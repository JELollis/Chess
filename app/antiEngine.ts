import { Chess } from "chess.js";

export const MATE = 1_000_000;
export const STALEMATE_SCORE = 80_000;

const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const pst: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,-5,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

const mirror = (i: number) => (7 - (i >> 3)) * 8 + (i & 7);

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
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;
  return score;
}

function orderMoves(moves: string[]) {
  return moves.sort((a, b) => orderScore(b) - orderScore(a));
}

function orderScore(san: string) {
  let score = 0;
  if (san.includes("=")) score += 9;
  if (san.includes("x")) score += 8;
  if (san.includes("#")) score += 20;
  else if (san.includes("+")) score += 2;
  return score;
}

function mobility(game: Chess) {
  return game.moves().length;
}

function evaluateAnti(game: Chess) {
  let score = evaluate(game) * 0.15;
  const mob = mobility(game);
  const turn = game.turn();
  const mobTerm = (20 - Math.min(mob, 20)) * 12;
  if (turn === "b") score += mobTerm;
  else score -= mobTerm;
  if (game.inCheck()) {
    if (turn === "b") score += 40;
    else score -= 40;
  }
  return score;
}

function searchAnti(game: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  const moves = game.moves();
  if (moves.length === 0) {
    if (game.inCheck()) {
      return game.turn() === "w" ? -(MATE - ply) : (MATE - ply);
    }
    return game.turn() === "w" ? -STALEMATE_SCORE : STALEMATE_SCORE;
  }
  if (depth === 0) return evaluateAnti(game);
  orderMoves(moves);
  const maximizing = game.turn() === "w";
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    let score = searchAnti(game, depth - 1, alpha, beta, ply + 1);
    if (game.inCheck()) score += maximizing ? 15 : -15;
    game.undo();
    if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, score); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

/** Draw/stalemate hunter. Takes checkmate only when clearly forced. */
export function chooseAntiStockfishMove(fen: string, depth: number) {
  const game = new Chess(fen);
  const maximizing = game.turn() === "w";
  const moves = orderMoves(game.moves());
  if (!moves.length) return null;

  const searchDepth = Math.max(depth, 3);
  type Cand = { move: string; score: number; mates: boolean; draws: boolean };
  const cands: Cand[] = [];

  for (const move of moves) {
    game.move(move);
    const score = searchAnti(game, searchDepth - 1, -Infinity, Infinity, 1);
    const mates = game.isCheckmate();
    const draws = game.isStalemate() || game.isThreefoldRepetition() || game.isDraw();
    game.undo();
    cands.push({ move, score, mates, draws });
  }

  const drawNow = cands.filter((c) => c.draws && !c.mates);
  if (drawNow.length) {
    drawNow.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
    return drawNow[0].move;
  }

  const mateMoves = cands.filter((c) => c.mates);
  const nonMate = cands.filter((c) => !c.mates);
  if (mateMoves.length) {
    mateMoves.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
    const bestMate = mateMoves[0];
    if (!nonMate.length) return bestMate.move;
    nonMate.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
    const bestOther = nonMate[0];
    const mateIsForced = maximizing
      ? bestMate.score > bestOther.score + 100_000
      : bestMate.score < bestOther.score - 100_000;
    if (mateIsForced) return bestMate.move;
    return bestOther.move;
  }

  cands.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
  return cands[0].move;
}
