// ai_trainer/train.js

import fs from "fs-extra";
import * as tf from "@tensorflow/tfjs-node";
import path from "path";
import { GAMES } from "./config.js";

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

async function loadData(gameName) {
  const cfg = GAMES[gameName];
  const raw = await fs.readJson(path.resolve("data", `${gameName}_selfplay.json`));
  return {
    states:   tf.tensor(raw.states,   undefined, "float32"),
    policies: tf.tensor(raw.policies, undefined, "float32"),
    values:   tf.tensor(raw.values,   undefined, "float32")
  };
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
