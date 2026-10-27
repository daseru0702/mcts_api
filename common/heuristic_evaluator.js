// common/heuristic_evaluator.js — 신경망 없는 평가기 (브라우저/Node 공용)

const uniform = moves => moves.map(() => 1 / moves.length);

/**
 * 게임이 제공하는 휴리스틱으로 평가 (0세대 데이터 생성/기준선/모델이 없을 때).
 * 어댑터에 heuristicPriors/heuristicValue 가 없으면 균등 사전확률·가치 0 을 씁니다.
 */
export class HeuristicEvaluator {
  async evaluate(state, moves) {
    return {
      priors: state.heuristicPriors ? state.heuristicPriors(moves) : uniform(moves),
      value: state.heuristicValue ? state.heuristicValue() : 0,
    };
  }
}

/** 균등 사전확률 + 휴리스틱 가치 */
export class UniformEvaluator {
  async evaluate(state, moves) {
    return { priors: uniform(moves), value: state.heuristicValue ? state.heuristicValue() : 0 };
  }
}
