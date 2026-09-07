# 学习日记 iPhone 使用教程

本文适用于 `codex/mobile-integration` 分支的移动版学习日记。你可以先在同一 Wi-Fi 下试用；要在外面随时打开、稳定添加到主屏幕，需要部署到公网 HTTPS 地址。

## 选择使用方式

| 方式 | 适合场景 | 限制 |
| --- | --- | --- |
| 同一 Wi-Fi 试用 | 当天在家检查页面和答题流程 | 电脑必须开机，手机和电脑必须在同一网络；HTTP 不适合作为正式 PWA |
| 公网 HTTPS | 日常从主屏幕使用，Wi-Fi 和蜂窝网络都能访问 | 需要域名、长期在线的服务器和有效的 LLM 密钥 |

当前集成版本已在 390 × 844 的移动视口完成自动化检查，前端构建和后端测试也已通过。真实 iPhone Safari、主屏幕安装、软键盘和蜂窝网络仍需按文末验收表亲自确认。

## 方式一：同一 Wi-Fi 快速试用

以下命令在 Windows PowerShell 中执行。示例工作区是 `D:\mobile-integration-worktree`。

### 1. 更新代码

```powershell
cd D:\mobile-integration-worktree
git switch codex/mobile-integration
git pull --ff-only origin codex/mobile-integration
```

### 2. 找到电脑的局域网地址

```powershell
ipconfig
```

找到“无线局域网适配器 WLAN”或 Wi-Fi 项下的 IPv4 地址，例如 `192.168.1.23`。下面用 `<电脑IP>` 代替它。

### 3. 首次准备后端

```powershell
cd D:\mobile-integration-worktree\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

如果 `.venv` 和 `.env` 已存在，跳过对应创建命令。打开 `backend\.env`，至少确认这些配置：

```env
LLM_API_KEY=<你的模型服务密钥>
LLM_BASE_URL=<兼容 OpenAI API 的服务地址>
LLM_MODEL=<该服务支持的模型名>
DATABASE_URL=sqlite:///./data/study_diary.db
APP_TIMEZONE=Asia/Shanghai
FRONTEND_ORIGIN=http://<电脑IP>:5173
APP_ACCESS_TOKEN=
```

不要把真实密钥提交到 Git。局域网个人试用可以暂时留空 `APP_ACCESS_TOKEN`；公开到互联网时应设置访问码。

初始化数据库和题库：

```powershell
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe scripts\import_seed_data.py --all
```

已有学习数据时，先复制 `backend\data\study_diary.db` 做备份，再执行迁移。

### 4. 启动后端

在第一个 PowerShell 窗口运行：

```powershell
cd D:\mobile-integration-worktree\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. 首次准备并启动前端

在第二个 PowerShell 窗口运行：

```powershell
cd D:\mobile-integration-worktree\frontend
npm ci
Copy-Item .env.example .env
```

把 `frontend\.env` 中的 API 地址改为电脑的局域网地址：

```env
VITE_API_BASE_URL=http://<电脑IP>:8000
VITE_ENABLE_QUESTION_REVIEW=false
VITE_ENABLE_AI_QUESTION_REVIEW=false
VITE_ENABLE_QUESTION_QUICK_PUBLISH=false
```

然后启动前端：

```powershell
npm.cmd run dev -- --host=0.0.0.0 --port=5173 --strictPort
```

首次运行时，如果 Windows 防火墙询问是否允许 Python 或 Node.js，请允许其访问专用网络。

### 6. 从 iPhone 打开

确保手机和电脑连接同一 Wi-Fi，然后用 Safari 依次打开：

1. `http://<电脑IP>:8000/api/health`，应看到 `{"status":"ok"}`。
2. `http://<电脑IP>:5173`，进入学习日记。

这种方式适合快速试用。电脑休眠、服务窗口关闭、手机切到蜂窝网络后都会无法访问；HTTP 环境也不能完整验证主屏幕 PWA。

## 方式二：公网 HTTPS 日常使用

