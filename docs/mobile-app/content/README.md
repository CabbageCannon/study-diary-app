# 移动端题库内容交付说明（角色 D）

更新时间：2026-09-06

本目录记录移动端“题意阅读 + 口述思路核对”的内容交付说明。正式算法上下文数据已经按 C 的 `schema_version: 1` 放入 `backend/data/mobile/algorithm_contexts/`；历史草案仍保留在 `drafts/`，仅作为 Claude 阶段材料，不作为生产导入源。

## 算法上下文

当前正式 JSON 共 12 道，全部 `content_status: ready`，均来自现有 18 题 catalog，未新增后端架构或模型字段。

| problem_key | 题目 | 难度 | 模式 | 状态 |
| --- | --- | --- | --- | --- |
| `leetcode-1` | 两数之和 | easy | 数组 / 哈希 | ready |
| `leetcode-15` | 三数之和 | medium | 双指针 | ready |
| `leetcode-322` | 零钱兑换 | medium | 动态规划 | ready |
| `leetcode-20` | 有效的括号 | easy | 栈 | ready |
| `leetcode-704` | 二分查找 | easy | 二分 | ready |
| `leetcode-217` | 存在重复元素 | easy | 数组 / 哈希 | ready |
| `leetcode-206` | 反转链表 | easy | 链表 | ready |
| `leetcode-21` | 合并两个有序链表 | easy | 链表 | ready |
| `leetcode-104` | 二叉树的最大深度 | easy | 树 | ready |
| `leetcode-3` | 无重复字符的最长子串 | medium | 滑动窗口 | ready |
| `leetcode-238` | 除自身以外数组的乘积 | medium | 前后缀 | ready |
| `leetcode-198` | 打家劫舍 | medium | 动态规划 | ready |

内容覆盖：原创中文题意、输入输出、约束、自编示例、核对要点、可接受解法、常见错误、边界情况和来源说明。每题恰好一个 `is_reference: true` 参考思路，同时保留其它正确但非最优或不同实现方向，避免把最优解误当唯一正确答案。

## 来源规则

- 正式 JSON 的 `source.url` 必须与 `backend/data/algorithms/problem_catalog.json` 对应条目一致。
- 题名、URL 和约束于 2026-09-06 对照力扣中文站官方题面核对。
- 正文、示例、核对要点和反例均为原创中文整理，未复制外站完整题面或题解。
- D 不填写 `content_version`、`content_updated_at`、`imported_at`；这些由 C 导入器按内容哈希管理。

## 八股种子审查

仓库八股种子 `backend/data/interview_question_bank.json` 共 27 道：

- `review_status: pending`：27
- `verified_by_human: false`：27
- 生产 ready / verified：0
- draft / rejected：0

这 27 道题的字段完整度和手机阅读长度整体可用，但仍属于待人工或 AI 审核内容，不应被描述为已验证 ready。逐题清单见 [interview-seed-review.md](interview-seed-review.md)。

本次未读取或公开个人答案、未使用本地个人数据库作为种子来源，也未把任何八股题改为 `verified`。

## 验证摘要

- 算法上下文 schema 形状校验：`files=12 ready=12 draft=0 errors=0`
- 算法示例语义自检：`semantic_checks=12 failed=0`
- 现有种子校验：`python backend/scripts/validate_seed_data.py` 通过，疑似重复题 `0`
- 八股人工审核建议报告重建：27 道题均建议保持 `pending`，自动报告明确不能替代人工审核

已知非 D 范围 warning：运行后端脚本时会出现既有 Pydantic `InterviewEvaluationRead.model_name` protected namespace warning。
