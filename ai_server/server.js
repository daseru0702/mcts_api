// ai_server/server.js

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import ort from "onnxruntime-node";
import { GAMES } from "../common/config.js";
import { AdapterFactory } from "../common/AdapterFactory.js";
import { MCTSNN } from "../common/mcts_nn.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/best-move", async (req, res) => {
  try {
    const { gameName, gameState, simLimit } = req.body;
    if (!GAMES[gameName]) throw new Error("Invalid gameName");
    const cfg = GAMES[gameName];

    // 1) Adapter 생성 (stateJson → adapter)
    const adapter = await AdapterFactory.create(gameName, gameState);

    // 2) ONNX 세션 생성
    const modelPath = path.resolve(__dirname, "models", `${gameName}.onnx`);
    const sessionPromise = ort.InferenceSession.create(modelPath);

    // 3) MCTS+NN 탐색
    const tree = new MCTSNN(adapter, sessionPromise, {
      simulationLimit: simLimit ?? cfg.simLimit
    });
    await tree.runSearch();

    // 4) best move
    const move = tree.bestMove();
    res.json({ move });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`AI server listening on http://0.0.0.0:${PORT}`);
});
