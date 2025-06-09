#!/usr/bin/env python
# convert_to_onnx.py

import argparse, os, subprocess, sys

def main():
    parser = argparse.ArgumentParser(
        description="Convert TensorFlow SavedModel to ONNX"
    )
    parser.add_argument('gameName',
        help='게임 이름 (config.js의 key와 동일)')
    parser.add_argument('-s','--saved-model',
        default="models/{gameName}/saved_model",
        help='SavedModel 디렉토리 (default: models/<gameName>/saved_model)')
    parser.add_argument('-o','--output',
        default="models/{gameName}/model.onnx",
        help='ONNX 출력 경로 (default: models/<gameName>/model.onnx)')
    parser.add_argument('--opset', type=int, default=13,
        help='ONNX opset 버전 (default:13)')
    args = parser.parse_args()

    saved_dir = args.saved_model.format(gameName=args.gameName)
    out_path  = args.output.format(gameName=args.gameName)

    if not os.path.isdir(saved_dir):
        print(f"❌ SavedModel 디렉토리를 찾을 수 없습니다: {saved_dir}")
        sys.exit(1)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    cmd = [
        sys.executable, '-m', 'tf2onnx.convert',
        '--saved-model', saved_dir,
        '--output',      out_path,
        '--opset',       str(args.opset),
    ]
    print("🔄 변환 시작:", " ".join(cmd))
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print("❌ ONNX 변환 실패")
        sys.exit(res.returncode)

    print(f"✅ ONNX 모델 저장 완료: {out_path}")

if __name__ == "__main__":
    main()
