# ai_trainer/train.py

import os
import argparse
import torch
import torch.nn.functional as F
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from config import GAMES
from models.policy_value_net import PolicyValueNet

def main():
    p = argparse.ArgumentParser()
    p.add_argument("game", choices=GAMES.keys(), help="게임 이름 (config.py 참조)")
    p.add_argument("--epochs", type=int,   default=20)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float,    default=1e-3)
    args = p.parse_args()

    cfg = GAMES[args.game]
    DATA_PATH = cfg["selfplay_file"]
    MODEL_DIR = "models"
    os.makedirs(MODEL_DIR, exist_ok=True)

    # 데이터 로드
    data = torch.load(DATA_PATH)
    states   = torch.tensor(data["states"],   dtype=torch.float32)
    policies = torch.tensor(data["policies"], dtype=torch.float32)
    values   = torch.tensor(data["values"],   dtype=torch.float32)

    ds = TensorDataset(states, policies, values)
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True)

    # 모델 생성
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    net = PolicyValueNet(
        in_channels       = cfg["in_channels"],
        board_size        = cfg["board_size"],
        policy_output_dim = cfg["policy_output_dim"],
        num_filters       = 64,
        num_res_blocks    = 4
    ).to(device)
    opt = optim.Adam(net.parameters(), lr=args.lr)

    # 학습
    for epoch in range(1, args.epochs+1):
        net.train()
        total_loss = 0.0
        for s, p_tgt, v_tgt in loader:
            s, p_tgt, v_tgt = s.to(device), p_tgt.to(device), v_tgt.to(device)
            opt.zero_grad()
            p_pred, v_pred = net(s)
            loss_p = -(p_tgt * p_pred).sum(dim=1).mean()
            loss_v = F.mse_loss(v_pred.view(-1), v_tgt)
            (loss_p + loss_v).backward()
            opt.step()
            total_loss += (loss_p + loss_v).item()
        print(f"[{args.game}] Epoch {epoch}/{args.epochs} Loss {total_loss/len(loader):.4f}")

    # 저장
    prefix = cfg["model_prefix"]
    pt_file  = os.path.join(MODEL_DIR, f"{prefix}_net.pt")
    onnx_file= os.path.join(MODEL_DIR, f"{prefix}.onnx")
    torch.save(net.state_dict(), pt_file)
    print(f"Saved PyTorch model to {pt_file}")

    # ONNX 내보내기
    net.eval()
    dummy = torch.zeros(1, cfg["in_channels"], cfg["board_size"], cfg["board_size"], device=device)
    torch.onnx.export(
        net, dummy, onnx_file,
        input_names=["x"], output_names=["policy","value"],
        dynamic_axes={"x":[0]}
    )
    print(f"Exported ONNX model to {onnx_file}")

if __name__ == "__main__":
    main()
