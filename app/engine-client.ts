// Phase 0/1 — engine Worker protocol (DOM-free so it can be unit-tested in Node).
//
// The client hands each search a monotonic request id and only ever resolves the
// most recent one, so a superseded search (new game / undo / difficulty change)
// can never apply a stale move. An optional `engine` id selects which registered
// engine answers (defaults to the built-in one).

export interface SearchRequest { type: "search"; id: number; fen: string; depth: number; engine?: string }
export type EngineOutbound = SearchRequest;
export type EngineInbound =
  | { type: "result"; id: number; move: string | null }
  | { type: "error"; id: number; message: string };

export interface EngineClient {
  request(fen: string, depth: number, engine?: string): Promise<string | null>;
  cancel(): void;
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
    request(fen, depth, engine) {
      const id = ++seq;
      current = id;
      return new Promise<string | null>((resolve) => {
        resolvers.set(id, resolve);
        post({ type: "search", id, fen, depth, engine });
      });
    },
    cancel() {
      current = ++seq; // a fresh id nothing outstanding can match
      for (const id of [...resolvers.keys()]) settle(id, null);
    },
    handle(message) {
      if (message.id !== current) { settle(message.id, null); return; }
      settle(message.id, message.type === "result" ? message.move : null);
    },
  };
}
