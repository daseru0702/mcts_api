// client/app.js — 전시용 보드게임 클라이언트 (게임 무관)
//
// 게임은 ?game=<id> 로 고르며(없으면 games/index.json 의 첫 게임), 보드 그리기·입력은
// games/<id>/view.js 가, 규칙은 games/<id>/index.js 의 Adapter 가 맡습니다.
import { loadGame } from "./common/games.js";

const $ = id => document.getElementById(id);
const svg = $("board");
const LEVEL_NAMES = { easy: "쉬움", normal: "보통", hard: "어려움" };

// ─── 게임 선택 ───────────────────────────────────────────────────
async function pickGame() {
  let list = [];
  try {
    list = await (await fetch("games/index.json")).json();
  } catch {}
  const wanted = new URLSearchParams(location.search).get("game");
  const id = list.some(g => g.id === wanted) ? wanted : list[0]?.id;
  if (!id) throw new Error("games/index.json 에 게임이 없습니다");

  if (list.length > 1) {
    const sel = $("gameSelect");
    sel.innerHTML = list.map(g => `<option value="${g.id}">${g.name}</option>`).join("");
    sel.value = id;
    sel.classList.remove("hidden");
    sel.addEventListener("change", () => { location.search = `?game=${sel.value}`; });
  }
  return loadGame(id);
}

const game = await pickGame();
document.title = game.title ?? game.name;
$("gameTitle").textContent = game.title ?? game.name;
if (game.subtitle) $("gameSubtitle").textContent = game.subtitle;
const defaultHint = game.hint ?? "";

// ─── 상태 ────────────────────────────────────────────────────────
const ui = {
  state: new game.Adapter(),
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
};

const isAI = p => ui.demo || p !== ui.humanPlayer;
const bottomPlayer = () => (ui.demo ? 1 : ui.humanPlayer);   // 화면 아래쪽(주황) 플레이어
const colorOf = p => (p === bottomPlayer() ? "human" : "ai");
const isLegal = move => (ui.state.isLegalMove
  ? ui.state.isLegalMove(move)
  : ui.state.getPossibleMoves().some(m => JSON.stringify(m) === JSON.stringify(move)));

const { createView } = await import(game.viewUrl);
const view = createView({
  svg,
  onMove: move => { if (canHumanAct() && isLegal(move)) play(move); },
  setHint: text => { $("hint").textContent = text; },
});

// ─── 렌더링 ──────────────────────────────────────────────────────
function render() {
  const winner = ui.state.getWinner();
  view.render({
    state: ui.state,
    humanTurn: canHumanAct(),
    bottomPlayer: bottomPlayer(),
    colorOf,
    lastMove: ui.lastMove,
    stats: ui.stats,
    showCandidates: $("chkThinking").checked,
  });
  renderPanel(winner);
}

function renderPanel(winner) {
  const turn = ui.state.getCurrentPlayer();
  const human = bottomPlayer();
  const ai = 3 - human;

  // 상태 표시
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
  $("status").className = `status ${cls}`;
  $("statusText").textContent = text;

  // 플레이어 카드
  $("aiName").textContent = ui.demo ? "청록 AI" : `AI · ${LEVEL_NAMES[ui.level]}`;
  document.querySelector("#cardHuman .pname").textContent = ui.demo ? "주황 AI" : "나";
  $("cardHuman").classList.toggle("turn", !winner && turn === human);
  $("cardAI").classList.toggle("turn", !winner && turn === ai);
  $("infoHuman").innerHTML = view.playerInfo?.(ui.state, human) ?? "";
  $("infoAI").innerHTML = view.playerInfo?.(ui.state, ai) ?? "";

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
  const cell = e => `<li class="${e && colorOf(e.player) === "human" ? "h" : "a"}">${e ? view.notation(e.move) : ""}</li>`;
  for (let i = 0; i < ui.log.length; i += 2) {
    list.insertAdjacentHTML("beforeend", `<li class="n">${i / 2 + 1}.</li>${cell(ui.log[i])}${cell(ui.log[i + 1])}`);
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
      : game.loseTip ?? "난이도를 낮춰 다시 도전해 보세요.";
  } else {
    ov.classList.add("hidden");
  }
}

// ─── AI 백엔드: 로컬 서버(전시용)가 있으면 서버, 없으면(GitHub Pages) 브라우저 워커 ──
const backend = (async () => {
  try {
    const res = await fetch(`api/info?game=${game.id}`);
    if (res.ok) return { kind: "server" };
  } catch {}
  const worker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
  const pending = new Map();
  let nextId = 0, model = "loading";
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") { model = data.model; loadInfo(); return; }
    const p = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) p?.reject(new Error(data.error));
    else p?.resolve(data);
  };
  worker.postMessage({ type: "prepare", game: game.id });
  return {
    kind: "browser",
    get model() { return model; },
    request: (state, level) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, game: game.id, state, level });
    }),
  };
})();

