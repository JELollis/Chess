import assert from "node:assert/strict";
import test from "node:test";
import { exportGame } from "../app/game-export.ts";

const sample = { pgn: "1. e4 e5 2. Nf3 Nc6" };

test("exports a portable PGN and readable movelist", () => {
  assert.match(exportGame(sample, "pgn").text, /\[Result "\*"\]/);
  assert.match(exportGame(sample, "pgn").text, /1\. e4 e5 2\. Nf3 Nc6 \*$/);
  assert.match(exportGame({ ...sample, result: "1-0" }, "pgn").text, /1\. e4 e5 2\. Nf3 Nc6 1-0$/);
  assert.equal(exportGame(sample, "txt").text, "1. e4 e5\n2. Nf3 Nc6");
});

test("exports structured CSV and JSON move records", () => {
  const csv = exportGame(sample, "csv").text;
  assert.match(csv, /^"move","color","san"/);
  assert.match(csv, /"1","white","e4","e2","e4"/);
  const json = JSON.parse(exportGame(sample, "json").text);
  assert.equal(json.moves.length, 4);
  assert.equal(json.moves[3].san, "Nc6");
});

test("exports the final position as FEN", () => {
  assert.equal(exportGame(sample, "fen").text, "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3");
});
