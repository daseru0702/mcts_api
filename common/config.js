// common/config.js

export const GAMES = {
    quoridor: {
      adapter:         '../games/quoridor/quoridorAdapter.js',
      inChannels:      4,
      boardSize:       9,
      policyOutputDim: 9*9 + 2*(8*9),
      selfplayFile:    "../ai_trainer/data/quoridor_selfplay.json",
      modelDir:        "./models",
      modelPath:       ".models/quoridor/model.json",
      simLimit:        1000,
      selfPlayGames:   500,
      maxMoves:        200,
      epochs:          20,
      batchSize:       64,
      learningRate:    1e-3,
      c_puct:          1.0,
    },
  };
  