# 算法题库与训练数据

算法模块只保存可验证的题目元数据：标题、稳定标识、确定链接、难度、主题、模式、来源榜单和授权/来源说明。它不保存题目全文、官方题解、测试用例或在线判题代码。

当前仓库内置 **18 道人工维护的示例子集**，用于让 MVP 首次启动即可训练。`hot100.json`、`blind75.json` 与 `neetcode150.json` 均明确标注为示例子集，绝不代表完整榜单；所有训练只会从已导入的本地记录中选择。

## 数据文件

- `backend/data/algorithms/source_neetcode.json`：人工维护的题目元数据源。
- `backend/data/algorithms/lists/*.json`：来源榜单的本地 slug 子集。
- `backend/data/algorithms/problem_catalog.json`：构建后的规范化目录。
- `backend/data/algorithms/problem_catalog_report.json`：构建报告，含数量与跳过项。

## 构建、校验与导入

```powershell
cd backend
.venv\Scripts\python.exe scripts\build_algorithm_catalog.py
.venv\Scripts\python.exe scripts\validate_seed_data.py
.venv\Scripts\python.exe scripts\import_seed_data.py --algorithms --dry-run
.venv\Scripts\python.exe scripts\import_seed_data.py --algorithms
```

导入以稳定键为准：已有题目只更新元数据，不会重置用户的训练会话、作答、进度或复习记录。不能确认标题或链接的条目应保留在源文件之外，待人工补充，而不是由 LLM 猜测。

## 扩充流程

1. 在 `source_neetcode.json` 追加经过人工确认的元数据。
2. 仅在有清晰授权或人工整理来源时，更新对应的榜单 slug 文件。
3. 运行构建、校验和 dry-run，确认报告中的数量与跳过原因。
4. 再执行正式导入。

应用运行时不会抓取 GitHub、LeetCode 或任何第三方题库，也不会生成不存在的题目、标题或链接。

## 训练 API

`POST /api/algorithms/sessions` 支持 `daily`、`hot100`、`topic`、`difficulty`、`random`、`weakness`、`wrong`、`similar` 与 `custom` 模式。会话创建后题目顺序固定；`POST /api/algorithms/attempts` 只追加新的作答记录。

AI 提示与复盘接口只传递本地元数据和用户输入，不运行、编译或提交用户代码。模型推荐的题目 ID 会被本地题库候选集过滤；失败时保留原作答并返回可理解的错误。
