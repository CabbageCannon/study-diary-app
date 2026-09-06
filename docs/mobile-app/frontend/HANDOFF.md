# Mobile Frontend B Handoff

Status: in progress on `codex/mobile-frontend-b`.

## Scope

- Mobile PWA primary navigation is reduced to four bottom entries: `今日`, `八股`, `算法`, `我的`.
- Focus routes hide the desktop/sidebar navigation for mobile-first practice: `/interview/session/*` and `/algorithms/session/*`.
- The accepted mist-sage visual direction is applied as an additive stylesheet in `frontend/src/styles/mobile-learning.css`.
- Existing desktop routes remain reachable from desktop navigation or the `我的` mobile sheet.

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

- `npm run typecheck` passes after installing frontend dependencies with `npm ci`.
- Full build and browser checks should be run again after merging the latest `origin/codex/mobile-integration`.
