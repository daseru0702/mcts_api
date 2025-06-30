// client/games/quoridor/controller.js

import { renderGame }      from "./view.js";
import { QuoridorAdapter }     from "./QuoridorAdapter.js";
import { getBestMove }     from "/api/quoridorApi.js";

const AI_PLAYER = 2;

export class GameController {
  constructor(canvas) {
    this.canvas  = canvas;
    this.adapter = new QuoridorAdapter();

    // --- ★ 캔버스 크기 자동 설정 ★ ---
    const boardSize     = this.adapter.game.boardSize;       // 9
    const tileSize      = 60;
    const wallThick     = 10;
    const padding       = 40;
    // 전체 픽셀 크기 = 패딩*2 + (tileSize*boardSize + wallThickness*(boardSize-1))
    const size = padding*2 + tileSize*boardSize + wallThick*(boardSize-1);
    canvas.width  = size;
    canvas.height = size;
    // ------------------------------------

    this.isThinking = false;
    this.winner     = null;
    this.legalMoves = [];
    this.dragging   = false;
    this.ghostPos   = null;
    this.hoverWall  = null;

    canvas.addEventListener("mousedown", e => this._onMouseDown(e));
    canvas.addEventListener("mousemove", e => this._onMouseMove(e));
    canvas.addEventListener("mouseup",   e => this._onMouseUp(e));
    canvas.addEventListener("mousemove", e => this._onHoverWall(e));
    canvas.addEventListener("click",     e => this._onClickWall(e));

    this._render();
  }

  _render(highlights = [], ghost = null, hoverWall = null) {
    // ★ 반드시 'QuoridorGame' 인스턴스를 넘겨 줘야 뷰가 정상 동작합니다
    renderGame(
      this.adapter.game,   // <-- adapter가 감싸고 있는 실제 QuoridorGame
      this.canvas,
      highlights,
      ghost,
      hoverWall,
      this.isThinking,
      this.winner
    );
  }

  async makeAIMove() {
    this.isThinking = true;
    this._render();

    const stateJson = this.adapter.getStateTensor();
    const best      = await getBestMove("quoridor", stateJson, 1000);

    this.isThinking = false;
    if (best) {
      this.adapter.applyMove(best);
      this._render();
      this._checkVictory();
    }
  }

  _onMouseDown(e) {
    if (this.winner || this.isThinking) return;
    const pos = this._gridPos(e.offsetX, e.offsetY);
    const cur = this.adapter.game.pawns[this.adapter.game.currentPlayer];
    if (pos && pos.x === cur.x && pos.y === cur.y) {
      this.dragging   = true;
      this.legalMoves = this.adapter.game.getLegalPawnMoves();
      this._render(this.legalMoves, { x:e.offsetX,y:e.offsetY });
    }
  }

  _onMouseMove(e) {
    if (this.dragging) {
      this.ghostPos = { x:e.offsetX, y:e.offsetY };
      this._render(this.legalMoves, this.ghostPos);
    }
  }

  _onMouseUp(e) {
    if (!this.dragging) return;
    this.dragging = false;
    const pos = this._gridPos(e.offsetX, e.offsetY);
    if (pos) {
      const mv = this.legalMoves.find(m => m.x===pos.x && m.y===pos.y);
      if (mv) {
        this.adapter.applyMove(mv);
        this._render();
        if (this._checkVictory()) return;
        this.makeAIMove();
      }
    }
    this.legalMoves = [];
    this.ghostPos   = null;
    this._render();
  }

  _onHoverWall(e) {
    if (this.dragging || this.winner || this.isThinking) return;
    const move = this._detectWall(e.offsetX, e.offsetY);
    this.hoverWall = move && this.adapter.game.isValidWallPlacement(move)
      ? move : null;
    this._render([], null, this.hoverWall);
  }

  _onClickWall(e) {
    if (this.dragging || this.winner || this.isThinking) return;
    const move = this._detectWall(e.offsetX, e.offsetY);
    if (move && this.adapter.game.isValidWallPlacement(move)) {
      this.adapter.applyMove(move);
      this._render();
      if (this._checkVictory()) return;
      this.makeAIMove();
    }
  }

  _checkVictory() {
    const p = 3 - this.adapter.game.currentPlayer;
    const pawn = this.adapter.game.pawns[p];
    if ((p===1 && pawn.y===8) || (p===2 && pawn.y===0)) {
      this.winner = p;
      this._render();
      return true;
    }
    return false;
  }

  _gridPos(x, y) {
    const tileSize  = 60, wallThick = 10, padding = 40;
    const unit = tileSize + wallThick;
    const gx = Math.floor((x - padding) / unit);
    const gy = Math.floor((y - padding) / unit);
    const dx = (x - padding) % unit, dy = (y - padding) % unit;
    if (gx<0||gy<0||gx>=this.adapter.game.boardSize||gy>=this.adapter.game.boardSize) return null;
    if (dx<tileSize && dy<tileSize) return { x: gx, y: gy };
    return null;
  }

  _detectWall(x, y) {
    const tileSize  = 60, wallThick = 10, padding = 40;
    const unit = tileSize + wallThick;
    const gx = Math.floor((x - padding) / unit);
    const gy = Math.floor((y - padding) / unit);
    const dx = (x - padding) % unit, dy = (y - padding) % unit;
    if (gx<0||gy<0||gx>=this.adapter.game.boardSize||gy>=this.adapter.game.boardSize) return null;
    if (dx<tileSize && dy>=tileSize)     return { type:"wall", x:gx, y:gy, orientation:"h" };
    if (dx>=tileSize && dy<tileSize)     return { type:"wall", x:gx, y:gy, orientation:"v" };
    return null;
  }
}
