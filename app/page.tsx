"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move, Square } from "chess.js";
import { Bot, ChevronDown, Flag, RotateCcw, Settings2, Swords, Undo2, Volume2, VolumeX } from "lucide-react";

const glyphs: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};
const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Mode = "engine" | "local";
type Color = "w" | "b";

function evaluate(game: Chess) {
  if (game.isCheckmate()) return game.turn() === "w" ? -999999 : 999999;
  let score = 0;
  game.board().flat().forEach((piece) => {
    if (piece) score += values[piece.type] * (piece.color === "w" ? 1 : -1);
  });
  return score;
}

function minimax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game);
  const maximizing = game.turn() === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const move of game.moves()) {
    game.move(move);
    const score = minimax(game, depth - 1, alpha, beta);
    game.undo();
    if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, score); }
    else { best = Math.min(best, score); beta = Math.min(beta, score); }
    if (beta <= alpha) break;
  }
  return best;
}

function chooseEngineMove(fen: string, depth: number) {
  const game = new Chess(fen);
  const moves = game.moves();
  let bestMove = moves[0];
  let bestScore = game.turn() === "w" ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const score = minimax(game, depth - 1, -Infinity, Infinity) + (Math.random() - 0.5) * (depth === 1 ? 120 : 8);
    game.undo();
    if ((game.turn() === "w" && score > bestScore) || (game.turn() === "b" && score < bestScore)) {
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
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [, forceTick] = useState(0);

  const game = gameRef.current;
  const history = useMemo(() => game.history({ verbose: true }), [fen, game]);
  const board = useMemo(() => {
    const rows = game.board();
    const squares = rows.flatMap((row, rankIndex) => row.map((piece, fileIndex) => ({
      piece,
      square: `${files[fileIndex]}${8 - rankIndex}` as Square,
      fileIndex,
      rankIndex,
    })));
    return flipped ? [...squares].reverse() : squares;
  }, [fen, flipped, game]);

  const status = useMemo(() => {
    if (whiteTime === 0) return "Black wins on time";
    if (blackTime === 0) return "White wins on time";
    if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
    if (game.isStalemate()) return "Draw by stalemate";
    if (game.isThreefoldRepetition()) return "Draw by repetition";
    if (game.isInsufficientMaterial()) return "Draw — insufficient material";
    if (game.isDraw()) return "Draw";
    return `${game.turn() === "w" ? "White" : "Black"} to move${game.inCheck() ? " — check" : ""}`;
  }, [fen, whiteTime, blackTime, game]);

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

  useEffect(() => {
    if (mode !== "engine" || game.turn() !== "b" || game.isGameOver() || thinking || blackTime === 0 || whiteTime === 0) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const moveName = chooseEngineMove(game.fen(), depth);
      if (moveName) commitMove(game.move(moveName));
      setThinking(false);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [fen, mode, depth, thinking, commitMove, game, blackTime, whiteTime]);

  useEffect(() => {
    if (game.isGameOver() || whiteTime === 0 || blackTime === 0) return;
    const timer = window.setInterval(() => {
      if (game.turn() === "w") setWhiteTime((t) => Math.max(0, t - 1));
      else setBlackTime((t) => Math.max(0, t - 1));
      forceTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [fen, whiteTime === 0, blackTime === 0, game]);

  function clickSquare(square: Square) {
    if (thinking || game.isGameOver() || (mode === "engine" && game.turn() === "b")) return;
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
    setLastMove(null); setWhiteTime(600); setBlackTime(600); setThinking(false);
  }

  function undo() {
    if (!history.length || thinking) return;
    game.undo();
    if (mode === "engine" && game.history().length) game.undo();
    setFen(game.fen()); setLastMove(null); setSelected(null); setTargets([]);
  }

  const movePairs = Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => history.slice(i * 2, i * 2 + 2));

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
            <div><strong>{mode === "engine" ? "Aether Engine" : "Black"}</strong><small>{mode === "engine" ? `Depth ${depth} · ${["Casual", "Club", "Expert"][depth - 1]}` : "Local player"}</small></div>
            <time className={game.turn() === "b" ? "live" : ""}>{formatClock(blackTime)}</time>
          </div>
          <div className="versus"><span /> VS <span /></div>
          <div className="player-card">
            <div className="avatar human-avatar">Y</div>
            <div><strong>{mode === "engine" ? "You" : "White"}</strong><small>White pieces</small></div>
            <time className={game.turn() === "w" ? "live" : ""}>{formatClock(whiteTime)}</time>
          </div>
          <div className="status-pill"><i className={thinking ? "thinking" : ""} />{thinking ? "Engine calculating…" : status}</div>
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
                return <button key={square} className={`square ${isLight ? "light" : "dark"} ${selected === square ? "selected" : ""} ${(lastMove?.from === square || lastMove?.to === square) ? "last" : ""}`} onClick={() => clickSquare(square)} aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}>
                  {edgeFile && <span className="file-label">{displayFile}</span>}{edgeRank && <span className="rank-label">{displayRank}</span>}
                  {isTarget && <span className={piece ? "capture-ring" : "move-dot"} />}
                  {piece && <span className={`piece piece-${piece.color}`}>{glyphs[piece.color + piece.type]}</span>}
                </button>;
              })}
            </div>
          </div>
          <div className="board-controls">
            <button onClick={undo} disabled={!history.length || thinking}><Undo2 size={16} /> Undo</button>
            <button onClick={() => setFlipped(!flipped)}><RotateCcw size={16} /> Rotate</button>
            <button className="new-game" onClick={() => newGame()}><span>New game</span><ChevronDown size={15} /></button>
          </div>
        </section>

        <aside className="right-panel glass-panel">
          <div className="panel-heading"><div><span>GAME RECORD</span><strong>Moves</strong></div><span className="opening">{history.length < 2 ? "Opening" : `${history.length} ply`}</span></div>
          <div className="moves-list">
            {!movePairs.length && <div className="empty-record"><span>♙</span><p>Your moves will appear here.</p></div>}
            {movePairs.map((pair, i) => <div className="move-row" key={i}><span>{i + 1}.</span><b>{pair[0]?.san}</b><b>{pair[1]?.san ?? ""}</b></div>)}
          </div>
          <div className="captured"><span>STATUS</span><p>{status}</p></div>
          <button className="resign" onClick={() => newGame()}><Flag size={16} /> Resign &amp; restart</button>
        </aside>
      </section>

      <footer><span>LEGAL MOVE ENGINE ACTIVE</span><span>•</span><span>CASTLING · EN PASSANT · PROMOTION</span><span className="footer-right">AETHER / 01</span></footer>

      {showSettings && <div className="settings-popover glass-panel">
        <div className="settings-title"><div><span>ENGINE SETTINGS</span><strong>Difficulty</strong></div><button onClick={() => setShowSettings(false)}>×</button></div>
        {[1, 2, 3].map((level) => <button className={depth === level ? "chosen" : ""} key={level} onClick={() => setDepth(level)}><span>{["Casual", "Club", "Expert"][level - 1]}</span><small>Search depth {level}</small></button>)}
      </div>}
    </main>
  );
}
