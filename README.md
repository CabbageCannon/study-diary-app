# 学习日记记录系统

## 八股训练 MVP

项目新增了一个基于本地面试题库的训练闭环：训练集只从 `verified` 且启用的题目中抽题，支持文本或浏览器语音输入、逐题 AI 评分、回答历史和间隔复习。题库初始的 27 道题仍全部是 `pending`，不会因为生成审核报告而自动变为已验证。

从 `backend` 目录执行以下命令可以生成只读的人工审核建议报告；该命令不会写入数据库，也不会更改题目审核状态：

```powershell
.venv\Scripts\python.exe scripts\build_interview_manual_review_report.py
```

审核能力默认关闭。仅在本地审核时，同时启用后端和前端开关；AI 审核和快速正式化还需要各自的后端、前端开关：

```powershell
# backend/.env
ALLOW_QUESTION_REVIEW=true
ALLOW_UNVERIFIED_QUESTION_ACCESS=true
ALLOW_AI_QUESTION_REVIEW=true
ALLOW_QUESTION_QUICK_PUBLISH=true
BATCH_AI_REVIEW_CONCURRENCY=2

# frontend/.env
VITE_ENABLE_QUESTION_REVIEW=true
VITE_ENABLE_AI_QUESTION_REVIEW=true
VITE_ENABLE_QUESTION_QUICK_PUBLISH=true
```

普通题库导入只更新题目内容，已存在题目的人工评分、AI 审核结果、审核方式、审核时间和状态都会保留。只有明确执行 `--overwrite-review-metadata` 才允许种子 JSON 覆盖这些审核元数据：

```powershell
cd backend
.venv\Scripts\python.exe scripts\import_seed_data.py --interviews --dry-run
.venv\Scripts\python.exe scripts\import_seed_data.py --interviews --overwrite-review-metadata
```

训练题集有 `in_progress`、`completed`、`abandoned` 三种状态。训练进度、当前题目、题目顺序、已答/跳过状态、回答和评分以 SQLite 为准；未提交文本草稿仅保存在浏览器 localStorage，并按题集与题目隔离。首页和历史页均可继续未完成训练，历史页支持放弃、再次练习和删除训练记录；删除不会影响八股题库原题。

训练接口包括 `POST /api/interviews/question-sets`、`GET /api/interviews/question-sets?status=in_progress`、`GET /api/interviews/question-sets/{id}`、`PATCH /api/interviews/question-sets/{id}/progress`、`POST /api/interviews/question-sets/{id}/complete`、`POST /api/interviews/question-sets/{id}/abandon`、`POST /api/interviews/question-sets/{id}/restart`、`DELETE /api/interviews/question-sets/{id}`、`POST /api/interviews/question-sets/{id}/answers`、`POST /api/interviews/answers/{id}/retry`、`POST /api/interviews/answers/{id}/evaluate`、`GET /api/interviews/stats` 和 `GET /api/interviews/reviews/due`。评分按正确性 35%、完整性 30%、结构性 20%、口语表达 15% 加权，并按 1 / 3 / 7 / 14 天安排复习。

一个本地运行的学习日记 Web 应用：前端使用 React + TypeScript + Vite，后端使用 FastAPI + SQLite + SQLAlchemy，通过 OpenAI-compatible API 将口语化学习记录整理成可检查、可修改、可归档的中文学习日记。

## 项目结构

```text
.
├─ backend/
│  ├─ requirements.txt
│  ├─ .env.example
│  └─ app/
│     ├─ main.py
│     ├─ config.py
│     ├─ database.py
│     ├─ models.py
│     ├─ schemas.py
│     ├─ crud.py
│     ├─ llm.py
│     ├─ prompts.py
│     └─ routers/
│        ├─ diaries.py
│        ├─ algorithms.py
│        └─ interviews.py
│  ├─ data/
│  │  ├─ algorithms/
│  │  ├─ interview_bank/
│  │  ├─ interview_question_bank.json
│  │  ├─ interview_sources.json
│  │  ├─ data_manifest.json
│  │  └─ ATTRIBUTIONS.md
│  ├─ scripts/
│  └─ tests/
└─ frontend/
   ├─ package.json
   ├─ .env.example
   ├─ index.html
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ api/
      ├─ components/
      ├─ layout/
      ├─ pages/
      ├─ styles/
      └─ types/
```

