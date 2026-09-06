# 八股种子内容审查

更新时间：2026-09-06

审查对象：`backend/data/interview_question_bank.json` 与分类源文件 `backend/data/interview_bank/*.json`。本次只审查仓库种子，不读取个人本地数据库，不公开个人答案。

## 总结

- 总数：27 道
- 训练池 ready / verified：0 道
- 待核验 pending：27 道
- draft / rejected：0 道
- `verified_by_human=false`：27 道
- 手机可读性：27 道参考答案均为短段落，最长约 149 个中文字符；每题 4 个参考点、3 条评分 rubric、3 条常见错误，适合移动端折叠展示。
- 自动完整性检查：27 道均有具体来源、rubric 权重有效、参考点有效、常见错误有效、题干哈希唯一，自动报告未标出 factual risk。

结论：这批八股题“结构完整、手机展示可用”，但状态仍是 `pending`，不能作为已验证内容进入正式训练池。若产品需要临时预览，必须依赖已有未审核内容开关；对客户或 PR 说明中不得称为 ready。

## 逐题清单

| ID | 方向 / 主题 | 状态 | 手机可读性 | 下一步 |
| --- | --- | --- | --- | --- |
| `agent-evaluation-001` | agent / agent_evaluation | pending | 可读 | 待人工或 AI 审核 |
| `agent-execution-loop-001` | agent / react_pattern | pending | 可读 | 待人工或 AI 审核 |
| `agent-human-in-loop-001` | agent / human_in_the_loop | pending | 可读 | 待人工或 AI 审核 |
| `agent-mcp-boundary-001` | agent / mcp | pending | 可读 | 待人工或 AI 审核 |
| `agent-memory-001` | agent / memory | pending | 可读 | 待人工或 AI 审核 |
| `agent-multi-agent-001` | agent / multi_agent | pending | 可读 | 待人工或 AI 审核 |
| `agent-planning-001` | agent / planning | pending | 可读 | 待人工或 AI 审核 |
| `agent-safety-evaluation-001` | agent / agent_safety | pending | 可读 | 待人工或 AI 审核 |
| `agent-safety-tool-boundary-001` | agent / agent_safety | pending | 可读 | 待人工或 AI 审核 |
| `agent-tool-calling-loop-001` | llm_application / tool_calling | pending | 可读 | 待人工或 AI 审核 |
| `ai-cost-control-001` | ai_engineering / cost_control | pending | 可读 | 待人工或 AI 审核 |
| `ai-deployment-001` | ai_engineering / deployment | pending | 可读 | 待人工或 AI 审核 |
| `ai-observability-001` | ai_engineering / observability | pending | 可读 | 待人工或 AI 审核 |
| `ai-observability-002` | ai_engineering / tracing | pending | 可读 | 待人工或 AI 审核 |
| `ai-retry-timeout-001` | ai_engineering / retry | pending | 可读 | 待人工或 AI 审核 |
| `ai-streaming-001` | ai_engineering / streaming | pending | 可读 | 待人工或 AI 审核 |
| `llm-function-calling-contract-001` | llm_application / function_calling | pending | 可读 | 待人工或 AI 审核 |
| `llm-structured-output-001` | llm_application / structured_output | pending | 可读 | 待人工或 AI 审核 |
| `network-http-idempotency-001` | network / http | pending | 可读 | 待人工或 AI 审核 |
| `network-proxy-timeout-001` | network / proxy | pending | 可读 | 待人工或 AI 审核 |
| `network-sse-websocket-001` | network / sse | pending | 可读 | 待人工或 AI 审核 |
| `python-asyncio-001` | python / asyncio | pending | 可读 | 待人工或 AI 审核 |
| `python-fastapi-dependencies-001` | python / fastapi | pending | 可读 | 待人工或 AI 审核 |
| `python-pydantic-validation-001` | python / pydantic | pending | 可读 | 待人工或 AI 审核 |
| `rag-chunking-001` | rag / chunking | pending | 可读 | 待人工或 AI 审核 |
| `rag-hallucination-evaluation-001` | rag / evaluation | pending | 可读 | 待人工或 AI 审核 |
| `rag-retrieval-pipeline-001` | rag / retrieval | pending | 可读 | 待人工或 AI 审核 |

## 未直接修改种子的原因

本轮没有发现可以在不重新查证来源的情况下安全修正的明显事实错误、字段缺失或手机阅读结构问题。按现有项目规则，所有由 AI 整理或生成的题目默认保持 `pending` 且 `verified_by_human=false`，只有完成审核流程后才可进入 verified 训练池。

后续若要正式化，建议优先做小批量审核：每次 5-8 道，逐题对照对应官方文档或论文来源，确认参考答案、rubric 权重、常见错误和追问均准确，再由审核流程改状态。
