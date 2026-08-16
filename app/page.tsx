"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Move, Square } from "chess.js";
import { Bot, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Flag, RotateCcw, Settings2, Swords, Trophy, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { ChessBoard, DifficultyOverlay, ProfileDialog, SettingsPanel } from "./chess-ui";
import { useEngineWorker } from "./use-engine";
import { cloneGame, decrementClock, GameMode, replayAt, undoTurn } from "./game-state";
import { applyResult, GameRecord, Level, LEVEL_NAMES, loadGames, loadProfile, makeDefaultProfile, makeId, Profile, Result, saveGames, saveProfile } from "./rating";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

type Mode = GameMode;

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
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("engine");
  const [depth, setDepth] = useState(2);
  const [flipped, setFlipped] = useState(false);
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

  const newGameWrapRef = useRef<HTMLDivElement>(null);
  // Refs mirror the latest profile/games so recordGame reads fresh values without
  // stale closures, and recordedRef guards against recording a game twice.
  const profileRef = useRef(profile);
  const gamesRef = useRef(games);
  const recordedRef = useRef(false);
  const history = useMemo(() => game.history({ verbose: true }), [game]);
  const thinking = !review && mode === "engine" && game.turn() === "b" && !game.isGameOver() && blackTime > 0 && whiteTime > 0;
  // Whether a clock has run out. Derived as a boolean so the engine effect can
  // depend on it WITHOUT re-running on every one-second tick — otherwise each
  // tick would cancel and restart the search, and a search longer than a second
  // could never finish (the "Engine calculating…" that never moves).
  const timeExpired = whiteTime === 0 || blackTime === 0;

  // While reviewing a stored game, the board shows that game's position at the
  // current step rather than the live game.
  const reviewState = useMemo(() => {
    if (!review) return null;
    return replayAt(review.sans, review.index);
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
  }, [flipped, displayGame]);

  const status = useMemo(() => {
    if (useClock && whiteTime === 0) return "Black wins on time";
    if (useClock && blackTime === 0) return "White wins on time";
    if (game.isCheckmate()) return `${game.turn() === "w" ? "Black" : "White"} wins by checkmate`;
    if (game.isStalemate()) return "Draw by stalemate";
    if (game.isThreefoldRepetition()) return "Draw by repetition";
    if (game.isInsufficientMaterial()) return "Draw — insufficient material";
    if (game.isDraw()) return "Draw";
    return `${game.turn() === "w" ? "White" : "Black"} to move${game.inCheck() ? " — check" : ""}`;
  }, [useClock, whiteTime, blackTime, game]);

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

  const { requestMove, cancelMove } = useEngineWorker();

  const commitMove = useCallback((nextGame: Chess, move: Move) => {
    setGame(nextGame);
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
    const timer = window.setTimeout(() => {
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
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Load the stored rating profile and game history once on the client.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfile(loadProfile());
      setGames(loadGames());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { gamesRef.current = games; }, [games]);

  // Fold a finished game into the rating profile and save it to the history.
  const recordGame = useCallback((result: Result, reason: string) => {
    const level = depth as Level;
    const prev = profileRef.current;
    const next = applyResult(prev, level, result);
    const record: GameRecord = {
      id: makeId(), date: Date.now(), level, result, reason,
      plies: game.history().length, pgn: game.pgn(),
      ratingBefore: prev.rating, ratingAfter: next.rating,
    };
    const nextGames = [record, ...gamesRef.current].slice(0, 50);
    profileRef.current = next; gamesRef.current = nextGames;
    setProfile(next); saveProfile(next);
    setGames(nextGames); saveGames(nextGames);
  }, [depth, game]);

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
  }, [whiteTime, blackTime, useClock, mode, game, recordGame]);

  useEffect(() => {
    if (review || mode !== "engine" || game.turn() !== "b" || game.isGameOver() || timeExpired) return;
    let active = true;
    // Small deliberate delay so the reply doesn't feel instant, then search in the
    // Worker. The result is applied only if this effect is still active — a new
    // game, undo, or difficulty change cancels it so a stale move can't land.
    const timer = window.setTimeout(() => {
      requestMove(game.fen(), depth).then((moveName) => {
        if (!active) return; // superseded by new game / undo / difficulty change
        const nextGame = cloneGame(game);
        // moveName is null only when the Worker failed (cancellation sets active=
        // false above). Fall back to a legal move so the game never deadlocks on
        // "Engine calculating…".
        let chosen = moveName;
        if (!chosen) {
          const legal = nextGame.moves();
          if (!legal.length) return;
          chosen = legal[Math.floor(Math.random() * legal.length)];
        }
        commitMove(nextGame, nextGame.move(chosen));
      });
    }, 420);
    return () => {
      active = false;
      cancelMove();
      window.clearTimeout(timer);
    };
  }, [review, mode, depth, commitMove, game, timeExpired, requestMove, cancelMove]);

  useEffect(() => {
    // The clock only runs when enabled, and stays idle until the game is under
    // way — White's timer must not start counting down before White's first move.
    if (review || !useClock || !history.length || game.isGameOver() || whiteTime === 0 || blackTime === 0) return;
    const timer = window.setInterval(() => {
      const next = decrementClock(game.turn(), whiteTime, blackTime);
      setWhiteTime(next.white);
      setBlackTime(next.black);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [review, useClock, history.length, whiteTime, blackTime, game]);

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
      try {
        const nextGame = cloneGame(game);
        commitMove(nextGame, nextGame.move({ from: selected, to: square, promotion: "q" }));
      } catch { return; }
      return;
    }
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      setSelected(square);
      setTargets(game.moves({ square, verbose: true }).map((move) => move.to));
    } else { setSelected(null); setTargets([]); }
  }

  function newGame(nextMode = mode) {
    setGame(new Chess()); setMode(nextMode); setSelected(null); setTargets([]);
    setLastMove(null); setWhiteTime(START_TIME); setBlackTime(START_TIME);
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
    const nextGame = undoTurn(game, mode);
    setGame(nextGame); setLastMove(null); setSelected(null); setTargets([]);
  }

  const movePairs = Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => history.slice(i * 2, i * 2 + 2));
  const reviewPairs = review ? Array.from({ length: Math.ceil(review.sans.length / 2) }, (_, i) => review.sans.slice(i * 2, i * 2 + 2)) : [];
  const resultLabel = (r: Result) => (r === "win" ? "You won" : r === "loss" ? "You lost" : "Draw");
  const displayStatus = review ? `Review · ${LEVEL_NAMES[review.game.level]} · ${resultLabel(review.game.result)}` : status;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#" aria-label="Aether Chess home"><span className="brand-mark">♘</span><span>AETHER <b>CHESS</b></span></a>
        <div className="mode-switch" role="group" aria-label="Game mode">
          <button className={mode === "engine" ? "active" : ""} onClick={() => newGame("engine")} aria-pressed={mode === "engine"}><Bot size={16} /> Engine</button>
          <button className={mode === "local" ? "active" : ""} onClick={() => newGame("local")} aria-pressed={mode === "local"}><Swords size={16} /> Local PvP</button>
        </div>
        <div className="header-actions">
          <button className="rating-badge" onClick={() => setShowProfile(true)} aria-label="Profile and stats"><Trophy size={15} /> <b>{profile.rating}</b></button>
          <button className="icon-btn" onClick={() => setSound(!sound)} aria-label="Toggle sound" aria-pressed={sound}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)} aria-label="Settings" aria-expanded={showSettings}><Settings2 size={19} /></button>
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
          <div className="status-pill" role="status" aria-live="polite"><i className={thinking ? "thinking" : ""} />{thinking ? "Engine calculating…" : displayStatus}</div>
        </aside>

        <section className="board-stage" aria-label="Chess board">
          <div className="board-frame">
            <ChessBoard board={board} flipped={flipped} selected={selected} targets={targets} lastMove={displayLastMove} onSquare={clickSquare} />
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
                <button className={`move-jump ${review.index === i * 2 + 1 ? "cur" : ""}`} onClick={() => reviewSeek(i * 2 + 1)}>{pair[0]}</button>
                {pair[1] ? <button className={`move-jump ${review.index === i * 2 + 2 ? "cur" : ""}`} onClick={() => reviewSeek(i * 2 + 2)}>{pair[1]}</button> : <span />}
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

      {showSettings && <SettingsPanel depth={depth} useClock={useClock} onChooseLevel={chooseLevel} onToggleClock={toggleClock} onClose={() => setShowSettings(false)} />}
      {showProfile && <ProfileDialog profile={profile} games={games} onReview={startReview} onClose={() => setShowProfile(false)} />}
      {!levelChosen && <DifficultyOverlay onChoose={chooseLevel} />}
    </main>
  );
}
