"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move, Square } from "chess.js";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Flag, RotateCcw, Settings2, Swords, Trophy, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { applyResult, GameRecord, Level, LEVEL_NAMES, LEVEL_RATINGS, loadGames, loadProfile, makeDefaultProfile, makeId, Profile, Result, saveGames, saveProfile, totalGames } from "./rating";

const glyphs: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};
const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Mode = "engine" | "local";
type Color = "w" | "b";

// A mate is worth more than any material swing; subtracting the ply that
// reaches it makes the engine prefer the quickest checkmate (and the slowest loss).
const MATE = 1_000_000;

// Piece-square tables, written rank-8-first (matching chess.js `board()` order,
// index 0 = a8 … 63 = h1) and oriented for White. Black reads the vertically
// mirrored square. Values are centipawn bonuses added on top of raw material.
const pst: Record<string, number[]> = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
     -5,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

// Flip a board index vertically so Black can share White's tables.
const mirror = (i: number) => (7 - (i >> 3)) * 8 + (i & 7);

// Static evaluation from White's perspective, in centipawns. Only ever called on
// non-terminal positions (search/quiescence handle checkmate & draws directly).
function evaluate(game: Chess) {
  const board = game.board();
  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const i = r * 8 + c;
      const placement = pst[piece.type][piece.color === "w" ? i : mirror(i)];
      const worth = values[piece.type] + placement;
      if (piece.color === "w") { score += worth; if (piece.type === "b") whiteBishops++; }
      else { score -= worth; if (piece.type === "b") blackBishops++; }
    }
  }
  if (whiteBishops >= 2) score += 30; // bishop-pair bonus
  if (blackBishops >= 2) score -= 30;
  return score;
}

// Move ordering for alpha-beta. chess.js `moves()` returns SAN strings, which are
// ~16x cheaper to generate than verbose move objects (those carry before/after
// FEN strings), so the whole search stays on SAN. We can't read the captured
// piece from a SAN string cheaply, but the punctuation alone is enough to float
// the moves that cause the most cutoffs to the front: promotions, then captures,
// then checks. Good ordering is what makes this search faster than the old one.
function orderMoves(moves: string[]) {
  return moves.sort((a, b) => orderScore(b) - orderScore(a));
}

function orderScore(san: string) {
  let score = 0;
  if (san.includes("=")) score += 9; // promotion
  if (san.includes("x")) score += 8; // capture
  if (san.includes("#")) score += 20; // mate
  else if (san.includes("+")) score += 2; // check
  return score;
}

// Negamax-style alpha-beta over White's perspective. A single move generation per
// node doubles as the terminal test (no legal moves => checkmate or stalemate),
// which avoids the old engine's habit of calling isCheckmate() — itself a full
// move generation — at every leaf.
function search(game: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return evaluate(game);
  const moves = game.moves();
  if (moves.length === 0) {
    // Mate scores fold in the ply so the engine picks the fastest checkmate and
    // the most stubborn defence, instead of treating every mate as equal.
    return game.inCheck() ? (game.turn() === "w" ? -(MATE - ply) : MATE - ply) : 0;
  }
  orderMoves(moves);
  const maximizing = game.turn() === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const score = search(game, depth - 1, alpha, beta, ply + 1);
    game.undo();
    if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, score); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

