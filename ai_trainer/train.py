#!/usr/bin/env python
# ai_trainer/train.py
#
# 자가대국 데이터(.bin)로 정책/가치 신경망을 학습하고 ONNX 로 내보냅니다.
#
#   .venv/Scripts/python ai_trainer/train.py --data data/<game>/gen_000.bin data/<game>/gen_001.bin \
#       --out-ckpt models/<game>/gen_002.pt --out-onnx models/<game>/gen_002.onnx \
#       [--init models/<game>/gen_001.pt] [--epochs 4]
#
# .bin 형식은 ai_trainer/selfplay.js 참고 ("sparse-u8-v1": uint8 상태 + 방문한 수만 저장한 정책).
# 예전 형식(float32 행 [state | pi | z | q])도 읽습니다.
# 입력 크기·정책 크기는 게임마다 다르며, selfplay.js 가 .bin 옆에 남긴 .json(stateShape, policySize)에서 읽습니다.
# 게임이 POLICY_PLANES 를 주면(.json 의 policyPlanes) 정책 출력층을 1×1 합성곱으로 만들어
# 정책이 큰 게임(블로커스 1.8만 개)도 모델이 작고 빠릅니다.
#
# 가치 목표 = z_weight·z + (1-z_weight)·q
#   z(최종 승패)만 쓰면 신경망이 벽 배치로 '어느 게임인지'를 외워 과적합되므로
#   국면별 MCTS 평가값 q 를 섞습니다.

import argparse
import json
import math
import os
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F



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


class SpatialPolicyHead(nn.Module):
    """정책 = [planes × H × W 격자 로짓 | 나머지 특수 수 로짓(전역 평균에서)]"""

    def __init__(self, channels, planes, extra):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(channels, channels, 1, bias=False), nn.BatchNorm2d(channels), nn.ReLU(),
            nn.Conv2d(channels, planes, 1),
        )
        self.extra = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(channels, extra)) if extra else None

    def forward(self, h):
        grid = self.conv(h).flatten(1)
        return torch.cat([grid, self.extra(h)], 1) if self.extra is not None else grid