日常使用建议采用一个 HTTPS 域名：Nginx 提供前端并把 `/api/` 转发给 FastAPI，SQLite 保存在服务器持久磁盘。完整命令和现成配置见 [HTTPS PWA 部署说明](../deployment.md)。

部署时需要：

- 一个域名和可管理的 DNS；
- 一台长期在线的 Linux 主机；
- 有效的 LLM 服务地址、模型名和密钥；
- 一个较长的 `APP_ACCESS_TOKEN`；
- 数据库的异地备份位置。

后端的 `FRONTEND_ORIGIN` 应是最终 HTTPS 地址，例如 `https://study.example.com`。同域部署时，前端生产配置中的 `VITE_API_BASE_URL` 保持为空。部署完成后，先访问 `https://你的域名/api/health`，确认返回 `{"status":"ok"}`，再打开首页。

## 添加到 iPhone 主屏幕

1. 用 Safari 打开正式 HTTPS 地址。
2. 点击 Safari 的“分享”按钮。
3. 选择“添加到主屏幕”。
4. 确认名称后点击“添加”。
5. 从主屏幕图标启动学习日记。

如果公开部署时设置了 `APP_ACCESS_TOKEN`，进入“我的 → 输入访问码”，填写同一个值。访问码只保存在当前浏览器会话；Safari 清理网站数据后需要重新输入。

## 日常刷题

### 今日

“今日”优先展示未完成练习，然后给出八股、算法和到期复习入口。平时可直接点击“继续上次”，或者开始当天推荐任务。

### 八股

1. 进入“八股”，选择题目并开始练习。
2. 在回答区输入答案；也可以点击 iPhone 键盘上的麦克风，用系统听写把口述转成文字。
3. 提交核对，先看简短结论，需要时再展开详细反馈。
4. 点击下一题，或退出后从“今日”继续。

### 算法

1. 进入“算法”，打开当天推荐或题目列表。
2. 阅读题意，在回答区讲清楚数据结构、核心步骤、复杂度和边界情况；手机端不要求写完整代码。
3. 点击核对，让 LLM 检查思路中的遗漏和错误。
4. 如果显示“回答已保存，暂时没有核对结果”，答案已经保留。检查网络或模型配置后重试即可，不需要重新输入。

### 我的

“我的”中可以进入学习日记、练习历史、算法历史、八股历史、复习、设置、主题、安装说明和访问码输入。

## 更新与备份

服务器更新代码前先备份 SQLite 数据库，然后拉取 `codex/mobile-integration`、执行后端迁移、重新构建前端并重启服务。具体步骤和备份命令见 [HTTPS PWA 部署说明](../deployment.md)。

新版本发布后，应用会提示“稍后”或“立即更新”。正在输入答案时选“稍后”；完成当前题目后再更新。

## 常见问题

### 手机打不开局域网页面

- 确认手机和电脑在同一 Wi-Fi，且没有启用会隔离局域网的访客网络或 VPN。
- 再次用 `ipconfig` 检查电脑 IP 是否变化。
- 确认前后端两个 PowerShell 窗口仍在运行。
- 确认启动命令包含 `--host 0.0.0.0`，并允许 Python、Node.js 访问 Windows 专用网络。

### 健康检查正常，但页面没有数据

确认 `frontend\.env` 的 `VITE_API_BASE_URL` 使用电脑当前 IP。修改 `.env` 后需要停止并重新启动 Vite。

### 页面提示无权限

进入“我的 → 输入访问码”，填写服务器 `APP_ACCESS_TOKEN` 的值。

### 回答保存了，但没有 LLM 核对

依次检查后端的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 和服务器外网连接。答案已经保存，可以在配置恢复后重试。

### 仍显示旧页面

关闭并重新打开主屏幕应用，看到更新提示时选择“立即更新”。清理 Safari 网站数据会同时清除本机草稿和访问码，操作前先保存需要保留的内容。

## 真机验收

正式使用前，在你的 iPhone 上逐项填写 [iPhone HTTPS PWA 验收记录](IPHONE_ACCEPTANCE.md)。只有完成 HTTPS、主屏幕启动、软键盘、后台恢复、断网重试和版本更新实测后，才算完成真机交付。
