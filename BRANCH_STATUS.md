# feature/goth-3d-anti-stockfish

## Done
- `app/rating.ts` — Level 4 Anti-Stockfish
- `app/globals.css` — Goth palette + ~38° 3D glass board
- `app/antiEngine.ts` — Draw/stalemate hunter

## page.tsx
If you still see a stub page, replace `app/page.tsx` with main's version and add:
1. `import { chooseAntiStockfishMove } from "./antiEngine";`
2. `LEVELS = ["Casual", "Club", "Expert", "Anti-Stockfish"]`
3. Accept saved level `4`
4. `depth === 4 ? chooseAntiStockfishMove(fen, 3) : chooseEngineMove(fen, depth)`
5. Level pickers use `[1, 2, 3, 4]`

Full patched file is ready in the agent sandbox as `page_slim.tsx` / `page_minimal.tsx`.
