# Mobile Integration Handoff

Date: 2026-09-06. This file is the current integration checkpoint for the mobile/PWA work. Historical review files stay in place, but downstream sessions should use this file plus live Git state for the latest facts.

## Repositories and PRs

- Baseline branch: `codex/mobile-baseline`
- Frozen M0 SHA: `5bcaa2e78cb8f887a71638533d81d74fbb1f4a20`
- Integration branch: `codex/mobile-integration`
- Current published integration SHA before this handoff update: `1454cab63065138919782dc70a185521d5435cd1`
- Integration PR: https://github.com/CabbageCannon/study-diary-app/pull/3, base `codex/mobile-baseline`
- Baseline PR: https://github.com/CabbageCannon/study-diary-app/pull/2, base `feat/study-diary-mvp`

## Working Directories

- Original user workspace: `D:/学习日记`; contains user uncommitted work and must not be reset, cleaned, or used for integration commits.
- Frozen baseline worktree: `D:/mobile-baseline-worktree`; keep SHA `5bcaa2e78cb8f887a71638533d81d74fbb1f4a20` intact.
- Integration worktree: `D:/mobile-integration-worktree`; only this worktree is used by E for integration commits.

## Integrated Facts

- M0 baseline was copied into an isolated branch and published without private env files, SQLite databases, logs, browser data, Playwright output, or local process state.
- E deployment corrections are included: same-origin PWA sample uses empty `VITE_API_BASE_URL`, Nginx has HTTP bootstrap before HTTPS, Alembic loads `/etc/study-diary/api.env`, and `APP_ACCESS_TOKEN` remains required for protected writes when configured.
- Backend test discovery is fixed for `backend/tests/test_time_utils.py`; current basis collected 62 unittest cases.
- Claude/Codex guidance now treats SQLite as the personal production baseline, acknowledges Alembic, allows D's original Chinese mobile practice content, and points B/C/D to the integration branch rather than the frozen M0 SHA.
- PM review commit `21e72da` was cherry-picked as `3ef49f26c993e9258b1710d75723593834b87808`; its historical findings are preserved.

## Role State

- A design: current remote PR #4 old head observed earlier as `875cc3046eefdafbd741edd36df1126610855688`; not integrated yet because the final corrected design was still pending. Integrate only `docs/mobile-app/design/**` after A publishes the corrected SHA.
- C backend/LLM: PM reported `codex/mobile-reasoning` SHA `8588947` as protocol/fixtures basis. Await corrected protocol boundary and implementation delivery before merging.
- D content: PM reported `codex/mobile-content` SHA `45eb3f3` as local initial 3-sample basis, not pushed at that time. Await content aligned to C's contract before merging.
- B frontend: PM reported task `01a076ff-7554-7190-b81b-d7f519df3660` started from detached `2c6a83c` and instructed to integrate `origin/codex/mobile-integration`. Await branch/PR.

## Verification Evidence

PM independently rechecked the current integration basis at `1454cab63065138919782dc70a185521d5435cd1`:

- Backend: `python -m unittest discover -s tests -v` passed with 62 collected tests using the original workspace venv and a temporary test DB.
- Frontend: `npm run build` passed.

Earlier E checks on the same corrected basis also passed:

- `python -m compileall app`
- `npm run build` with production-equivalent empty `VITE_API_BASE_URL`
- Bundle assertions: no `/api/api/`, `/api/diaries` present, compiled API base empty
- `git diff --check`

These are local build/test results only. They are not public HTTPS deployment, real Safari, real iPhone, or real LLM acceptance.

## Next Executable Commands

For downstream roles:

```powershell
git fetch origin
git worktree add <new-worktree> origin/codex/mobile-integration
cd <new-worktree>
git switch -c codex/mobile-<role>
```

For E before merging any role branch:

```powershell
git fetch origin
git status --short --branch
git diff --check
```

Then inspect the role branch diff against `origin/codex/mobile-integration`, merge only owned files, run scoped regression, update this handoff with the exact merged source SHA and test evidence, commit, push, and update PR #3.

## Not Yet Verified

- No public HTTPS domain/server/account has been provided.
- No actual iPhone device, iOS version, Safari version, PWA home-screen launch, soft-keyboard safe-area behavior, background resume, refresh recovery, version update, offline draft, or reconnect recovery has been verified.
- No real LLM end-to-end validation has been run for the new mobile flow.
- The app must be described as an HTTPS PWA until native packaging and store release actually exist.
