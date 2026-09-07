# Render + Vercel + Supabase 部署教程

本方案把 FastAPI 部署到 Render、React PWA 部署到 Vercel，并把正式数据放在 Supabase PostgreSQL。前端只访问 Render API，不需要 Supabase SDK，也不要把 Supabase 数据库密码或 LLM 密钥放进 Vercel。

## 1. 创建 Supabase 数据库

1. 在 Supabase 新建一个项目，妥善保存数据库密码。
2. 在项目顶部点击 **Connect**，选择 **Session pooler**。Render 是持续运行的后端，Session 模式比 Transaction 模式更合适，也能兼容仅支持 IPv4 的运行环境。
3. 复制 URI，把密码占位符替换为 URL 编码后的数据库密码，并在末尾添加 `?sslmode=require`。最终格式类似：

   ```text
   postgresql://postgres.<project-ref>:<url-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

数据库连接串只填写到 Render 的 `DATABASE_URL`。前端不需要 Supabase URL、anon key 或 service role key。

## 2. 迁移现有 SQLite 数据

如果不需要保留当前电脑上的学习记录，可以跳过本节；Render 首次启动时会创建表并导入仓库里的题库种子。

需要保留现有记录时，在本机 PowerShell 中进入后端目录，先备份 SQLite 文件，再运行：

```powershell
cd D:\mobile-integration-worktree\backend
Copy-Item .\data\study_diary.db .\data\study_diary.before-supabase.db
$env:DATABASE_URL='<Supabase Session pooler URI>'
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe scripts\migrate_sqlite_to_postgres.py --source sqlite:///./data/study_diary.db --target $env:DATABASE_URL
Remove-Item Env:DATABASE_URL
```

迁移脚本要求目标表为空；检测到已有数据会停止，避免覆盖 Supabase 内容。完成后它会同步 PostgreSQL 自增序列，后续新增记录不会与旧主键冲突。

## 3. 部署 Render 后端

代码库根目录已有 `render.yaml`。在 Render 选择 **New → Blueprint**，连接 GitHub 仓库，并把分支设为 `codex/mobile-integration`。首次创建时填写：

| 环境变量 | 值 |
| --- | --- |
| `DATABASE_URL` | Supabase Session pooler URI，末尾带 `?sslmode=require` |
| `FRONTEND_ORIGIN` | 首次可暂填 `https://example.invalid`，Vercel 创建完成后再替换 |
| `LLM_API_KEY` | 你的模型服务密钥 |
| `APP_ACCESS_TOKEN` | 你自己设置的访问码，手机端需要输入 |

`LLM_BASE_URL` 和 `LLM_MODEL` 默认使用 OpenAI；使用其他兼容服务时，在 Render 环境变量中改成该服务的地址和模型名。不要把上述密钥提交到 Git。

Blueprint 会执行以下工作：

- 安装 `backend/requirements.txt`；
- 每次启动前执行 Alembic 数据库迁移；
- 幂等导入题库种子；
- 启动 FastAPI，并用 `/api/health` 做健康检查。

部署成功后记下地址，例如 `https://study-diary-api.onrender.com`，打开：

```text
https://study-diary-api.onrender.com/api/health
```

应返回 `{"status":"ok"}`。Render 免费实例长时间无人访问后可能休眠，第一次打开会慢一些。

## 4. 部署 Vercel 前端

1. 在 Vercel 选择 **Add New → Project**，导入同一个 GitHub 仓库。
2. 将 **Root Directory** 设置为 `frontend`。
3. Framework Preset 选择 **Vite**；构建命令保持 `npm run build`，输出目录保持 `dist`。
4. 项目创建后，在 **Settings → Environments → Production → Branch Tracking** 把生产分支设为 `codex/mobile-integration`；该仓库当前默认分支不是移动集成分支。
5. 添加生产环境变量：

   ```env
   VITE_API_BASE_URL=https://study-diary-api.onrender.com
   VITE_ENABLE_QUESTION_REVIEW=false
   VITE_ENABLE_AI_QUESTION_REVIEW=false
   VITE_ENABLE_QUESTION_QUICK_PUBLISH=false
   ```

6. 从 `codex/mobile-integration` 触发一次生产部署，记下正式地址，例如 `https://study-diary-app.vercel.app`。

`frontend/vercel.json` 已包含单页应用回退，直接刷新 `/today`、`/interview` 或 `/algorithms` 不会返回 404。

## 5. 回填跨域地址

回到 Render，把 `FRONTEND_ORIGIN` 改为实际 Vercel 正式地址，不要带末尾 `/`：

```env
FRONTEND_ORIGIN=https://study-diary-app.vercel.app
```

保存后让 Render 重新部署。若以后绑定自定义域名，可用英文逗号同时保留两个来源：

```env
FRONTEND_ORIGIN=https://study-diary-app.vercel.app,https://study.example.com
```

## 6. 上线验收

1. 打开 Vercel 正式地址，确认“今日”、八股和算法题能加载。
2. 进入“我的 → 输入访问码”，填写 Render 的 `APP_ACCESS_TOKEN`。
3. 完成一道八股和一道算法题，确认答案与 LLM 反馈可保存。
4. 在 Supabase Table Editor 中确认对应表产生记录。
5. 用 iPhone Safari 添加到主屏幕，并填写 [iPhone HTTPS PWA 验收记录](mobile-app/IPHONE_ACCEPTANCE.md)。

## 更新方式

Render 和 Vercel 都连接同一 GitHub 分支后，后续 push 会自动触发部署。数据库结构由 Alembic 更新；题库导入是幂等操作。更新前仍建议从 Supabase Dashboard 导出或使用其备份功能保留一份可恢复副本。
