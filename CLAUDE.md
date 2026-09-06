# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

本地运行的中文学习日记系统，含三个应用：

- **backend/** — FastAPI + SQLAlchemy + SQLite（个人部署基线保留 SQLite），通过 OpenAI-compatible API（`LLM_BASE_URL`/`LLM_MODEL`）调用大模型
- **frontend/** — React 19 + TypeScript + Vite Web 应用（固定端口 5173），含 PWA 支持
- **desktop-pet/** — Tauri 2 + React 桌面学习宠物（开发端口 1420），复用后端 API

三大功能模块：学习日记（语音/文本 → AI 整理 → 确认保存）、算法刷题（每日推荐、训练会话）、八股面试训练（题库审核、AI 评分、间隔复习）。

## 协作基准

本文件是跨工具工程提示，不替代用户的明确授权、当前 Git 状态、PR 事实和 `docs/mobile-app/integration/HANDOFF.md`。移动端协作以 E 发布的 `codex/mobile-integration` 最新检查点为准；冻结 M0 基线只保留为可复现源头，不再作为 B/C/D 的直接开发起点。

`.claude/agents/*` 的 `model: inherit` 只描述执行会话模型继承关系；不要把它混同为应用运行时的 `LLM_MODEL`，也不要因为切换 GPT/Claude 执行工具而改应用配置。

## 常用命令

### 一键启动（Windows）

```powershell
.\start-dev.cmd                          # 启动后端+前端+桌宠，各自独立终端
powershell -ExecutionPolicy Bypass -File .\dev.ps1 -CheckOnly   # 只检查依赖
```

脚本会复用已在运行的服务；不自动安装依赖。首次使用需手动安装（见下）。

### 分服务启动

```bash
# 后端（backend/ 目录，先 python -m venv .venv && pip install -r requirements.txt && copy .env.example .env）
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 前端（frontend/ 目录，先 npm install && copy .env.example .env）
npm run dev

# 桌宠（desktop-pet/ 目录，需 Rust/Cargo，先 npm install）
npm run tauri dev
```

### 测试与检查

```bash
# 后端全部测试（unittest，非 pytest）
cd backend && .venv\Scripts\python.exe -m unittest discover -s tests -v
# 单个测试文件 / 单个用例
.venv\Scripts\python.exe -m unittest tests.test_interview_training -v
.venv\Scripts\python.exe -m unittest tests.test_time_utils.TimeUtilsTest.test_xxx
# 语法检查
python -m compileall app

# 前端类型检查 + 构建（build 内含 tsc --noEmit）
cd frontend && npm run build
cd frontend && npm run typecheck
```

### 题库数据管道（只影响 backend/data/，与日记数据独立）

```bash
cd backend
.venv\Scripts\python.exe scripts\build_interview_bank.py          # 构建八股题库
.venv\Scripts\python.exe scripts\validate_seed_data.py            # 校验种子数据
.venv\Scripts\python.exe scripts\import_seed_data.py --all --dry-run   # 导入（先 dry-run）
.venv\Scripts\python.exe scripts\build_problem_catalog.py --source <path>\.problemSiteData.json
.venv\Scripts\python.exe scripts\build_interview_manual_review_report.py  # 只读审核报告，不写库
```

## 架构要点

### 后端分层

请求流：`app/routers/` → `app/services/` → `app/repositories/` → SQLAlchemy `app/models.py`。路由按模块拆分（diaries / algorithms / interviews / study_sessions / desktop_pet），Pydantic schema 集中在 `app/schemas.py`，LLM 调用封装在 `app/llm.py` + `app/prompts.py`。

`app/main.py` 中有一个全局 HTTP 中间件 `protect_public_mutations`：
- 所有 `/api/` 写操作（POST/PATCH/PUT/DELETE）在设置 `APP_ACCESS_TOKEN` 时要求请求头 `X-Study-Diary-Access`（`app/security.py`）
- 路径含 `/draft`、`/ai-review`、`/evaluate`、`/answers`、`/hint` 的 AI 请求受滑动窗口限流（`AI_RATE_LIMIT_PER_MINUTE`）

### 数据库与时区

- SQLite 自动创建于 `backend/data/study_diary.db`（已 gitignore），启动时 `init_db()` 建表；当前仓库已有 `backend/alembic/`，生产部署按 `docs/deployment.md` 先加载同一份 `/etc/study-diary/api.env` 再执行 Alembic
- **所有"天"级统计和每日推荐必须走 `app/time_utils.py`**，它按 `APP_TIMEZONE`（默认 Asia/Shanghai）计算日历日，不要直接用 UTC 日期

### 八股题库审核模型（核心业务规则）

- 题目有 `review_status`：`pending` / `verified` / `rejected`。AI 生成的题初始全是 `pending`；**训练抽题和默认 API 只返回 `verified` 题**
- 审核功能默认关闭，由后端 feature flag（`ALLOW_QUESTION_REVIEW`、`ALLOW_UNVERIFIED_QUESTION_ACCESS`、`ALLOW_AI_QUESTION_REVIEW`、`ALLOW_QUESTION_QUICK_PUBLISH`）+ 前端 flag（`VITE_ENABLE_QUESTION_REVIEW` 等）**双侧同时开启**才可用
- 三种审核方式（人工精审 / AI 审核 / 快速正式化）共用 `PATCH .../review` 接口，分别写入 `human_quality_score`、`ai_quality_score`、`manual_override`，不能互相伪装
- 批量审核接口每次最多 30 题；批量任务先持久化到 SQLite 再后台执行，服务重启时未完成任务标记为失败；AI 并发由 `BATCH_AI_REVIEW_CONCURRENCY`（1–3）控制
- 种子导入默认**保留**已有题目的审核元数据，只有 `--overwrite-review-metadata` 才覆盖

### 训练会话状态归属

- 训练进度、当前题目、回答、评分**以 SQLite 为准**
- 未提交的文本草稿只存浏览器 localStorage，按题集与题目隔离（前端 `hooks/useInterviewAnswerDraft.ts`）
- 日记草稿同理：生成草稿只调 LLM 不入库，用户确认后才 `POST /api/diaries` 保存，保存接口不再调 LLM

### 前端结构

路由在 `App.tsx`：`/today`（默认入口）、`/write`、`/history`、`/algorithms/*`（嵌套在 `AlgorithmWorkspaceLayout`）、`/interview/*`、`/settings/desktop-pet`。`/interview/review` 受 `VITE_ENABLE_QUESTION_REVIEW` 控制。API 封装在 `src/api/`（`client.ts` 为公共基座）。批量任务进度由 `contexts/InterviewBatchJobContext.tsx` 跨页面轮询，右下角任务中心展示。

### 桌宠（desktop-pet）

Tauri 2 应用：Rust 侧仅 `src-tauri/src/lib.rs`（窗口/插件装配），业务逻辑在前端 TS（`src/services/api.ts` 调后端 `desktop_pet` 和 `study_sessions` 路由，`src/state/petReducer.ts` 管理宠物状态）。可信 origin 由后端 `DESKTOP_PET_ORIGINS` 配置（默认 `http://127.0.0.1:1420,http://tauri.localhost`）。

### 算法题数据约束

历史算法目录只保存题目元数据和固定链接；移动端练习允许保存由 D 原创整理的中文题意、示例、核对依据、反例和版本来源，供 C 的保存/核对协议使用。不得复制外站完整题面、题解或测试用例；NeetCode 150 / Blind 75 通过本地 `.problemSiteData.json` 离线转换，**运行时不联网抓取 GitHub/LeetCode**。数据源与许可证见 `backend/data/ATTRIBUTIONS.md`。

## 文档索引

- `docs/data-import-guide.md` — 题库构建/校验/导入流程
- `docs/algorithm-daily-feed.md` — 每日推荐算法与刷新语义
- `docs/algorithm-catalog.md`、`docs/interview-bank-taxonomy.md`、`docs/interview-training.md` — 模块设计
- `docs/deployment.md` — 单用户 HTTPS PWA、SQLite/Alembic、公网部署与访问保护
