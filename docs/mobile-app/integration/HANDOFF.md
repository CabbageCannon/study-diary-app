# Mobile Integration Handoff

Date: 2026-09-06. This file is the current integration checkpoint for the mobile/PWA work. Historical review files stay in place, but downstream sessions should use this file plus live Git state for the latest facts.

## Repositories and PRs

- Baseline branch: `codex/mobile-baseline`
- Frozen M0 SHA: `5bcaa2e78cb8f887a71638533d81d74fbb1f4a20`
- Integration branch: `codex/mobile-integration`
- Last code/test basis verified before handoff-only commits: `1454cab63065138919782dc70a185521d5435cd1`
- E guidance update commit: `ef60791` (`docs: update mobile integration handoff guidance`)
- PM resume source commit: `0b343ca` on `origin/codex/mobile-product-plan`
- PM resume cherry-pick on integration: `0278b6266071a9f523031bd304c2ffc7de1fbb13`
- Latest role merge before this handoff update: `0c04236cce3f0714f2426e0023ed6d789e3d8c67`
- Current branch tip after this file is committed should be read with `git rev-parse origin/codex/mobile-integration`; E will also publish the exact SHA in the handoff message/PR.
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
- PM continuation snapshot commit `0b343ca` was cherry-picked as `0278b6266071a9f523031bd304c2ffc7de1fbb13`; it added `docs/mobile-app/RESUME_2026-09-06.md` and a historical note in `NEXT_TASKS.md`. Do not repeatedly rewrite that snapshot; update this handoff for new facts.
- A design source `5afceefe9e985cea1ad91f3bbe71e37ceb540a83` was integrated as `745b4727ff7ca67d73524b8ea84ce527dcc7e33f` after confirming the branch only changed `docs/mobile-app/design/**`.
- C protocol source `981bba139b00d96787431b187b0005bf2944c71a` was integrated as `ec48c864dbbfc846dc5e25d0d07d890c28d6263c` after confirming the branch only changed `docs/mobile-app/api/**`.
- D first mobile reasoning contexts source `f8a133c02658bd56c3cdad3f1ea75d11dd6b41e4` was integrated as `37de29f12330040522ff300686f0c176a225cf54` after confirming the branch only changed `backend/data/mobile/**` and `docs/mobile-app/content/**`.
- D final content package source `0c04236cce3f0714f2426e0023ed6d789e3d8c67` was fast-forwarded into integration. It adds 9 more algorithm context JSON files for a total of 12 ready contexts, plus the D handoff, content README, and interview seed review.

## Role State

- A design: final mist-sage design is integrated from source `5afceefe9e985cea1ad91f3bbe71e37ceb540a83`. PR #4 remains the role PR; E did not modify A's worktree.
- C backend/LLM: protocol and fixtures are integrated from source `981bba139b00d96787431b187b0005bf2944c71a`. Backend implementation is still pending on the same role branch and must be reviewed separately before merge.
- D content: final content package is integrated from source `0c04236cce3f0714f2426e0023ed6d789e3d8c67`. It contains 12 ready algorithm contexts and records the 27 interview seed questions as pending review, not verified training content.
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

After integrating A final design, C protocol, and D first content batch, E ran:

- `git diff --check origin/codex/mobile-integration..HEAD`, passed.
- JSON parsing for `backend/data/mobile/algorithm_contexts/*.json`, passed.
- `D:/学习日记/backend/.venv/Scripts/python.exe scripts/validate_seed_data.py` from `D:/mobile-integration-worktree/backend`, passed with `疑似重复题: 0`.

After fast-forwarding D final content package, E ran:

- D schema shape check for `backend/data/mobile/algorithm_contexts/*.json`, passed with `files=12 ready=12 draft=0 errors=0`.
- `D:/学习日记/backend/.venv/Scripts/python.exe scripts/validate_seed_data.py` from `D:/mobile-integration-worktree/backend`, passed with `疑似重复题: 0`.
- `git diff --check origin/codex/mobile-integration..HEAD`, passed.

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