class PolicyValueNet(nn.Module):
    """게임 무관 정책·가치 ResNet. in_shape = (C, H, W)"""

    def __init__(self, in_shape, policy_size, channels=64, blocks=6, policy_planes=0):
        super().__init__()
        c, h, w = in_shape
        self.in_shape = tuple(in_shape)
        self.policy_size = policy_size
        self.policy_planes = policy_planes
        self.stem = nn.Sequential(
            nn.Conv2d(c, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(),
        )
        self.body = nn.Sequential(*[ResBlock(channels) for _ in range(blocks)])
        if policy_planes:
            self.p_head = SpatialPolicyHead(channels, policy_planes, policy_size - policy_planes * h * w)
        else:
            self.p_head = nn.Sequential(
                nn.Conv2d(channels, 4, 1, bias=False), nn.BatchNorm2d(4), nn.ReLU(), nn.Flatten(),
                nn.Linear(4 * h * w, policy_size),
            )
        self.v_head = nn.Sequential(
            nn.Conv2d(channels, 2, 1, bias=False), nn.BatchNorm2d(2), nn.ReLU(), nn.Flatten(),
            nn.Linear(2 * h * w, 128), nn.ReLU(),
            nn.Linear(128, 1), nn.Tanh(),
        )

    def forward(self, x):
        h = self.body(self.stem(x))
        return self.p_head(h), self.v_head(h)


def read_meta(path):
    meta_path = os.path.splitext(path)[0] + ".json"
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    if "stateShape" not in meta:
        raise ValueError(f"{meta_path}: stateShape 가 없습니다 (selfplay.js 로 다시 생성하세요)")
    return meta


def read_file(path, meta):
    """→ states uint8 [n, S], counts [n], idx int32 [nnz], val float32 [nnz], z [n], q [n]"""
    state_size = int(np.prod(meta["stateShape"]))
    policy_size = int(meta["policySize"])
    if meta.get("format") == "sparse-u8-v1":
        raw = np.fromfile(path, dtype=np.uint8)
        n, nnz, off = int(meta["rows"]), int(meta["nnz"]), meta["offsets"]

        def sec(name, dtype, count):
            return np.frombuffer(raw, dtype=dtype, count=count, offset=off[name])

        states = sec("states", np.uint8, n * state_size).reshape(n, state_size)
        zq = sec("zq", np.float32, n * 2).reshape(n, 2)
        return states, sec("counts", np.int32, n), sec("idx", np.int32, nnz), sec("val", np.float32, nnz), zq[:, 0], zq[:, 1]
    # 예전 형식: float32 행 [state | pi | z | q]
    row = state_size + policy_size + 2
    a = np.fromfile(path, dtype=np.float32)
    if a.size % row != 0:
        raise ValueError(f"{path}: 크기가 행 길이({row})의 배수가 아닙니다")
    a = a.reshape(-1, row)
    states = np.rint(np.clip(a[:, :state_size], 0, 1) * 255).astype(np.uint8)
    pi = a[:, state_size:state_size + policy_size]
    rows, cols = np.nonzero(pi)
    counts = np.bincount(rows, minlength=a.shape[0])
    return states, counts, cols.astype(np.int32), pi[rows, cols].astype(np.float32), a[:, -2], a[:, -1]


def load_data(paths):
    """→ (in_shape, policy_size, policy_planes, states uint8, pi_idx [n,K] int32, pi_val [n,K], z [n,1], q [n,1])
    정책은 행마다 방문한 수만 K 칸에 채우고 나머지는 (0, 0.0) 으로 둡니다."""
    metas = [read_meta(p) for p in paths]
    shapes = {(tuple(m["stateShape"]), int(m["policySize"]), int(m.get("policyPlanes") or 0)) for m in metas}
    if len(shapes) != 1:
        raise ValueError(f"데이터 파일의 크기 정보가 서로 다릅니다: {shapes}")
    in_shape, policy_size, planes = shapes.pop()
    parts = []
    for p, m in zip(paths, metas):
        parts.append(read_file(p, m))
        print(f"  {p}: {parts[-1][0].shape[0]} rows ({m.get('format', 'dense')})")
    states = np.concatenate([x[0] for x in parts])
    counts = np.concatenate([x[1] for x in parts]).astype(np.int64)
    idx = np.concatenate([x[2] for x in parts])
    val = np.concatenate([x[3] for x in parts])
    z = np.concatenate([x[4] for x in parts]).astype(np.float32)[:, None]
    q = np.concatenate([x[5] for x in parts]).astype(np.float32)[:, None]
    n, k = states.shape[0], max(1, int(counts.max()))
    row_of = np.repeat(np.arange(n), counts)
    pos = np.arange(len(idx)) - np.repeat(np.cumsum(counts) - counts, counts)
    pi_idx = np.zeros((n, k), np.int32)
    pi_val = np.zeros((n, k), np.float32)
    pi_idx[row_of, pos] = idx
    pi_val[row_of, pos] = val
    return in_shape, policy_size, planes, states, pi_idx, pi_val, z, q


def export_onnx(model, path):
    model.eval()
    dummy = torch.zeros(1, *model.in_shape)
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
    ap.add_argument("--z-weight", type=float, default=0.5, help="가치 목표에서 최종 승패 z 의 비중")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device}")

    in_shape, policy_size, planes, states, pi_idx, pi_val, zs, qs = load_data(args.data)
    print(f"input={in_shape} policy={policy_size} planes={planes} maxVisited={pi_idx.shape[1]}")
    n = states.shape[0]
    # 행 순서 = 게임 순서이므로 끝 5% 를 검증용으로 (같은 게임이 섞이지 않게)
    n_val = max(1, int(n * 0.05))
    perm_train = np.arange(n - n_val)
    X = torch.from_numpy(states).view(-1, *in_shape).to(device)   # uint8, 배치마다 /255
    PI = torch.from_numpy(pi_idx).to(device)
    PV = torch.from_numpy(pi_val).to(device)

    def xb(i):
        return X[i].float().div_(255)

    def policy_loss(logits, i):
        # 방문한 수에 대해서만 -Σ π·log p  (나머지 π 는 0)
        return -(PV[i] * F.log_softmax(logits, 1).gather(1, PI[i].long())).sum(1)
    Zraw = torch.from_numpy(zs).to(device)
    Z = args.z_weight * Zraw + (1 - args.z_weight) * torch.from_numpy(qs).to(device)

    if args.init and os.path.exists(args.init):
        ck = torch.load(args.init, map_location="cpu")
        ck_shape = tuple(ck.get("in_shape", in_shape))
        if (ck_shape != tuple(in_shape) or ck.get("policy_size", policy_size) != policy_size
                or ck.get("policy_planes", 0) != planes):
            raise ValueError(f"체크포인트 크기 {ck_shape} 가 데이터 {in_shape} 와 다릅니다")
        model = PolicyValueNet(in_shape, policy_size, ck["channels"], ck["blocks"], planes)
        model.load_state_dict(ck["model"])
        print(f"init from {args.init}")
    else:
        model = PolicyValueNet(in_shape, policy_size, args.channels, args.blocks, planes)
    model.to(device)

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    steps_per_epoch = math.ceil(len(perm_train) / args.batch)
    total_steps = max(1, int(steps_per_epoch * args.epochs))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=total_steps, pct_start=0.15)

    def evaluate():
        model.eval()
        with torch.no_grad():
            pl = vl = vz = 0.0
            for i in range(n - n_val, n, 4096):
                j = min(i + 4096, n)
                sl = slice(i, j)
                logits, v = model(xb(sl))
                pl += policy_loss(logits, sl).sum().item()
                vl += F.mse_loss(v, Z[i:j], reduction="sum").item()
                vz += F.mse_loss(v, Zraw[i:j], reduction="sum").item()
        model.train()
        return pl / n_val, vl / n_val, vz / n_val

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
            logits, v = model(xb(idx))
            p_loss = policy_loss(logits, idx).mean()
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
        vp, vv, vz = evaluate()
        print(f"  step {step}/{total_steps}  train p={run_p / cnt:.4f} v={run_v / cnt:.4f}  "
              f"val p={vp:.4f} v={vv:.4f} v_vs_z={vz:.4f}  ({time.time() - t0:.0f}s)", flush=True)

    os.makedirs(os.path.dirname(args.out_ckpt) or ".", exist_ok=True)
    torch.save({"model": model.state_dict(), "channels": model.stem[0].out_channels,
                "blocks": len(model.body), "in_shape": list(in_shape), "policy_size": policy_size,
                "policy_planes": planes},
               args.out_ckpt)
    export_onnx(model, args.out_onnx)
    print(json.dumps({"ckpt": args.out_ckpt, "onnx": args.out_onnx, "rows": n,
                      "valPolicy": vp, "valValue": vv, "valValueVsZ": vz}))


if __name__ == "__main__":
    main()
