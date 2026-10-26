// client/app.js — 전시용 쿼리도 클라이언트
import { QuoridorGame } from "/games/quoridor/QuoridorGame.js";

// ─── 보드 기하 (SVG 단위) ─────────────────────────────────────────
const C = 10;          // 칸 크기
const G = 3;           // 홈(벽 자리) 두께
const S = C + G;       // 칸 간격
const SPAN = 9 * C + 8 * G;
const COLS = "abcdefghi";
const IDLE_DEMO_MS = 150_000;

const $ = id => document.getElementById(id);
const svg = $("board");
const NS = "http://www.w3.org/2000/svg";

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

// ─── 상태 ────────────────────────────────────────────────────────
const ui = {
  game: new QuoridorGame(),
  snapshots: [],        // 각 수 이전 상태 JSON
  log: [],              // { player, move }
  humanPlayer: 1,
  level: "normal",
  demo: false,
  thinking: false,
  token: 0,             // 진행 중인 AI 요청 무효화용
  stats: null,          // 마지막 AI 탐색 결과
  statsPlayer: null,
  lastMove: null,
  hover: null,          // 벽 미리보기
  touchArmed: null,     // 터치: 한 번 누르면 미리보기, 다시 누르면 설치
};

const isAI = p => ui.demo || p !== ui.humanPlayer;
// 사람(또는 데모의 P1)이 화면 아래쪽에 오도록 뒤집기
const flip = () => (ui.demo ? 1 : ui.humanPlayer) === 1;
const dRow = y => (flip() ? 8 - y : y);         // 칸 행 → 화면 행
const dWallRow = y => (flip() ? 7 - y : y);     // 벽 행 → 화면 행
const colorOf = p => (p === (ui.demo ? 1 : ui.humanPlayer) ? "human" : "ai");

// ─── SVG 레이어 ──────────────────────────────────────────────────
const layers = {};
function buildBoard() {
  svg.innerHTML = "";
  layers.goals = el("g", {}, svg);
  layers.cells = el("g", {}, svg);
  layers.legal = el("g", {}, svg);
  layers.walls = el("g", {}, svg);
  layers.ghost = el("g", {}, svg);
  layers.pawns = el("g", {}, svg);
  layers.cands = el("g", {}, svg);

  ui.cellEls = [];
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      ui.cellEls.push(el("rect", { class: "cell", width: C, height: C, rx: 1.6 }, layers.cells));
    }
  }
  ui.pawnEls = {};
  for (const p of [1, 2]) {
    const g = el("g", { class: "pawn" }, layers.pawns);
    el("circle", { class: "body", r: 3.8, cx: 0, cy: 0 }, g);
    el("circle", { class: "shine", r: 1.2, cx: -1.2, cy: -1.3 }, g);
    ui.pawnEls[p] = g;
  }
}

function cellPos(x, y) {
  return [x * S, dRow(y) * S];
}

function wallRect(w) {
  const top = dWallRow(w.y);
  return w.orientation === "h"
    ? { x: w.x * S, y: top * S + C, width: 2 * C + G, height: G }
    : { x: w.x * S + C, y: top * S, width: G, height: 2 * C + G };
}

function notation(move, player) {
  if (move.type === "move") return `${COLS[move.x]}${move.y + 1}`;
  return `${COLS[move.x]}${move.y + 1}${move.orientation}`;
}

