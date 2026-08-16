import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { chooseEngineMove, orderMoves, search } from "../app/engine.ts";
import { decrementClock, replayAt, undoTurn } from "../app/game-state.ts";
import {
  applyResult,
  loadGames,
  loadProfile,
  makeDefaultProfile,
  nextRating,
  saveGames,
  saveProfile,
  totalGames,
} from "../app/rating.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

test("depth-one engine recognizes and plays an immediate checkmate", () => {
  const game = new Chess();
  game.move("f3");
  game.move("e5");
  game.move("g4");

  assert.equal(chooseEngineMove(game.fen(), 1, () => 0.5), "Qh4#");
});

test("terminal positions are scored before depth-zero evaluation", () => {
  const game = new Chess();
  game.move("f3");
  game.move("e5");
  game.move("g4");
  game.move("Qh4#");

  assert.equal(game.isCheckmate(), true);
  assert.ok(search(game, 0, -Infinity, Infinity, 1) < -900_000);
});

test("stalemate at the search horizon scores as a draw", () => {
  const game = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

  assert.equal(game.isStalemate(), true);
  assert.equal(search(game, 0, -Infinity, Infinity, 1), 0);
  assert.equal(chooseEngineMove(game.fen(), 3, () => 0.5), null);
});

test("engine move ordering prioritizes mate, promotions, captures, and checks", () => {
  const ordered = orderMoves(["a3", "Bb5+", "Qh4#", "exd5", "e8=Q"]);

  assert.deepEqual(ordered, ["Qh4#", "e8=Q", "exd5", "Bb5+", "a3"]);
});

test("engine always returns a legal move from the initial position", () => {
  const game = new Chess();
  const move = chooseEngineMove(game.fen(), 1, () => 0.5);

  assert.ok(move);
  assert.doesNotThrow(() => game.move(move));
});

test("engine handles promotion positions deterministically with a supplied random source", () => {
  const game = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
  const first = chooseEngineMove(game.fen(), 1, () => 0.5);
  const second = chooseEngineMove(game.fen(), 1, () => 0.5);

  assert.equal(first, second);
  const move = game.move(first);
  assert.equal(move.promotion, "q");
});

test("search leaves the supplied game unchanged", () => {
  const game = new Chess();
  game.move("e4");
  game.move("e5");
  const before = { fen: game.fen(), pgn: game.pgn(), history: game.history() };

  search(game, 2, -Infinity, Infinity, 0);

  assert.deepEqual({ fen: game.fen(), pgn: game.pgn(), history: game.history() }, before);
});

test("Elo updates, records, peaks, and streaks remain internally consistent", () => {
  const initial = makeDefaultProfile();
  const afterWin = applyResult(initial, 2, "win");
  const afterSecondWin = applyResult(afterWin, 2, "win");
  const afterDraw = applyResult(afterSecondWin, 1, "draw");
  const afterLoss = applyResult(afterDraw, 3, "loss");

  assert.equal(afterWin.rating, nextRating(1200, 1400, 1));
  assert.equal(afterSecondWin.streak.current, 2);
  assert.equal(afterSecondWin.streak.best, 2);
  assert.equal(afterDraw.streak.current, 0);
  assert.equal(afterLoss.streak.best, 2);
  assert.deepEqual(afterLoss.records[2], { w: 2, l: 0, d: 0 });
  assert.deepEqual(afterLoss.records[1], { w: 0, l: 0, d: 1 });
  assert.deepEqual(afterLoss.records[3], { w: 0, l: 1, d: 0 });
  assert.equal(totalGames(afterLoss), 4);
  assert.equal(afterLoss.peak, Math.max(...afterLoss.history));
});

test("rating history is capped at sixty entries", () => {
  let profile = makeDefaultProfile();
  for (let index = 0; index < 75; index++) profile = applyResult(profile, 2, "draw");

  assert.equal(profile.history.length, 60);
});

test("profiles and games round-trip through guarded browser storage", () => {
  globalThis.localStorage = memoryStorage();
  const profile = applyResult(makeDefaultProfile(), 1, "win");
  const game = {
    id: "game-1",
    date: 1_786_243_200_000,
    level: 1,
    result: "win",
    reason: "checkmate",
    plies: 7,
    pgn: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#",
    ratingBefore: 1200,
    ratingAfter: profile.rating,
  };

  saveProfile(profile);
  saveGames(Array.from({ length: 55 }, (_, index) => ({ ...game, id: `game-${index}` })));

  assert.deepEqual(loadProfile(), profile);
  assert.equal(loadGames().length, 50);
  assert.equal(loadGames()[0].id, "game-0");
});

test("malformed local data falls back safely", () => {
  globalThis.localStorage = memoryStorage();
  localStorage.setItem("aether-chess-profile", "not-json");
  localStorage.setItem("aether-chess-games", "not-json");

  assert.deepEqual(loadProfile(), makeDefaultProfile());
  assert.deepEqual(loadGames(), []);
});

test("stored PGN can be loaded and reviewed move by move", () => {
  const pgn = "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#";
  const complete = new Chess();
  complete.loadPgn(pgn);
  const sans = complete.history();
  const replay = new Chess();

  for (const san of sans) assert.ok(replay.move(san));

  assert.equal(replay.isCheckmate(), true);
  assert.equal(replay.history().length, 7);
});

test("clock ticks only the side to move and never becomes negative", () => {
  assert.deepEqual(decrementClock("w", 10, 20), { white: 9, black: 20 });
  assert.deepEqual(decrementClock("b", 10, 20), { white: 10, black: 19 });
  assert.deepEqual(decrementClock("w", 0, 20), { white: 0, black: 20 });
});

test("engine undo removes both the engine and player ply while local undo removes one", () => {
  const game = new Chess();
  game.move("e4");
  game.move("e5");

  assert.equal(undoTurn(game, "engine").history().length, 0);
  assert.deepEqual(undoTurn(game, "local").history(), ["e4"]);
  assert.equal(game.history().length, 2, "undo helper must not mutate the source game");
});

test("review positions clamp safely and expose the last move", () => {
  const sans = ["e4", "e5", "Nf3"];
  const start = replayAt(sans, -1);
  const middle = replayAt(sans, 2);
  const end = replayAt(sans, 99);

  assert.equal(start.game.history().length, 0);
  assert.deepEqual(middle.lastMove, { from: "e7", to: "e5" });
  assert.deepEqual(end.game.history(), sans);
});
