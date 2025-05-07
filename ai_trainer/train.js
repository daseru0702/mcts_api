// ai_trainer/train.js
import fs from "fs-extra";
import * as tf from "@tensorflow/tfjs-node";
import path from "path";
import { fileURLToPath } from "url";
import { GAMES } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * 1) Self-play JSON 을 불러와 Tensor 로 변환
 */
async function loadData(gameName) {
  const cfg    = GAMES[gameName];
  const json   = await fs.readJson(path.resolve(__dirname, cfg.selfplayFile));
  const states = tf.tensor(json.states,   undefined, "float32");    // shape [T, C, N, N]
  const policies = tf.tensor(json.policies, undefined, "float32");  // shape [T, M]
  const values = tf.tensor(json.values,   undefined, "float32");    // shape [T]
  return { states, policies, values };
}

/**
 * 2) Policy-Value Net 정의 (Residual + Policy/Value heads)
 */
function buildModel({ inChannels, boardSize, policyOutputDim }) {
  const input = tf.input({ shape: [inChannels, boardSize, boardSize], name: "board" });
  // Conv3×3 → BN → ReLU
  let x = tf.layers
    .conv2d({ filters: 64, kernelSize: 3, padding: "same", dataFormat: "channelsFirst" })
    .apply(input);
  x = tf.layers.batchNormalization().apply(x);
  x = tf.layers.activation({ activation: "relu" }).apply(x);

  // Residual Blocks ×4
  for (let i = 0; i < 4; i++) {
    const y = tf.layers
      .conv2d({ filters: 64, kernelSize: 3, padding: "same", dataFormat: "channelsFirst" })
      .apply(x);
    const ybn = tf.layers.batchNormalization().apply(y);
    const yact = tf.layers.activation({ activation: "relu" }).apply(ybn);
    const z = tf.layers
      .conv2d({ filters: 64, kernelSize: 3, padding: "same", dataFormat: "channelsFirst" })
      .apply(yact);
    const zbn = tf.layers.batchNormalization().apply(z);
    x = tf.layers.add().apply([x, zbn]);
    x = tf.layers.activation({ activation: "relu" }).apply(x);
  }

  // Policy Head: 1×1 Conv → Flatten → Dense(softmax)
  let p = tf.layers
    .conv2d({ filters: 2, kernelSize: 1, dataFormat: "channelsFirst" })
    .apply(x);
  p = tf.layers.flatten().apply(p);
  const policyOut = tf.layers.dense({
    units: policyOutputDim,
    activation: "softmax",
    name: "policy"
  }).apply(p);

  // Value Head: 1×1 Conv → Flatten → Dense→ReLU→Dense(tanh)
  let v = tf.layers
    .conv2d({ filters: 1, kernelSize: 1, dataFormat: "channelsFirst" })
    .apply(x);
  v = tf.layers.flatten().apply(v);
  v = tf.layers.dense({ units: 256, activation: "relu" }).apply(v);
  const valueOut = tf.layers.dense({
    units: 1,
    activation: "tanh",
    name: "value"
  }).apply(v);

  return tf.model({ inputs: input, outputs: [policyOut, valueOut] });
}

/**
 * 3) 학습 루프
 */
async function main() {
  const gameName = process.argv[2];
  if (!gameName || !GAMES[gameName]) {
    console.error("Usage: node train.js <gameName>");
    console.error("Available games:", Object.keys(GAMES).join(", "));
    process.exit(1);
  }
  const cfg = GAMES[gameName];

  console.log(`Loading data for ${gameName}...`);
  const { states, policies, values } = await loadData(gameName);

  console.log("Building model...");
  const model = buildModel(cfg);
  model.compile({
    optimizer: tf.train.adam(1e-3),
    loss: {
      policy: tf.losses.softmaxCrossEntropy,
      value: tf.losses.meanSquaredError
    },
    lossWeights: { policy: 1, value: 1 }
  });

  console.log("Starting training...");
  await model.fit(states, { policy: policies, value: values }, {
    epochs:    cfg.epochs,
    batchSize: cfg.batchSize,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}/${cfg.epochs}  loss=${logs.loss.toFixed(4)}`);
      }
    }
  });

  // 모델 저장
  const outDir = path.resolve(__dirname, cfg.modelDir, gameName);
  await model.save(`file://${outDir}`);
  console.log(`Model saved to ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
