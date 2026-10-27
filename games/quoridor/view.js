// games/quoridor/view.js — 쿼리도 보드 화면 (client/app.js 가 불러 씀)
//
// createView({ svg, onMove, setHint }) → {
//   render(ctx)              ctx = { state, humanTurn, bottomPlayer, colorOf(p), lastMove, stats, showCandidates }
//   notation(move)           기보 표기
//   playerInfo(state, p)     플레이어 카드에 붙는 HTML (남은 벽)
// }

const C = 10;          // 칸 크기
const G = 3;           // 홈(벽 자리) 두께
const S = C + G;       // 칸 간격
const SPAN = 9 * C + 8 * G;
const COLS = "abcdefghi";
const NS = "http://www.w3.org/2000/svg";

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

function loadCss() {
  const href = new URL("./view.css", import.meta.url).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function createView({ svg, onMove, setHint }) {
  loadCss();
  svg.setAttribute("viewBox", "-5 -5 124 124");
  svg.innerHTML = "";

  const layers = {};
  for (const name of ["goals", "cells", "legal", "walls", "ghost", "pawns", "cands"]) layers[name] = el("g", {}, svg);
  const cellEls = [];
  for (let i = 0; i < 81; i++) cellEls.push(el("rect", { class: "cell", width: C, height: C, rx: 1.6 }, layers.cells));
  const pawnEls = {};
  for (const p of [1, 2]) {
    const g = el("g", { class: "pawn" }, layers.pawns);
    el("circle", { class: "body", r: 3.8, cx: 0, cy: 0 }, g);
    el("circle", { class: "shine", r: 1.2, cx: -1.2, cy: -1.3 }, g);
    pawnEls[p] = g;
  }

  let ctx = null;            // 마지막 render 인자
  let hover = null;          // 벽 미리보기
  let touchArmed = null;     // 터치: 한 번 누르면 미리보기, 다시 누르면 설치

  // bottomPlayer 가 화면 아래쪽에 오도록 뒤집기 (Player 1 은 y=0 에서 출발)
  const flip = () => ctx.bottomPlayer === 1;
  const dRow = y => (flip() ? 8 - y : y);
  const dWallRow = y => (flip() ? 7 - y : y);
  const cellPos = (x, y) => [x * S, dRow(y) * S];
  const wallRect = w => {
    const top = dWallRow(w.y);
    return w.orientation === "h"
      ? { x: w.x * S, y: top * S + C, width: 2 * C + G, height: G }
      : { x: w.x * S + C, y: top * S, width: G, height: 2 * C + G };
  };
  const sameWall = (a, b) => a && b && a.x === b.x && a.y === b.y && a.orientation === b.orientation;

  function draw() {
    const g = ctx.state.game;
    const legal = ctx.humanTurn ? g.getLegalPawnMoves() : [];
    const legalSet = new Set(legal.map(m => m.y * 9 + m.x));
    const lastCell = ctx.lastMove?.type === "move" ? ctx.lastMove : null;

    layers.legal.innerHTML = "";
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const r = cellEls[y * 9 + x];
        const [px, py] = cellPos(x, y);
        r.setAttribute("x", px);
        r.setAttribute("y", py);
        r.classList.toggle("legal", legalSet.has(y * 9 + x));
        r.classList.toggle("last", !!lastCell && lastCell.x === x && lastCell.y === y);
        if (legalSet.has(y * 9 + x)) el("circle", { class: "legal-dot", cx: px + C / 2, cy: py + C / 2, r: 1.6 }, layers.legal);
      }
    }

    // 목표선: 각 플레이어가 도달해야 하는 쪽
    layers.goals.innerHTML = "";
    for (const p of [1, 2]) {
      const topSide = dRow(p === 1 ? 8 : 0) === 0;
      el("rect", { class: `goal-${ctx.colorOf(p)}`, x: 0, y: topSide ? -3.6 : SPAN + 1.6, width: SPAN, height: 2, rx: 1 }, layers.goals);
    }

    layers.walls.innerHTML = "";
    const lastWall = ctx.lastMove?.type === "wall" ? ctx.lastMove : null;
    for (const w of g.placedWalls) {
      el("rect", { ...wallRect(w), rx: 1, class: `wall${sameWall(w, lastWall) ? " last" : ""}` }, layers.walls);
    }

    layers.ghost.innerHTML = "";
    if (ctx.humanTurn && hover) el("rect", { ...wallRect(hover), rx: 1, class: "wall-ghost" }, layers.ghost);

    for (const p of [1, 2]) {
      const [px, py] = cellPos(g.pawns[p].x, g.pawns[p].y);
      pawnEls[p].setAttribute("class", `pawn ${ctx.colorOf(p)}`);
      pawnEls[p].style.transform = `translate(${px + C / 2}px, ${py + C / 2}px)`;
    }

    drawCandidates();
  }

  function drawCandidates() {
    layers.cands.innerHTML = "";
    if (!ctx.showCandidates || !ctx.stats) return;
    const total = ctx.stats.simulations || 1;
    ctx.stats.candidates.slice(0, 5).forEach((c, i) => {
      const pct = Math.round((c.visits / total) * 100);
      if (pct < 2) return;
      const g = el("g", { class: `cand${i === 0 ? " cand-best" : ""}` }, layers.cands);
      let lx, ly;
      if (c.move.type === "move") {
        const [px, py] = cellPos(c.move.x, c.move.y);
        el("rect", { class: "cand-move", x: px + 0.6, y: py + 0.6, width: C - 1.2, height: C - 1.2, rx: 1.4 }, g);
        lx = px + C / 2; ly = py + C / 2 + 1.1;
      } else {
        const r = wallRect(c.move);
        el("rect", { ...r, rx: 1, class: "cand-wall" }, g);
        lx = r.x + r.width / 2; ly = r.y + r.height / 2 + 1.1;
      }
      el("text", { class: "cand-label", x: lx, y: ly }, g).textContent = `${pct}%`;
    });
  }

  // ─── 입력 ──────────────────────────────────────────────────────
  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /** 포인터 위치 → { cell } 또는 { wall } */
  function hitTest(evt) {
    const { x: px, y: py } = svgPoint(evt);
    if (px < 0 || py < 0 || px > SPAN || py > SPAN) return null;
    const inHGroove = py % S >= C && py < SPAN - 0.01;
    const inVGroove = px % S >= C && px < SPAN - 0.01;
    const clamp = v => Math.max(0, Math.min(7, v));
    if (inHGroove && (!inVGroove || hover?.orientation !== "v")) {
      const r = Math.floor(py / S);
      const wx = clamp(Math.round((px - C - G / 2) / S));
      return { wall: { type: "wall", x: wx, y: flip() ? 7 - r : r, orientation: "h" } };
    }
    if (inVGroove) {
      const c = Math.floor(px / S);
      const j = clamp(Math.round((py - C - G / 2) / S));
      return { wall: { type: "wall", x: clamp(c), y: flip() ? 7 - j : j, orientation: "v" } };
    }
    const cx = Math.floor(px / S), cy = Math.floor(py / S);
    return { cell: { x: cx, y: flip() ? 8 - cy : cy } };
  }

  function commit(move) {
    hover = null;
    touchArmed = null;
    onMove(move);
  }

  svg.addEventListener("pointermove", evt => {
    if (evt.pointerType !== "mouse" || !ctx?.humanTurn) return;
    const hit = hitTest(evt);
    const w = hit?.wall && ctx.state.game.isValidWallPlacement(hit.wall) ? hit.wall : null;
    if (!sameWall(w, hover) && (w || hover)) {
      hover = w;
      draw();
    }
  });

  svg.addEventListener("pointerleave", () => {
    if (hover) { hover = null; if (ctx) draw(); }
  });

  svg.addEventListener("pointerup", evt => {
    if (!ctx?.humanTurn) return;
    const hit = hitTest(evt);
    if (!hit) return;
    const g = ctx.state.game;
    if (hit.cell) {
      const mv = g.getLegalPawnMoves().find(m => m.x === hit.cell.x && m.y === hit.cell.y);
      if (mv) commit(mv);
      else if (touchArmed) { touchArmed = null; hover = null; draw(); }
      return;
    }
    const w = hit.wall;
    if (!g.isValidWallPlacement(w)) return;
    if (evt.pointerType === "mouse" || sameWall(touchArmed, w)) {
      commit(w);
    } else {
      touchArmed = w;
      hover = w;
      draw();
      setHint?.("같은 자리를 한 번 더 누르면 벽이 설치됩니다.");
    }
  });

  return {
    render(next) {
      if (!next.humanTurn) { hover = null; touchArmed = null; }
      ctx = next;
      draw();
    },
    notation(move) {
      return move.type === "move"
        ? `${COLS[move.x]}${move.y + 1}`
        : `${COLS[move.x]}${move.y + 1}${move.orientation}`;
    },
    playerInfo(state, player) {
      const n = state.game.wallCounts[player];
      const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? "" : "used"}"></i>`).join("");
      return `<div class="q-walls" title="남은 벽 ${n}개">${pips}</div>`;
    },
  };
}
