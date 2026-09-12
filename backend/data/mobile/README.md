# backend/data/mobile/

本目录预留给移动端思路核对的**正式**题目内容数据（角色 D 维护正文，schema/导入器由角色 C 维护）。

当前状态：C 已在 `D:/study-diary-mobile-reasoning/docs/mobile-app/api/problem-context-schema.md` 提供 `schema_version: 1` 冻结候选协议，本目录开始放置正式题目上下文 JSON。

正式数据路径：

- `algorithm_contexts/<problem_key>.json`

D 只维护题目正文、核对要点、可接受解法、常见错误、边界和来源说明；`content_version` 由 C 的导入器管理，D 不在 JSON 中填写。
