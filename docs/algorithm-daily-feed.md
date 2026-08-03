# 算法每日推荐

`/algorithms` 只承载当天的学习决策：未完成训练优先恢复、一个主推荐题，以及同策略的继续刷列表。临时训练方式、每日策略和轻量题库浏览集中在 `/algorithms/settings`；复习与训练记录沿用各自的页面。

## 持久化与刷新

- `algorithm_daily_recommendation_settings` 保存单用户的推荐策略、筛选项与重复规避规则。
- `algorithm_daily_feeds` 以自然日唯一保存主推荐、继续刷列表、配置快照和刷新版本。
- 首次读取当天推荐时生成并持久化；同一天再次读取不会重新抽题。
- 保存设置只影响下一天。用户确认后调用刷新接口，才会替换当天的推荐；训练、作答与复习记录不会被删除或改写。

## 策略与筛选

策略支持均衡、随机、题型、难度、题单、薄弱点、错题和复习优先。所有选择均来自本地题库和本地学习记录，不会在运行时抓取题目或调用 AI。题池不足时会以明确提示回退；勾选相邻难度时，系统只在所选难度不够时扩展到相邻一档。

## 接口

```http
GET   /api/algorithms/daily-feed
POST  /api/algorithms/daily-feed/refresh
GET   /api/algorithms/daily-settings
PATCH /api/algorithms/daily-settings
GET   /api/algorithms/catalog-overview
GET   /api/algorithms/problems?search=&difficulty=&topic=&source_list=&completed=&needs_review=
```

历史兼容接口 `GET /api/algorithms/daily` 仍返回当天主推荐题。

## 数据库升级

```powershell
cd backend
.venv\Scripts\python.exe -m alembic upgrade head
```

迁移只新增每日推荐配置与推荐结果表。现有本地 SQLite 文件若曾被应用的 `Base.metadata.create_all` 初始化，也可以安全升级。
