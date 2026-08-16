// Phase 1 — registers the built-in engine and re-exports the registry. Importing
// this module wires the JS engine in as the default; Stockfish and mod engines
// register the same way later. (Composite module — verified via the build, not a
// Node unit test, since it pulls in engine.ts.)

import { chooseEngineMove } from "./engine";
import { DEFAULT_ENGINE_ID, registerEngine } from "./engine-registry";
import type { Engine } from "./engine-registry";

export { getEngine, registerEngine, DEFAULT_ENGINE_ID } from "./engine-registry";
export type { Engine } from "./engine-registry";

// The built-in JavaScript engine (piece-square eval, SAN search, no quiescence).
export const aetherJsEngine: Engine = {
  id: DEFAULT_ENGINE_ID,
  label: "Aether (built-in)",
  search: (fen, level) => Promise.resolve(chooseEngineMove(fen, level)),
};

registerEngine(aetherJsEngine);
