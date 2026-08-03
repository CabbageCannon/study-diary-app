# PWA 与生产部署

## 前端

构建前在 `frontend/.env` 设置正式后端地址。不要把访问码或模型密钥写入任何 `VITE_` 变量。

```env
VITE_API_BASE_URL=https://api.example.com
VITE_ENABLE_QUESTION_REVIEW=true
VITE_ENABLE_AI_QUESTION_REVIEW=true
VITE_ENABLE_QUESTION_QUICK_PUBLISH=true
```

```bash
cd frontend
npm ci
npm run build
```

`vite-plugin-pwa` 会生成 `manifest.webmanifest` 与 Service Worker。静态资源和 SPA 壳使用预缓存；`/api/*`、AI 评估、写入、删除、训练状态均不会缓存。离线时应用会明确提示，未提交回答仍只由本地草稿恢复。

- Cloudflare Pages：`frontend/public/_redirects` 已提供 `/* /index.html 200`。
- Vercel：以 `frontend` 为项目根目录，`vercel.json` 已提供 SPA rewrite。
- 自建 Nginx：将未知前端路径回退到 `/index.html`，并让 `/api/` 反向代理到后端。

## 后端与 PostgreSQL

生产环境变量：

```env
PORT=8000
DATABASE_URL=postgresql://user:password@host:5432/study_diary
FRONTEND_ORIGIN=https://app.example.com,https://www.example.com
LLM_API_KEY=replace_me
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
APP_ACCESS_TOKEN=replace_with_a_long_random_value
AI_RATE_LIMIT_PER_MINUTE=12
```

`DATABASE_URL` 可使用 `postgresql://` 或 `postgres://`；运行时会选择 SQLAlchemy 的 `psycopg` 驱动。SQLite 仍适用于本地开发。PostgreSQL 不再在应用启动时使用 `create_all` 建表，必须先运行迁移：

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

仓库提供的 `backend/Dockerfile` 会在启动 Uvicorn 前执行 `alembic upgrade head`。首次部署完成后再导入种子数据。

将现有 SQLite 数据迁入一个已执行 Alembic、且业务表为空的 PostgreSQL 数据库：

```bash
cd backend
python scripts/migrate_sqlite_to_postgres.py \
  --source sqlite:///./data/study_diary.db \
  --target postgresql://user:password@host:5432/study_diary
```

该脚本会按外键顺序复制全部模型表；目标表已有业务数据时会停止，不会覆盖审核状态或训练记录。

## 公网保护

设置 `APP_ACCESS_TOKEN` 后，所有 `/api/` 写入和管理请求都需要 `X-Study-Diary-Access` 请求头。移动端可在“更多 -> 输入访问码”中输入一次，令牌只保留在当前浏览器会话。模型密钥始终只留在后端。

应用还会对草稿生成、AI 审核、评估和答题提交使用按 IP、按路径的 60 秒滑动窗口限制，超限返回 `429` 与 `Retry-After`。对于单用户公网部署，仍建议在前端和 API 域名外层启用 Cloudflare Access、Vercel Authentication 或反向代理的 Basic Auth，以同时保护只读内容。

## iPhone 验收

1. 用 iPhone Safari 打开正式 HTTPS 地址，检查 428 x 926 下无横向滚动。
2. 在“训练”中输入回答并唤起键盘，确认输入框和提交区仍可见。
3. 点按底部“更多”，检查训练历史、题库审核、主题切换和安装入口。
4. 点按 Safari 分享，选择“添加到主屏幕”，再从主屏幕启动，确认独立窗口内路由刷新不返回 404。
5. 断网后重新打开应用，确认出现离线提示；恢复网络后刷新训练和历史数据。
6. 发布一个新版本，确认用户看到“稍后 / 立即更新”，且答题不会被强制刷新。

上线前仍需由部署者填写：正式域名、PostgreSQL URL、LLM 配置、`APP_ACCESS_TOKEN`，以及平台侧访问保护规则。
