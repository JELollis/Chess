// Phase 0 — dedicated Web Worker that runs the chess search off the UI thread.
// It owns no game state; it just answers search requests. The engine itself
// (app/engine.ts) stays the DOM-free source of truth (SAN search, no quiescence).

import { chooseEngineMove } from "./engine";
import type { EngineInbound, SearchRequest } from "./engine-client";

// Type the worker scope locally so this file doesn't depend on the "webworker"
// TS lib being enabled project-wide (keeps the shared tsconfig untouched).
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null;
  postMessage: (message: EngineInbound) => void;
};

ctx.onmessage = (event: MessageEvent<SearchRequest>) => {
  const request = event.data;
  if (!request || request.type !== "search") return;
  try {
    const move = chooseEngineMove(request.fen, request.depth);
    ctx.postMessage({ type: "result", id: request.id, move } satisfies EngineInbound);
  } catch (error) {
    ctx.postMessage({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies EngineInbound);
  }
};
