#!/usr/bin/env python
# ai_trainer/pipeline.py
#
# AlphaZero 식 반복 학습 파이프라인 (중단 후 다시 실행하면 이어서 진행)
#
#   gen 0 : 휴리스틱 MCTS 자가대국 → 첫 신경망 학습
#   gen k : 현재 best 모델로 자가대국 → 최근 데이터로 이어서 학습 → best 와 대결해 이기면 교체
#
#   .venv/Scripts/python ai_trainer/pipeline.py [--generations 15] [--games 400] [--sims 200]
#
# 결과:  models/quoridor/best.onnx  (서버가 사용)
#        models/quoridor/history.json (세대별 기록, 전시 페이지에서 사용)

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
MODELS = os.path.join(ROOT, "models", "quoridor")
HISTORY = os.path.join(MODELS, "history.json")
BEST = os.path.join(MODELS, "best.onnx")
NODE = "node"
PY = sys.executable


def run(cmd):
    print("▶", " ".join(cmd), flush=True)
    proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    last = ""
    for line in proc.stdout:
        if "Warning" in line or "warn(" in line:
            continue
        print("   " + line.rstrip(), flush=True)
        if line.strip():
            last = line.strip()
    if proc.wait() != 0:
        raise SystemExit(f"명령 실패: {' '.join(cmd)}")
    return last


def load_history():
    if os.path.exists(HISTORY):
        with open(HISTORY, encoding="utf-8") as f:
            return json.load(f)
    return {"best": None, "generations": []}


def save_history(h):
    os.makedirs(MODELS, exist_ok=True)
    tmp = HISTORY + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=2)
    os.replace(tmp, HISTORY)


def data_file(i):
    return os.path.join("data", f"gen_{i:03d}.bin")


def model_base(i):
    return os.path.join("models", "quoridor", f"gen_{i:03d}")


def arena(a, b, games):
    out = run([NODE, "ai_trainer/arena.js", f"--a={a}", f"--b={b}", f"--games={games}"])
    return json.loads(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generations", type=int, default=15, help="학습할 신경망 세대 수")
    ap.add_argument("--games0", type=int, default=1500, help="0세대(휴리스틱) 자가대국 판 수")
    ap.add_argument("--games", type=int, default=400, help="세대당 자가대국 판 수")
    ap.add_argument("--sims", type=int, default=200, help="자가대국 시뮬레이션 수")
    ap.add_argument("--window", type=int, default=5, help="학습에 쓰는 최근 데이터 세대 수")
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--gate-games", type=int, default=40)
    ap.add_argument("--gate-sims", type=int, default=200)
    ap.add_argument("--gate-threshold", type=float, default=0.55)
    args = ap.parse_args()

    os.makedirs(DATA, exist_ok=True)
    os.makedirs(MODELS, exist_ok=True)
    h = load_history()
    done = {g["gen"] for g in h["generations"]}

    for gen in range(1, args.generations + 1):
        if gen in done:
            continue
        t0 = time.time()
        print(f"\n════════ 세대 {gen} ════════", flush=True)

        # 1) 자가대국: 데이터 gen-1 (0세대는 휴리스틱)
        src = gen - 1
        if not os.path.exists(data_file(src)):
            cmd = [NODE, "ai_trainer/selfplay.js", f"--out={data_file(src)}", f"--sims={args.sims}"]
            if src == 0:
                cmd.append(f"--games={args.games0}")
            else:
                cmd += [f"--games={args.games}", f"--model={BEST}"]
            run(cmd)
        with open(data_file(src).replace(".bin", ".json"), encoding="utf-8") as f:
            sp_meta = json.load(f)

        # 2) 학습: 최근 window 세대 데이터, 직전 체크포인트에서 이어서
        files = [data_file(i) for i in range(max(0, src - args.window + 1), src + 1)]
        base = model_base(gen)
        cmd = [PY, "ai_trainer/train.py", "--data", *files,
               "--out-ckpt", base + ".pt", "--out-onnx", base + ".onnx",
               "--epochs", str(args.epochs if gen > 1 else max(args.epochs, 6))]
        if gen > 1:
            cmd += ["--init", model_base(gen - 1) + ".pt"]
        run(cmd)

        # 3) 게이팅: 현재 best 와 대결
        record = {"gen": gen, "selfplay": {k: sp_meta[k] for k in ("games", "rows", "avgMoves", "wins", "seconds")}}
        new_spec = f"nn:{base}.onnx:{args.gate_sims}"
        if h["best"] is None:
            promoted = True
        else:
            res = arena(new_spec, f"nn:{h['best']}.onnx:{args.gate_sims}", args.gate_games)
            record["vsBest"] = res
            promoted = res["aScore"] >= args.gate_threshold
        if promoted:
            h["best"] = base
            shutil.copyfile(os.path.join(ROOT, base + ".onnx"), BEST)
        record["promoted"] = promoted
        record["best"] = h["best"]

        # 4) 기준선(휴리스틱 MCTS) 대비 실력 기록
        if promoted or gen == args.generations:
            record["bestVsHeuristic"] = arena(f"nn:{h['best']}.onnx:{args.gate_sims}",
                                              f"heur:{args.gate_sims}", args.gate_games)
        record["seconds"] = round(time.time() - t0)
        h["generations"].append(record)
        save_history(h)
        print(f"✔ 세대 {gen} 완료 ({record['seconds']}s) — best={h['best']} promoted={promoted}", flush=True)

    print(f"\n✅ 학습 완료. best = {h['best']}  →  {BEST}")


if __name__ == "__main__":
    main()
