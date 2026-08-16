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
        const worker = new Worker("/stockfish/stockfish-18-lite-single.js");
        worker.onmessage = (event) => {
          const text = String(event.data);
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
        worker.onerror = () => setError("Stockfish could not be loaded.");
        worker.postMessage("uci");
        workerRef.current = worker;
      } catch {
        queueMicrotask(() => setError("Stockfish is not supported in this browser."));
        return;
      }
    }
    fenRef.current = fen;
    queueMicrotask(() => { setError(null); setAnalysis(EMPTY); });
    workerRef.current?.postMessage("stop");
    workerRef.current?.postMessage(`position fen ${fen}`);
    workerRef.current?.postMessage("go depth 16");
  }, [fen, enabled]);

  useEffect(() => () => workerRef.current?.terminate(), []);
  return { analysis, error };
}
