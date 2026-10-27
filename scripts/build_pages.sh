#!/usr/bin/env bash
# scripts/build_pages.sh — GitHub Pages 용 정적 사이트를 _site/ 에 만듭니다.
# 서버 없이 브라우저 안에서 AI 가 동작합니다 (client/ai-worker.js).
# games/ 에 있는 모든 게임과 models/<game>/best.onnx 를 자동으로 포함합니다.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site/common _site/games _site/models
cp client/index.html client/style.css client/app.js client/ai-worker.js _site/
cp common/mcts.js common/onnx_evaluator.js common/heuristic_evaluator.js common/levels.js common/games.js _site/common/

for dir in games/*/; do
  id=$(basename "$dir")
  [ -f "$dir/index.js" ] || continue
  mkdir -p "_site/games/$id" "_site/models/$id"
  # 브라우저에서 쓰는 파일만 (테스트 제외)
  find "$dir" -maxdepth 1 -type f \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.png' -o -name '*.svg' \) \
    ! -name 'tests.js' -exec cp {} "_site/games/$id/" \;
  for f in best.onnx history.json; do
    if [ -f "models/$id/$f" ]; then cp "models/$id/$f" "_site/models/$id/$f"; fi
  done
  echo "  + $id"
done

node scripts/list_games.mjs > _site/games/index.json
touch _site/.nojekyll
echo "✅ _site 생성 완료"
