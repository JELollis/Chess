// Phase 0 — React hook that owns the engine Worker lifecycle and exposes a tiny
// async surface to the UI. The Worker is created on the client only (never during
// SSR), and torn down on unmount.

import { useCallback, useEffect, useRef } from "react";
import { createEngineClient, EngineClient, EngineInbound } from "./engine-client";

export function useEngineWorker() {
  const workerRef = useRef<Worker | null>(null);
  const clientRef = useRef<EngineClient | null>(null);
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    // `disposed` guards every respawn path so nothing recreates a Worker after
    // the component has unmounted (which would leak an orphan Worker).
    let disposed = false;

    const spawn = () => {
      if (disposed) return;
      const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      const client = createEngineClient((message) => worker.postMessage(message));
      worker.onmessage = (event: MessageEvent<EngineInbound>) => client.handle(event.data);
      // If the Worker itself faults, onmessage never fires — settle the pending
      // request as null (the UI falls back to a legal move) and replace the Worker.
      worker.onerror = () => {
        client.cancel();
        worker.terminate();
        if (workerRef.current === worker) spawn();
      };
      workerRef.current = worker;
      clientRef.current = client;
    };

    // Because the search runs synchronously inside the Worker, dropping the client
    // resolver alone would leave the obsolete search occupying the Worker and
    // blocking the next one. So cancellation settles the outstanding promise, then
    // terminates the busy Worker and spins up a fresh, idle one.
    cancelRef.current = () => {
      clientRef.current?.cancel();
      workerRef.current?.terminate();
      workerRef.current = null;
      clientRef.current = null;
      spawn();
    };

    spawn();

    return () => {
      disposed = true;
      cancelRef.current = () => {};
      workerRef.current?.terminate();
      workerRef.current = null;
      clientRef.current = null;
    };
  }, []);

  const requestMove = useCallback((fen: string, depth: number): Promise<string | null> => {
    return clientRef.current ? clientRef.current.request(fen, depth) : Promise.resolve(null);
  }, []);

  const cancelMove = useCallback(() => cancelRef.current(), []);

  return { requestMove, cancelMove };
}
