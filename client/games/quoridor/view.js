// client/games/quoridor/view.js

export function renderGame(
  game, canvas,
  highlights = [], ghost = null, hoverWall = null, isThinking = false
) {
  const ctx = canvas.getContext("2d");
  const tileSize      = 60;
  const wallThickness = 10;
  const padding       = 40;

  const size = tileSize * 9 + wallThickness * 8 + padding * 2;
  canvas.width  = size;
  canvas.height = size + 30;

  // 배경·보드
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard(ctx, tileSize, wallThickness, padding);

  // 말 이동 하이라이트
  drawHighlights(ctx, highlights, tileSize, wallThickness, padding);

  // 드래그 중 ghost pawn
  drawGhostPawn(ctx, ghost, tileSize);

  // 벽 설치 미리보기
  drawHoverWall(ctx, hoverWall, tileSize, wallThickness, padding);

  // 실제 말·벽·벽 수
  drawPawns(ctx, game.pawns, tileSize, wallThickness, padding);
  drawWalls(ctx, game.placedWalls, tileSize, wallThickness, padding);
  drawWallCounts(ctx, game.wallCounts, padding);

  // AI 생각 중 메시지
  if (isThinking) {
    ctx.font      = "20px sans-serif";
    ctx.fillStyle = "#f00";
    ctx.fillText("AI 생각 중…", canvas.width - 140, 25);
  }
}

function drawBoard(ctx, tileSize, wallThickness, padding) {
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#b58863";
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const px = padding + x * (tileSize + wallThickness);
      const py = padding + y * (tileSize + wallThickness);
      ctx.fillRect(px, py, tileSize, tileSize);
    }
  }
}

function drawHighlights(ctx, highlights, tileSize, wallThickness, padding) {
  if (!highlights.length) return;
  ctx.fillStyle = "rgba(0,255,0,0.3)";
  for (const m of highlights) {
    const px = padding + m.x * (tileSize + wallThickness);
    const py = padding + m.y * (tileSize + wallThickness);
    ctx.fillRect(px, py, tileSize, tileSize);
  }
}

function drawGhostPawn(ctx, ghost, tileSize) {
  if (!ghost) return;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, tileSize / 3, 0, 2 * Math.PI);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
}

function drawHoverWall(ctx, hoverWall, tileSize, wallThickness, padding) {
  if (!hoverWall) return;
  const { x, y, orientation } = hoverWall;
  const px = padding + x * (tileSize + wallThickness);
  const py = padding + y * (tileSize + wallThickness);
  ctx.fillStyle = "rgba(0,255,0,0.3)";
  if (orientation === "h") {
    ctx.fillRect(px, py + tileSize, tileSize * 2 + wallThickness, wallThickness);
  } else {
    ctx.fillRect(px + tileSize, py, wallThickness, tileSize * 2 + wallThickness);
  }
}

function drawPawns(ctx, pawns, tileSize, wallThickness, padding) {
  const colors = { 1: "#000", 2: "#fff" };
  for (let p of [1, 2]) {
    const { x, y } = pawns[p];
    const px = padding + x * (tileSize + wallThickness) + tileSize / 2;
    const py = padding + y * (tileSize + wallThickness) + tileSize / 2;
    ctx.beginPath();
    ctx.arc(px, py, tileSize / 3, 0, 2 * Math.PI);
    ctx.fillStyle = colors[p];
    ctx.fill();
  }
}

function drawWalls(ctx, walls, tileSize, wallThickness, padding) {
  ctx.fillStyle = "#444";
  for (const w of walls) {
    const { x, y, orientation } = w;
    const px = padding + x * (tileSize + wallThickness);
    const py = padding + y * (tileSize + wallThickness);
    if (orientation === "h") {
      ctx.fillRect(px, py + tileSize, tileSize * 2 + wallThickness, wallThickness);
    } else {
      ctx.fillRect(px + tileSize, py, wallThickness, tileSize * 2 + wallThickness);
    }
  }
}

function drawWallCounts(ctx, wallCounts, padding) {
  ctx.font      = "16px sans-serif";
  ctx.fillStyle = "#000";
  ctx.fillText(`⚫ 남은 벽: ${wallCounts[1]}`, padding, 20);
  ctx.fillText(`⚪ 남은 벽: ${wallCounts[2]}`, padding + 300, 20);
}
