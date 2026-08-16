import assert from "node:assert/strict";
import test from "node:test";
import { terminalAnalysis } from "../app/use-stockfish.ts";

test("terminal analysis reports checkmate from White's perspective", () => {
  assert.equal(terminalAnalysis("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1")?.evaluation, "+M0");
  assert.equal(terminalAnalysis("7K/6q1/6k1/8/8/8/8/8 w - - 0 1")?.evaluation, "−M0");
});

test("terminal analysis reports draws and ignores active positions", () => {
  assert.deepEqual(terminalAnalysis("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), {
    depth: 0, evaluation: "0.00", score: 0, line: [],
  });
  assert.equal(terminalAnalysis("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"), null);
  assert.equal(terminalAnalysis("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "draw")?.evaluation, "0.00");
});
