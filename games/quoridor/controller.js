// games/quoridor/controller.js

import { renderGame } from "./view.js";

export class GameController {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game   = game;

    this.tileSize      = 60;
    this.wallThickness = 10;
    this.padding       = 40;

    this.dragging    = false;
    this.legalMoves  = [];
    this.ghostPos    = null;

    canvas.addEventListener("mousedown", e => this.handleMouseDown(e));
    canvas.addEventListener("mousemove", e => this.handleMouseMove(e));
    canvas.addEventListener("mouseup",   e => this.handleMouseUp(e));
    canvas.addEventListener("click",     e => { if (!this.dragging) this.handleClickWall(e); });

    this._render();
  }

  _render(highlights = [], ghost = null) {
    renderGame(this.game, this.canvas, highlights, ghost);
  }

  /* ─── 말 드래그 → 이동 ─── */

  handleMouseDown(e) {
    const pos = this._gridPos(e.offsetX, e.offsetY);
    if (!pos) return;
    const cur = this.game.pawns[this.game.currentPlayer];
    if (pos.x === cur.x && pos.y === cur.y) {
      this.dragging   = true;
      this.legalMoves = this.game.getLegalPawnMoves();
      this._render(this.legalMoves, { x: e.offsetX, y: e.offsetY });
    }
  }

  handleMouseMove(e) {
    if (!this.dragging) return;
    this.ghostPos = { x: e.offsetX, y: e.offsetY };
    this._render(this.legalMoves, this.ghostPos);
  }

  handleMouseUp(e) {
    if (!this.dragging) return;
    this.dragging = false;

    const pos = this._gridPos(e.offsetX, e.offsetY);
    if (pos) {
      const found = this.legalMoves.find(m => m.x === pos.x && m.y === pos.y);
      if (found) this.game.applyMove(found);
    }

    this.legalMoves = [];
    this.ghostPos   = null;
    this._render();
  }

  /* ─── 클릭 → 벽 설치 ─── */

  handleClickWall(e) {
    const move = this.detectMove(e.offsetX, e.offsetY);
    if (!move || move.type !== "wall") return;
    if (this.game.isValidWallPlacement(move)) {
      this.game.applyMove(move);
      this._render();
    }
  }

  /* ─── 공통 유틸 ─── */

  _gridPos(offsetX, offsetY) {
    const unit = this.tileSize + this.wallThickness;
    const x = offsetX - this.padding;
    const y = offsetY - this.padding;
    const gx = Math.floor(x / unit);
    const gy = Math.floor(y / unit);
    const dx = x % unit, dy = y % unit;
    if (gx < 0 || gy < 0 || gx >= this.game.boardSize || gy >= this.game.boardSize) {
      return null;
    }
    if (dx < this.tileSize && dy < this.tileSize) {
      return { x: gx, y: gy };
    }
    return null;
  }

  detectMove(offsetX, offsetY) {
    const unit = this.tileSize + this.wallThickness;
    const x = offsetX - this.padding;
    const y = offsetY - this.padding;
    const gx = Math.floor(x / unit);
    const gy = Math.floor(y / unit);
    const dx = x % unit, dy = y % unit;

    if (gx < 0 || gy < 0 || gx >= this.game.boardSize || gy >= this.game.boardSize) {
      return null;
    }
    const isTile  = dx < this.tileSize && dy < this.tileSize;
    const isHWall = dx < this.tileSize && dy >= this.tileSize;
    const isVWall = dx >= this.tileSize && dy < this.tileSize;

    if (isTile)     return { type: "move", x: gx, y: gy };
    if (isHWall)    return { type: "wall", x: gx, y: gy, orientation: "h" };
    if (isVWall)    return { type: "wall", x: gx, y: gy, orientation: "v" };
    return null;
  }
}
