// ELO-style rating, records, and stored-game types for Aether Chess.
//
// The player earns a single chess rating that rises when they beat a bot and
// falls when they lose, with each difficulty acting as a fixed-rated opponent.
// All of this currently persists to localStorage (see the load/save helpers at
// the bottom) — a placeholder for the user's account/profile once login exists.
// The pure math (elo/applyResult) is deliberately DOM-free so the worker's
// leaderboard backend can share it.

export type Level = 1 | 2 | 3 | 4;
export type Result = "win" | "loss" | "draw";

export interface Tally { w: number; l: number; d: number; }

export interface Profile {
  rating: number;
  peak: number;
  lastDelta: number;               // rating change from the most recent game
  streak: { current: number; best: number };
  records: Record<Level, Tally>;   // wins/losses/draws per difficulty
  history: number[];               // rating after each game (most recent last)
}

export interface GameRecord {
  id: string;
  date: number;                    // epoch ms
  level: Level;
  result: Result;                  // from the player's (White's) perspective
  reason: string;                  // "checkmate", "time", "resignation", …
  plies: number;
  pgn: string;
  ratingBefore: number;
  ratingAfter: number;
}

// Fixed opponent strength per difficulty, and the player's starting point.
// Level 4 is Anti-Stockfish: draw/stalemate hunter (not rated as a strong tactical opponent).
export const LEVEL_RATINGS: Record<Level, number> = { 1: 1000, 2: 1400, 3: 1800, 4: 1200 };
export const LEVEL_NAMES: Record<Level, string> = {
  1: "Casual",
  2: "Club",
  3: "Expert",
  4: "Anti-Stockfish",
};
export const START_RATING = 1200;
export const K_FACTOR = 32;        // max single-game swing
const MAX_HISTORY = 60;            // cap the rating sparkline / stored series
const MAX_GAMES = 50;              // cap stored game count in localStorage

export const scoreOf = (result: Result) => (result === "win" ? 1 : result === "draw" ? 0.5 : 0);

// Standard ELO expectation: the chance the player "should" score vs an opponent.
export function expectedScore(playerRating: number, oppRating: number) {
  return 1 / (1 + Math.pow(10, (oppRating - playerRating) / 400));
}

export function nextRating(playerRating: number, oppRating: number, score: number) {
  return Math.round(playerRating + K_FACTOR * (score - expectedScore(playerRating, oppRating)));
}

// Fold a finished game into the profile, returning a fresh profile (never mutates).
export function applyResult(profile: Profile, level: Level, result: Result): Profile {
  const before = profile.rating;
  const after = nextRating(before, LEVEL_RATINGS[level], scoreOf(result));
  const tally = profile.records[level] ?? { w: 0, l: 0, d: 0 };
  const updatedTally: Tally = {
    w: tally.w + (result === "win" ? 1 : 0),
    l: tally.l + (result === "loss" ? 1 : 0),
    d: tally.d + (result === "draw" ? 1 : 0),
  };
  const current = result === "win" ? profile.streak.current + 1 : 0;
  return {
    rating: after,
    peak: Math.max(profile.peak, after),
    lastDelta: after - before,
    streak: { current, best: Math.max(profile.streak.best, current) },
    records: { ...profile.records, [level]: updatedTally },
    history: [...profile.history, after].slice(-MAX_HISTORY),
  };
}

export const totalGames = (p: Profile) =>
  ([1, 2, 3, 4] as Level[]).reduce((sum, l) => {
    const t = p.records[l] ?? { w: 0, l: 0, d: 0 };
    return sum + t.w + t.l + t.d;
  }, 0);

export function makeDefaultProfile(): Profile {
  return {
    rating: START_RATING,
    peak: START_RATING,
    lastDelta: 0,
    streak: { current: 0, best: 0 },
    records: {
      1: { w: 0, l: 0, d: 0 },
      2: { w: 0, l: 0, d: 0 },
      3: { w: 0, l: 0, d: 0 },
      4: { w: 0, l: 0, d: 0 },
    },
    history: [START_RATING],
  };
}

// ---- localStorage persistence (browser only; all reads/writes are guarded) ----

const PROFILE_KEY = "aether-chess-profile";
const GAMES_KEY = "aether-chess-games";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Profile;
      const base = makeDefaultProfile();
      return {
        ...base,
        ...parsed,
        records: { ...base.records, ...(parsed.records ?? {}) },
      };
    }
  } catch { /* storage optional */ }
  return makeDefaultProfile();
}

export function saveProfile(profile: Profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage optional */ }
}

export function loadGames(): GameRecord[] {
  try {
    const raw = localStorage.getItem(GAMES_KEY);
    if (raw) return JSON.parse(raw) as GameRecord[];
  } catch { /* storage optional */ }
  return [];
}

export function saveGames(games: GameRecord[]) {
  try { localStorage.setItem(GAMES_KEY, JSON.stringify(games.slice(0, MAX_GAMES))); } catch { /* storage optional */ }
}

export function makeId(): string {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
