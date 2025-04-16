// games/quoridor/controller.js

import { renderGame } from "./view.js";

export class GameController {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;

    this.tileSize = 60;
    this.wallThickness = 10;
    this.padding = 20;

    canvas.addEventListener("click", (e) => this.handleClick(e));
    renderGame(game, canvas);
  }

  handleClick(e) {
    const move = this.detectMove(e.offsetX, e.offsetY);
    if (!move) return;

    if (move.type === "move") {
      const legalMoves = this.game.getLegalPawnMoves();
      const found = legalMoves.find(m => m.x === move.x && m.y === move.y);
      if (found) {
        this.game.applyMove(found);
        renderGame(this.game, this.canvas);
      }
    }

    if (move.type === "wall") {
      if (this.game.isValidWallPlacement(move)) {
        this.game.applyMove(move);
        renderGame(this.game, this.canvas);
      }
    }
  }

  detectMove(offsetX, offsetY) {
    const unit = this.tileSize + this.wallThickness;
    const x = offsetX - this.padding;
    const y = offsetY - this.padding;
    const gx = Math.floor(x / unit);
    const gy = Math.floor(y / unit);
    const dx = x % unit;
    const dy = y % unit;

    const isTile = dx < this.tileSize && dy < this.tileSize;
    const isHWall = dx < this.tileSize && dy >= this.tileSize;
    const isVWall = dx >= this.tileSize && dy < this.tileSize;

    if (isTile) return { type: "move", x: gx, y: gy };
    if (isHWall) return { type: "wall", x: gx, y: gy, orientation: "h" };
    if (isVWall) return { type: "wall", x: gx, y: gy, orientation: "v" };
    return null;
  }
}
