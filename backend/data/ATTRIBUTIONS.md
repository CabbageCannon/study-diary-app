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

导入日期：2026-08-02。每道八股题的具体来源见 `interview_question_bank.json`，原始来源登记见 `interview_sources.json`。首批题目由 AI 协助整理，全部保持 `pending`，尚未进入正式训练池。
