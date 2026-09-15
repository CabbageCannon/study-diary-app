# E 复验交接：集成与 PWA

日期：2026-09-06。本记录补充 [PM 第一轮验收](PM_REVIEW_A_E.md)，不修改其针对旧 SHA 的历史发现。

## 已复验的修正

| 首轮问题 | 修正与复验 |
| --- | --- |
| 同源 API 双 `/api` 前缀 | `frontend/pwa-production.env.sample` 将 `VITE_API_BASE_URL` 留空；所有调用端本已提供 `/api/...`。用空基址生产构建并检查 bundle：编译基址为空、存在 `/api/diaries`、不存在 `/api/api/`。未修改 B 拥有的 API 客户端。 |
| 时间工具测试未被收集 | `backend/tests/test_time_utils.py` 改为 `unittest.TestCase`；`unittest discover -s tests -v` 实际收集并通过 62 项，其中含两个时间工具用例。 |
| 迁移和首次证书步骤不可执行 | 部署说明要求 Alembic 先加载 `/etc/study-diary/api.env`；新增 HTTP-only Nginx bootstrap 配置，证书存在后才启用引用证书路径的 HTTPS 配置。 |
| 同域与访问码文案矛盾 | 文档明确：同源只免除独立 API 域名配置；配置 `APP_ACCESS_TOKEN` 后仍须在当前会话输入访问码。 |
| PR 正文显示字面量换行 | PR #2 和 #3 已用 body-file 更新为正常 Markdown 段落。 |

## 已发布状态

- 冻结 M0 基线仍为 `5bcaa2e78cb8f887a71638533d81d74fbb1f4a20`，不得重写。
- 后续角色使用远程 `origin/codex/mobile-integration` 的最新已推送提交作为统一起点；产品经理或 E 在交接消息中公布该次提交的精确 SHA。
- A 的雾绿方向已选定，但 PR #4 的旧设计提交仍在修订中。本集成分支尚未导入其设计文件，B 不得以旧 PNG 的错误逻辑尺寸实施页面。
- C/D 可从当前集成分支建立独立 worktree，PR 目标仍为 `codex/mobile-integration`；B 等 A 修订设计和 C 协议后实施。

## 本次已执行工程检查

- `frontend: npm run build`，使用生产等价的空 `VITE_API_BASE_URL`，通过；PWA 生成 manifest、`sw.js` 和 Workbox 预缓存。
- bundle 断言通过：空 API 基址、`/api/diaries` 存在、无 `/api/api/`。
- `backend: python -m compileall app`，通过。
- `backend: python -m unittest discover -s tests -v`，62 项通过。
- `git diff --check`，通过。

## 未包含的验收结论

未部署公网 HTTPS，未做真实 iPhone/Safari/软键盘/主屏幕/后台恢复测试，未运行真实 LLM 学习闭环。不得把以上构建和测试表述为真机、线上或原生 App 验收通过。
