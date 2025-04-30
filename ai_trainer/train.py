# ai_trainer/train.py

import os
import json
import numpy as np
import torch
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from config import GAMES
from models.policy_value_net import PolicyValueNet

def main():
    # 사용할 게임과 설정 읽기
    GAME_NAME = "quoridor"
    cfg       = GAMES[GAME_NAME]

    # 경로 준비
    data_file  = cfg["selfplay_file"]    # "ai_trainer/data/quoridor_selfplay.json"
    model_dir  = "ai_trainer/models"
    os.makedirs(model_dir, exist_ok=True)

    # 하이퍼파라미터
    batch_size   = 64
    epochs       = 20
    learning_rate = 1e-3
    device       = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # 1) JSON 데이터 로드
    with open(data_file, "r") as f:
        raw = json.load(f)
    states   = np.array(raw["states"],   dtype=np.float32)  # (T, 4,9,9)
    policies = np.array(raw["policies"], dtype=np.float32)  # (T, M)
    values   = np.array(raw["values"],   dtype=np.float32)  # (T,)

    # 2) DataLoader 구성
    ds = TensorDataset(
        torch.tensor(states),
        torch.tensor(policies),
        torch.tensor(values)
    )
    loader = DataLoader(ds, batch_size=batch_size, shuffle=True)

    # 3) 모델 초기화
    net = PolicyValueNet(
        in_channels       = cfg["in_channels"],
        board_size        = cfg["board_size"],
        policy_output_dim = cfg["policy_output_dim"],
        num_filters       = 64,
        num_res_blocks    = 4
    ).to(device)
    optimizer = optim.Adam(net.parameters(), lr=learning_rate)

    # 4) 학습 루프
    for epoch in range(1, epochs+1):
        net.train()
        total_loss = 0.0

        for s_b, p_b, v_b in loader:
            s_b = s_b.to(device)
            p_b = p_b.to(device)
            v_b = v_b.to(device)

            optimizer.zero_grad()
            p_pred, v_pred = net(s_b)

            # Policy loss (cross-entropy)
            loss_p = - (p_b * p_pred).sum(dim=1).mean()
            # Value loss (MSE)
            loss_v = F.mse_loss(v_pred.view(-1), v_b)

            loss = loss_p + loss_v
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(loader)
        print(f"[{GAME_NAME}] Epoch {epoch}/{epochs}  loss={avg_loss:.4f}")

    # 5) 모델 저장
    torch.save(net.state_dict(), os.path.join(model_dir, f"{GAME_NAME}_net.pt"))
    print(f"Saved PyTorch model to {model_dir}/{GAME_NAME}_net.pt")

    # 6) ONNX 내보내기
    net.eval()
    dummy = torch.zeros(1,
                        cfg["in_channels"],
                        cfg["board_size"],
                        cfg["board_size"],
                        device=device)
    onnx_path = os.path.join(model_dir, f"{GAME_NAME}.onnx")
    torch.onnx.export(
        net, dummy, onnx_path,
        input_names  = ["x"],
        output_names = ["policy","value"],
        dynamic_axes = {"x": [0]}
    )
    print(f"Exported ONNX model to {onnx_path}")

if __name__ == "__main__":
    main()
