# 学习日记记录系统

一个本地运行的 MVP Web 应用：前端使用 React + TypeScript + Vite，后端使用 FastAPI + SQLite + SQLAlchemy，通过 OpenAI-compatible API 将口语化学习记录整理成中文学习日记。

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
- 可编辑原始学习记录，并提交给后端生成学习日记。
- 后端调用 OpenAI-compatible Chat Completions API，并要求模型返回严格 JSON。
- 使用 SQLite 持久化保存日记。
- 支持日记列表、详情查看和删除。
- 前后端都有基础错误提示。

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
