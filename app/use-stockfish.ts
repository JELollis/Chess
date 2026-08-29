import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move } from "chess.js";
import { createStockfishWorker } from "./stockfish-engine";

// How deep each position is analysed. MultiPV 2 lets us see how much worse the
// second-best move is, which is what separates a forced/only move (worth "!")
// from a routine one. Depth is a balance: deep enough to grade sensibly, shallow
// enough to keep up with live play on the single-threaded lite engine.
const SEARCH_DEPTH = 12;
const MULTIPV = 2;

// Move-quality glyphs (standard chess NAG symbols).
export type Glyph = "!!" | "!" | "!?" | "?!" | "?" | "??";

// A large scalar that dwarfs any centipawn eval, so a forced mate always
// outranks a merely huge material edge. Mate distance nudges it so mate-in-1
// beats mate-in-5. Terminal checkmate uses the ceiling directly.
const MATE_SCALAR = 30000;
const MATE_FLOOR = MATE_SCALAR - 30 * 100; // any |score| at/above this is a mate
function mateToScalar(movesToMate: number) {
  return Math.sign(movesToMate || 1) * (MATE_SCALAR - Math.min(Math.abs(movesToMate), 30) * 100);
}

// Win probability (0–100, White's perspective) for a White-POV scalar score.
// Standard logistic mapping of evaluation to expected score; mate scalars
// saturate it to ~0/100.
function winPct(scalar: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.004 * scalar)) - 1);
}

interface Score {
  best: number;            // White-POV scalar of the best line
  second: number | null;   // White-POV scalar of the 2nd-best line (if any)
  bestUci: string | null;  // best move in UCI, e.g. "e2e4" / "e7e8q"
  pv: string[];            // best line in UCI
}

// Per-move analysis surfaced to the UI. `glyph` drives the live annotation;
// `evalWhite`, `bestSan` and `line` power the fuller game-review readout.
export interface MoveGrade {
  glyph: Glyph | null;
  evalWhite: string;       // eval of the resulting position, White POV ("+0.35", "#3")
  bestSan: string | null;  // engine's best move in the position before this move
  line: string;            // engine's best line from before this move (SAN)
  played: boolean;         // whether the move played was the engine's top choice
}

// Score for a game-over position, computed without the engine (Stockfish just
// returns "bestmove (none)" and no score for terminal positions).
function terminalScore(chess: Chess): Score | null {
  if (chess.isCheckmate()) {
    // The side to move is mated. Express as White POV: if White is to move and
    // mated, Black delivered mate (negative); otherwise White won (positive).
    const whiteMated = chess.turn() === "w";
    return { best: whiteMated ? -MATE_SCALAR : MATE_SCALAR, second: null, bestUci: null, pv: [] };
  }
  if (chess.isGameOver()) return { best: 0, second: null, bestUci: null, pv: [] }; // stalemate / draw
  return null;
}

function pvToSan(fen: string, pv: string[]) {
  const game = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv.slice(0, 6)) {
    try {
      const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      sans.push(move.san);
    } catch { break; }
  }
  return sans;
}

