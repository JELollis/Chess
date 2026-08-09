import { Chess } from "chess.js";

const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// A mate is worth more than any material swing; subtracting the ply that
// reaches it makes the engine prefer the quickest mate and the slowest loss.
const MATE = 1_000_000;

// Rank-8-first piece-square tables matching chess.js board() order.
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

const mirror = (i: number) => (7 - (i >> 3)) * 8 + (i & 7);

export function evaluate(game: Chess) {
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
      if (piece.color === "w") {
        score += worth;
        if (piece.type === "b") whiteBishops++;
      } else {
        score -= worth;
        if (piece.type === "b") blackBishops++;
      }
    }
  }
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;
  return score;
}

function orderScore(san: string) {
  let score = 0;
  if (san.includes("=")) score += 9;
  if (san.includes("x")) score += 8;
  if (san.includes("#")) score += 20;
  else if (san.includes("+")) score += 2;
  return score;
}

export function orderMoves(moves: string[]) {
  return moves.sort((a, b) => orderScore(b) - orderScore(a));
}

export function search(game: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  // Terminal detection must precede the horizon evaluation. Otherwise a mate
  // reached exactly at depth zero is scored as ordinary material.
  const moves = game.moves();
  if (moves.length === 0) {
    return game.inCheck() ? (game.turn() === "w" ? -(MATE - ply) : MATE - ply) : 0;
  }
  if (depth === 0) return evaluate(game);

  orderMoves(moves);
  const maximizing = game.turn() === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const score = search(game, depth - 1, alpha, beta, ply + 1);
    game.undo();
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseEngineMove(fen: string, depth: number, random: () => number = Math.random) {
  const game = new Chess(fen);
  const maximizing = game.turn() === "w";
  const moves = orderMoves(game.moves());
  if (!moves.length) return null;
  const noise = depth <= 1 ? 60 : depth === 2 ? 24 : 8;
  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const score = search(game, depth - 1, -Infinity, Infinity, 1) + (random() - 0.5) * noise;
    game.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

