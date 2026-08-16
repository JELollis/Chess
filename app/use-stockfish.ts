import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";

export interface EngineAnalysis {
  depth: number;
  evaluation: string;
  score: number | null;
  line: string[];
}

const EMPTY: EngineAnalysis = { depth: 0, evaluation: "Starting…", score: null, line: [] };

function pvToSan(fen: string, pv: string[]) {
  const game = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      sans.push(move.san);
    } catch { break; }
  }
  return sans;
}

export function useStockfish(fen: string, enabled: boolean) {
  const workerRef = useRef<Worker | null>(null);
  const fenRef = useRef(fen);
  const readyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [analysis, setAnalysis] = useState<EngineAnalysis>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      workerRef.current?.postMessage("stop");
      queueMicrotask(() => setAnalysis(EMPTY));
      return;
    }
    if (!workerRef.current) {
      try {
        const script = "/stockfish/stockfish-18-lite-single.js";
        const wasm = encodeURIComponent(`${window.location.origin}/stockfish/stockfish-18-lite-single.wasm`);
        const worker = new Worker(`${script}#${wasm},worker`);
        worker.onmessage = (event) => {
          const text = String(event.data);
          if (text === "uciok") {
            worker.postMessage("isready");
            return;
          }
          if (text === "readyok") {
            readyRef.current = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            worker.postMessage(`position fen ${fenRef.current}`);
            worker.postMessage("go depth 16");
            return;
          }
          if (!text.startsWith("info ") || !text.includes(" pv ") || !text.includes(" score ")) return;
          const depth = Number(text.match(/\bdepth (\d+)/)?.[1] ?? 0);
          const scoreMatch = text.match(/\bscore (cp|mate) (-?\d+)/);
          const pv = text.split(" pv ")[1]?.trim().split(/\s+/) ?? [];
          if (!scoreMatch || !depth) return;
          const turn = fenRef.current.split(" ")[1];
          const raw = Number(scoreMatch[2]);
          const whiteScore = turn === "w" ? raw : -raw;
          const mate = scoreMatch[1] === "mate";
          setAnalysis({
            depth,
            score: mate ? null : whiteScore / 100,
            evaluation: mate ? `${whiteScore > 0 ? "+" : "−"}M${Math.abs(whiteScore)}` : `${whiteScore >= 0 ? "+" : ""}${(whiteScore / 100).toFixed(2)}`,
            line: pvToSan(fenRef.current, pv),
          });
        };
        worker.onerror = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setError("Stockfish could not be loaded.");
        };
        worker.postMessage("uci");
        workerRef.current = worker;
        timeoutRef.current = setTimeout(() => setError("Stockfish did not finish starting."), 15000);
      } catch {
        queueMicrotask(() => setError("Stockfish is not supported in this browser."));
        return;
      }
    }
    fenRef.current = fen;
    queueMicrotask(() => { setError(null); setAnalysis(EMPTY); });
    if (readyRef.current) {
      workerRef.current?.postMessage("stop");
      workerRef.current?.postMessage(`position fen ${fen}`);
      workerRef.current?.postMessage("go depth 16");
    }
  }, [fen, enabled]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    workerRef.current?.terminate();
  }, []);
  return { analysis, error };
}
