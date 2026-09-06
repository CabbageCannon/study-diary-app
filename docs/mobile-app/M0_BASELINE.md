# M0 可复现基线

日期：2026-09-06。此文档冻结手机项目启动前的当前 demo，供后续移动端角色建立独立 worktree。

## 来源与边界

- 父提交：`2c6a83c`（`feat/study-diary-mvp`）。
- 基线分支：`codex/mobile-baseline`。
- 整理方式：从父提交新建隔离 worktree，将原工作区全部 32 个已跟踪修改和 11 组未跟踪源文件逐项复制、暂存；原工作区未被暂存、提交、重置或清理。
- 已排除：`backend/.env`、`frontend/.env`、`desktop-pet/.env`、所有 SQLite/WAL 数据、浏览器存储、Playwright 输出、日志和 `.dev-processes.json`。检查未发现候选文件中含真实密钥；示例占位符保留在 `.env.example` 和文档中。

## 已保留的当前 demo 工作

| 分类 | 内容 | 路径范围 |
| --- | --- | --- |
| 移动入口与日记草稿 | 今日页、移动导航、访问令牌上下文、日记草稿恢复与样式 | `frontend/src/{App.tsx,auth,components,hooks,layout,pages,services,styles}` |
| 现有学习功能兼容 | 算法/八股服务的时间边界及相关测试 | `backend/app/{config.py,routers,services,time_utils.py}`、`backend/tests/` |
| 桌宠与同步 | 专注计时、控制、离线同步与统计展示 | `desktop-pet/src/`、对应前后端代码与测试 |
| 开发与说明 | 启动脚本、忽略规则、环境变量样例、项目与移动提案文档 | 根目录脚本、`README.md`、`docs/mobile-app/` |

## 尚未完成且不得误称为已交付

- A 的选定视觉规范、C 的思路核对协议、D 的首批完整题目内容、B 的手机学习闭环均尚未集成。
- HTTPS 公网部署、iPhone Safari 真机、主屏幕安装、软键盘、安全区、后台恢复、离线草稿恢复和版本更新尚未验收。
- 本基线是 Web/PWA 工程起点，不是已上架或已验收的原生 iPhone App。

## 已执行检查

在本隔离 worktree、锁文件所解析的依赖下执行：

| 检查 | 结果 |
| --- | --- |
| `frontend: npm ci && npm run build` | 通过；TypeScript 无错误，Vite 生产构建完成并生成 manifest/service worker。 |
| `desktop-pet: npm ci && npm run build` | 通过；TypeScript 无错误，Vite 生产构建完成。 |
| `backend: python -m compileall app` | 通过。 |
| `backend: python -m unittest discover -s tests -v` | 通过，60 项测试。 |
| `git diff --cached --check` | 通过。 |

后端测试期间出现第三方 `starlette.testclient` 对当前 `httpx` 的弃用警告；未造成测试失败，后续依赖维护应单独处理。

## 下游建立方式

```powershell
git fetch origin codex/mobile-baseline
git worktree add ..\study-diary-mobile-<role> -b codex/mobile-<role> origin/codex/mobile-baseline
```

后续 PR 均以此基线或 `codex/mobile-integration`（集成人发布后）为基准，不以默认分支猜测替代。
