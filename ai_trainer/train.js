// ai_trainer/train.js

import fs from "fs-extra";
//import * as tf from "@tensorflow/tfjs-node";
import * as tf from "@tensorflow/tfjs-node-gpu";
import path from "path";
import { GAMES } from "../common/config.js";

function buildModel(cfg) {
  const { inChannels, boardSize, policyOutputDim } = cfg;
  const input = tf.input({ shape: [inChannels, boardSize, boardSize], name: "board" });

  // Conv3x3 + ResBlocks...
  let x = tf.layers
    .conv2d({ filters: 64, kernelSize: 3, padding: "same", dataFormat: "channelsFirst" })
    .apply(input);
  x = tf.layers.batchNormalization().apply(x);
  x = tf.layers.activation({ activation: "relu" }).apply(x);
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

  // Policy head
  let p = tf.layers
    .conv2d({ filters: 2, kernelSize: 1, dataFormat: "channelsFirst" })
    .apply(x);
  p = tf.layers.flatten().apply(p);
  const policyOut = tf.layers
    .dense({ units: policyOutputDim, activation: "softmax", name: "policy" })
    .apply(p);

  // Value head
  let v = tf.layers
    .conv2d({ filters: 1, kernelSize: 1, dataFormat: "channelsFirst" })
    .apply(x);
  v = tf.layers.flatten().apply(v);
  v = tf.layers.dense({ units: 256, activation: "relu" }).apply(v);
  const valueOut = tf.layers
    .dense({ units: 1, activation: "tanh", name: "value" })
    .apply(v);

  return tf.model({ inputs: input, outputs: [policyOut, valueOut] });
}

// 세대가 늘어날 때마다 파일명을 다르게 만들었다면, path.resolve의 파일명을 수정해야합니다.
async function loadData(gameName) {
  const cfg  = GAMES[gameName];
  const file = path.resolve("data", `${gameName}_selfplay.ndjson`);
  const text = await fs.readFile(file, "utf8");
  const lines = text.trim().split("\n");
  const N = lines.length;

  // 1) Float32Array 로 flat 버퍼를 준비합니다.
  const stateSize  = cfg.inChannels * cfg.boardSize * cfg.boardSize;
  const polSize    = cfg.policyOutputDim;
  const rawStates  = new Float32Array(N * stateSize);
  const rawPols    = new Float32Array(N * polSize);
  const rawValues  = new Float32Array(N);

  // 2) 각 줄(JSON) 파싱해서 flat 버퍼에 채워 넣기
  for (let i = 0; i < N; i++) {
    const { state, pi, z } = JSON.parse(lines[i]);
    rawStates.set(state, i * stateSize);
    rawPols.set(pi,     i * polSize);
    // z가 1 또는 2로 저장돼 있다면 1->+1, 2->-1 같은 식으로 바꿔주세요.
    rawValues[i] = z != null ? (z === 1 ? 1 : -1) : 0;
  }

  // 3) 올바른 shape 으로 텐서 생성
  const states   = tf.tensor4d(rawStates, [N, cfg.inChannels, cfg.boardSize, cfg.boardSize], "float32");
  const policies = tf.tensor2d(rawPols,   [N, cfg.policyOutputDim],                             "float32");
  const values   = tf.tensor2d(rawValues, [N, 1],                                              "float32");

  return { states, policies, values };
}


async function main() {
  const gameName = process.argv[2];
  if (!GAMES[gameName]) {
    console.error("Usage: node train.js <gameName>");
    process.exit(1);
  }
  const cfg = GAMES[gameName];

  console.log(`Loading data for ${gameName}...`);
  const { states, policies, values } = await loadData(gameName);

  console.log("Building model...");
  const model = buildModel(cfg);
  model.compile({
    optimizer: tf.train.adam(cfg.learningRate),
    loss: {
      policy: tf.losses.softmaxCrossEntropy,
      value:  tf.losses.meanSquaredError
    },
    lossWeights: { policy: 1, value: 1 }
  });

  console.log("Training...");
  await model.fit(states, { policy: policies, value: values }, {
    epochs:    cfg.epochs,
    batchSize: cfg.batchSize,
    callbacks: {
      onEpochEnd: (_, logs) => console.log(`loss=${logs.loss.toFixed(4)}`)
    }
  });

  const outDir = path.resolve(cfg.modelDir, gameName);
  await model.save(`file://${outDir}`);
  console.log(`Model saved to ${outDir}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
