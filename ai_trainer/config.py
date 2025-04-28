# ai_trainer/config.py

GAMES = {
    "quoridor": {
        "in_channels":       4,       # pawn1, pawn2, h-walls, v-walls
        "board_size":        9,
        "policy_output_dim": 9*9 + 2*(8*9),  # 81 pawn + 144 wall = 225
        "selfplay_file":     "data/quoridor_selfplay.npz",
        "model_prefix":      "quoridor"
    },
    # 다른 게임 추가 시 여기에 설정만 더 넣으면 됩니다.
}