// ─── 렌더링 ──────────────────────────────────────────────────────
function render() {
  const g = ui.game;
  const winner = g.getWinner();
  const turn = g.currentPlayer;
  const humanTurn = !winner && !ui.thinking && !isAI(turn);

  // 칸 위치 + 이동 가능 표시
  const legal = humanTurn ? g.getLegalPawnMoves() : [];
  const legalSet = new Set(legal.map(m => m.y * 9 + m.x));
  const lastCell = ui.lastMove?.move.type === "move" ? ui.lastMove.move : null;
  layers.legal.innerHTML = "";
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const r = ui.cellEls[y * 9 + x];
      const [px, py] = cellPos(x, y);
      r.setAttribute("x", px);
      r.setAttribute("y", py);
      r.dataset.x = x;
      r.dataset.y = y;
      r.classList.toggle("legal", legalSet.has(y * 9 + x));
      r.classList.toggle("last", !!lastCell && lastCell.x === x && lastCell.y === y);
      if (legalSet.has(y * 9 + x)) el("circle", { class: "legal-dot", cx: px + C / 2, cy: py + C / 2, r: 1.6 }, layers.legal);
    }
  }

  // 목표선: 각 플레이어가 도달해야 하는 쪽
  layers.goals.innerHTML = "";
  for (const p of [1, 2]) {
    const goalY = p === 1 ? 8 : 0;
    const topSide = dRow(goalY) === 0;
    el("rect", { class: `goal-${colorOf(p)}`, x: 0, y: topSide ? -3.6 : SPAN + 1.6, width: SPAN, height: 2, rx: 1 }, layers.goals);
  }

  // 벽
  layers.walls.innerHTML = "";
  const lastWall = ui.lastMove?.move.type === "wall" ? ui.lastMove.move : null;
  for (const w of g.placedWalls) {
    const isLast = lastWall && lastWall.x === w.x && lastWall.y === w.y && lastWall.orientation === w.orientation;
    el("rect", { ...wallRect(w), rx: 1, class: `wall${isLast ? " last" : ""}` }, layers.walls);
  }

  // 벽 미리보기
  layers.ghost.innerHTML = "";
  if (humanTurn && ui.hover) el("rect", { ...wallRect(ui.hover), rx: 1, class: "wall-ghost" }, layers.ghost);

  // 말
  for (const p of [1, 2]) {
    const [px, py] = cellPos(g.pawns[p].x, g.pawns[p].y);
    const pe = ui.pawnEls[p];
    pe.setAttribute("class", `pawn ${colorOf(p)}`);
    pe.style.transform = `translate(${px + C / 2}px, ${py + C / 2}px)`;
  }

  renderCandidates();
  renderPanel();
}

function renderCandidates() {
  layers.cands.innerHTML = "";
  if (!$("chkThinking").checked || !ui.stats) return;
  const total = ui.stats.simulations || 1;
  ui.stats.candidates.slice(0, 5).forEach((c, i) => {
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
    const t = el("text", { class: "cand-label", x: lx, y: ly }, g);
    t.textContent = `${pct}%`;
  });
}

function renderPanel() {
  const g = ui.game;
  const winner = g.getWinner();
  const turn = g.currentPlayer;
  const human = ui.demo ? 1 : ui.humanPlayer;
  const ai = 3 - human;

  // 상태 표시
  const st = $("status");
  let text, cls;
  if (winner) {
    cls = "over";
    text = ui.demo ? `${winner === 1 ? "주황" : "청록"} AI 승리` : winner === human ? "🎉 승리했습니다!" : "AI 승리";
  } else if (ui.thinking || isAI(turn)) {
    cls = "ai";
    text = ui.demo ? `${turn === human ? "주황" : "청록"} AI 생각 중…` : "AI가 생각 중…";
  } else {
    cls = "human";
    text = "당신의 차례";
  }
  st.className = `status ${cls}`;
  $("statusText").textContent = text;

  // 플레이어 카드
  $("aiName").textContent = ui.demo ? "청록 AI" : `AI · ${{ easy: "쉬움", normal: "보통", hard: "어려움" }[ui.level]}`;
  document.querySelector("#cardHuman .pname").textContent = ui.demo ? "주황 AI" : "나";
  $("cardHuman").classList.toggle("turn", !winner && turn === human);
  $("cardAI").classList.toggle("turn", !winner && turn === ai);
  const pips = n => Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? "" : "used"}"></i>`).join("");
  $("wallsHuman").innerHTML = pips(g.wallCounts[human]);
  $("wallsAI").innerHTML = pips(g.wallCounts[ai]);

  // 승률 게이지 (청록=AI 쪽 기준)
  let aiProb = 0.5;
  if (winner) aiProb = winner === ai ? 1 : 0;
  else if (ui.stats) {
    const pOfStats = (ui.stats.value + 1) / 2;       // stats 를 계산한 플레이어 기준
    aiProb = ui.statsPlayer === ai ? pOfStats : 1 - pOfStats;
  }
  $("gaugeHuman").style.width = `${(1 - aiProb) * 100}%`;
  $("gaugeHumanLabel").textContent = `${ui.demo ? "주황" : "나"} ${Math.round((1 - aiProb) * 100)}%`;
  $("gaugeAILabel").textContent = `${ui.demo ? "청록" : "AI"} ${Math.round(aiProb * 100)}%`;
  $("evalMeta").textContent = ui.stats ? `${ui.stats.simulations} sims · ${ui.lastMs ?? "-"}ms` : "";

  // 기보
  const list = $("moveList");
  list.innerHTML = "";
  for (let i = 0; i < ui.log.length; i += 2) {
    const a = ui.log[i], b = ui.log[i + 1];
    list.insertAdjacentHTML("beforeend",
      `<li class="n">${i / 2 + 1}.</li><li class="${colorOf(a.player) === "human" ? "h" : "a"}">${notation(a.move)}</li>` +
      `<li class="${b && colorOf(b.player) === "human" ? "h" : "a"}">${b ? notation(b.move) : ""}</li>`);
  }
  list.scrollTop = list.scrollHeight;

  // 버튼
  $("btnUndo").disabled = ui.demo || ui.thinking || !ui.log.some(l => l.player === ui.humanPlayer);
  $("btnDemo").classList.toggle("on", ui.demo);
  $("btnDemo").textContent = ui.demo ? "■ 데모 중지" : "▶ AI vs AI 데모";
  $("hint").classList.toggle("hidden", ui.demo || !!winner);

  // 종료 오버레이
  const ov = $("overlay");
  if (winner && !ui.demo) {
    ov.classList.remove("hidden");
    $("overlayTitle").textContent = winner === human ? "승리! 🎉" : "AI 승리";
    $("overlaySub").textContent = winner === human
      ? `${Math.ceil(ui.log.length / 2)}수 만에 AI를 이겼습니다.`
      : "벽으로 AI의 길을 막아 보세요. 난이도를 낮춰도 좋아요.";
  } else {
    ov.classList.add("hidden");
  }
}

