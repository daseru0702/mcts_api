// games/blokus/view.js — 블로커스 듀오 보드 화면 (client/app.js 가 불러 씀)
//
// createView({ svg, onMove, setHint }) → {
//   render(ctx)                ctx = { state, humanTurn, bottomPlayer, colorOf(p), lastMove, stats, showCandidates }
//   notation(move)             기보 표기
//   playerInfo(state, p)       플레이어 카드에 붙는 HTML (놓은 칸 수, 남은 조각)
//   resultText(state, human)   끝났을 때 점수 요약
// }
//
// 보드 아래에 조각 상자를 붙입니다. 조각을 고르고 보드 위에 올리면 놓일 자리가 미리 보입니다.
//   R / 마우스 휠 / 오른쪽 클릭 = 회전,  F = 뒤집기,  Esc = 선택 취소,  고른 조각을 다시 누르면 회전
// 가리킨 칸에 지금 방향으로 놓을 수 있는 자리가 여러 개면, 조각의 가운데에 가까운 칸이 가리킨 칸에 오는 자리를 고릅니다.

import { BlokusGame, N, START } from "./BlokusGame.js";
import { PIECES, ORIENTS, PIECE_ORIENTS, PIECE_SIZES, TOTAL_SQUARES } from "./pieces.js";

const C = 10;          // 칸 간격
const PAD = 0.35;      // 칸 사이 틈 절반
const COLS = "abcdefghijklmn";
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

