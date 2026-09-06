# HTTPS PWA 部署与 iPhone 验收

这是一套个人使用的 HTTPS PWA 交付方案，不是 TestFlight、App Store 或原生 App 上架方案。首选单台长期在线的 Linux 主机：Nginx 通过同一 HTTPS 域名提供前端与 `/api/`，FastAPI 仅监听本机回环地址，SQLite 放在主机持久磁盘并备份。这样 Safari 主屏幕安装使用一个稳定地址，前端也不需要在浏览器里保存 API 域名或访问码。

未确定域名、服务器或账户前，不得发布。缺少的实际条件列在本文末尾。

## 已随工程提供的 PWA 条件

- Vite PWA 构建会生成 manifest 与 Service Worker；清单声明 standalone、portrait、中文名称，并提供 192、512 和 iPhone 180 px PNG 图标。
- `index.html` 已设置 `viewport-fit=cover`、Apple 主屏幕元数据与 `apple-touch-icon`。
- 预缓存仅覆盖 Web 应用壳和静态资源。所有 `/api/` 请求、AI 核对、写入、删除、训练状态都不缓存；离线只承诺恢复已有应用壳和本机未提交草稿，不承诺离线评分或完整题库。
- 更新使用提示模式，用户可选“稍后”或“立即更新”，不会在有输入时强制刷新。

## 一次性部署步骤（Nginx + systemd + SQLite）

以下示例把公开地址设为 `https://app.example.com`。将仓库放在 `/srv/study-diary`，不要把 `.env`、SQLite 或浏览器数据提交到 Git。

1. 在主机安装 Node.js、Python 3.12、Nginx、Certbot 和 SQLite 命令行工具；创建不可登录的 `study-diary` 用户与目录：`/var/lib/study-diary`、`/etc/study-diary`，两者仅该用户可读写。
2. 创建 `/etc/study-diary/api.env`（权限 `600`，属主 `study-diary`）：

   ```env
   DATABASE_URL=sqlite:////var/lib/study-diary/study_diary.db
   FRONTEND_ORIGIN=https://app.example.com
   LLM_API_KEY=<实际密钥，仅此文件保存>
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4o-mini
   APP_TIMEZONE=Asia/Shanghai
   APP_ACCESS_TOKEN=<足够长的随机访问码>
   AI_RATE_LIMIT_PER_MINUTE=12
   ```

   `APP_ACCESS_TOKEN` 会保护写入和管理 API；客户端只在当前会话保存它。不要设置任何 `VITE_*` 密钥。
3. 后端在 `/srv/study-diary/backend` 建立虚拟环境、安装 `requirements.txt`，执行 `alembic upgrade head`。首次空库需要题库时，再按项目数据导入说明导入；已有 SQLite 文件应先停服务、制作备份，然后复制到上述持久目录并执行迁移检查，不要覆盖正在使用的数据。
4. 复制 [`deploy/systemd/study-diary-api.service.example`](../deploy/systemd/study-diary-api.service.example) 到 `/etc/systemd/system/study-diary-api.service`，随后执行 `systemctl daemon-reload`、`systemctl enable --now study-diary-api`，并从主机检查 `curl http://127.0.0.1:8000/api/health`。
5. 复制 [`frontend/pwa-production.env.sample`](../frontend/pwa-production.env.sample) 为 `frontend/.env.production`，在 `frontend` 执行 `npm ci`、`npm run build`。该配置把 API 设为相同来源的 `/api`；将生成的 `dist/` 保留在 `/srv/study-diary/frontend/dist`。
6. 将 [`deploy/nginx/study-diary.conf.example`](../deploy/nginx/study-diary.conf.example) 复制为 Nginx site 配置，替换域名和路径。DNS 指向主机后，以 Certbot 签发证书，再执行 `nginx -t` 和 `systemctl reload nginx`。访问 `https://app.example.com/api/health` 应返回 `{"status":"ok"}`。
7. 每次发布先构建与检查，再替换 `dist/`，并重启 API（仅后端变更时）。`index.html` 与 `sw.js` 禁止缓存，带 hash 的 `/assets/` 长缓存；发布后用真实 Safari 看见更新提示再选择更新，避免在答题中强制刷新。

`frontend/public/_redirects` 与 `frontend/vercel.json` 仍适用于纯前端托管的 SPA 回退，但它们不会部署或持久化本项目的 FastAPI/SQLite 后端；在未另外设计数据库卷与 HTTPS API 前，不能把它们当成完整个人部署方案。

## SQLite 备份与恢复

SQLite 是本阶段的正式单用户存储，不迁移为账号平台或高并发数据库。每天在低使用时段执行一次一致性备份，并把备份同步到主机以外的私人加密位置：

```bash
sqlite3 /var/lib/study-diary/study_diary.db ".backup '/var/backups/study-diary/study_diary-$(date +%F).db'"
sqlite3 /var/backups/study-diary/study_diary-$(date +%F).db "PRAGMA integrity_check;"
```

保留策略、异地位置和恢复演练时间由部署者记录。恢复前停止 `study-diary-api`，保留当前数据库副本，再替换数据库文件、检查完整性并启动服务；绝不直接覆盖唯一副本。

## 真机验收记录（必须实测）

模拟器、桌面浏览器和截图只能作为工程检查，不能替代客户 iPhone Safari 验收。使用 [iPhone HTTPS PWA 验收记录](mobile-app/IPHONE_ACCEPTANCE.md) 填写设备型号、iOS 版本、Safari 版本、PWA 构建 SHA、部署 URL、日期和每项结果：

1. 在蜂窝网络或离开开发电脑局域网后访问 HTTPS 地址；刷新深链接不返回 404。
2. Safari 分享菜单“添加到主屏幕”，从主屏幕 standalone 启动并返回上次位置。
3. 用真实 Safari 键盘输入，检查安全区、软键盘、长题目滚动和主操作不被遮挡。
4. 输入未提交草稿后切后台、锁屏/恢复、刷新；确认草稿恢复符合页面承诺。
5. 模拟核对超时或断网，确认已保存回答不丢失、重试不生成重复记录；恢复联网后再次核对。
6. 连续完成下一题、复习入口和返回导航；确认历史/日记仍可达。
7. 离线重新打开已安装应用、恢复网络后刷新数据；明确离线不能评分或同步。
8. 发布一次新构建，确认“稍后 / 立即更新”可控且不打断正在输入的内容。

## 仍需部署者提供的外部条件

- 一个可公开解析的域名及 DNS 管理权，用于 TLS 证书；
- 一台长期在线、可运行 Nginx、Python 与持久磁盘的 Linux 主机，或同等能力的已付费托管账户；
- HTTPS 证书签发权限（通常为 DNS/HTTP-01）和主机防火墙的 80/443 入站规则；
- LLM 服务的有效凭据与可接受的费用；
- 私有备份存储位置，以及客户自己的 iPhone、iOS/Safari 版本和实测时间。

在这些条件到位前，本项目只完成可构建的 PWA 工程与具体部署方案，不能声称已在公网可用或已完成 iPhone 验收。
