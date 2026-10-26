// common/onnx_evaluator.js
//
// train.py 가 내보낸 ONNX 모델 평가기 (입력 "input", 출력 "policy" 로짓, "value").
// onnxruntime-node / onnxruntime-web 어느 쪽 모듈이든 ort 로 넘기면 됩니다.

export class OnnxEvaluator {
  constructor(ort, session) {
    this.ort = ort;
    this.session = session;
  }

  async evaluate(state, moves) {
    const C = state.constructor.IN_CHANNELS, B = state.constructor.BOARD_SIZE;
    const input = new this.ort.Tensor("float32", state.encode(), [1, C, B, B]);
    const out = await this.session.run({ input });
    const logits = out.policy.data;
    const value = out.value.data[0];

    // 합법 수에 대해서만 softmax
    const raw = moves.map(m => logits[state.moveToIndex(m)]);
    const max = Math.max(...raw);
    const exps = raw.map(l => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return { priors: exps.map(e => e / sum), value };
  }
}
