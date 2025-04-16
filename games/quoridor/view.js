// games/quoridor/view.js

export function renderGame(game, canvas) {
    const ctx = canvas.getContext("2d");
    const tileSize = 60;
    const wallThickness = 10;
    const padding = 20;
  
    const size = tileSize * 9 + wallThickness * 8 + padding * 2;
    canvas.width = size;
    canvas.height = size;
  
    ctx.clearRect(0, 0, size, size);
    drawBoard(ctx, tileSize, wallThickness, padding);
    drawPawns(ctx, game.pawns, tileSize, wallThickness, padding);
    drawWalls(ctx, game.placedWalls, tileSize, wallThickness, padding);
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
  
  function drawPawns(ctx, pawns, tileSize, wallThickness, padding) {
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
  
  function drawWalls(ctx, walls, tileSize, wallThickness, padding) {
    ctx.fillStyle = "#444";
  
    for (const wall of walls) {
      const { x, y, orientation } = wall;
      const px = padding + x * (tileSize + wallThickness);
      const py = padding + y * (tileSize + wallThickness);
  
      if (orientation === "h") {
        // 가로벽: 2칸 길이로
        ctx.fillRect(px, py + tileSize, tileSize * 2 + wallThickness, wallThickness);
      } else {
        // 세로벽: 2칸 길이로
        ctx.fillRect(px + tileSize, py, wallThickness, tileSize * 2 + wallThickness);
      }
    }
  }
  