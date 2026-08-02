# 算法题元数据库

算法题库只保存可验证的元数据：标题、slug、确定性链接、难度、题型、所属列表和来源。它不保存 LeetCode 完整题面、官方题解、测试用例或提交代码。

`backend/scripts/build_problem_catalog.py` 只读取本地 `.problemSiteData.json`，不会在应用运行时访问 GitHub 或 LeetCode。转换后的链接始终由 slug 生成：`https://leetcode.cn/problems/{slug}/`。

当前仓库没有附带上游 NeetCode 数据快照，因此 `backend/data/algorithms/problem_catalog.json` 保持为空；这不是缺失数据被伪造为题目。拿到人工下载或许可明确的数据后运行：

```powershell
cd backend
.venv\Scripts\python.exe scripts\build_problem_catalog.py `
  --source C:\path\to\.problemSiteData.json
```

脚本会合并源数据中的 `neetcode150` / `blind75` 标记，以及 `data/algorithms/lists/*.json` 中人工维护的 slug 列表。未知题型不会丢弃，统一标为 `other` 并写入构建报告。

`hot100.json` 已预留加载能力，但初始列表为空。请只填写人工整理或许可证清晰的数据集，不要通过运行时爬取力扣补全。