function formatEval(scalarWhite: number) {
  if (Math.abs(scalarWhite) >= MATE_FLOOR) {
    const dist = Math.round((MATE_SCALAR - Math.abs(scalarWhite)) / 100);
    return `${scalarWhite >= 0 ? "+" : "−"}#${dist}`;
  }
  const pawns = scalarWhite / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

// Classify a single move from the analysed positions around it.
function classify(before: Score, after: Score, move: Move): Glyph | null {
  const toMover = (whiteScalar: number) => (move.color === "w" ? whiteScalar : -whiteScalar);
  const bestWin = winPct(toMover(before.best));
  const playedWin = winPct(toMover(after.best));
  const loss = Math.max(0, bestWin - playedWin);
  const gap = before.second === null ? 0 : Math.max(0, bestWin - winPct(toMover(before.second)));
  const played = before.bestUci !== null && before.bestUci === move.lan;

  if (loss >= 20) return "??";
  if (loss >= 10) return "?";
  if (loss >= 5) return "?!";
  // Good-move territory (small loss). Without multi-line sacrifice detection the
  // "good" glyphs are heuristic: reward finding a move whose alternatives were
  // much worse, and flag a reasonable off-best try in an unclear position.
  if (played && gap >= 30) return "!!";
  if (played && gap >= 12) return "!";
  if (!played && loss < 3 && bestWin > 30 && bestWin < 70) return "!?";
  return null;
}

// Analyses every position in `moves` with Stockfish and returns a per-move
// grade aligned to `moves`. Entries are null until their surrounding positions
// have been evaluated. Work is incremental and cached by FEN, so a freshly
// played move is graded after a single new search.
export function useMoveGrades(moves: Move[], enabled: boolean): { grades: (MoveGrade | null)[]; error: string | null } {
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const currentFenRef = useRef<string | null>(null);
  const cacheRef = useRef<Map<string, Score>>(new Map());
  const queueRef = useRef<string[]>([]);
  const fensRef = useRef<string[]>([]);
  const enabledRef = useRef(enabled);
  const refillRef = useRef<() => void>(() => {});
  // cacheRef is the worker's synchronous source of truth; `scores` mirrors it
  // into React state so the grades memo can read it without touching a ref
  // during render.
  const [scores, setScores] = useState<Map<string, Score>>(() => new Map());
  const [error, setError] = useState<string | null>(null);

  // Every distinct position we need scored: the start position plus the result
  // of each move (a move's "before" is the previous move's "after").
  const fens = useMemo(() => {
    if (!moves.length) return [] as string[];
    return [moves[0].before, ...moves.map((m) => m.after)];
  }, [moves]);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  // Worker lifecycle — created once while enabled, and kept alive across moves.
  useEffect(() => {
    if (!enabled) { queueMicrotask(() => setError(null)); return; }
    queueMicrotask(() => setError(null));

    const bump = () => setScores(new Map(cacheRef.current));
    // Latest info lines seen for each PV rank during the current search.
    let pv1: { scalar: number; pv: string[] } | null = null;
    let pv2: { scalar: number; pv: string[] } | null = null;

    // Pull the next uncached position off the queue and search it. Terminal
    // positions are scored locally without troubling the engine.
    const pump = () => {
      const worker = workerRef.current;
      if (!worker || !readyRef.current || busyRef.current) return;
      let fen: string | undefined;
      while ((fen = queueRef.current.shift())) {
        if (!cacheRef.current.has(fen)) break;
      }
      if (!fen) return;
      const terminal = terminalScore(new Chess(fen));
      if (terminal) {
        cacheRef.current.set(fen, terminal);
        bump();
        queueMicrotask(pump);
        return;
      }
      busyRef.current = true;
      currentFenRef.current = fen;
      pv1 = null; pv2 = null;
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${SEARCH_DEPTH}`);
    };

    // Rebuild the work queue from the current move list, newest position first
    // so the most recently played move is graded soonest.
    const refill = () => {
      queueRef.current = fensRef.current
        .filter((fen) => !cacheRef.current.has(fen) && fen !== currentFenRef.current)
        .reverse();
      pump();
    };
    refillRef.current = refill;

    const parseInfo = (text: string) => {
      const turn = (currentFenRef.current ?? "").split(" ")[1] === "w" ? 1 : -1;
      const rank = Number(text.match(/\bmultipv (\d+)/)?.[1] ?? 1);
      const scoreMatch = text.match(/\bscore (cp|mate) (-?\d+)/);
      if (!scoreMatch) return;
      const raw = Number(scoreMatch[2]);
      const scalar = (scoreMatch[1] === "mate" ? mateToScalar(raw) : raw) * turn;
      const pv = text.split(" pv ")[1]?.trim().split(/\s+/) ?? [];
      if (rank === 1) pv1 = { scalar, pv };
      else if (rank === 2) pv2 = { scalar, pv };
    };

    const worker = createStockfishWorker(() => {
      if (workerRef.current !== worker) return;
      readyRef.current = false;
      setError("Stockfish could not be loaded.");
    });
    worker.onmessage = (event) => {
      const text = String(event.data);
      if (text === "uciok") { worker.postMessage(`setoption name MultiPV value ${MULTIPV}`); worker.postMessage("isready"); return; }
      if (text === "readyok") { readyRef.current = true; refill(); return; }
      if (text.startsWith("info ")) { if (busyRef.current) parseInfo(text); return; }
      if (text.startsWith("bestmove")) {
        const fen = currentFenRef.current;
        if (fen) {
          const bestUci = text.split(/\s+/)[1] || null;
          cacheRef.current.set(fen, {
            best: pv1?.scalar ?? 0,
            second: pv2?.scalar ?? null,
            bestUci: bestUci === "(none)" ? null : bestUci,
            pv: pv1?.pv ?? [],
          });
          bump();
        }
        busyRef.current = false;
        currentFenRef.current = null;
        pump();
      }
    };
    workerRef.current = worker;

    return () => {
      readyRef.current = false;
      busyRef.current = false;
      currentFenRef.current = null;
      queueRef.current = [];
      refillRef.current = () => {};
      worker.onmessage = null;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [enabled]);

  // When the move list changes, refresh what needs analysing without disturbing
  // the running worker.
  useEffect(() => {
    fensRef.current = fens;
    if (enabledRef.current) refillRef.current();
  }, [fens]);

  // Recompute grades whenever the move list or the eval cache changes.
  const grades = useMemo<(MoveGrade | null)[]>(() => {
    if (!enabled) return moves.map(() => null);
    return moves.map((move) => {
      const before = scores.get(move.before);
      const after = scores.get(move.after);
      if (!before || !after) return null;
      const bestLine = before.pv.length ? pvToSan(move.before, before.pv) : [];
      const played = before.bestUci !== null && before.bestUci === move.lan;
      return {
        glyph: classify(before, after, move),
        evalWhite: formatEval(after.best),
        bestSan: played ? null : bestLine[0] ?? null,
        line: bestLine.join(" "),
        played,
      };
    });
  }, [moves, enabled, scores]);

  return { grades, error };
}
