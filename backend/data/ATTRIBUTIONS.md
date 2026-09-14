# 数据来源与署名

本目录保存的是可审计的题库元数据和由项目整理的面试问题，不包含 LeetCode 完整题面、官方题解、测试用例或外部文章的大段文字。

| 数据源 | 地址 | 许可证/使用说明 | 导入字段或用途 | 修改方式 |
| --- | --- | --- | --- | --- |
| neetcode-gh/leetcode | https://github.com/neetcode-gh/leetcode | MIT | `problem`、`pattern`、`link`、`difficulty`、`neetcode150`、`blind75` | 转换为标题、slug、难度、题型和确定性链接；不导入题解或代码 |
| Python Documentation | https://docs.python.org/ | PSF License | Python / asyncio 问题的事实来源 | 整理为问题、要点和常见错误，不复制原文 |
| FastAPI Documentation | https://fastapi.tiangolo.com/ | MIT | FastAPI 问题来源 | 同上 |
| Pydantic Documentation | https://docs.pydantic.dev/ | MIT | Pydantic 问题来源 | 同上 |
| RFC 9110 | https://www.rfc-editor.org/rfc/rfc9110 | IETF Trust Legal Provisions | HTTP 语义问题来源 | 同上 |
| MDN Web Docs | https://developer.mozilla.org/ | CC-BY-SA 2.5 | SSE / WebSocket 问题来源 | 同上 |
| Model Context Protocol Specification | https://modelcontextprotocol.io/specification/2025-06-18 | Specification terms | MCP 问题来源 | 同上 |
| ReAct / RAG papers | https://arxiv.org/abs/2210.03629, https://arxiv.org/abs/2005.11401 | arXiv terms | Agent / RAG 问题来源 | 同上 |
| OpenTelemetry Documentation | https://opentelemetry.io/docs/ | Apache-2.0 | 可观测性问题来源 | 同上 |
| OpenAI API Documentation | https://platform.openai.com/docs/ | Documentation terms apply | Tool Calling、结构化输出、可靠性问题来源 | 同上 |
| Docker Documentation | https://docs.docker.com/ | Documentation terms apply | 部署问题来源 | 同上 |
| 小林面试笔记大模型专题目录 | https://www.xiaolinnote.com/ai/ | Copyright © 2026；仅用于确定专题覆盖范围 | Agent、RAG、工具调用、大模型工程、LangChain/LangGraph 题目选题 | 未复制题面或答案；题目与参考答案均重新编写，并以官方文档或论文核验技术事实 |
| LangChain / LangGraph Documentation | https://docs.langchain.com/oss/python/ | MIT（项目）；未导入原文 | LangChain、LangGraph、记忆、持久化与迁移题目的事实来源 | 整理为原创口述题、要点和评分标准 |
| LangChain4j Documentation | https://docs.langchain4j.dev/ | Apache-2.0（项目）；未导入原文 | Java 大模型应用框架题目的事实来源 | 同上 |
| LlamaIndex Documentation | https://developers.llamaindex.ai/python/framework/ | MIT（项目）；未导入原文 | 框架定位与选型题目的事实来源 | 同上 |
| Anthropic Building Effective Agents | https://www.anthropic.com/engineering/building-effective-agents | Website terms；未导入原文 | Agent 模式、工作流与工程选型题目的事实来源 | 同上 |
| OpenAI Agents SDK Documentation | https://openai.github.io/openai-agents-python/ | MIT（项目）；未导入原文 | Agent 编排、追踪与护栏题目的事实来源 | 同上 |
| MCP / Agent Skills / A2A Specifications | https://modelcontextprotocol.io/specification/2026-07-28、https://agentskills.io/specification、https://a2a-protocol.org/latest/specification/ | 各项目规范条款；未导入原文 | 工具调用、Skill 与 Agent 协作题目的事实来源 | 同上 |
| RAG、Transformer 与大模型工程论文 | https://arxiv.org/ | arXiv terms；未导入原文 | RAG、Embedding、注意力、训练、对齐、量化、推理与评测题目的事实来源 | 仅整理技术结论并重新编写口述题；每题具体论文见题库 sources |

最近导入日期：2026-09-14。每道八股题的具体来源见 `interview_question_bank.json`，原始来源登记见 `interview_sources.json`。新增题目先以 `pending` 导入，审核通过后才进入正式训练池。
