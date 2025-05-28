// common/AdapterFactory.js

export class AdapterFactory {
    /**
     * @param {string} gameName  ex: "quoridor"
     * @param {object} stateJson raw JSON state from client or null for new game
     */
    static async create(gameName, stateJson = null) {
      switch (gameName) {
        case "quoridor": {
          const { QuoridorAdapter } = await import(
            "../games/quoridor/QuoridorAdapter.js"
          );
          return new QuoridorAdapter(stateJson);
        }
        // add cases for other games here...
        default:
          throw new Error(`Unknown game: ${gameName}`);
      }
    }
  }
  