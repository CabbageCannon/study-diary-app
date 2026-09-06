# 移动端题库内容 · 第一阶段交付说明（角色 D）

版本：2026-09-06。本目录保存移动端思路核对的内容草稿与审核说明。正式数据目录 `backend/data/mobile/` 在 C 冻结协议后才填充；本阶段**未**发明永久 schema，**未**修改数据库、`app/schemas.py`、`app/models.py` 或任何迁移。

## 第一阶段范围与产出

严格限定 3 道算法题样例（未扩展到 10–15 道）：

| catalog ID | 题目 | 难度 | 思维模式 | 内容文件 |
| --- | --- | --- | --- | --- |
| `leetcode-1` | 两数之和 Two Sum | easy | 数组 / 哈希（补数查找） | [algorithm-samples/leetcode-1-two-sum.md](algorithm-samples/leetcode-1-two-sum.md) |
| `leetcode-15` | 三数之和 3Sum | medium | 排序 + 双指针（去重） | [algorithm-samples/leetcode-15-3sum.md](algorithm-samples/leetcode-15-3sum.md) |
| `leetcode-322` | 零钱兑换 Coin Change | medium | 动态规划（贪心失效） | [algorithm-samples/leetcode-322-coin-change.md](algorithm-samples/leetcode-322-coin-change.md) |

结构化数据草稿（临时字段名，便于 C 映射）：[drafts/algorithm_samples_draft.json](drafts/algorithm_samples_draft.json)。

选题依据：三道题全部取自现有 18 条目录（`backend/data/algorithms/problem_catalog.json`），有稳定 ID 与可核实链接；三种思维模式互相独立——哈希补数、有序性上的双指针、最优子结构递推——各自带有能区分对错的原创反例。

每题内容包含：原创题意摘要、输入、输出、约束、原创示例（每题 3 个）、多种可接受方案（并标注“正确但非最优”）、分级核对要点（required / expected / bonus）、常见错误、边界情况、有区分力的反例、时间与空间复杂度要求、来源与版本。

## 当前状态核实（只读，2026-09-06 @ 1454cab）

- 算法目录：18 道题**只有元数据**（标题、slug、难度、模式、链接、来源），无题面、示例或核对依据；本阶段 3 道样例即针对此缺口。
- 八股题库：仓库文件 `backend/data/interview_question_bank.json` 共 27 题，**全部 `review_status: pending`**。产品 README 所述“本地 SQLite 有 27 道 verified”是个人数据库计数，不适用于仓库文件；本阶段未改动任何审核状态。八股题的问法/参考点/追问审阅列入下一阶段。
- C 协议状态：**尚未冻结**。`docs/mobile-app/api/` 不存在；本地 `codex/mobile-reasoning` 分支仍停在 1454cab，无协议提交。因此本阶段所有字段映射均为 pending C contract。

## 与 C 的字段映射（pending C contract）

草稿 JSON 的字段是临时命名，仅表达内容需求；C 冻结后按 C 的字段转换。建议映射（以 C 最终协议为准）：

| 草稿字段（临时） | 内容含义 | 映射状态 |
| --- | --- | --- |
| `catalog_ref` | 关联现有目录稳定 ID（如 `leetcode-1`） | pending C contract |
| `statement.summary / input / output` | 独立可读题意，进入 LLM 上下文，不靠标题猜题 | pending C contract |
| `statement.constraints[]` | 本内容采用的约束规格（核对用真值） | pending C contract |
| `statement.examples[]` | 原创示例（input/output/explanation） | pending C contract |
| `accepted_approaches[]` | 多种可接受方案 + status（target / acceptable / correct_but_suboptimal） | pending C contract |
| `unacceptable_approaches[]` | 明确不可接受的方案及原因（仅 322 用到） | pending C contract；C 可决定是否并入 accepted_approaches |
| `verification_points[]` | 分级核对要点（required / expected / bonus / required_if_*） | pending C contract；分级枚举需与 C 的核对协议对齐 |
| `common_mistakes[] / edge_cases[] / counterexamples[]` | 常见错误、边界、反例（counterexample 含 wrong_output 供 LLM 引导） | pending C contract |
| `complexity_requirement` | expected / acceptable 时间空间 | pending C contract |
| `source` + `content_version` | 来源可追踪 + 内容版本（v1, 2026-09-06） | pending C contract；版本语义（递增规则、与回答版本的关联）由 C 定 |
| `content_id`（如 `algo-mobile-leetcode-1-v1`） | 内容稳定键草案 | pending C contract；是否内嵌版本号、是否与尝试/反馈版本关联由 C 定 |

