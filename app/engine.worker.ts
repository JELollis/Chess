// Phase 0/1 — dedicated Web Worker that runs the chess search off the UI thread.
// It owns no game state; it answers search requests, dispatching through the
// engine registry so the active engine can be swapped (built-in JS now, Stockfish
// and mod engines later) without touching the UI or protocol.

import { getEngine } from "./engines";
import type { EngineInbound, SearchRequest } from "./engine-client";

// Type the worker scope locally so this file doesn't depend on the "webworker"
// TS lib being enabled project-wide (keeps the shared tsconfig untouched).
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null;
  postMessage: (message: EngineInbound) => void;
};

ctx.onmessage = async (event: MessageEvent<SearchRequest>) => {
  const request = event.data;
  if (!request || request.type !== "search") return;
  try {
    const engine = getEngine(request.engine);
    if (!engine) throw new Error(`no engine registered for "${request.engine ?? "default"}"`);
    const move = await engine.search(request.fen, request.depth);
    ctx.postMessage({ type: "result", id: request.id, move });
  } catch (error) {
    ctx.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
