# Mobile Frontend B Handoff

Status: final B handoff on `codex/mobile-frontend-b`.

Final integration base before B delivery: `origin/codex/mobile-integration@dbb2583e5d9b4cd1dc310a1a8ea1b8ce3d544aca`.

## Scope

- Mobile PWA primary navigation is reduced to four bottom entries: `今日`, `八股`, `算法`, `我的`.
- Focus routes hide the desktop/sidebar navigation for mobile-first practice: `/interview/session/*` and `/algorithms/session/*`.
- The accepted mist-sage visual direction is applied as an additive stylesheet in `frontend/src/styles/mobile-learning.css`.
- Existing desktop routes remain reachable from desktop navigation or the `我的` mobile sheet.
- Mobile algorithm and interview practice action panels use normal document flow in focus routes to avoid covering answer fields at iPhone width.

## Algorithm Reasoning Integration

Frontend code targets C v1 reasoning endpoints:

- `GET /api/algorithms/problems/{problem_id}/reasoning-context`
- `POST /api/algorithms/reasoning/checks`
- `POST /api/algorithms/reasoning/answers/{answer_id}/check`
- `GET /api/algorithms/reasoning/answers?client_answer_id=...`

Client behavior:

- Every local algorithm draft owns a stable `client_answer_id`.
- Unknown network outcomes do not become fixture or fake success; the UI attempts same-id recovery, then shows an unconfirmed-save state with the local draft intact.
- Real save validation failure is surfaced as save failed.
- LLM/check failure is shown as saved answer with retry.
- Editing after feedback creates a new `client_answer_id` and records `revision_of_answer_id`.
- Fixture mode is explicit only: dev query/storage toggle or `VITE_USE_ALGORITHM_REASONING_FIXTURES=true`, always with a visible banner.

## Verification Notes

- `npm run typecheck`: pass on 2026-09-07.
- `npm run build`: pass on 2026-09-07; Vite transformed 189 modules and generated PWA service worker files.
- PM also independently reviewed B commit `86e7026` build output before the final CSS overlap fixes.
- Playwright CLI mobile viewport pass at 390 x 844: pass. Checked `今日` bottom nav labels, `我的` sheet, algorithm focus route without nav, interview focus route without nav, explicit fixture banner/success, real API failure recovery state, and absence of `/api/api` requests.
- Screenshots are in ignored local artifacts under `output/playwright/mobile-b/`:
  - `01-today-mobile.png`
  - `02-my-sheet.png`
  - `03-algorithm-real-api-failure.png`
  - `04-algorithm-fixture-success.png`
  - `05-interview-focus.png`

## Not Yet Verified

- Physical iPhone Safari/PWA install behavior, including real keyboard safe-area behavior.
- True end-to-end LLM reasoning check against production credentials; browser validation used route mocks plus explicit fixture mode.