// ─── 게임 진행 ──────────────────────────────────────────────────
function play(move) {
  ui.snapshots.push(ui.game.toJSON());
  ui.log.push({ player: ui.game.currentPlayer, move });
  ui.game.applyMove(move);
  ui.lastMove = { move };
  ui.hover = null;
  ui.touchArmed = null;
  render();
  maybeAI();
}

function newGame({ demo = false } = {}) {
  ui.token++;
  ui.demo = demo;
  ui.game = new QuoridorGame();
  ui.snapshots = [];
  ui.log = [];
  ui.stats = null;
  ui.lastMove = null;
  ui.thinking = false;
  ui.hover = null;
  render();
  maybeAI();
}

async function maybeAI() {
  const g = ui.game;
  if (g.getWinner()) {
    if (ui.demo) {
      const token = ui.token;
      setTimeout(() => { if (ui.demo && token === ui.token) newGame({ demo: true }); }, 5000);
    }
    return;
  }
  if (!isAI(g.currentPlayer) || ui.thinking) return;

  const token = ++ui.token;
  ui.thinking = true;
  render();
  const started = Date.now();
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: g.toJSON(), level: ui.demo ? "normal" : ui.level }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    // 너무 빨리 두면 사람이 따라가기 어려우므로 최소 지연
    const minDelay = ui.demo ? 700 : 350;
    await new Promise(r => setTimeout(r, Math.max(0, minDelay - (Date.now() - started))));
    if (token !== ui.token) return;
    ui.thinking = false;
    ui.stats = data.stats;
    ui.statsPlayer = g.currentPlayer;
    ui.lastMs = data.ms;
    if (!g.isLegalMove(data.move)) throw new Error("서버가 잘못된 수를 보냈습니다");
    play(data.move);
  } catch (e) {
    if (token !== ui.token) return;
    ui.thinking = false;
    render();
    $("statusText").textContent = `AI 서버 오류: ${e.message} — 3초 후 재시도`;
    setTimeout(() => { if (token === ui.token) maybeAI(); }, 3000);
  }
}

function undo() {
  if (ui.demo || ui.thinking) return;
  ui.token++;
  // 마지막 사람 수까지 되돌림
  let idx = -1;
  for (let i = ui.log.length - 1; i >= 0; i--) {
    if (ui.log[i].player === ui.humanPlayer) { idx = i; break; }
  }
  if (idx < 0) return;
  ui.game = QuoridorGame.fromJSON(ui.snapshots[idx]);
  ui.snapshots.length = idx;
  ui.log.length = idx;
  ui.lastMove = ui.log.length ? { move: ui.log.at(-1).move } : null;
  ui.stats = null;
  render();
}

