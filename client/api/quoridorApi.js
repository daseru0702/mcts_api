// client/api/quoridorApi.js

const API_URL = "http://localhost:3000/best-move";

export async function getBestMove(gameName, state, simLimit = 1000) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameName, state, simLimit }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`AI 서버 응답 에러: ${res.status} ${err.error||''}`);
  }
  const { move } = await res.json();
  return move;
}