// ─── 방향 표: 회전·뒤집기 후의 방향 번호, 잡는 칸(가운데에 가장 가까운 칸) ───
function normalize(cells) {
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
const keyOf = cells => normalize(cells).map(c => c.join(",")).join(";");
const byKey = new Map(ORIENTS.map((o, i) => [keyOf(o.cells), i]));
const ROTATE = ORIENTS.map(o => byKey.get(keyOf(o.cells.map(([x, y]) => [-y, x]))));  // 화면에서 시계 방향 90°
const FLIP = ORIENTS.map(o => byKey.get(keyOf(o.cells.map(([x, y]) => [-x, y]))));     // 좌우 뒤집기
const GRAB = ORIENTS.map(o => {
  const cx = (o.w - 1) / 2, cy = (o.h - 1) / 2;
  return o.cells.reduce((best, c) =>
    ((c[0] - cx) ** 2 + (c[1] - cy) ** 2 < (best[0] - cx) ** 2 + (best[1] - cy) ** 2 ? c : best));
});
const placeKey = (o, x, y) => (o * N + y) * N + x;

export function createView({ svg, onMove, setHint }) {
  loadCss();
  svg.setAttribute("viewBox", `-3 -3 ${N * C + 6} ${N * C + 6}`);
  svg.innerHTML = "";

  const layers = {};
  for (const name of ["cells", "marks", "last", "cands", "ghost"]) layers[name] = el("g", {}, svg);
  const cellEls = [];
  for (let i = 0; i < N * N; i++) {
    cellEls.push(el("rect", {
      class: "bk-cell", x: (i % N) * C + PAD, y: ((i / N) | 0) * C + PAD,
      width: C - 2 * PAD, height: C - 2 * PAD, rx: 1.2,
    }, layers.cells));
  }

  // ─── 조각 상자 (보드 틀 바로 아래) ───
  const frame = svg.closest(".board-frame");
  frame.parentElement.classList.add("bk-has-tray");
  frame.parentElement.querySelector(".bk-tray")?.remove();
  const tray = document.createElement("div");
  tray.className = "bk-tray";
  tray.innerHTML = `
    <div class="bk-pieces"></div>
    <div class="bk-tools">
      <button type="button" data-act="rotate" title="회전 (R)">⟳ 회전</button>
      <button type="button" data-act="flip" title="뒤집기 (F)">⇋ 뒤집기</button>
      <button type="button" data-act="pass" class="bk-pass hidden">패스</button>
    </div>`;
  frame.after(tray);
  const pieceBtns = PIECES.map((p, piece) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bk-piece";
    b.title = `${p.name} (${PIECE_SIZES[piece]}칸)`;
    b.dataset.piece = piece;
    b.appendChild(document.createElementNS(NS, "svg"));
    tray.querySelector(".bk-pieces").appendChild(b);
    return b;
  });
  const passBtn = tray.querySelector(".bk-pass");

  let ctx = null;
  let legal = new Set();          // 사람 차례의 합법 배치 (placeKey)
  let movable = new Set();        // 놓을 곳이 있는 조각
  let sel = null;                 // 고른 조각
  let orient = null;              // 고른 조각의 지금 방향
  const lastOrient = {};          // 조각마다 마지막으로 쓴 방향
  let hoverCell = null;           // 마우스/터치가 가리키는 칸 { x, y }
  let armed = null;               // 터치: 미리보기 중인 배치 (같은 자리를 다시 누르면 놓음)

  const me = () => ctx.state.getCurrentPlayer();

  function computeLegal() {
    legal = new Set();
    movable = new Set();
    if (!ctx.humanTurn) return;
    for (const m of ctx.state.game.getPlacements()) {
      legal.add(placeKey(m.orient, m.x, m.y));
      movable.add(m.piece);
    }
  }

  /** 가리킨 칸에 지금 방향으로 놓을 배치 → { move, legal } */
  function placementAt(hx, hy) {
    const o = ORIENTS[orient];
    const [gx, gy] = GRAB[orient];
    const tries = o.cells
      .map(([cx, cy]) => ({ x: hx - cx, y: hy - cy, d: (cx - gx) ** 2 + (cy - gy) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (const t of tries) {
      if (legal.has(placeKey(orient, t.x, t.y))) {
        return { move: { type: "place", piece: sel, orient, x: t.x, y: t.y }, legal: true };
      }
    }
    const x = Math.max(0, Math.min(N - o.w, hx - gx)), y = Math.max(0, Math.min(N - o.h, hy - gy));
    return { move: { type: "place", piece: sel, orient, x, y }, legal: false };
  }

  const sameMove = (a, b) => a && b && a.orient === b.orient && a.x === b.x && a.y === b.y;

  // ─── 그리기 ───
  function draw() {
    const g = ctx.state.game;
    for (let c = 0; c < N * N; c++) {
      const v = g.board[c];
      cellEls[c].setAttribute("class", v ? `bk-cell bk-${ctx.colorOf(v)}` : "bk-cell");
    }

    // 시작점, 내가 시작할 수 있는 칸
    layers.marks.innerHTML = "";
    for (const p of [1, 2]) {
      const s = START[p];
      if (g.board[s]) continue;
      el("circle", { class: `bk-start bk-start-${ctx.colorOf(p)}`, cx: (s % N + 0.5) * C, cy: (((s / N) | 0) + 0.5) * C, r: 2.6 }, layers.marks);
    }
    if (ctx.humanTurn) {
      for (const c of g.cornerCells(me())) {
        el("circle", { class: "bk-corner", cx: (c % N + 0.5) * C, cy: (((c / N) | 0) + 0.5) * C, r: 1.3 }, layers.marks);
      }
    }

    // 마지막 수 테두리
    layers.last.innerHTML = "";
    if (ctx.lastMove?.type === "place") outline(ctx.lastMove, "bk-last", layers.last);

    drawCandidates();
    drawGhost();
    drawTray();
  }

  /** 배치가 차지하는 칸들을 테두리 사각형으로 */
  function outline(move, cls, parent) {
    const g = el("g", { class: cls }, parent);
    for (const c of BlokusGame.cellsOf(move)) {
      el("rect", { x: (c % N) * C + PAD, y: ((c / N) | 0) * C + PAD, width: C - 2 * PAD, height: C - 2 * PAD, rx: 1.2 }, g);
    }
    return g;
  }

  function drawGhost() {
    layers.ghost.innerHTML = "";
    if (!ctx.humanTurn || sel === null || !hoverCell) return;
    const { move, legal: ok } = placementAt(hoverCell.x, hoverCell.y);
    outline(move, `bk-ghost ${ok ? "ok" : "bad"}`, layers.ghost);
  }

  function drawCandidates() {
    layers.cands.innerHTML = "";
    if (!ctx.showCandidates || !ctx.stats) return;
    const total = ctx.stats.simulations || 1;
    ctx.stats.candidates.slice(0, 4).forEach((c, i) => {
      const pct = Math.round((c.visits / total) * 100);
      if (pct < 2 || c.move.type !== "place") return;
      const g = outline(c.move, `bk-cand${i === 0 ? " bk-cand-best" : ""}`, layers.cands);
      const cells = BlokusGame.cellsOf(c.move);
      const cx = cells.reduce((a, k) => a + (k % N) + 0.5, 0) / cells.length * C;
      const cy = cells.reduce((a, k) => a + ((k / N) | 0) + 0.5, 0) / cells.length * C;
      el("text", { class: "bk-cand-label", x: cx, y: cy + 1.4 }, g).textContent = `${pct}%`;
    });
  }

  function drawPieceIcon(svgEl, o) {
    const { cells, w, h } = ORIENTS[o];
    const S = 5;
    svgEl.setAttribute("viewBox", `0 0 ${S} ${S}`);
    svgEl.innerHTML = "";
    const ox = (S - w) / 2, oy = (S - h) / 2;
    for (const [x, y] of cells) el("rect", { x: ox + x + 0.06, y: oy + y + 0.06, width: 0.88, height: 0.88, rx: 0.15 }, svgEl);
  }

  function drawTray() {
    const p = ctx.humanTurn ? me() : ctx.bottomPlayer;
    const rem = ctx.state.game.remaining[p];
    tray.classList.toggle("waiting", !ctx.humanTurn);
    tray.dataset.color = ctx.colorOf(p);
    pieceBtns.forEach((b, piece) => {
      b.classList.toggle("used", !rem[piece]);
      b.classList.toggle("stuck", ctx.humanTurn && !!rem[piece] && !movable.has(piece));
      b.classList.toggle("on", sel === piece);
      b.disabled = !ctx.humanTurn || !rem[piece];
      drawPieceIcon(b.firstChild, sel === piece ? orient : lastOrient[piece] ?? PIECE_ORIENTS[piece][0]);
    });
    const mustPass = ctx.humanTurn && movable.size === 0;
    passBtn.classList.toggle("hidden", !mustPass);
    for (const b of tray.querySelectorAll("[data-act=rotate],[data-act=flip]")) b.disabled = !ctx.humanTurn || sel === null;
    if (mustPass) setHint?.("놓을 수 있는 조각이 없어요. 패스를 누르세요.");
  }

  // ─── 조작 ───
  function select(piece) {
    if (!ctx?.humanTurn || !ctx.state.game.remaining[me()][piece]) return;
    if (sel === piece) { turn(ROTATE); return; }
    sel = piece;
    orient = lastOrient[piece] ?? PIECE_ORIENTS[piece][0];
    armed = null;
    if (!movable.has(piece)) setHint?.("이 조각은 지금 놓을 곳이 없어요. 다른 조각을 골라 보세요.");
    draw();
  }

  function turn(table) {
    if (sel === null || !ctx?.humanTurn) return;
    orient = table[orient];
    lastOrient[sel] = orient;
    armed = null;
    draw();
  }

  function commit(move) {
    lastOrient[move.piece] = move.orient;
    sel = null;
    orient = null;
    armed = null;
    hoverCell = null;
    onMove(move);
  }

  tray.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.piece != null) select(parseInt(b.dataset.piece, 10));
    else if (b.dataset.act === "rotate") turn(ROTATE);
    else if (b.dataset.act === "flip") turn(FLIP);
    else if (b.dataset.act === "pass" && ctx?.humanTurn) onMove({ type: "pass" });
  });

  document.addEventListener("keydown", e => {
    if (!ctx?.humanTurn || e.target.closest?.("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "r") turn(ROTATE);
    else if (k === "f") turn(FLIP);
    else if (k === "escape" && sel !== null) { sel = null; armed = null; draw(); }
  });

  function cellAt(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.floor(p.x / C), y = Math.floor(p.y / C);
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }

  svg.addEventListener("pointermove", evt => {
    if (evt.pointerType !== "mouse" || !ctx?.humanTurn || sel === null) return;
    const c = cellAt(evt);
    if (c?.x !== hoverCell?.x || c?.y !== hoverCell?.y) { hoverCell = c; drawGhost(); }
  });
  svg.addEventListener("pointerleave", () => { if (hoverCell && !armed) { hoverCell = null; if (ctx) drawGhost(); } });
  svg.addEventListener("wheel", evt => {
    if (!ctx?.humanTurn || sel === null) return;
    evt.preventDefault();
    turn(ROTATE);
  }, { passive: false });
  svg.addEventListener("contextmenu", evt => {
    if (!ctx?.humanTurn || sel === null) return;
    evt.preventDefault();
    turn(ROTATE);
  });

  svg.addEventListener("pointerup", evt => {
    if (evt.button !== 0 || !ctx?.humanTurn) return;
    const c = cellAt(evt);
    if (!c) return;
    if (sel === null) { setHint?.("아래에서 놓을 조각을 먼저 고르세요."); return; }
    hoverCell = c;
    const { move, legal: ok } = placementAt(c.x, c.y);
    if (!ok) {
      armed = null;
      drawGhost();
      setHint?.("여기엔 놓을 수 없어요. 내 조각과 꼭짓점으로만 닿고, 변으로는 닿으면 안 돼요.");
      return;
    }
    if (evt.pointerType === "mouse" || sameMove(armed, move)) {
      commit(move);
    } else {
      armed = move;
      drawGhost();
      setHint?.("같은 자리를 한 번 더 누르면 놓아요. 회전·뒤집기 버튼으로 방향을 바꿀 수 있어요.");
    }
  });

  const placed = (state, p) => state.game.placedSquares[p];

  return {
    render(next) {
      ctx = next;
      if (!ctx.humanTurn) { sel = null; orient = null; armed = null; hoverCell = null; }
      computeLegal();
      draw();
    },
    notation(move) {
      return move.type === "pass" ? "패스" : `${PIECES[move.piece].name}·${COLS[move.x]}${move.y + 1}`;
    },
    playerInfo(state, p) {
      const g = state.game;
      const left = g.remaining[p].reduce((a, b) => a + b, 0);
      return `<div class="bk-info" title="놓은 칸 / 전체 ${TOTAL_SQUARES}칸, 남은 조각 수"><b>${placed(state, p)}</b>칸 · 조각 ${left}` +
        (g.passed[p] ? ` · <span class="bk-passed">패스</span>` : "") + "</div>";
    },
    resultText(state, human) {
      return `나 ${placed(state, human)}칸 : AI ${placed(state, 3 - human)}칸`;
    },
  };
}
