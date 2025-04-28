// client/games/quoridor/controller.js

import { renderGame } from "./view.js";
import { QuoridorGame } from "../../../ai-server/games/quoridor/QuoridorGame.js";
import { getBestMove } from "../../api/quoridorApi.js";

const HUMAN_PLAYER = 1;
const AI_PLAYER    = 2;

export class GameController {
  constructor(canvas, game) {
    this.canvas        = canvas;
    this.game          = game;
    this.tileSize      = 60;
    this.wallThickness = 10;
    this.padding       = 40;

    this.dragging    = false;
    this.legalMoves  = [];
    this.ghostPos    = null;
    this.hoverWall   = null;
    this.isThinking  = false;
    this.winner      = null;

    // 마우스/클릭 이벤트
    canvas.addEventListener("mousedown", e => this.handleMouseDown(e));
    canvas.addEventListener("mousemove", e => this.handleMouseMove(e));
    canvas.addEventListener("mouseup",   e => this.handleMouseUp(e));
    canvas.addEventListener("mousemove", e => {
      if (!this.dragging && !this.winner) this.updateHoverWall(e);
    });
    canvas.addEventListener("click", e => {
      if (!this.dragging && !this.winner) this.handleClickWall(e);
    });

    this._render();
  }

  _render(highlights = [], ghost = null, hoverWall = null) {
    renderGame(
      this.game,
      this.canvas,
      highlights,
      ghost,
      hoverWall,
      this.isThinking
    );
  }

  /* ─── AI 호출 (서버 API) ─── */
  async makeAIMove() {
    this.isThinking = true;
    this._render();

    const best = await getBestMove(this.game);
    this.isThinking = false;

    if (best) {
      this.game.applyMove(best);
      this._render();
      if (this.checkVictory()) return;
    }
  }

  /* ─── 말 드래그 이동 ─── */
  handleMouseDown(e) {
    if (this.winner) return;
    const pos = this._gridPos(e.offsetX, e.offsetY);
    if (!pos) return;
    const cur = this.game.pawns[this.game.currentPlayer];
    if (pos.x === cur.x && pos.y === cur.y) {
      this.dragging   = true;
      this.legalMoves = this.game.getLegalPawnMoves();
      this._render(this.legalMoves, { x: e.offsetX, y: e.offsetY }, null);
    }
  }

  handleMouseMove(e) {
    if (this.dragging) {
      this.ghostPos = { x: e.offsetX, y: e.offsetY };
      this._render(this.legalMoves, this.ghostPos, null);
    }
  }

  handleMouseUp(e) {
    if (!this.dragging) return;
    this.dragging = false;

    const pos = this._gridPos(e.offsetX, e.offsetY);
    if (pos) {
      const found = this.legalMoves.find(m => m.x === pos.x && m.y === pos.y);
      if (found) {
        this.game.applyMove(found);
        this._render();

        if (this.checkVictory()) return;
        if (this.game.currentPlayer === AI_PLAYER) {
          this.makeAIMove();
        }
      }
    }

    this.legalMoves = [];
    this.ghostPos   = null;
    this._render();
  }

  /* ─── 벽 설치 미리보기 & 클릭 ─── */
  updateHoverWall(e) {
    const move = this.detectMove(e.offsetX, e.offsetY);
    if (move?.type === "wall" && this.game.isValidWallPlacement(move)) {
      this.hoverWall = move;
    } else {
      this.hoverWall = null;
    }
    this._render([], null, this.hoverWall);
  }

  handleClickWall(e) {
    const move = this.detectMove(e.offsetX, e.offsetY);
    if (move?.type === "wall" && this.game.isValidWallPlacement(move)) {
      this.game.applyMove(move);
      this._render();

      if (this.checkVictory()) return;
      if (this.game.currentPlayer === AI_PLAYER) {
        this.makeAIMove();
      }
    }
  }

  /* ─── 승리 체크 ─── */
  checkVictory() {
    const p = 3 - this.game.currentPlayer;
    const pawn = this.game.pawns[p];
    if ((p === 1 && pawn.y === 8) || (p === 2 && pawn.y === 0)) {
      this.winner = p;
      this._render();
      return true;
    }
    return false;
  }

  /* ─── 좌표 변환 헬퍼 ─── */
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
    if (dx < this.tileSize && dy < this.tileSize) {
      return { type: "move", x: gx, y: gy };
    }
    if (dx < this.tileSize && dy >= this.tileSize) {
      return { type: "wall", x: gx, y: gy, orientation: "h" };
    }
    if (dx >= this.tileSize && dy < this.tileSize) {
      return { type: "wall", x: gx, y: gy, orientation: "v" };
    }
    return null;
  }
}
