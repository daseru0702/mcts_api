// ai_trainer/config.js
export const GAMES = {
    quoridor: {
      inChannels:       4,
      boardSize:        9,
      policyOutputDim:  9*9 + 2*(8*9),
      selfplayFile:     "./data/quoridor_selfplay.json",
      modelDir:         "./models",      // JS 모델 저장 폴더
      epochs:           20,
      batchSize:        64
    },
    // 다른 게임을 추가할 때는 여기에만 설정 추가
  };
  