SQLite 数据库会在后端启动时自动创建到 `backend/data/study_diary.db`，该文件已被 `.gitignore` 忽略。

## Windows 一键启动开发环境

首次使用前，请先创建后端 `.venv` 并安装 `backend/requirements.txt`，在 `frontend` 和 `desktop-pet` 分别执行 `npm install`，并安装 Rust/Cargo。之后可直接双击根目录的 `start-dev.cmd`。

脚本会依次启动后端、Web 前端和桌宠，每项服务都在独立终端中运行；已可用的后端或前端会被复用，服务就绪后会自动打开浏览器。关闭项目时，请在对应终端按 `Ctrl + C`。一键启动不会自动安装依赖。

如果只想检查依赖而不启动服务，可执行 `powershell -ExecutionPolicy Bypass -File .\dev.ps1 -CheckOnly`；不希望自动打开浏览器时，可给 `dev.ps1` 传入 `-NoBrowser`。

## 后端启动

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

在 macOS 或 Linux 上激活虚拟环境：

```bash
source .venv/bin/activate
```

## 前端启动

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。开发服务器会固定使用 5173；若终端提示端口已被占用，请先停止占用该端口的旧前端进程，而不是继续打开旧服务。

前端页面：

- `/today`：默认入口，汇总桌宠专注、算法、八股训练、未完成任务和到期复习。
- `/write`：写日记，支持语音/手动输入、草稿本机自动保存、生成草稿、编辑草稿、按反馈重新生成、确认保存。
- `/history`：历史日记，支持列表、详情预览和删除。

## 环境变量

后端 `backend/.env`：

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
DATABASE_URL=sqlite:///./data/study_diary.db
APP_TIMEZONE=Asia/Shanghai
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

