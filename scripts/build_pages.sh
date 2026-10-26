#!/usr/bin/env bash
# scripts/build_pages.sh — GitHub Pages 용 정적 사이트를 _site/ 에 만듭니다.
# 서버 없이 브라우저 안에서 AI 가 동작합니다 (client/ai-worker.js).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site/games/quoridor _site/common _site/models
cp client/index.html client/style.css client/app.js client/ai-worker.js _site/
cp games/quoridor/QuoridorGame.js games/quoridor/QuoridorAdapter.js _site/games/quoridor/
cp common/mcts.js common/onnx_evaluator.js common/levels.js _site/common/
cp models/quoridor/best.onnx _site/models/best.onnx
if [ -f models/quoridor/history.json ]; then cp models/quoridor/history.json _site/models/history.json; fi
touch _site/.nojekyll
echo "✅ _site 생성 완료"
