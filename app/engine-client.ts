// Phase 0 — engine Worker protocol (DOM-free so it can be unit-tested in Node).
//
// The client hands each search a monotonic request id and only ever resolves the
// most recent one. This is the core guarantee: starting a new game, undoing, or
// switching difficulty supersedes any in-flight search, so a stale result from an
// earlier position can never be applied to a newer game.

export interface SearchRequest { type: "search"; id: number; fen: string; depth: number }
export type EngineOutbound = SearchRequest;
export type EngineInbound =
  | { type: "result"; id: number; move: string | null }
  | { type: "error"; id: number; message: string };

export interface EngineClient {
  /** Post a search; resolves with the move, or null if it was superseded/failed. */
  request(fen: string, depth: number): Promise<string | null>;
  /** Supersede any outstanding search so its result is ignored (null-resolved). */
  cancel(): void;
  /** Feed a message back from the Worker. */
  handle(message: EngineInbound): void;
}

export function createEngineClient(post: (message: EngineOutbound) => void): EngineClient {
  let seq = 0;
  let current = 0;
  const resolvers = new Map<number, (move: string | null) => void>();

  const settle = (id: number, move: string | null) => {
    const resolve = resolvers.get(id);
    if (!resolve) return;
    resolvers.delete(id);
    resolve(move);
  };

  return {
    request(fen, depth) {
      const id = ++seq;
      current = id;
      return new Promise<string | null>((resolve) => {
        resolvers.set(id, resolve);
        post({ type: "search", id, fen, depth });
      });
    },
    cancel() {
      current = ++seq; // a fresh id nothing outstanding can match
      for (const id of [...resolvers.keys()]) settle(id, null);
    },
    handle(message) {
      // Ignore anything that isn't the search we currently care about.
      if (message.id !== current) { settle(message.id, null); return; }
      settle(message.id, message.type === "result" ? message.move : null);
    },
  };
}