前端 `frontend/.env`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_ENABLE_QUESTION_REVIEW=false
VITE_ENABLE_AI_QUESTION_REVIEW=false
VITE_ENABLE_QUESTION_QUICK_PUBLISH=false
```

`LLM_BASE_URL` 使用 OpenAI-compatible 格式，因此可以切换到 DeepSeek、OpenAI 或其他兼容服务。不要提交真实 `.env` 文件或 API Key。

## 已完成功能

- 使用 Web Speech API 进行中文语音识别，浏览器不支持时可手动输入。
- 写日记和历史日记拆成独立页面，并提供应用级导航。
- 生成草稿时只调用大模型，不写入数据库。
- 未归档的日记内容会自动保存到浏览器本机，刷新页面后可恢复，正式保存后自动清除。
- 草稿可手动编辑标题、正文、总结和标签。
- 可输入反馈，让大模型基于原始输入和当前草稿重新生成。
- 用户确认后再保存草稿，保存接口不重复调用大模型。
- 使用 SQLite 持久化保存已确认日记。
- 历史页支持列表、详情查看和删除。
- 前后端都有基础错误提示。

## API 概览

```http
POST /api/diaries/draft
```

根据 `date` 和 `raw_text` 生成草稿，不入库。

```http
POST /api/diaries/draft/rewrite
```

根据原始输入、当前草稿和用户反馈重新生成草稿，不入库。

```http
POST /api/diaries
```

保存用户确认后的草稿，写入 SQLite，不再次调用大模型。

```http
GET /api/diaries
GET /api/diaries/{diary_id}
DELETE /api/diaries/{diary_id}
```

## 本地题库

后端新增本地、可审计的题库管道，和日记数据完全独立：

- 算法题只保存题目元数据和固定链接；不保存题面、题解或测试用例。
- NeetCode 150 / Blind 75 通过本地 `.problemSiteData.json` 离线转换；应用运行时不联网读取 GitHub 或 LeetCode。
- Hot 100 只预留人工维护或许可证清晰数据集的 slug 合并能力，初始为空。
- 八股题围绕 Agent、RAG、Python、网络和 AI 工程；每题保存来源、参考要点、评分 rubric 和审核状态。
- 由 AI 协助整理的首批 27 道八股题均为 `pending`，默认 API 不会返回。人工审核后才可改为 `verified`。

构建、校验和导入说明见 [docs/data-import-guide.md](docs/data-import-guide.md)，数据源和许可证说明见 [backend/data/ATTRIBUTIONS.md](backend/data/ATTRIBUTIONS.md)。

算法训练的每日推荐、刷新语义、设置项与接口说明见 [docs/algorithm-daily-feed.md](docs/algorithm-daily-feed.md)。

```bash
cd backend
.venv\Scripts\python.exe scripts\build_interview_bank.py
.venv\Scripts\python.exe scripts\validate_seed_data.py
.venv\Scripts\python.exe scripts\import_seed_data.py --all --dry-run
```

算法题上游数据由人工下载后构建：

```bash
cd backend
.venv\Scripts\python.exe scripts\build_problem_catalog.py --source C:\path\to\.problemSiteData.json
```

题库查询 API：

```http
GET /api/algorithms/problems?difficulty=easy&pattern=arrays_hashing&topic=数组&source_list=neetcode150&limit=20
GET /api/algorithms/problems/{stable_key}
GET /api/interviews/questions?domain=agent&difficulty=medium&count=10&random=true
GET /api/interviews/questions/{question_id}
```

八股题接口默认 `review_status=verified`；本地开发审核时可显式传 `review_status=pending`。

审核 API（均受后端 feature flag 保护）：

```http
PATCH /api/interviews/questions/{question_id}/review
POST /api/interviews/questions/{question_id}/ai-review
POST /api/interviews/questions/{question_id}/ai-review/apply
POST /api/interviews/questions/ai-review-batch
POST /api/interviews/questions/publish-batch
POST /api/interviews/questions/reject-batch
POST /api/interviews/batch-jobs
GET /api/interviews/batch-jobs
GET /api/interviews/batch-jobs/{job_id}
```

三种审核方式共用 `/interview/review`：人工精审的评分写入 `human_quality_score`，AI 评分写入 `ai_quality_score` 和结构化审核结果；快速正式化会记录 `manual_override`，但不会伪装成 `verified_by_human`。批量接口每次最多 30 题，单题失败不会中断其余处理。

批量操作会先创建持久化后台任务并立即返回。任务状态和逐题结果保存于 SQLite，前端右下角任务中心会跨页面轮询显示进度、完成提示和失败原因。AI 审核默认最多并发 2 个模型调用，可通过 `BATCH_AI_REVIEW_CONCURRENCY` 在 1 到 3 之间调整。服务重启时未完成任务会标记为失败，避免长期显示为处理中。

查询列表、查询详情和删除日记。

## 常用检查命令

后端：

```bash
cd backend
python -m compileall app
python -c "from app.database import init_db; init_db(); from fastapi.testclient import TestClient; from app.main import app; c=TestClient(app); print(c.get('/api/health').json()); print(c.get('/api/diaries').json())"
```

前端：

```bash
cd frontend
npm run build
```

题库与后端测试：

```bash
cd backend
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## 后续可扩展方向

- 增加日历视图、标签筛选和全文搜索。
- 增加本地导出 Markdown / PDF。
- 增加模型调用重试、流式生成和本地演示模式。
- 增加用户登录后支持多设备同步。

## PWA 与生产部署

Cloudflare PWA、Render 后端、Supabase PostgreSQL 和 SQLite 数据迁移见 [docs/deployment-cloudflare-render-supabase.md](docs/deployment-cloudflare-render-supabase.md)。自建 Linux/Nginx 方案仍见 [docs/deployment.md](docs/deployment.md)。