async function requestMove(state, level) {
  const b = await backend;
  if (b.kind === "browser") return b.request(state, level);
  const res = await fetch("api/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: game.id, state, level }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

// ─── 게임 진행 ──────────────────────────────────────────────────
function play(move) {
  ui.snapshots.push(ui.state.toJSON());
  ui.log.push({ player: ui.state.getCurrentPlayer(), move });
  ui.state.applyMove(move);
  ui.lastMove = move;
  $("hint").textContent = defaultHint;
  render();
  maybeAI();
}

function newGame({ demo = false } = {}) {
  ui.token++;
  ui.demo = demo;
  ui.state = new game.Adapter();
  ui.snapshots = [];
  ui.log = [];
  ui.stats = null;
  ui.lastMove = null;
  ui.thinking = false;
  $("hint").textContent = defaultHint;
  render();
  maybeAI();
}

async function maybeAI() {
  if (ui.state.getWinner()) {
    if (ui.demo) {
      const token = ui.token;
      setTimeout(() => { if (ui.demo && token === ui.token) newGame({ demo: true }); }, 5000);
    }
    return;
  }
  if (!isAI(ui.state.getCurrentPlayer()) || ui.thinking) return;

  const token = ++ui.token;
  ui.thinking = true;
  render();
  const started = Date.now();
  try {
    const data = await requestMove(ui.state.toJSON(), ui.demo ? "normal" : ui.level);
    // 너무 빨리 두면 사람이 따라가기 어려우므로 최소 지연
    const minDelay = ui.demo ? 700 : 350;
    await new Promise(r => setTimeout(r, Math.max(0, minDelay - (Date.now() - started))));
    if (token !== ui.token) return;
    ui.thinking = false;
    ui.stats = data.stats;
    ui.statsPlayer = ui.state.getCurrentPlayer();
    ui.lastMs = data.ms;
    if (!isLegal(data.move)) throw new Error("서버가 잘못된 수를 보냈습니다");
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
  ui.state = new game.Adapter(ui.snapshots[idx]);
  ui.snapshots.length = idx;
  ui.log.length = idx;
  ui.lastMove = ui.log.length ? ui.log.at(-1).move : null;
  ui.stats = null;
  render();
}

function canHumanAct() {
  return !ui.demo && !ui.thinking && !ui.state.getWinner() && !isAI(ui.state.getCurrentPlayer());
}

// ─── 컨트롤 ─────────────────────────────────────────────────────
function segment(id, onPick) {
  $(id).addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of $(id).querySelectorAll("button")) x.classList.toggle("on", x === b);
    onPick(b.dataset.v);
  });
}
segment("segLevel", v => { ui.level = v; render(); });
segment("segSide", v => { ui.humanPlayer = parseInt(v, 10); });

$("btnNew").addEventListener("click", () => newGame());
$("btnOverlayNew").addEventListener("click", () => newGame());
$("btnUndo").addEventListener("click", undo);
$("btnDemo").addEventListener("click", () => newGame({ demo: !ui.demo }));
$("chkThinking").addEventListener("change", render);
$("btnFullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});

// ─── 학습 정보 ───────────────────────────────────────────────────
async function loadInfo() {
  try {
    const b = await backend;
    let info;
    if (b.kind === "server") {
      info = await (await fetch(`api/info?game=${game.id}`)).json();
    } else {
      const res = await fetch(`models/${game.id}/history.json`);
      info = { model: { kind: b.model }, history: res.ok ? await res.json() : null };
    }
    const gens = info.history?.generations ?? [];
    const best = info.history?.best?.match(/gen_(\d+)/)?.[1];
    const lastEval = [...gens].reverse().find(g => g.bestVsHeuristic)?.bestVsHeuristic;
    const totalGames = gens.reduce((a, g) => a + (g.selfplay?.games ?? 0), 0);
    $("modelLine").textContent = info.model.kind === "onnx"
      ? `현재 모델: ${best ? `${parseInt(best, 10)}세대` : "신경망"} · 자가대국 ${totalGames.toLocaleString()}판 학습` +
        (lastEval ? ` · 휴리스틱 MCTS 상대 승률 ${Math.round(lastEval.aScore * 100)}%` : "")
      : info.model.kind === "loading"
        ? "신경망 모델을 불러오는 중…"
        : "현재 모델: 휴리스틱 MCTS (신경망 학습 전)";
    drawChart(gens);
  } catch {
    $("modelLine").textContent = "모델 정보를 불러오지 못했습니다.";
  }
}

function drawChart(gens) {
  const chart = $("chart");
  chart.innerHTML = "";
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    chart.appendChild(e);
    return e;
  };
  const pts = gens.filter(g => g.bestVsHeuristic).map(g => ({ gen: g.gen, v: g.bestVsHeuristic.aScore }));
  const L = 34, R = 310, T = 12, B = 140;
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

newGame();
loadInfo();
setInterval(loadInfo, 60_000);
