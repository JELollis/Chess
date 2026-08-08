// Aether Chess — global leaderboard schema (Cloudflare D1 / SQLite via Drizzle).
//
// NOTE: This backend is built but intentionally UNPLUGGED. The live game records
// rating/history in the browser (localStorage). These tables + the /api routes in
// worker/api.ts are ready for when the login/account system lands — at that point
// the client submits finished games to POST /api/games keyed by the player's
// account id, and reads GET /api/leaderboard for the global board.
//
// To create the migration once you're ready: `npm run db:generate`.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),            // account / player id
  name: text("name").notNull().default("Anonymous"),
  rating: integer("rating").notNull().default(1200),
  peak: integer("peak").notNull().default(1200),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({
  ratingIdx: index("players_rating_idx").on(t.rating),
}));

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  level: integer("level").notNull(),      // 1 Casual, 2 Club, 3 Expert
  result: text("result").notNull(),       // "win" | "loss" | "draw" (player's perspective)
  reason: text("reason").notNull(),       // "checkmate", "time", "resignation", …
  plies: integer("plies").notNull(),
  pgn: text("pgn").notNull(),
  ratingBefore: integer("rating_before").notNull(),
  ratingAfter: integer("rating_after").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  playerIdx: index("games_player_idx").on(t.playerId),
}));
