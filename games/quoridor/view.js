// games/quoridor/view.js

import { GameBridge } from "../../bridge/GameBridge.js";
import { detectMove } from "../../utils/detectMove.js";

const tileSize = 60;
const wallThickness = 10;
const padding = 20;
let bridge = new GameBridge();

export function initView(canvas) {
  const ctx = canvas.getContext("2d");

  // 초기 렌더링
  renderGame(bridge.getGame(), canvas);

  // 클릭 이벤트 처리
  canvas.addEventListener("click", (e) => {
    const move = detectMove(e.offsetX, e.offsetY, bridge.getGame(), {
      tileSize,
      wallThickness,
      padding
    });
    if (move && bridge.playUserMove(move)) {
      renderGame(bridge.getGame(), canvas);
      setTimeout(async () => {
        await bridge.playAITurn();
        renderGame(bridge.getGame(), canvas);
      }, 300);
    }
  });
}

export function renderGame(game, canvas) {
  const ctx = canvas.getContext("2d");
  const size = tileSize * 9 + wallThickness * 8 + padding * 2;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);

  drawBoard(ctx);
  drawWalls(ctx, game.walls);
  drawPawns(ctx, game.pawns);
}

function drawBoard(ctx) {
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

function drawWalls(ctx, walls) {
  ctx.fillStyle = "#444";
  for (const w of walls.horizontal) {
    const [x, y] = w.split(',').map(Number);
    const px = padding + x * (tileSize + wallThickness);
    const py = padding + y * (tileSize + wallThickness) + tileSize;
    ctx.fillRect(px, py, tileSize * 2 + wallThickness, wallThickness);
  }
  for (const w of walls.vertical) {
    const [x, y] = w.split(',').map(Number);
    const px = padding + x * (tileSize + wallThickness) + tileSize;
    const py = padding + y * (tileSize + wallThickness);
    ctx.fillRect(px, py, wallThickness, tileSize * 2 + wallThickness);
  }
}

function drawPawns(ctx, pawns) {
  const colors = { 1: "#00f", 2: "#f00" };
  for (let player of [1, 2]) {
    const { x, y } = pawns[player];
    const px = padding + x * (tileSize + wallThickness) + tileSize / 2;
    const py = padding + y * (tileSize + wallThickness) + tileSize / 2;
    ctx.beginPath();
    ctx.arc(px, py, tileSize / 3, 0, 2 * Math.PI);
    ctx.fillStyle = colors[player];
    ctx.fill();
  }
}
