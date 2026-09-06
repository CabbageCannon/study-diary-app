# 题目上下文数据契约（C ↔ D 接口）

版本：schema_version 1（2026-09-06，C 冻结候选）。配套 [README.md](README.md) 的思路核对协议。

本文件定义**每道启用思路核对的算法题**必须提供的上下文数据。D 负责内容正文（放 `backend/data/mobile/`，首批可先以 `docs/mobile-app/content/` 可读文档确认），C 负责本 schema、校验导入器、数据库表与 API。D 不直接改数据库/公共 schema；C 不批量代写题目正文。

## 1. 职责划分

| 项 | 归属 | 说明 |
| --- | --- | --- |
| 字段名、类型、required 规则、枚举值 | **C** | 即本文件；变更需更新 schema_version 并通知 D |
| 文件位置与命名：`backend/data/mobile/algorithm_contexts/<problem_key>.json` | **C 定，D 放** | `problem_key` = 现有 catalog 的 `stable_key`（如 `leetcode-1`） |
| 题意/输入输出/约束/示例/核对要点/解法/错误/边界正文 | **D** | 全部原创中文转写，不复制外站完整题面/题解 |
| `source.*`（来源名称、URL、来源版本说明） | **D 填，C 校验** | URL 必须与 catalog 中该题 `url` 一致 |
| `content_status` | **D 标注 draft/ready** | C 导入器仅接受字段齐全且通过校验的 `ready` |
| `content_version` | **C** | 导入器按内容哈希分配递增整数；D 不填 |
| 校验、导入、回滚、API 暴露 | **C** | `scripts/import_mobile_problem_contexts.py`（第二阶段交付） |

无法确定的事实：D 在对应字段放 `"uncertain_note"` 并把 `content_status` 保持 `draft`，不编造。

## 2. 顶层结构

```json
{
  "schema_version": 1,
  "problem_key": "leetcode-1",
  "title": "Two Sum",
  "title_zh": "两数之和",
  "statement_zh": "…",
  "input_output": { "input": "…", "output": "…" },
  "constraints": ["…"],
  "examples": [ { "input": "…", "output": "…", "explanation": "…" } ],
  "verification_points": [ { "id": "vp-…", "kind": "…", "statement": "…", "required": true, "acceptable_variants": ["…"] } ],
  "acceptable_approaches": [ { "name": "…", "idea": "…", "time_complexity": "O(n)", "space_complexity": "O(n)", "is_reference": true, "note": "…" } ],
  "common_mistakes": [ { "description": "…", "counterexample": "…" } ],
  "edge_cases": [ { "description": "…", "expected_handling": "…" } ],
  "source": { "name": "…", "url": "https://leetcode.cn/problems/…", "license_note": "…", "source_version": "…" },
  "content_notes": "…",
  "content_status": "ready"
}
```

## 3. 字段说明与 required 规则

“required(核对)” = 题目要启用思路核对（`content_status: ready`）时必须非空；导入器据此校验。

