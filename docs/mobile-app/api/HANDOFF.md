# C 后端与 LLM 交接

日期：2026-09-06。工作区：`D:/study-diary-mobile-reasoning`。分支：`codex/mobile-reasoning`。

## 已交付

- 协议小修已推送：`981bba139b00d96787431b187b0005bf2944c71a`。
- 后端实现已完成，待本文件所在实现提交推送后供 E 集成：
  - 新增 `algorithm_problem_contexts`、`algorithm_reasoning_answers`、`algorithm_reasoning_feedbacks`。
  - 新增题目上下文导入器：`import_mobile_problem_contexts`，支持 `backend/data/mobile/algorithm_contexts/<problem_key>.json`，按内容 hash 分配递增 `content_version`。
  - 新增移动端思路核对 API：
    - `GET /api/algorithms/problems/{problem_id}/reasoning-context`
    - `POST /api/algorithms/reasoning/answers`
    - `POST /api/algorithms/reasoning/checks`
    - `POST /api/algorithms/reasoning/answers/{answer_id}/check`
    - `GET /api/algorithms/reasoning/answers/{answer_id}`
    - `GET /api/algorithms/reasoning/answers?problem_id=&session_id=&client_answer_id=&limit=`
  - 保存和核对分离：回答先提交保存；LLM 超时/坏格式返回 `check_status="failed"`，不删除回答、不写假 feedback。
  - `client_answer_id` 幂等：同 UUID 同内容返回旧回答；同 UUID 不同内容返回 409。
  - feedback 与 answer version 一对一绑定；修订回答使用新 UUID，`revision_of_answer_id` 指向上一版，服务端自动把上一版反馈摘要注入 LLM prompt。
  - completed feedback 只同步一次旧 `AlgorithmAttempt`/progress/review，重复核对或恢复不会重复写学习进度。
  - 缺少 ready 上下文时 `reasoning_available=false` 或 `check_status="context_unavailable"`，不调用 LLM、不编造结论。
  - 纯保存端点不走 AI 限流；两个核对端点仍走 AI 限流。

## D 数据验证

D 首批正式数据来自 `origin/codex/mobile-content@f8a133c`，路径：

- `backend/data/mobile/algorithm_contexts/leetcode-1.json`
- `backend/data/mobile/algorithm_contexts/leetcode-15.json`
- `backend/data/mobile/algorithm_contexts/leetcode-322.json`

已用临时目录 + 内存 SQLite 验证导入器：3 个文件全部 `created`，`content_version=1`，`errors=0`。C 分支未复制或覆盖 D 的题目 JSON；集成时由 E 合并 D 分支内容。

D 最终 12 题内容包来自 `origin/codex/mobile-content@0c04236cce3f0714f2426e0023ed6d789e3d8c67`。C 已再次用临时目录 + 内存 SQLite 验证导入器：12 个文件全部 `created`，`content_version=1`，`errors=0`。

## 已运行验证

- `D:/学习日记/backend/.venv/Scripts/python.exe -m compileall app scripts`：通过。
- `D:/学习日记/backend/.venv/Scripts/python.exe -m unittest tests.test_mobile_algorithm_reasoning -v`：10 项通过。
- `D:/学习日记/backend/.venv/Scripts/python.exe -m unittest discover -s tests -v`：72 项通过。
- `D:/学习日记/backend/.venv/Scripts/python.exe scripts/import_seed_data.py --all --dry-run`：通过；在同一事务中验证 algorithm catalog、D 的 3 个 mobile contexts 和 27 道八股，最后回滚。
- D 首批上下文导入器验证：临时 SQLite，通过。

覆盖点包括：正确/部分正确/关键错误/信息不足、LLM 超时、模型坏格式、保存校验失败、断线后同 `client_answer_id` 恢复、同 UUID 不同内容 409、修订版本、重复核对不重复进度、旧 SQLite 建表兼容、上下文缺失。

## 未做

- 未运行真实 LLM 端到端核对；当前验证使用 mock，避免把 mock 写成真实模型通过。
- C 实现提交未修改 D 的 `backend/data/mobile/**` 内容；当前分支 rebase 到 E 的集成分支后可见 D 已合入的首批 3 道上下文。
- 未做前端/真机/PWA 验收，等待 B/E 集成。

## 给 B 的接口注意

- 请求无响应时先用本地保存的 `answer_id` 或 `client_answer_id` 查询恢复；查不到再用同一 `client_answer_id` 重试保存。
- `save_status="saved"` 且 `check_status="failed"` 表示回答已保存，只重试 `/answers/{answer_id}/check`。
- 修改回答必须生成新 `client_answer_id`，并在补充上一版时传 `revision_of_answer_id`。
- 新版本在自己的核对完成前不要显示旧版本 feedback。

## 给 E 的集成注意

- PR base 使用 `codex/mobile-integration`。
- 集成 D 内容后，部署初始化可运行 `python backend/scripts/import_seed_data.py --mobile-contexts`，或在 `--all` 中自动导入存在的移动上下文目录。
- Alembic 新迁移为 `20260906_01_mobile_algorithm_reasoning.py`，down_revision=`20260804_01`。
