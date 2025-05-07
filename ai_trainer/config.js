// ai_trainer/config.js

export const GAMES = {
    quoridor: {
      inChannels:      4,
      boardSize:       9,
      policyOutputDim: 9*9 + 2*(8*9),
      selfplayFile:    "./data/quoridor_selfplay.json",
      modelDir:        "./models",
      simLimit:        20,
      epochs:          20,
      batchSize:       64,
      learningRate:    1e-3
    },
    // 다른 게임을 추가할 때 여기에 한 줄만 더 추가하면 됩니다.
  };
  