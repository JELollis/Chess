import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";

export interface EngineAnalysis { depth: number; evaluation: string; score: number | null; line: string[]; }
const EMPTY: EngineAnalysis = { depth: 0, evaluation: "Starting…", score: null, line: [] };

function pvToSan(fen: string, pv: string[]) {
  const game = new Chess(fen); const sans: string[] = [];
  for (const uci of pv.slice(0, 8)) {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break; sans.push(move.san);
    } catch { break; }
  }
  return sans;
}

export function terminalAnalysis(fen: string): EngineAnalysis | null {
  const game = new Chess(fen);
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) return { depth: 0, evaluation: `${game.turn() === "b" ? "+" : "−"}M0`, score: null, line: [] };
  return { depth: 0, evaluation: "0.00", score: 0, line: [] };
}

export function useStockfish(fen: string, enabled: boolean) {
  const workerRef = useRef<Worker | null>(null);
  const enabledRef = useRef(enabled);
  const readyRef = useRef(false);
  const searchingRef = useRef(false);
  const acceptingRef = useRef(false);
  const activeFenRef = useRef<string | null>(null);
  const pendingFenRef = useRef<string | null>(fen);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [analysis, setAnalysis] = useState<EngineAnalysis>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    pendingFenRef.current = enabled ? fen : null;

    const startSearch = (worker: Worker, nextFen: string) => {
      const terminal = terminalAnalysis(nextFen);
      if (terminal) {
        searchingRef.current = false; acceptingRef.current = false; activeFenRef.current = nextFen;
        queueMicrotask(() => setAnalysis(terminal)); return;
      }
      activeFenRef.current = nextFen; pendingFenRef.current = null;
      searchingRef.current = true; acceptingRef.current = true;
      worker.postMessage(`position fen ${nextFen}`); worker.postMessage("go depth 16");
    };

    if (!enabled) {
      acceptingRef.current = false;
      if (searchingRef.current) workerRef.current?.postMessage("stop");
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
          if (text === "uciok") { worker.postMessage("isready"); return; }
          if (text === "readyok") {
            readyRef.current = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            const nextFen = enabledRef.current ? pendingFenRef.current : null;
            if (nextFen) startSearch(worker, nextFen);
            return;
          }
          if (text.startsWith("bestmove")) {
            searchingRef.current = false; acceptingRef.current = false;
            const nextFen = enabledRef.current ? pendingFenRef.current : null;
            if (nextFen) startSearch(worker, nextFen);
            return;
          }
          if (!acceptingRef.current || !text.startsWith("info ") || !text.includes(" pv ") || !text.includes(" score ")) return;
          const analysisFen = activeFenRef.current;
          if (!analysisFen) return;
          const depth = Number(text.match(/\bdepth (\d+)/)?.[1] ?? 0);
          const scoreMatch = text.match(/\bscore (cp|mate) (-?\d+)/);
          const pv = text.split(" pv ")[1]?.trim().split(/\s+/) ?? [];
          if (!scoreMatch || !depth) return;
          const raw = Number(scoreMatch[2]);
          const whiteScore = analysisFen.split(" ")[1] === "w" ? raw : -raw;
          const mate = scoreMatch[1] === "mate";
          setAnalysis({ depth, score: mate ? null : whiteScore / 100,
            evaluation: mate ? `${whiteScore > 0 ? "+" : "−"}M${Math.abs(whiteScore)}` : `${whiteScore >= 0 ? "+" : ""}${(whiteScore / 100).toFixed(2)}`,
            line: pvToSan(analysisFen, pv) });
        };
        worker.onerror = () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); setError("Stockfish could not be loaded."); };
        worker.postMessage("uci"); workerRef.current = worker;
        timeoutRef.current = setTimeout(() => setError("Stockfish did not finish starting."), 15000);
      } catch { queueMicrotask(() => setError("Stockfish is not supported in this browser.")); return; }
    }

    queueMicrotask(() => { setError(null); setAnalysis(EMPTY); });
    const worker = workerRef.current;
    if (worker && readyRef.current) {
      if (searchingRef.current) { acceptingRef.current = false; worker.postMessage("stop"); }
      else startSearch(worker, fen);
    }
  }, [fen, enabled]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    workerRef.current?.terminate(); workerRef.current = null;
    readyRef.current = false; searchingRef.current = false; acceptingRef.current = false;
  }, []);
  return { analysis, error };
}