## 内容规则（本目录所有产出遵守）

1. 不复制外站完整题面或题解；题意摘要、示例、反例全部原创；保留原题链接仅供核实。
2. 不把单一解法当唯一正确答案；暴力/次优解标注为“正确但非最优”，贪心等错误解法明确列出反例。
3. 不编造无法确认的 source/version；元数据来源仅为仓库现有目录条目（neetcode-gh/leetcode，MIT）。
4. 不擅自把未审核内容标为 verified；本阶段所有内容 `review_status: pending`。
5. 不修改个人数据库、公共 schema、models、迁移；`backend/data/mobile/` 现阶段只有占位 README。
6. 约束（constraints）是**本内容采用的核对规格**，用本项目措辞独立表述；如需与 LeetCode 当前原文逐字对照，以原题链接为准，不在仓库中复制。

## 数据校验结果（2026-09-06）

- `backend/scripts/validate_seed_data.py`（现有种子数据，未改动）：**通过**，疑似重复题 0，exit 0。注：本 worktree 无 `.venv`，使用系统 Python（pydantic 2.9.2）运行；有一条**既有**的 pydantic protected-namespace UserWarning（`InterviewEvaluationRead.model_name`），属 C 的 schema 范围，本阶段不修改，仅记录。
- 草稿 JSON 结构自检（临时脚本，不入库）：JSON 可解析；3 个条目的 `catalog_ref` 均存在于 `problem_catalog.json`；每题均含 summary/input/output/constraints/examples/accepted_approaches/verification_points/common_mistakes/edge_cases/counterexamples/complexity_requirement/source/content_version 全部必需块。
- 尚未进行：按 C 正式 schema 的校验（等待协议冻结后在转换为 `backend/data/mobile/` 正式数据时执行）。

## 尚待 C 决定的问题

1. 正式字段名与结构（含内容 ID 规则、版本语义、与回答/反馈版本的关联方式）。
2. `verification_points` 的分级枚举如何进入核对协议；“信息不足→追问”场景需要内容侧提供哪些提示语料（本草稿的含糊表述处理建议已写在每题“核对要点”下方注释）。
3. 约束规格与 LeetCode 原文不完全一致时（本内容独立表述），核对以内容规格为准还是以原题为准——建议以**内容规格为准**（LLM 上下文自洽），请 C 确认。
4. `unacceptable_approaches` 是否需要独立字段，还是并入 accepted_approaches 用 status 表达。
5. 正式数据格式：沿用 JSON（类似现有 catalog）还是其他；导入器由 C 维护，D 只提供数据与校验样例。
6. 八股题内容审阅的优先级与范围（现有 27 题 pending）：是否等算法样例通过后再启动。

## 下一步

1. C 冻结协议后：把 3 道题转换为 `backend/data/mobile/` 正式数据，跑 C 提供的校验，通过后与 C 对齐验收。
2. 验收通过后扩展首批 10–15 道，覆盖数组/哈希、双指针、二分、链表、栈、树、基础动态规划（均可从现有 18 条目录中选，含 `leetcode-704` 二分、`leetcode-206/21` 链表、`leetcode-20` 栈、`leetcode-104` 树、`leetcode-198` DP 等）。
3. 八股题审阅：优先修正现有 27 题中的实际错误，不为数量批量生成。
