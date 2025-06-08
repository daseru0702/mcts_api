// common/config.js

export const GAMES = {
    quoridor: {
      adapter:         '../games/quoridor/quoridorAdapter.js',
      inChannels:      4,
      boardSize:       9,
      policyOutputDim: 9*9 + 2*(8*9),
      selfplayFile:    "../ai_trainer/data/quoridor_selfplay.json",
      modelDir:        "./models",
      simLimit:        1000,
      selfPlayGames:   500,
      maxMoves:        200,    //한 판당 최대 수 제한
      epochs:          20,
      batchSize:       64,
      learningRate:    1e-3
    },
  };
  