function chooseEngineMove(fen: string, depth: number) {
  const game = new Chess(fen);
  const maximizing = game.turn() === "w";
  const moves = orderMoves(game.moves());
  if (!moves.length) return null;
  // A touch of randomness at low difficulty keeps casual games varied; it fades
  // out as depth rises so Expert commits to its best line.
  const noise = depth <= 1 ? 60 : depth === 2 ? 24 : 8;
  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const score = search(game, depth - 1, -Infinity, Infinity, 1) + (Math.random() - 0.5) * noise;
    game.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

function formatClock(total: number) {
  const safe = Math.max(0, total);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

const LEVELS = ["Casual", "Club", "Expert"];
// Where the player's chosen difficulty is remembered. This is a placeholder for
// the eventual account system: once login/profiles exist, the difficulty should
// be read from and written to the user's profile instead of localStorage. Until
// then the preference lives in the browser so it survives reloads on this device.
const LEVEL_STORAGE_KEY = "aether-chess-level";
// Whether games are timed. Not every game is played on a clock, so this is a
// stored preference too — same future-profile note as LEVEL_STORAGE_KEY applies.
const CLOCK_STORAGE_KEY = "aether-chess-clock";
const START_TIME = 600; // seconds per side when the clock is on (10 minutes)

export default function Home() {
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(gameRef.current.fen());
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("engine");
  const [depth, setDepth] = useState(2);
  const [flipped, setFlipped] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [sound, setSound] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewGameMenu, setShowNewGameMenu] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteTime, setWhiteTime] = useState(START_TIME);
  const [blackTime, setBlackTime] = useState(START_TIME);
  const [useClock, setUseClock] = useState(true);
  const [levelChosen, setLevelChosen] = useState(false);
  const [profile, setProfile] = useState<Profile>(makeDefaultProfile);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [review, setReview] = useState<{ sans: string[]; index: number; game: GameRecord } | null>(null);
  const [, forceTick] = useState(0);

  const newGameWrapRef = useRef<HTMLDivElement>(null);
  // Refs mirror the latest profile/games so recordGame reads fresh values without
  // stale closures, and recordedRef guards against recording a game twice.
  const profileRef = useRef(profile);
  const gamesRef = useRef(games);
  const recordedRef = useRef(false);
  const game = gameRef.current;
  const history = useMemo(() => game.history({ verbose: true }), [fen, game]);

  // While reviewing a stored game, the board shows that game's position at the
  // current step rather than the live game.
  const reviewState = useMemo(() => {
    if (!review) return null;
    const replay = new Chess();
    let lastMove: { from: string; to: string } | null = null;
    for (let i = 0; i < review.index; i++) {
      const mv = replay.move(review.sans[i]);
      if (mv) lastMove = { from: mv.from, to: mv.to };
    }
    return { game: replay, lastMove };
  }, [review]);
  const displayGame = reviewState?.game ?? game;
  const displayLastMove = review ? reviewState?.lastMove ?? null : lastMove;

  const board = useMemo(() => {
    const rows = displayGame.board();
    const squares = rows.flatMap((row, rankIndex) => row.map((piece, fileIndex) => ({
      piece,
      square: `${files[fileIndex]}${8 - rankIndex}` as Square,
      fileIndex,
      rankIndex,
    })));
    return flipped ? [...squares].reverse() : squares;
  }, [fen, flipped, displayGame]);

  const status = useMemo(() => {
    if (useClock && whiteTime === 0) return "Black wins on time";
    if (useClock && blackTime === 0) return "White wins on time";
    if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
    if (game.isStalemate()) return "Draw by stalemate";
    if (game.isThreefoldRepetition()) return "Draw by repetition";
    if (game.isInsufficientMaterial()) return "Draw — insufficient material";
    if (game.isDraw()) return "Draw";
    return `${game.turn() === "w" ? "White" : "Black"} to move${game.inCheck() ? " — check" : ""}`;
  }, [fen, useClock, whiteTime, blackTime, game]);

  const playTone = useCallback((capture = false) => {
    if (!sound) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = capture ? 210 : 360;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch { /* sound is optional */ }
  }, [sound]);

  const commitMove = useCallback((move: Move) => {
    setFen(gameRef.current.fen());
    setLastMove({ from: move.from, to: move.to });
    setSelected(null); setTargets([]);
    playTone(Boolean(move.captured));
  }, [playTone]);

  // Persist the chosen difficulty and reveal the board. See LEVEL_STORAGE_KEY —
  // this write should target the user's profile once accounts exist.
  const chooseLevel = useCallback((level: number) => {
    setDepth(level);
    setLevelChosen(true);
    try { localStorage.setItem(LEVEL_STORAGE_KEY, String(level)); } catch { /* storage optional */ }
  }, []);

  // Turn the game clock on or off, and remember the choice for next time.
  const toggleClock = useCallback((on: boolean) => {
    setUseClock(on);
    if (on) { setWhiteTime(START_TIME); setBlackTime(START_TIME); } // fresh clock when re-enabled
    try { localStorage.setItem(CLOCK_STORAGE_KEY, on ? "1" : "0"); } catch { /* storage optional */ }
  }, []);

  // On first load, restore a previously chosen difficulty and skip straight to the
  // board. A brand-new visitor has nothing stored, so the level overlay stays up
  // until they pick one. (Runs once, client-side only, to avoid a hydration clash.)
  useEffect(() => {
    let saved: number | null = null;
    let clock: string | null = null;
    try {
      saved = Number(localStorage.getItem(LEVEL_STORAGE_KEY));
      clock = localStorage.getItem(CLOCK_STORAGE_KEY);
    } catch { /* storage optional */ }
    if (saved === 1 || saved === 2 || saved === 3) {
      setDepth(saved);
      setLevelChosen(true);
    }
    if (clock === "0" || clock === "1") setUseClock(clock === "1");
  }, []);

  // Load the stored rating profile and game history once on the client.
  useEffect(() => { setProfile(loadProfile()); setGames(loadGames()); }, []);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { gamesRef.current = games; }, [games]);

  // Fold a finished game into the rating profile and save it to the history.
  const recordGame = useCallback((result: Result, reason: string) => {
    const level = depth as Level;
    const prev = profileRef.current;
    const next = applyResult(prev, level, result);
    const record: GameRecord = {
      id: makeId(), date: Date.now(), level, result, reason,
      plies: gameRef.current.history().length, pgn: gameRef.current.pgn(),
      ratingBefore: prev.rating, ratingAfter: next.rating,
    };
    const nextGames = [record, ...gamesRef.current].slice(0, 50);
    profileRef.current = next; gamesRef.current = nextGames;
    setProfile(next); saveProfile(next);
    setGames(nextGames); saveGames(nextGames);
  }, [depth]);

  // Watch for a decisive result in an engine game and record it exactly once.
  useEffect(() => {
    if (mode !== "engine" || recordedRef.current) return;
    let outcome: { result: Result; reason: string } | null = null;
    if (useClock && whiteTime === 0) outcome = { result: "loss", reason: "time" };
    else if (useClock && blackTime === 0) outcome = { result: "win", reason: "time" };
    else if (game.isCheckmate()) outcome = { result: game.turn() === "w" ? "loss" : "win", reason: "checkmate" };
    else if (game.isStalemate()) outcome = { result: "draw", reason: "stalemate" };
    else if (game.isThreefoldRepetition()) outcome = { result: "draw", reason: "repetition" };
    else if (game.isInsufficientMaterial()) outcome = { result: "draw", reason: "insufficient material" };
    else if (game.isDraw()) outcome = { result: "draw", reason: "fifty-move rule" };
    if (!outcome) return;
    recordedRef.current = true;
    recordGame(outcome.result, outcome.reason);
  }, [fen, whiteTime, blackTime, useClock, mode, game, recordGame]);

  useEffect(() => {
    if (review || mode !== "engine" || game.turn() !== "b" || game.isGameOver() || blackTime === 0 || whiteTime === 0) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const moveName = chooseEngineMove(game.fen(), depth);
      if (moveName) commitMove(game.move(moveName));
      setThinking(false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [fen, mode, depth, commitMove, game, blackTime, whiteTime]);

  useEffect(() => {
    // The clock only runs when enabled, and stays idle until the game is under
    // way — White's timer must not start counting down before White's first move.
    if (review || !useClock || !history.length || game.isGameOver() || whiteTime === 0 || blackTime === 0) return;
    const timer = window.setInterval(() => {
      if (game.turn() === "w") setWhiteTime((t) => Math.max(0, t - 1));
      else setBlackTime((t) => Math.max(0, t - 1));
      forceTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [fen, useClock, history.length, whiteTime === 0, blackTime === 0, game]);

  // Close the "New game" level menu when clicking anywhere outside it.
  useEffect(() => {
    if (!showNewGameMenu) return;
    const onDown = (event: MouseEvent) => {
      if (newGameWrapRef.current && !newGameWrapRef.current.contains(event.target as Node)) setShowNewGameMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showNewGameMenu]);

  function clickSquare(square: Square) {
    if (review || thinking || game.isGameOver() || (mode === "engine" && game.turn() === "b")) return;
    if (selected && targets.includes(square)) {
      try { commitMove(game.move({ from: selected, to: square, promotion: "q" })); } catch { return; }
      return;
    }
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      setSelected(square);
      setTargets(game.moves({ square, verbose: true }).map((move) => move.to));
    } else { setSelected(null); setTargets([]); }
  }

  function newGame(nextMode = mode) {
    game.reset(); setFen(game.fen()); setMode(nextMode); setSelected(null); setTargets([]);
    setLastMove(null); setWhiteTime(START_TIME); setBlackTime(START_TIME); setThinking(false);
    setShowNewGameMenu(false); setReview(null); recordedRef.current = false;
  }

  // Resigning an in-progress engine game counts as a loss before restarting.
  function resign() {
    const timedOut = useClock && (whiteTime === 0 || blackTime === 0);
    if (mode === "engine" && history.length && !recordedRef.current && !game.isGameOver() && !timedOut) {
      recordedRef.current = true;
      recordGame("loss", "resignation");
    }
    newGame();
  }

  // Open a stored game on the board and step through its moves.
  function startReview(record: GameRecord) {
    try {
      const replay = new Chess();
      replay.loadPgn(record.pgn);
      setReview({ sans: replay.history(), index: replay.history().length, game: record });
      setShowProfile(false); setSelected(null); setTargets([]);
    } catch { /* skip a malformed record */ }
  }
  function reviewSeek(index: number) {
    setReview((r) => (r ? { ...r, index: Math.max(0, Math.min(r.sans.length, index)) } : r));
  }

  // Start a fresh game at the picked difficulty (also persists it as the preference).
  function newGameAtLevel(level: number) {
    chooseLevel(level);
    newGame();
  }

  function undo() {
    if (!history.length || thinking) return;
    game.undo();
    if (mode === "engine" && game.history().length) game.undo();
    setFen(game.fen()); setLastMove(null); setSelected(null); setTargets([]);
  }

  const movePairs = Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => history.slice(i * 2, i * 2 + 2));
  const reviewPairs = review ? Array.from({ length: Math.ceil(review.sans.length / 2) }, (_, i) => review.sans.slice(i * 2, i * 2 + 2)) : [];
  const resultLabel = (r: Result) => (r === "win" ? "You won" : r === "loss" ? "You lost" : "Draw");
  const displayStatus = review ? `Review · ${LEVEL_NAMES[review.game.level]} · ${resultLabel(review.game.result)}` : status;
  const sparkPath = (() => {
    const h = profile.history;
    if (h.length < 2) return null;
    const min = Math.min(...h), max = Math.max(...h), range = max - min || 1;
    return "M" + h.map((v, i) => `${(i / (h.length - 1)) * 100},${27 - ((v - min) / range) * 26}`).join(" L");
  })();

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#" aria-label="Aether Chess home"><span className="brand-mark">♘</span><span>AETHER <b>CHESS</b></span></a>
        <div className="mode-switch" role="group" aria-label="Game mode">
          <button className={mode === "engine" ? "active" : ""} onClick={() => newGame("engine")}><Bot size={16} /> Engine</button>
          <button className={mode === "local" ? "active" : ""} onClick={() => newGame("local")}><Swords size={16} /> Local PvP</button>
        </div>
        <div className="header-actions">
          <button className="rating-badge" onClick={() => setShowProfile(true)} aria-label="Profile and stats"><Trophy size={15} /> <b>{profile.rating}</b></button>
          <button className="icon-btn" onClick={() => setSound(!sound)} aria-label="Toggle sound">{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)} aria-label="Settings"><Settings2 size={19} /></button>
        </div>
      </header>

      <section className="game-layout">
        <aside className="left-panel glass-panel">
          <div className="eyebrow">LIVE MATCH</div>
          <h1>Play the<br /><span>next move.</span></h1>
          <p>A focused chess room with complete rules, a tactical engine, and local competition.</p>
          <div className="divider" />
          <div className="player-card dark-player">
            <div className="avatar bot-avatar"><Bot size={20} /></div>
            <div><strong>{mode === "engine" ? "Aether Engine" : "Black"}</strong><small>{mode === "engine" ? `Depth ${depth} · ${LEVELS[depth - 1]}` : "Local player"}</small></div>
            <time className={useClock && game.turn() === "b" ? "live" : ""}>{useClock ? formatClock(blackTime) : "∞"}</time>
          </div>
          <div className="versus"><span /> VS <span /></div>
          <div className="player-card">
            <div className="avatar human-avatar">Y</div>
            <div><strong>{mode === "engine" ? "You" : "White"}</strong><small>White pieces</small></div>
            <time className={useClock && game.turn() === "w" ? "live" : ""}>{useClock ? formatClock(whiteTime) : "∞"}</time>
          </div>
          <div className="status-pill"><i className={thinking ? "thinking" : ""} />{thinking ? "Engine calculating…" : displayStatus}</div>
        </aside>

        <section className="board-stage" aria-label="Chess board">
          <div className="board-frame">
            <div className={`chessboard ${flipped ? "flipped" : ""}`}>
              {board.map(({ piece, square, fileIndex, rankIndex }) => {
                const isLight = (fileIndex + rankIndex) % 2 === 0;
                const isTarget = targets.includes(square);
                const displayFile = square[0]; const displayRank = square[1];
                const edgeFile = flipped ? displayRank === "8" : displayRank === "1";
                const edgeRank = flipped ? displayFile === "h" : displayFile === "a";
                return <button key={square} className={`square ${isLight ? "light" : "dark"} ${selected === square ? "selected" : ""} ${(displayLastMove?.from === square || displayLastMove?.to === square) ? "last" : ""}`} onClick={() => clickSquare(square)} aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}>
                  {edgeFile && <span className="file-label">{displayFile}</span>}{edgeRank && <span className="rank-label">{displayRank}</span>}
                  {isTarget && <span className={piece ? "capture-ring" : "move-dot"} />}
                  {piece && <span className={`piece piece-${piece.color}`}>{glyphs[piece.color + piece.type]}</span>}
                </button>;
              })}
            </div>
          </div>
          {review ? (
            <div className="board-controls review-controls">
              <button onClick={() => reviewSeek(0)} disabled={review.index === 0} aria-label="First move"><ChevronsLeft size={16} /></button>
              <button onClick={() => reviewSeek(review.index - 1)} disabled={review.index === 0} aria-label="Previous move"><ChevronLeft size={16} /></button>
              <span className="review-counter">{review.index} / {review.sans.length}</span>
              <button onClick={() => reviewSeek(review.index + 1)} disabled={review.index >= review.sans.length} aria-label="Next move"><ChevronRight size={16} /></button>
              <button onClick={() => reviewSeek(review.sans.length)} disabled={review.index >= review.sans.length} aria-label="Last move"><ChevronsRight size={16} /></button>
              <button className="new-game" onClick={() => setReview(null)}><X size={15} /> Exit review</button>
            </div>
          ) : (
          <div className="board-controls">
            <button onClick={undo} disabled={!history.length || thinking}><Undo2 size={16} /> Undo</button>
            <button onClick={() => setFlipped(!flipped)}><RotateCcw size={16} /> Rotate</button>
            {mode === "engine" ? (
              <div className="new-game-wrap" ref={newGameWrapRef}>
                <button className="new-game" onClick={() => setShowNewGameMenu((v) => !v)} aria-haspopup="menu" aria-expanded={showNewGameMenu}><span>New game</span><ChevronDown size={15} /></button>
                {showNewGameMenu && <div className="new-game-menu glass-panel" role="menu">
                  <div className="ng-title">START AT LEVEL</div>
                  {[1, 2, 3].map((level) => <button key={level} role="menuitem" className={depth === level ? "chosen" : ""} onClick={() => newGameAtLevel(level)}><span>{LEVELS[level - 1]}</span><small>Search depth {level}</small></button>)}
                </div>}
              </div>
            ) : (
              <button className="new-game" onClick={() => newGame()}><span>New game</span></button>
            )}
          </div>
          )}
        </section>

        <aside className="right-panel glass-panel">
          <div className="panel-heading"><div><span>{review ? "REVIEWING" : "GAME RECORD"}</span><strong>Moves</strong></div><span className="opening">{review ? `${review.sans.length} ply` : history.length < 2 ? "Opening" : `${history.length} ply`}</span></div>
          <div className="moves-list">
            {review ? (
              reviewPairs.map((pair, i) => <div className="move-row" key={i}>
                <span>{i + 1}.</span>
                <b className={review.index === i * 2 + 1 ? "cur" : ""} onClick={() => reviewSeek(i * 2 + 1)}>{pair[0]}</b>
                <b className={pair[1] ? (review.index === i * 2 + 2 ? "cur" : "") : ""} onClick={() => pair[1] && reviewSeek(i * 2 + 2)}>{pair[1] ?? ""}</b>
              </div>)
            ) : (<>
              {!movePairs.length && <div className="empty-record"><span>♙</span><p>Your moves will appear here.</p></div>}
              {movePairs.map((pair, i) => <div className="move-row" key={i}><span>{i + 1}.</span><b>{pair[0]?.san}</b><b>{pair[1]?.san ?? ""}</b></div>)}
            </>)}
          </div>
          <div className="captured"><span>STATUS</span><p>{displayStatus}</p></div>
          {review
            ? <button className="resign" onClick={() => setReview(null)}><X size={16} /> Exit review</button>
            : <button className="resign" onClick={resign}><Flag size={16} /> Resign &amp; restart</button>}
        </aside>
      </section>

      <footer><span>LEGAL MOVE ENGINE ACTIVE</span><span>•</span><span>CASTLING · EN PASSANT · PROMOTION</span><span className="footer-right">AETHER / 01</span></footer>

      {showSettings && <div className="settings-popover glass-panel">
        <div className="settings-title"><div><span>ENGINE SETTINGS</span><strong>Difficulty</strong></div><button onClick={() => setShowSettings(false)}>×</button></div>
        {[1, 2, 3].map((level) => <button className={depth === level ? "chosen" : ""} key={level} onClick={() => chooseLevel(level)}><span>{LEVELS[level - 1]}</span><small>Search depth {level}</small></button>)}
        <div className="settings-clock">
          <div><span>CLOCK</span><small>{useClock ? "10 min each side" : "Untimed game"}</small></div>
          <div className="clock-switch" role="group" aria-label="Clock">
            <button className={useClock ? "active" : ""} onClick={() => toggleClock(true)}>On</button>
            <button className={!useClock ? "active" : ""} onClick={() => toggleClock(false)}>Off</button>
          </div>
        </div>
      </div>}

      {showProfile && <div className="level-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}>
        <div className="profile-card glass-panel">
          <div className="profile-head">
            <div><span>YOUR RECORD</span><strong>Player profile</strong></div>
            <button className="close-x" onClick={() => setShowProfile(false)} aria-label="Close profile"><X size={20} /></button>
          </div>
          <div className="rating-row">
            <div className="rating-main">
              <span className="rating-num">{profile.rating}</span>
              <span className="rating-meta">
                {profile.lastDelta !== 0 && <b className={profile.lastDelta > 0 ? "up" : "down"}>{profile.lastDelta > 0 ? "+" : ""}{profile.lastDelta}</b>}
                {profile.lastDelta !== 0 ? " last game · " : ""}peak {profile.peak}
              </span>
            </div>
            {sparkPath && <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d={sparkPath} /></svg>}
          </div>
          <div className="profile-stats">
            <div className="stat"><span>{totalGames(profile)}</span><small>games</small></div>
            <div className="stat"><span>{profile.streak.current}{profile.streak.current > 0 ? " 🔥" : ""}</span><small>win streak</small></div>
            <div className="stat"><span>{profile.streak.best}</span><small>best streak</small></div>
          </div>
          <div className="record-table">
            {([1, 2, 3] as Level[]).map((lvl) => {
              const t = profile.records[lvl];
              const played = t.w + t.l + t.d;
              return <div className="record-row" key={lvl}>
                <span className="rec-name">{LEVEL_NAMES[lvl]}<small>~{LEVEL_RATINGS[lvl]}</small></span>
                <span className="rec-wld"><b className="w">{t.w}W</b><b className="l">{t.l}L</b><b className="d">{t.d}D</b></span>
                <span className="rec-pct">{played ? `${Math.round((t.w / played) * 100)}%` : "—"}</span>
              </div>;
            })}
          </div>
          <div className="history-head">RECENT GAMES</div>
          <div className="game-history">
            {!games.length && <p className="no-games">No games yet — finish a game against the engine and it lands here.</p>}
            {games.map((g) => <button className="game-item" key={g.id} onClick={() => startReview(g)}>
              <span className={`res-badge ${g.result}`}>{g.result === "win" ? "W" : g.result === "loss" ? "L" : "D"}</span>
              <span className="game-meta"><b>vs {LEVEL_NAMES[g.level]}</b><small>{g.plies} ply · {g.reason}</small></span>
              <span className="game-date">{new Date(g.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <ChevronRight size={15} />
            </button>)}
          </div>
        </div>
      </div>}

      {!levelChosen && <div className="level-overlay">
        <div className="level-card glass-panel">
          <div className="level-head"><span>SELECT YOUR OPPONENT</span><strong>Choose a difficulty</strong><p>Pick how hard the Aether Engine plays. You can change this any time from settings.</p></div>
          {[1, 2, 3].map((level) => <button key={level} onClick={() => chooseLevel(level)}>
            <span className="level-name">{LEVELS[level - 1]}</span>
            <span className="level-desc">{["Relaxed — great for learning the ropes.", "A solid, tactical club-level challenge.", "Sharpest play. Expect to be punished for mistakes."][level - 1]}</span>
            <span className="level-depth">Search depth {level}</span>
          </button>)}
        </div>
      </div>}
    </main>
  );
}