| 字段 | 类型 | required(核对) | 说明 |
| --- | --- | --- | --- |
| `schema_version` | int | ✅ | 固定 1；C 升级 schema 时递增 |
| `problem_key` | string | ✅ | 必须命中现有 catalog `stable_key`；导入器以此关联 `algorithm_problems`，找不到则拒绝导入 |
| `title` / `title_zh` | string | title_zh ✅ | 与 catalog 一致即可，展示用 |
| `statement_zh` | string, ≤2000 字 | ✅ | **独立编写的题意摘要**：任务背景 + 要做什么 + 返回什么。不复制外站原文 |
| `input_output.input` | string | ✅ | 输入是什么（类型、含义、记号） |
| `input_output.output` | string | ✅ | 输出是什么（类型、含义、多解时的约定） |
| `constraints` | string[] , ≥1 条 | ✅ | 数据范围与硬性约定（如“恰好一个解”“同一元素不可复用”），每条 ≤200 字 |
| `examples` | object[], ≥1 个 | ✅ | 每个：`input`(✅)、`output`(✅)、`explanation`(建议)。必须**原创小示例**或公认最小示例，数值自洽；至少 1 个能暴露常见错误的示例（如重复元素）优先放 `explanation` 说明 |
| `verification_points` | object[], ≥1 条 | ✅ | 核对要点，见 §4 |
| `acceptable_approaches` | object[], ≥1 条 | ✅ | 可接受解法，见 §5；**必须包含所有应被认可的解法**（含非最优但正确的），否则模型会把其它正确解法误判 |
| `common_mistakes` | object[], 建议 ≥1 | 建议 | `description`(✅)、`counterexample`(建议，具体数值反例) |
| `edge_cases` | object[], 建议 ≥1 | 建议 | `description`(✅)、`expected_handling`(✅) |
| `source.name` | string | ✅ | 如 `LeetCode CN 1. 两数之和` |
| `source.url` | string | ✅ | 必须等于 catalog 中该题 `url`（导入器校验） |
| `source.license_note` | string | ✅ | 固定声明内容为原创转写，如“题意为原创中文转写，未复制外站题面/题解” |
| `source.source_version` | string | ✅ | **来源版本说明**：内容依据哪个来源/哪次核对编写，人类可读，如 `2026-09-06 对照 leetcode.cn 题面人工核对` |
| `content_notes` | string | 可选 | D 的待核对说明、存疑点；不进入 LLM 上下文 |
| `content_status` | `"draft" \| "ready"` | ✅ | `ready` 才会被导入器接受为可核对上下文 |

导入器（C）自动补：`content_version`（int，内容变化即递增）、`content_updated_at`、`imported_at`。D 不要提供这三个字段。

## 4. `verification_points` 结构（核对要点）

模型按这些要点核对用户思路，是“反馈有据可依”的关键。

```json
{
  "id": "vp-lookup-before-store",
  "kind": "key_insight",
  "statement": "对每个元素应先查补数 target - x 是否已见过，再存当前元素，避免同一索引被使用两次",
  "required": true,
  "acceptable_variants": [
    "先存后查但明确说明需排除同一索引（j != i）也接受"
  ]
}
```

| 字段 | 类型 | required | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 文件内唯一，kebab-case，`vp-` 前缀；feedback 会引用它 |
| `kind` | 枚举 | ✅ | `key_insight`（核心洞察）/ `correctness_condition`（正确性必要条件）/ `complexity`（复杂度要求）/ `edge_case`（必须处理的边界） |
| `statement` | string | ✅ | 一条可判断的陈述，避免“理解题意”这类空话 |
| `required` | bool | ✅ | `true`：缺失时结论不能是 `correct`（至少 `partially_correct`）；`false`：加分项 |
| `acceptable_variants` | string[] | 可选 | 同样接受的表述/变体，支撑“认可多种有效解法” |

## 5. `acceptable_approaches` 结构

```json
{
  "name": "哈希表一次遍历",
  "idea": "遍历中用哈希表存已见值到下标的映射；对当前元素先查 target - x，命中即返回两个下标",
  "time_complexity": "O(n)",
  "space_complexity": "O(n)",
  "is_reference": true,
  "note": null
}
```

- `is_reference: true` 每题**恰好一个**（参考思路，进入 feedback 的 `reference_outline`，默认收起）。
- 非最优但正确的解法（如暴力双循环）必须列入，`note` 写明评价口径（“正确但应引导到哈希方案”），否则模型可能将其判为错误。
- 复杂度用标准记号字符串（`O(1)`、`O(n log n)`…）。

## 6. 首批三题（D 的第一批交付）

按 NEXT_TASKS.md：`leetcode-1` 两数之和、`leetcode-20` 有效括号、`leetcode-704` 二分查找。交付流程：

1. D 先在 `docs/mobile-app/content/` 放可读稿（含以上全部字段的实质内容）；
2. C 确认可映射到本 schema（有出入则 C 更新本文件并升 schema_version）；
3. D 转为 `backend/data/mobile/algorithm_contexts/<problem_key>.json`；
4. C 的导入器校验入库，`content_version=1`，随后 fixture 与评估集引用真实内容。

## 7. 完整示例（C 编写的原创示意，供 D 参考格式；正式内容以 D 交付为准）

见 [fixtures/context-two-sum.json](fixtures/context-two-sum.json)。
