sequenceDiagram
    actor Client
    participant Express   as "Express Server"
    participant Adapter   as "QuoridorAdapter"
    participant MCTS      as "MCTS Engine"
    participant ONNX      as "ONNX Runtime"
    
    Client->>Express: POST /best-move<br/>{"gameState", "simLimit"}
    Express->>Adapter: new QuoridorAdapter(gameState)
    Adapter->>MCTS: runSearch(simLimit)
    loop simulationLimit times
      MCTS->>MCTS: select→expand→simulate→backpropagate
    end
    MCTS->>ONNX: runInference(stateTensor)
    ONNX-->>MCTS: {policy, value}
    MCTS-->>Express: bestMove
    Express-->>Client: 200 OK<br/>{move}
