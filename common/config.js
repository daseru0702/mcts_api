// common/config.js

export const GAMES = {
    quoridor: {
      inChannels:      4,
      boardSize:       9,
      policyOutputDim: 9*9 + 2*(8*9),
      selfplayFile:    "../ai_trainer/data/quoridor_selfplay.json",
      modelDir:        "./models",
      simLimit:        200,
      selfPlayGames:   10,
      maxMoves:        200,    //한 판당 최대 수 제한
      epochs:          20,
      batchSize:       64,
      learningRate:    1e-3
    },
    // 다른 게임을 추가할 때 여기에 한 줄만 더 추가하면 됩니다.
  };
  