# 学习日记记录系统

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
│        └─ diaries.py
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

浏览器打开 `http://localhost:5173`。

前端页面：

- `/write`：写日记，支持语音/手动输入、生成草稿、编辑草稿、按反馈重新生成、确认保存。
- `/history`：历史日记，支持列表、详情预览和删除。

## 环境变量

后端 `backend/.env`：

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
DATABASE_URL=sqlite:///./data/study_diary.db
FRONTEND_ORIGIN=http://localhost:5173
```

前端 `frontend/.env`：

```env
VITE_API_BASE_URL=http://localhost:8000
```

`LLM_BASE_URL` 使用 OpenAI-compatible 格式，因此可以切换到 DeepSeek、OpenAI 或其他兼容服务。不要提交真实 `.env` 文件或 API Key。

## 已完成功能

- 使用 Web Speech API 进行中文语音识别，浏览器不支持时可手动输入。
- 写日记和历史日记拆成独立页面，并提供应用级导航。
- 生成草稿时只调用大模型，不写入数据库。
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

## 后续可扩展方向

- 增加日历视图、标签筛选和全文搜索。
- 增加本地导出 Markdown / PDF。
- 增加模型调用重试、流式生成和本地演示模式。
- 增加用户登录后支持多设备同步。
