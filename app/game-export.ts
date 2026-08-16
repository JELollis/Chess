import { Chess } from "chess.js";

export type ExportFormat = "pgn" | "txt" | "csv" | "json" | "fen";

export interface ExportGame {
  pgn: string;
  filename?: string;
  result?: "1-0" | "0-1" | "1/2-1/2" | "*";
}

function gameFromPgn(pgn: string) {
  const game = new Chess();
  if (pgn.trim()) game.loadPgn(pgn);
  return game;
}

export function exportGame(game: ExportGame, format: ExportFormat) {
  const replay = gameFromPgn(game.pgn);
  const moves = replay.history({ verbose: true });
  const stem = (game.filename || `aether-game-${new Date().toISOString().slice(0, 10)}`).replace(/[^a-z0-9_-]+/gi, "-");

  if (format === "pgn") {
    replay.header("Result", game.result ?? "*");
    return { filename: `${stem}.pgn`, mime: "application/x-chess-pgn", text: replay.pgn() };
  }
  if (format === "fen") return { filename: `${stem}.fen`, mime: "text/plain", text: replay.fen() };
  if (format === "txt") {
    const lines = Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) =>
      `${i + 1}. ${moves[i * 2]?.san ?? ""}${moves[i * 2 + 1] ? ` ${moves[i * 2 + 1].san}` : ""}`,
    );
    return { filename: `${stem}.txt`, mime: "text/plain", text: lines.join("\n") || "No moves recorded." };
  }
  if (format === "csv") {
    const rows = moves.map((move, i) => [Math.floor(i / 2) + 1, i % 2 ? "black" : "white", move.san, move.from, move.to, move.before, move.after]);
    const quote = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    return { filename: `${stem}.csv`, mime: "text/csv", text: [["move", "color", "san", "from", "to", "fen_before", "fen_after"], ...rows].map((r) => r.map(quote).join(",")).join("\n") };
  }
  return {
    filename: `${stem}.json`, mime: "application/json",
    text: JSON.stringify({ pgn: game.pgn, finalFen: replay.fen(), moves: moves.map(({ san, lan, from, to, color, piece, captured, promotion, before, after }) => ({ san, lan, from, to, color, piece, captured, promotion, before, after })) }, null, 2),
  };
}

export function downloadGame(game: ExportGame, format: ExportFormat) {
  const file = exportGame(game, format);
  const url = URL.createObjectURL(new Blob([file.text], { type: `${file.mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
