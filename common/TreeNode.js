// common/TreeNode.js

export default class TreeNode {
  constructor(state, parent = null, move = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.children = [];
    // state.getPossibleMoves()가 가능한 수 목록을 배열로 돌려준다 가정
    this.untriedMoves = this.state.getPossibleMoves();
    this.visits = 0;
    this.wins = 0;
  }

  expand() {
    // 1) 남은 시도 가능한 움직임 중 하나를 꺼내고
    const mv = this.untriedMoves.pop();
    // 2) 현재 노드의 상태를 복제한 뒤, 그 복제 상태에 mv를 적용
    const nextState = this.state.clone();
    nextState.applyMove(mv);
    // 3) 자식 노드를 만들어서 연결
    const child = new TreeNode(nextState, this, mv);
    this.children.push(child);
    return child;
  }

  // (추가적으로) UCT 계산, 백업 등 필요한 메소드들도 같이 정의되어 있어야 합니다.
}
