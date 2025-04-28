# ai_trainer/generate_selfplay.py

import os
import numpy as np
from tqdm import trange
import argparse

from config import GAMES
from games.quoridor.QuoridorGame import QuoridorGame    # 게임 폴더별 import는 고정
from games.quoridor.QuoridorAdapter import QuoridorAdapter
from games.quoridor.mcts import MCTS
from stateSerializer import serialize_state

def collect_selfplay(game_name, num_games, sim_limit):
    cfg = GAMES[game_name]
    out_file = cfg["selfplay_file"]
    os.makedirs(os.path.dirname(out_file), exist_ok=True)

    states, pis, vals = [], [], []

    for _ in trange(num_games, desc=f"Self-play {game_name}"):
        game = QuoridorGame()
        trajectory = []
        while True:
            s = serialize_state(game)
            mcts = MCTS(QuoridorAdapter(game.clone()), simulationLimit=sim_limit)
            mcts.runSearch()
            visits = np.array([c.visits for c in mcts.root.children], dtype=np.float32)
            pi = visits / (visits.sum() or 1)
            trajectory.append((s, pi, game.currentPlayer))
            move = mcts.bestMove()
            game.applyMove(move)
            if game.pawns[1].y == 8 or game.pawns[2].y == 0:
                winner = 1 if game.pawns[1].y == 8 else 2
                break
        for s, pi, player in trajectory:
            states.append(s)
            pis.append(pi)
            vals.append(1.0 if player == winner else 0.0)

    np.savez_compressed(out_file,
                        states=np.stack(states),
                        policies=np.stack(pis),
                        values=np.array(vals))
    print(f"Saved self-play data to {out_file}")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("game", choices=GAMES.keys())
    p.add_argument("--num-games", type=int, default=100)
    p.add_argument("--sim-limit", type=int, default=200)
    args = p.parse_args()
    collect_selfplay(args.game, args.num_games, args.sim_limit)

if __name__ == "__main__":
    main()
