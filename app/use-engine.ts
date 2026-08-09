// Phase 0 — React hook that owns the engine Worker lifecycle and exposes a tiny
// async surface to the UI. The Worker is created on the client only (never during
// SSR), and torn down on unmount.

import { useCallback, useEffect, useRef } from "react";
import { createEngineClient, EngineClient, EngineInbound } from "./engine-client";

export function useEngineWorker() {
  const workerRef = useRef<Worker | null>(null);
  const clientRef = useRef<EngineClient | null>(null);

  const spawn = useCallback(() => {
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    const client = createEngineClient((message) => worker.postMessage(message));
    worker.onmessage = (event: MessageEvent<EngineInbound>) => client.handle(event.data);
    workerRef.current = worker;
    clientRef.current = client;
  }, []);

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    clientRef.current = null;
  }, []);

  useEffect(() => {
    spawn();
    return teardown;
  }, [spawn, teardown]);

  const requestMove = useCallback((fen: string, depth: number): Promise<string | null> => {
    return clientRef.current ? clientRef.current.request(fen, depth) : Promise.resolve(null);
  }, []);

  // Because the search runs synchronously inside the Worker, dropping the resolver
  // alone would leave the obsolete search occupying the Worker and blocking the
  // next one. So we actually interrupt it: settle any outstanding promise, then
  // terminate the busy Worker and spin up a fresh, idle one for the next search.
  const cancelMove = useCallback(() => {
    clientRef.current?.cancel();
    teardown();
    spawn();
  }, [teardown, spawn]);

  return { requestMove, cancelMove };
}
