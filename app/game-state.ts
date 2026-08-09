import { Chess } from "chess.js";

export type GameMode = "engine" | "local";

export function cloneGame(source: Chess) {
  const clone = new Chess();
  const pgn = source.pgn();
  if (pgn) clone.loadPgn(pgn);
  return clone;
}

export function undoTurn(source: Chess, mode: GameMode) {
  const game = cloneGame(source);
  game.undo();
  if (mode === "engine" && game.history().length) game.undo();
  return game;
}

export function decrementClock(turn: "w" | "b", white: number, black: number) {
  return turn === "w"
    ? { white: Math.max(0, white - 1), black }
    : { white, black: Math.max(0, black - 1) };
}

export function replayAt(sans: string[], index: number) {
  const game = new Chess();
  let lastMove: { from: string; to: string } | null = null;
  const end = Math.max(0, Math.min(sans.length, index));
  for (let moveIndex = 0; moveIndex < end; moveIndex++) {
    const move = game.move(sans[moveIndex]);
    if (move) lastMove = { from: move.from, to: move.to };
  }
  return { game, lastMove };
}

