# 题库构建、校验与导入

所有命令从 `backend` 目录执行。构建和校验是文件操作，导入才会写入当前 `DATABASE_URL` 指向的数据库。

```powershell
# 合并分类八股题，并生成质量报告和 manifest
.venv\Scripts\python.exe scripts\build_interview_bank.py

# 校验两类本地题库；失败时返回非零退出码
.venv\Scripts\python.exe scripts\validate_seed_data.py

# 不写数据库地演练导入
.venv\Scripts\python.exe scripts\import_seed_data.py --all --dry-run

# 正式导入（可重复执行，已存在记录会更新或跳过）
.venv\Scripts\python.exe scripts\import_seed_data.py --algorithms
.venv\Scripts\python.exe scripts\import_seed_data.py --interviews
.venv\Scripts\python.exe scripts\import_seed_data.py --all
```

导入对每个题库使用事务：任意数据库错误会回滚本次题库导入。算法题按稳定键/slug upsert，八股题按稳定 ID upsert；两者都不会删除日记、未来的练习记录或用户回答。源数据中已标记下架的算法题只会通过 `is_active=false` 停用。

开发阶段可通过 `review_status=pending` 查询待审核题。部署到有外部用户的环境前，应为该参数增加管理权限控制。
