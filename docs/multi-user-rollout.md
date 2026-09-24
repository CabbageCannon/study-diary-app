# 多用户登录上线与旧记录认领

这次升级把身份交给 Supabase Auth，学习数据仍由 Render API 通过 PostgreSQL 访问。旧记录在认领前会暂时隐藏；它们不会自动落到第一个注册的新用户账户。

1. **备份现有 Supabase PostgreSQL。** 在安全的终端使用当前数据库连接串执行 `pg_dump --format=custom --file=study-diary-before-users.dump "<DATABASE_URL>"`，确认文件非空并妥善保存。不要把连接串或备份提交到仓库。上线窗口内暂时停止使用旧版 App。
2. **配置 Supabase Auth。** 开启 Email provider 和邮箱验证；用已验证域名配置 Resend 自定义 SMTP，并实测验证邮件、密码重置邮件。将正式 Cloudflare 域名设为 Site URL，并加入 Redirect URLs。旧版项目默认 SMTP 只允许向授权邮箱发信，不能用于公开注册。
3. **先部署后端，再部署前端。** Render 增加 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，`ADMIN_USER_ID` 暂留空；保留原 `DATABASE_URL`、提醒密钥和模型密钥。后端启动时 Alembic 新增用户归属字段，并关闭 Supabase REST 对应用表的直接访问；浏览器数据统一经 Render API。Cloudflare 构建变量增加 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`；`VITE_API_BASE_URL` 留空，现有 Worker 代理 `/api/*`。确认 `/api/health` 为 200，未登录请求 `/api/diaries` 为 401。
4. **建立管理员。** 在 Supabase Auth 创建并验证你的邮箱账户，登录新版 App 一次。在 Auth 用户列表复制该用户 UUID，设为 Render 的 `ADMIN_USER_ID` 并重新部署。再次登录后，「我的」应显示管理员入口。认领前保持公开注册关闭。
5. **认领旧记录。** 在具有 Render 环境变量的后端 Shell 中，先运行 `python scripts/claim_legacy_data.py --admin-user-id <UUID> --admin-email <你的邮箱>` 查看各表待认领数量；与备份中的数量核对后，运行同一命令并加 `--apply`。脚本会同时核对管理员 UUID、登录邮箱和账户状态，再在单一事务内完成归属、校验；PostgreSQL 还会把这些列改为 `NOT NULL`。脚本可重复执行；再次运行待认领数量应全部为 0。
6. **开放注册与验收。** 在 Supabase Auth 打开新用户注册。用两个测试邮箱分别注册并验证：A 的日记、答题和统计不出现在 B；猜测 ID 也不能读取或删除；管理员停用 B 后，B 的现有令牌访问 API 返回 403，恢复后可继续使用。验证你原有记录完整可见，提醒只根据各自任务发送。

后端 `SUPABASE_SERVICE_ROLE_KEY` 和数据库密码只能保存在 Render；Cloudflare 只放公开的项目 URL 与 publishable key。现有浏览器里的旧草稿和个人设置仅在管理员首次登录时复制到其账户空间，其他用户不会继承。
