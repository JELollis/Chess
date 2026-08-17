import { Square } from "chess.js";
import { ChevronRight, X } from "lucide-react";
import { GameRecord, Level, LEVEL_NAMES, LEVEL_RATINGS, Profile, totalGames } from "./rating";

const glyphs: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const pieceNames: Record<string, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

export interface BoardSquare {
  piece: { color: "w" | "b"; type: string } | null;
  square: Square;
  fileIndex: number;
  rankIndex: number;
}

interface ChessBoardProps {
  board: BoardSquare[];
  flipped: boolean;
  selected: Square | null;
  targets: string[];
  lastMove: { from: string; to: string } | null;
  onSquare: (square: Square) => void;
}

export function ChessBoard({ board, flipped, selected, targets, lastMove, onSquare }: ChessBoardProps) {
  return <div className={`chessboard ${flipped ? "flipped" : ""}`} role="grid" aria-label="Chess board">
    {board.map(({ piece, square, fileIndex, rankIndex }) => {
      const isLight = (fileIndex + rankIndex) % 2 === 0;
      const isTarget = targets.includes(square);
      const displayFile = square[0];
      const displayRank = square[1];
      const edgeFile = flipped ? displayRank === "8" : displayRank === "1";
      const edgeRank = flipped ? displayFile === "h" : displayFile === "a";
      const occupant = piece ? `${piece.color === "w" ? "white" : "black"} ${pieceNames[piece.type]}` : "empty";
      return <button
        key={square}
        role="gridcell"
        className={`square ${isLight ? "light" : "dark"} ${selected === square ? "selected" : ""} ${(lastMove?.from === square || lastMove?.to === square) ? "last" : ""}`}
        onClick={() => onSquare(square)}
        aria-label={`${square}, ${occupant}${isTarget ? ", legal destination" : ""}`}
        aria-selected={selected === square}
      >
        {edgeFile && <span className="file-label" aria-hidden="true">{displayFile}</span>}
        {edgeRank && <span className="rank-label" aria-hidden="true">{displayRank}</span>}
        {isTarget && <span className={piece ? "capture-ring" : "move-dot"} aria-hidden="true" />}
        {piece && <span className={`piece piece-${piece.color}`} aria-hidden="true">{glyphs[piece.color + piece.type]}</span>}
      </button>;
    })}
  </div>;
}

interface SettingsPanelProps {
  depth: number;
  useClock: boolean;
  liveAnalysis: boolean;
  onChooseLevel: (level: number) => void;
  onToggleClock: (enabled: boolean) => void;
  onToggleAnalysis: (enabled: boolean) => void;
  onClose: () => void;
}

export function SettingsPanel({ depth, useClock, liveAnalysis, onChooseLevel, onToggleClock, onToggleAnalysis, onClose }: SettingsPanelProps) {
  return <div className="settings-popover glass-panel" role="dialog" aria-label="Engine settings" onKeyDown={(event) => event.key === "Escape" && onClose()}>
    <div className="settings-title"><div><span>ENGINE SETTINGS</span><strong>Difficulty</strong></div><button onClick={onClose} aria-label="Close settings">×</button></div>
    {[1, 2, 3].map((level) => <button className={depth === level ? "chosen" : ""} key={level} onClick={() => onChooseLevel(level)} aria-pressed={depth === level}><span>{LEVEL_NAMES[level as Level]}</span><small>Search depth {level}</small></button>)}
    <div className="settings-clock">
      <div><span>CLOCK</span><small>{useClock ? "10 min each side" : "Untimed game"}</small></div>
      <div className="clock-switch" role="group" aria-label="Clock">
        <button className={useClock ? "active" : ""} onClick={() => onToggleClock(true)} aria-pressed={useClock}>On</button>
        <button className={!useClock ? "active" : ""} onClick={() => onToggleClock(false)} aria-pressed={!useClock}>Off</button>
      </div>
    </div>
    <div className="settings-clock">
      <div><span>LIVE ANALYTICS</span><small>Stockfish 18 evaluation</small></div>
      <div className="clock-switch" role="group" aria-label="Live analytics">
        <button className={liveAnalysis ? "active" : ""} onClick={() => onToggleAnalysis(true)} aria-pressed={liveAnalysis}>On</button>
        <button className={!liveAnalysis ? "active" : ""} onClick={() => onToggleAnalysis(false)} aria-pressed={!liveAnalysis}>Off</button>
      </div>
    </div>
  </div>;
}

interface DifficultyOverlayProps {
  onChoose: (level: number) => void;
}

export function DifficultyOverlay({ onChoose }: DifficultyOverlayProps) {
  return <div className="level-overlay" role="dialog" aria-modal="true" aria-labelledby="difficulty-title">
    <div className="level-card glass-panel">
      <div className="level-head"><span>SELECT YOUR OPPONENT</span><strong id="difficulty-title">Choose a difficulty</strong><p>Pick how hard the Aether Engine plays. You can change this any time from settings.</p></div>
      {[1, 2, 3].map((level) => <button key={level} onClick={() => onChoose(level)}>
        <span className="level-name">{LEVEL_NAMES[level as Level]}</span>
        <span className="level-desc">{["Relaxed — great for learning the ropes.", "A solid, tactical club-level challenge.", "Sharpest play. Expect to be punished for mistakes."][level - 1]}</span>
        <span className="level-depth">Search depth {level}</span>
      </button>)}
    </div>
  </div>;
}

interface ProfileDialogProps {
  profile: Profile;
  games: GameRecord[];
  onReview: (game: GameRecord) => void;
  onClose: () => void;
}

export function ProfileDialog({ profile, games, onReview, onClose }: ProfileDialogProps) {
  const history = profile.history;
  const sparkPath = history.length < 2 ? null : (() => {
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;
    return "M" + history.map((value, index) => `${(index / (history.length - 1)) * 100},${27 - ((value - min) / range) * 26}`).join(" L");
  })();

  return <div className="level-overlay" onClick={(event) => event.target === event.currentTarget && onClose()} onKeyDown={(event) => event.key === "Escape" && onClose()}>
    <div className="profile-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="profile-head">
        <div><span>YOUR RECORD</span><strong id="profile-title">Player profile</strong></div>
        <button className="close-x" onClick={onClose} aria-label="Close profile"><X size={20} /></button>
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
        {([1, 2, 3] as Level[]).map((level) => {
          const tally = profile.records[level];
          const played = tally.w + tally.l + tally.d;
          return <div className="record-row" key={level}>
            <span className="rec-name">{LEVEL_NAMES[level]}<small>~{LEVEL_RATINGS[level]}</small></span>
            <span className="rec-wld"><b className="w">{tally.w}W</b><b className="l">{tally.l}L</b><b className="d">{tally.d}D</b></span>
            <span className="rec-pct">{played ? `${Math.round((tally.w / played) * 100)}%` : "—"}</span>
          </div>;
        })}
      </div>
      <div className="history-head">RECENT GAMES</div>
      <div className="game-history">
        {!games.length && <p className="no-games">No games yet — finish a game against the engine and it lands here.</p>}
        {games.map((game) => <button className="game-item" key={game.id} onClick={() => onReview(game)}>
          <span className={`res-badge ${game.result}`}>{game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}</span>
          <span className="game-meta"><b>vs {LEVEL_NAMES[game.level]}</b><small>{game.plies} ply · {game.reason}</small></span>
          <span className="game-date">{new Date(game.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>)}
      </div>
    </div>
  </div>;
}
