#!/usr/bin/env python3
import argparse
import os
import tf2onnx

def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert a TensorFlow SavedModel to ONNX format"
    )
    parser.add_argument(
        "game",
        help="Game name (e.g. quoridor) — used to derive default paths"
    )
    parser.add_argument(
        "-s", "--saved_model_dir",
        help="Path to the TensorFlow SavedModel directory"
    )
    parser.add_argument(
        "-o", "--output_onnx",
        help="Path for the output ONNX file"
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=13,
        help="ONNX opset version (default: 13)"
    )
    return parser.parse_args()

def main():
    args = parse_args()

    # 기본 경로: models/<game>/saved_model, models/<game>/model.onnx
    saved_model_dir = args.saved_model_dir or os.path.join("models", args.game, "saved_model")
    output_onnx     = args.output_onnx     or os.path.join("models", args.game, "model.onnx")

    if not os.path.isdir(saved_model_dir):
        raise FileNotFoundError(f"SavedModel 디렉터리를 찾을 수 없습니다: {saved_model_dir}")

    os.makedirs(os.path.dirname(output_onnx), exist_ok=True)

    print(f"▶ 변환 시작: {saved_model_dir} → {output_onnx} (opset {args.opset})")
    # 실제 변환
    model_proto, _ = tf2onnx.convert.from_saved_model(
        saved_model_dir,
        opset=args.opset,
        output_path=output_onnx
    )
    print("✅ 변환 완료:", output_onnx)

if __name__ == "__main__":
    main()
