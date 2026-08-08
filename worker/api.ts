// Aether Chess — global leaderboard API (UNPLUGGED; see db/schema.ts).
//
// These routes are ready but not called by the live client yet. They power a
// future global leaderboard once accounts exist. ELO math is duplicated here
// (kept tiny) so the worker bundle stays free of any client/localStorage code.

import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { players, games } from "../db/schema";

const LEVEL_RATINGS: Record<number, number> = { 1: 1000, 2: 1400, 3: 1800 };
const K_FACTOR = 32;

function nextRating(rating: number, oppRating: number, score: number) {
  const expected = 1 / (1 + Math.pow(10, (oppRating - rating) / 400));
  return Math.round(rating + K_FACTOR * (score - expected));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

interface SubmitBody {
  playerId: string;
  name?: string;
  level: number;
  result: "win" | "loss" | "draw";
  reason?: string;
  plies?: number;
  pgn?: string;
}

// Returns a Response for any /api/* path, or null so the app router handles the rest.
export async function handleApi(request: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/")) return null;

  try {
    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      const db = getDb();
      const rows = await db.select().from(players).orderBy(desc(players.rating)).limit(limit);
      return json({ players: rows });
    }

    if (url.pathname === "/api/games" && request.method === "POST") {
      const body = (await request.json()) as SubmitBody;
      if (!body?.playerId || !(body.level in LEVEL_RATINGS) || !["win", "loss", "draw"].includes(body.result)) {
        return json({ error: "invalid payload" }, 400);
      }
      const db = getDb();
      const now = Date.now();
      const existing = (await db.select().from(players).where(eq(players.id, body.playerId)).limit(1))[0];

      const before = existing?.rating ?? 1200;
      const score = body.result === "win" ? 1 : body.result === "draw" ? 0.5 : 0;
      const after = nextRating(before, LEVEL_RATINGS[body.level], score);
      const wins = (existing?.wins ?? 0) + (body.result === "win" ? 1 : 0);
      const losses = (existing?.losses ?? 0) + (body.result === "loss" ? 1 : 0);
      const draws = (existing?.draws ?? 0) + (body.result === "draw" ? 1 : 0);
      const peak = Math.max(existing?.peak ?? 1200, after);

      if (existing) {
        await db.update(players).set({ rating: after, peak, wins, losses, draws, updatedAt: now }).where(eq(players.id, body.playerId));
      } else {
        await db.insert(players).values({ id: body.playerId, name: body.name ?? "Anonymous", rating: after, peak, wins, losses, draws, createdAt: now, updatedAt: now });
      }
      await db.insert(games).values({
        id: crypto.randomUUID(), playerId: body.playerId, level: body.level, result: body.result,
        reason: body.reason ?? "", plies: body.plies ?? 0, pgn: body.pgn ?? "",
        ratingBefore: before, ratingAfter: after, createdAt: now,
      });
      return json({ ratingBefore: before, ratingAfter: after, delta: after - before });
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}
