#!/usr/bin/env python
# ai_trainer/train.py
#
# 자가대국 데이터(.bin)로 정책/가치 신경망을 학습하고 ONNX 로 내보냅니다.
#
#   .venv/Scripts/python ai_trainer/train.py --data data/gen_000.bin data/gen_001.bin \
#       --out-ckpt models/quoridor/gen_002.pt --out-onnx models/quoridor/gen_002.onnx \
#       [--init models/quoridor/gen_001.pt] [--epochs 4]
#
# .bin 형식은 ai_trainer/selfplay.js 참고: float32 행 [state | pi | z]

import argparse
import json
import math
import os
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

IN_CHANNELS = 8
BOARD = 9
POLICY_SIZE = 81 + 2 * 64
STATE_SIZE = IN_CHANNELS * BOARD * BOARD
ROW = STATE_SIZE + POLICY_SIZE + 1


class ResBlock(nn.Module):
    def __init__(self, ch):
        super().__init__()
        self.c1 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.b1 = nn.BatchNorm2d(ch)
        self.c2 = nn.Conv2d(ch, ch, 3, padding=1, bias=False)
        self.b2 = nn.BatchNorm2d(ch)

    def forward(self, x):
        y = F.relu(self.b1(self.c1(x)))
        y = self.b2(self.c2(y))
        return F.relu(x + y)


class QuoridorNet(nn.Module):
    def __init__(self, channels=64, blocks=6):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(IN_CHANNELS, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )
        self.body = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        self.p_head = nn.Sequential(
            nn.Conv2d(channels, 4, 1, bias=False), nn.BatchNorm2d(4), nn.ReLU(), nn.Flatten(),
            nn.Linear(4 * BOARD * BOARD, POLICY_SIZE),
        )
        self.v_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False), nn.BatchNorm2d(2), nn.ReLU(), nn.Flatten(),
            nn.Linear(2 * BOARD * BOARD, 128), nn.ReLU(),
            nn.Linear(128, 1), nn.Tanh(),
        )

    def forward(self, x):
        h = self.body(self.stem(x))
        return self.p_head(h), self.v_head(h)


def load_data(paths):
    arrays = []
    for p in paths:
        a = np.fromfile(p, dtype=np.float32)
        if a.size % ROW != 0:
            raise ValueError(f"{p}: 크기가 행 길이({ROW})의 배수가 아닙니다")
        arrays.append(a.reshape(-1, ROW))
        print(f"  {p}: {arrays[-1].shape[0]} rows")
    data = np.concatenate(arrays)
    return data[:, :STATE_SIZE], data[:, STATE_SIZE:STATE_SIZE + POLICY_SIZE], data[:, -1:]


def export_onnx(model, path):
    model.eval()
    dummy = torch.zeros(1, IN_CHANNELS, BOARD, BOARD)
    m = model.to("cpu")
    torch.onnx.export(
        m, dummy, path,
        input_names=["input"], output_names=["policy", "value"],
        dynamic_axes={"input": {0: "batch"}, "policy": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17, dynamo=False,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--out-ckpt", required=True)
    ap.add_argument("--out-onnx", required=True)
    ap.add_argument("--init", default=None, help="이어서 학습할 체크포인트 (.pt)")
    ap.add_argument("--epochs", type=float, default=4)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--wd", type=float, default=1e-4)
    ap.add_argument("--channels", type=int, default=64)
    ap.add_argument("--blocks", type=int, default=6)
    ap.add_argument("--value-weight", type=float, default=1.0)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device}")

    states, pis, zs = load_data(args.data)
    n = states.shape[0]
    # 행 순서 = 게임 순서이므로 끝 5% 를 검증용으로 (같은 게임이 섞이지 않게)
    n_val = max(1, int(n * 0.05))
    perm_train = np.arange(n - n_val)
    X = torch.from_numpy(states).view(-1, IN_CHANNELS, BOARD, BOARD).to(device)
    P = torch.from_numpy(pis).to(device)
    Z = torch.from_numpy(zs).to(device)

    if args.init and os.path.exists(args.init):
        ck = torch.load(args.init, map_location="cpu")
        model = QuoridorNet(ck["channels"], ck["blocks"])
        model.load_state_dict(ck["model"])
        print(f"init from {args.init}")
    else:
        model = QuoridorNet(args.channels, args.blocks)
    model.to(device)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    steps_per_epoch = math.ceil(len(perm_train) / args.batch)
    total_steps = max(1, int(steps_per_epoch * args.epochs))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=total_steps, pct_start=0.15)

    def evaluate():
        model.eval()
        with torch.no_grad():
            pl = vl = 0.0
            for i in range(n - n_val, n, 4096):
                j = min(i + 4096, n)
                logits, v = model(X[i:j])
                pl += -(P[i:j] * F.log_softmax(logits, 1)).sum(1).sum().item()
                vl += F.mse_loss(v, Z[i:j], reduction="sum").item()
        model.train()
        return pl / n_val, vl / n_val

    t0 = time.time()
    step = 0
    model.train()
    while step < total_steps:
        order = torch.from_numpy(np.random.permutation(perm_train)).to(device)
        run_p = run_v = 0.0
        cnt = 0
        for b in range(0, len(order), args.batch):
            if step >= total_steps:
                break
            idx = order[b:b + args.batch]
            logits, v = model(X[idx])
            p_loss = -(P[idx] * F.log_softmax(logits, 1)).sum(1).mean()
            v_loss = F.mse_loss(v, Z[idx])
            loss = p_loss + args.value_weight * v_loss
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            step += 1
            run_p += p_loss.item()
            run_v += v_loss.item()
            cnt += 1
        vp, vv = evaluate()
        print(f"  step {step}/{total_steps}  train p={run_p / cnt:.4f} v={run_v / cnt:.4f}  "
              f"val p={vp:.4f} v={vv:.4f}  ({time.time() - t0:.0f}s)", flush=True)

    os.makedirs(os.path.dirname(args.out_ckpt) or ".", exist_ok=True)
    torch.save({"model": model.state_dict(), "channels": model.stem[0].out_channels,
                "blocks": len(model.body)}, args.out_ckpt)
    export_onnx(model, args.out_onnx)
    vp, vv = evaluate() if False else (None, None)
    print(json.dumps({"ckpt": args.out_ckpt, "onnx": args.out_onnx, "rows": n}))


if __name__ == "__main__":
    main()