// ─── 입력 ────────────────────────────────────────────────────────
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
  if (inHGroove && (!inVGroove || ui.hover?.orientation !== "v")) {
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

function canHumanAct() {
  return !ui.demo && !ui.thinking && !ui.game.getWinner() && !isAI(ui.game.currentPlayer);
}

svg.addEventListener("pointermove", evt => {
  if (evt.pointerType !== "mouse" || !canHumanAct()) return;
  const hit = hitTest(evt);
  const w = hit?.wall && ui.game.isValidWallPlacement(hit.wall) ? hit.wall : null;
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.orientation === b.orientation;
  if (!same(w, ui.hover) && (w || ui.hover)) {
    ui.hover = w;
    render();
  }
});

svg.addEventListener("pointerleave", () => {
  if (ui.hover) { ui.hover = null; render(); }
});

svg.addEventListener("pointerup", evt => {
  if (!canHumanAct()) return;
  const hit = hitTest(evt);
  if (!hit) return;
  if (hit.cell) {
    const mv = ui.game.getLegalPawnMoves().find(m => m.x === hit.cell.x && m.y === hit.cell.y);
    if (mv) play(mv);
    else if (ui.touchArmed) { ui.touchArmed = null; ui.hover = null; render(); }
    return;
  }
  const w = hit.wall;
  if (!ui.game.isValidWallPlacement(w)) return;
  if (evt.pointerType === "mouse") {
    play(w);
    return;
  }
  // 터치: 첫 탭은 미리보기, 같은 자리 두 번째 탭에 설치
  const armed = ui.touchArmed;
  if (armed && armed.x === w.x && armed.y === w.y && armed.orientation === w.orientation) {
    play(w);
  } else {
    ui.touchArmed = w;
    ui.hover = w;
    render();
    $("hint").textContent = "같은 자리를 한 번 더 누르면 벽이 설치됩니다.";
  }
});

function segment(id, onPick) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of $(id).querySelectorAll("button")) x.classList.toggle("on", x === b);
    onPick(b.dataset.v);
  });
}
segment("segLevel", v => { ui.level = v; renderPanel(); });
segment("segSide", v => { ui.humanPlayer = parseInt(v, 10); });

$("btnNew").addEventListener("click", () => newGame());
$("btnOverlayNew").addEventListener("click", () => newGame());
$("btnUndo").addEventListener("click", undo);
$("btnDemo").addEventListener("click", () => newGame({ demo: !ui.demo }));
$("chkThinking").addEventListener("change", renderCandidates);
$("btnFullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

// 전시용: 오래 아무도 만지지 않으면 데모 모드로 전환
let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!ui.demo) newGame({ demo: true }); }, IDLE_DEMO_MS);
}
for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, resetIdle, { passive: true });

// ─── 학습 정보 ───────────────────────────────────────────────────
async function loadInfo() {
  try {
    const info = await (await fetch("/api/info")).json();
    const h = info.history;
    const gens = h?.generations ?? [];
    const best = h?.best?.match(/gen_(\d+)/)?.[1];
    const lastEval = [...gens].reverse().find(g => g.bestVsHeuristic)?.bestVsHeuristic;
    const totalGames = gens.reduce((a, g) => a + (g.selfplay?.games ?? 0), 0);
    $("modelLine").textContent = info.model.kind === "onnx"
      ? `현재 모델: ${best ? `${parseInt(best, 10)}세대` : "신경망"} · 자가대국 ${totalGames.toLocaleString()}판 학습` +
        (lastEval ? ` · 휴리스틱 MCTS 상대 승률 ${Math.round(lastEval.aScore * 100)}%` : "")
      : "현재 모델: 휴리스틱 MCTS (신경망 학습 전)";
    drawChart(gens);
  } catch {
    $("modelLine").textContent = "모델 정보를 불러오지 못했습니다.";
  }
}

function drawChart(gens) {
  const chart = $("chart");
  chart.innerHTML = "";
  const pts = gens.filter(g => g.bestVsHeuristic).map(g => ({ gen: g.gen, v: g.bestVsHeuristic.aScore }));
  const L = 34, R = 310, T = 12, B = 140;
  const mk = (tag, attrs, text) => { const e = el(tag, attrs, chart); if (text != null) e.textContent = text; return e; };
  for (const v of [0, 0.5, 1]) {
    const y = B - v * (B - T);
    mk("line", { class: v === 0 ? "axis" : "grid", x1: L, x2: R, y1: y, y2: y });
    mk("text", { class: "lbl", x: L - 6, y: y + 3, "text-anchor": "end" }, `${v * 100}%`);
  }
  if (!pts.length) {
    mk("text", { class: "empty", x: (L + R) / 2, y: 80 }, "학습이 진행되면 여기에 표시됩니다");
    return;
  }
  const maxGen = Math.max(...gens.map(g => g.gen), 2);
  const X = g => L + ((g - 1) / (maxGen - 1)) * (R - L);
  const Y = v => B - v * (B - T);
  mk("path", { class: "line", d: pts.map((p, i) => `${i ? "L" : "M"}${X(p.gen)},${Y(p.v)}`).join(" ") });
  for (const p of pts) mk("circle", { class: "pt", cx: X(p.gen), cy: Y(p.v), r: 3.5 });
  for (let g = 1; g <= maxGen; g += Math.ceil(maxGen / 8)) {
    mk("text", { class: "lbl", x: X(g), y: B + 16, "text-anchor": "middle" }, `${g}세대`);
  }
}

buildBoard();
newGame();
resetIdle();
loadInfo();
setInterval(loadInfo, 60_000);
