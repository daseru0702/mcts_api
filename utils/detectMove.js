// utils/detectMove.js

export function detectMove(offsetX, offsetY, game, {
    tileSize = 60,
    wallThickness = 10,
    padding = 20
  } = {}) {
    const boardSize = 9;
    let x = offsetX - padding;
    let y = offsetY - padding;
  
    const unit = tileSize + wallThickness;
    const gx = Math.floor(x / unit);
    const gy = Math.floor(y / unit);
    const dx = x % unit;
    const dy = y % unit;
  
    const isTile = dx < tileSize && dy < tileSize;
    const isHWall = dx < tileSize && dy >= tileSize;
    const isVWall = dx >= tileSize && dy < tileSize;
  
    if (gx >= boardSize || gy >= boardSize) return null;
  
    if (isTile) {
      return { type: "move", x: gx, y: gy };
    } else if (isHWall && gx < boardSize - 1 && gy < boardSize - 1) {
      return { type: "wall", x: gx, y: gy, orientation: "h" };
    } else if (isVWall && gx < boardSize - 1 && gy < boardSize - 1) {
      return { type: "wall", x: gx, y: gy, orientation: "v" };
    }
  
    return null;
  }
  