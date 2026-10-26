# Quoridor Zero — MCTS + 신경망 쿼리도 AI

AlphaZero 방식(PUCT MCTS + 정책/가치 신경망 + 자가대국 강화학습)으로 9×9 쿼리도를 학습하고,
전시용 웹사이트에서 사람과 대국합니다.

```
games/quoridor/   규칙 엔진(QuoridorGame) + 신경망 인코딩(QuoridorAdapter)  ← 브라우저/Node 공용
common/           mcts.js (AlphaZero PUCT), mcts_pure.js (순수 MCTS 기준선), evaluators.js (ONNX/휴리스틱)
ai_trainer/       selfplay.js (자가대국), train.py (PyTorch 학습→ONNX), arena.js (대결), pipeline.py (세대 반복)
ai_server/        Express 서버: 웹페이지 + /api/move
client/           전시용 웹페이지
tests/            규칙/인코딩/MCTS 테스트
```

## 설치

```bash
npm install
python -m venv .venv
.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu124
.venv/Scripts/python -m pip install numpy onnx
```

## 실행 (전시)

```bash
npm start
```

http://localhost:3000 — `models/quoridor/best.onnx` 를 사용합니다 (없으면 휴리스틱 MCTS).
모델 파일이 바뀌면 서버가 10초 안에 자동으로 다시 불러옵니다.
2분 30초 동안 아무도 조작하지 않으면 AI vs AI 데모 모드로 전환됩니다.

## 학습

```bash
npm run train            # = .venv/Scripts/python ai_trainer/pipeline.py
```

1. **0세대**: 최단경로 휴리스틱을 평가기로 쓰는 MCTS 로 1500판 자가대국
2. **세대 k**: 현재 best 모델로 400판 자가대국 → 최근 5세대 데이터로 이어서 학습 →
   best 와 40판 대결해 55% 이상이면 교체 → 휴리스틱 MCTS 상대 승률 기록
3. 중단해도 다시 실행하면 `models/quoridor/history.json` 기준으로 이어서 진행

개별 실행:

```bash
node ai_trainer/selfplay.js --out=data/test.bin --model=models/quoridor/best.onnx --games=50 --sims=200
.venv/Scripts/python ai_trainer/train.py --data data/test.bin --out-ckpt m.pt --out-onnx m.onnx
node ai_trainer/arena.js --a=nn:models/quoridor/best.onnx:300 --b=heur:300 --games=40
npm test
```

## 신경망 입출력

- 입력 `8×9×9`, 항상 **둘 차례인 플레이어 기준**(P2 차례면 상하 반전):
  내 말 / 상대 말 / 가로벽 / 세로벽 / 내 남은 벽 / 상대 남은 벽 / 내 목표까지 거리맵 / 상대 거리맵
- 정책 `209` = 말 도착칸 81 + 가로벽 64 + 세로벽 64 (로짓, 합법 수만 softmax)
- 가치 `1` = 둘 차례 플레이어의 기대 승패 [-1, 1]
- 자가대국 데이터는 좌우 반전본을 함께 저장 (2배 증강)

## 이전 버전에서 고친 문제

| 문제 | 원인 | 수정 |
|---|---|---|
| 정책 학습이 무의미 | `pi` 를 자식 노드 순서로 저장 → 정책 인덱스와 불일치 | 수→인덱스 매핑으로 209차원 고정 벡터 저장 |
| 가치 학습이 무의미 | 승패 `z` 가 마지막 수에만 기록, 나머지 0. 차례 정보도 입력에 없음 | 모든 포지션에 차례 기준 ±1, canonical 입력 |
| MCTS 값이 NaN / 크래시 | 확장한 자식을 평가하지 않음(`value` undefined), 손자 노드에서 `P` undefined | 확장 시 평가, 노드별 사전확률 저장 |
| 상대 수를 내 수처럼 평가 | 2인 게임인데 역전파 때 부호를 뒤집지 않음 | 깊이마다 부호 반전 |
| 정책 손실 이상 | softmax 출력에 `softmaxCrossEntropy` 재적용 | 로짓 + soft-target 교차엔트로피 |
| 설치/실행 오류 | tfjs-node-gpu 는 Windows 에서 CUDA 11.2 필요, workspace 패키지 이름 중복 | PyTorch(GPU) 학습 + onnxruntime-node 추론 |
| 자가대국이 느림 | 벽 합법성 검사마다 보드 전체 복제 + BFS | 비트배열 엔진, 최단경로를 끊지 않는 벽은 BFS 생략 |
