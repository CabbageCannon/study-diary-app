# 八股训练助手 MVP

## 数据与审核边界

- `InterviewQuestion` 继续是唯一题库实体，日记表和算法题表不受训练功能影响。
- 训练集只会选择 `review_status=verified` 且 `is_active=true` 的题目；题库不足时 API 会返回实际可用题数和提示。
- `pending`、`rejected` 的查询和审核写入默认关闭。后端必须显式设置 `ALLOW_QUESTION_REVIEW=true` 与 `ALLOW_UNVERIFIED_QUESTION_ACCESS=true`，前端还必须设置 `VITE_ENABLE_QUESTION_REVIEW=true` 才会展示审核入口。
- `backend/data/interview_manual_review_report.json` 是自动完整性检查报告，不是人工背书。初始 27 道题保持 `pending`，不会被脚本或导入过程自动标记为 `verified`。

## 训练流程

1. 在 `/interview` 选择领域、主题、难度、题数和随机顺序，创建训练集。
2. 在 `/interview/session/:setId` 逐题用语音或文本回答；前端会明确标注录入来源。
3. 后端先保存原始回答，再调用 OpenAI-compatible 模型输出固定 JSON 评分。模型 JSON 由 Pydantic 校验；调用或校验失败时，回答仍保留且可以重试评分。
4. 最终得分按正确性 35%、完整性 30%、结构性 20%、口语表达 15% 加权。低于 60 分为 1 天，60-79 分为 3 天，80-89 分为 7 天，90 分及以上为 14 天。
5. `/interview/history` 可查看训练集、每次回答和评分；`GET /api/interviews/reviews/due` 返回到期复习题。

## 会话恢复与状态边界

- 题集创建后默认为 `in_progress`，全部题目已答或跳过后由用户明确执行结束操作，状态才变为 `completed`；中途放弃会变为 `abandoned`。已结束题集不能重新写回进行中状态。
- SQLite 保存题集筛选条件、冻结后的题目顺序、当前题目索引、最后活动题目、已答/跳过状态、回答、评分、开始/最后活动/完成/放弃时间。进入 `/interview/session/:setId` 会重新从后端读取这些状态。
- 浏览器只保存未提交的文本草稿与最近会话 ID：`study-diary:interview:last-active-session` 和 `study-diary:interview:session:{setId}:question:{questionId}:draft`。草稿在停止输入 750ms 后写入，并在切题、页面隐藏和完成训练时处理；已提交回答始终以服务端为准。
- 首页默认显示最近的未完成训练。继续训练会回到后端记录的准确题目；重新开始会先明确确认并将旧题集标记为已放弃；完成或放弃后会清理最近会话提示。
- 历史列表支持按三种状态筛选。删除为本地训练记录的事务性硬删除：关联回答、评分和仅由该回答支撑的复习计划会被清理或回退到上一条有效回答，`InterviewQuestion` 原题不会删除。
- `GET /api/interviews/stats` 在服务端聚合连续学习天数、当天和累计已答数、待复习数、近 20 次评分均分、进行中数量、领域练习量和最后训练时间；前端不拉取完整历史后自行统计。

## 新增持久化模型

- `InterviewQuestionSet` 与 `InterviewQuestionSetItem`：冻结训练集与题目顺序。
- `InterviewAnswer`：保存每次文本/语音回答和时长；同题重答使用新的 `attempt_index`，不会覆盖历史。
- `InterviewEvaluation`：保存各维度得分、总分、命中点、缺失点、改进答案和模型原始 JSON。
- `InterviewReviewSchedule`：保存最近一次得分和下一次复习时间。

SQLite 项目继续通过 `Base.metadata.create_all()` 创建新表，已有日记数据库无需迁移，现有记录也不会被重置。

## 审核工作流

`/interview/review` 是唯一审核工作区，提供三条彼此可追溯的路径：

- 人工精审：审核员可编辑题干、难度、标签、参考要点、评分 rubric、常见误区、口语提纲、标准回答和人工质量分。只有人工评分不低于 70、来源满足要求、评分标准权重合计为 100 且关键字段完整时，后端才允许标记为 `verified`。
- AI 审核：`ALLOW_AI_QUESTION_REVIEW=true` 与 `VITE_ENABLE_AI_QUESTION_REVIEW=true` 时可用。模型仅返回严格 Pydantic JSON，不会改写题目或补造来源。仅当总分不低于 85、建议通过、无事实风险和重复风险，并且基础数据校验通过时，才可自动进入训练池；其他情况始终保持 `pending`，不会自动拒绝。
- 快速正式化：`ALLOW_QUESTION_QUICK_PUBLISH=true` 与 `VITE_ENABLE_QUESTION_QUICK_PUBLISH=true` 时可用。后端先进行同样的基础数据校验，再以 `manual_override` 标记进入训练池，并保持 `verified_by_human=false`。

`human_quality_score`、`ai_quality_score`、`review_method`、`review_model`、`ai_review_json`、`reviewed_at` 将三种路径分开保存；旧字段 `quality_score` 继续镜像人工评分以兼容已有数据。普通题库查询接口不会改变任何审核数据。

## 批量操作与导入保护

- AI 评估、快速正式化和批量拒绝每次最多 30 题。`POST /api/interviews/batch-jobs` 会先创建持久化任务，再由 FastAPI 轻量后台任务逐题处理；`GET /api/interviews/batch-jobs` 和 `GET /api/interviews/batch-jobs/{id}` 可查询任务和失败原因。
- `InterviewBatchJob` 记录 `queued`、`running`、`completed`、`partial_failed`、`failed` 状态；`InterviewBatchJobItem` 分别记录每道题的 `pending`、`running`、`succeeded`、`skipped`、`failed` 状态。AI 任务使用 `BATCH_AI_REVIEW_CONCURRENCY` 限制为 1 至 3 个并发调用，默认 2。
- 前端任务中心在路由切换后继续轮询进行中的任务，页面刷新后从 SQLite 恢复状态；服务启动时会把上一进程遗留的 `queued` 或 `running` 任务标记为失败，避免永久卡住。
- 单题模型或数据错误不会回滚其他题目的结果；已人工通过和已拒绝题目默认跳过 AI 批处理。
- `scripts/import_seed_data.py --interviews` 对已有题目只更新题目内容，不会覆盖审核状态、评分、审核方式、模型名或 AI 结果。用 `--overwrite-review-metadata` 才会显式以种子数据覆盖审核元数据。
- `--dry-run` 输出每题变更细节，包括“内容字段更新”和“审核元数据保留/覆盖”的区别，随后回滚事务。

## 检查命令

```powershell
cd backend
.venv\Scripts\python.exe -m compileall app
.venv\Scripts\python.exe -m unittest discover -s tests -v
.venv\Scripts\python.exe scripts\validate_seed_data.py
.venv\Scripts\python.exe scripts\build_interview_manual_review_report.py
.venv\Scripts\python.exe scripts\import_seed_data.py --interviews --dry-run

cd ..\frontend
npm run build
```
