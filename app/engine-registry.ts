// Phase 1 — the engine registry (pure: no DOM, no engine.ts import, so it unit-
// tests directly in Node). Engines register themselves elsewhere; this file only
// holds the interface and the lookup.

export interface Engine {
  readonly id: string;
  readonly label: string;
  // SAN move, or null if there is none. Async so a real UCI engine (which replies
  // over messages) fits the same shape as the synchronous built-in one.
  search(fen: string, level: number): Promise<string | null>;
}

export const DEFAULT_ENGINE_ID = "aether-js";

const registry = new Map<string, Engine>();

export function registerEngine(engine: Engine) {
  registry.set(engine.id, engine);
}

// Falls back to the default engine for an unknown or missing id.
export function getEngine(id?: string): Engine | undefined {
  return (id ? registry.get(id) : undefined) ?? registry.get(DEFAULT_ENGINE_ID);
}
