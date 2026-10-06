# 学习日记微信小程序

这个目录是独立的 Taro 4 + React 18 小程序工程。它复用 Render API 与 Supabase 数据，不影响现有 Cloudflare 网页版。

## 本地启动

1. 复制 `.env.example` 为 `.env.production`，填写 Supabase **publishable key**（它是公开客户端配置，不是 service-role key）。
2. `npm install --no-audit --no-fund`
3. `npm run build:weapp`
4. 在微信开发者工具导入本目录；它会读取 `dist/`，AppID 已填为 `wx5372148eb34bcbdc`。

## 微信上线前配置

在微信公众平台的「开发管理 → 开发设置 → 服务器域名」添加：

- request 合法域名：`https://study-diary-api.onrender.com`
- request 合法域名：`https://lnmdbauqsunxasccrmkk.supabase.co`（只用于将已有邮箱账户绑定到微信）

在 Render 服务的 Environment 中设置（不要提交或发送到聊天）：

- `WECHAT_MINI_APP_SECRET`：微信公众平台「开发设置」中的 AppSecret
- `MINIAPP_JWT_SECRET`：用密码管理器生成的至少 32 字节随机字符串

Render 会从 `render.yaml` 读取小程序 AppID，并在启动时执行数据库迁移。首次使用已有网页账户时，在小程序点击「绑定已有学习账户」；之后可直接微信登录并看到同一份数据。
