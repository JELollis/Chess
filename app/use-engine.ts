// Phase 0 — React hook that owns the engine Worker lifecycle and exposes a tiny
// async surface to the UI. The Worker is created on the client only (never during
// SSR), and torn down on unmount.

import { useCallback, useEffect, useRef } from "react";
import { createEngineClient, EngineClient, EngineInbound } from "./engine-client";

export function useEngineWorker() {
  const clientRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const client = createEngineClient((message) => worker.postMessage(message));
    worker.onmessage = (event: MessageEvent<EngineInbound>) => client.handle(event.data);
    clientRef.current = client;
    return () => {
      worker.terminate();
      clientRef.current = null;
    };
  }, []);

  const requestMove = useCallback((fen: string, depth: number): Promise<string | null> => {
    return clientRef.current ? clientRef.current.request(fen, depth) : Promise.resolve(null);
  }, []);

  const cancelMove = useCallback(() => {
    clientRef.current?.cancel();
  }, []);

  return { requestMove, cancelMove };
}
