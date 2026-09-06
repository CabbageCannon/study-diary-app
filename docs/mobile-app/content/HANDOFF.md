# D 内容交接记录

更新时间：2026-09-06

## 分支与提交

- 工作区：`D:/study-diary-mobile-content`
- 分支：`codex/mobile-content`
- 基线：`45eb3f3`（3 道草案样例提交）
- 当前阶段提交：待提交
- 目标 base：`codex/mobile-integration`
- PR：待创建

## 已完成

- 读取 C 的协议文件：`D:/study-diary-mobile-reasoning/docs/mobile-app/api/README.md` 与 `problem-context-schema.md`。
- 按 `schema_version: 1` 转换首批 3 道正式 JSON：
  - `backend/data/mobile/algorithm_contexts/leetcode-1.json`
  - `backend/data/mobile/algorithm_contexts/leetcode-15.json`
  - `backend/data/mobile/algorithm_contexts/leetcode-322.json`
- 三题保留已有草案中有价值的手机口述核对内容：原创题意、输入输出、约束、自编示例、核对要点、多种可接受解法、常见错误和边界。
- 已按力扣官方题面核对标题、URL 和约束；`leetcode-15` 长度下限从草案的 `0` 校正为官方 `3`。
- 未填 `content_version`，交给 C 导入器按内容哈希管理。

## 验证命令

```powershell
@'
import json
import pathlib
import sys

files = sorted(pathlib.Path('backend/data/mobile/algorithm_contexts').glob('*.json'))
catalog = {p['id']: p for p in json.load(open('backend/data/algorithms/problem_catalog.json', encoding='utf-8'))['problems']}
allowed_kinds = {'key_insight', 'correctness_condition', 'complexity', 'edge_case'}
errors = []
for f in files:
    d = json.load(open(f, encoding='utf-8'))
    key = d.get('problem_key')
    if key not in catalog:
        errors.append(f'{f}: unknown problem_key {key}')
    elif d.get('source', {}).get('url') != catalog[key]['url']:
        errors.append(f'{f}: source.url mismatch')
    if 'content_version' in d:
        errors.append(f'{f}: D must not set content_version')
    for field in ['schema_version', 'problem_key', 'title_zh', 'statement_zh', 'input_output', 'constraints', 'examples', 'verification_points', 'acceptable_approaches', 'source', 'content_status']:
        if d.get(field) in (None, '', [], {}):
            errors.append(f'{f}: missing {field}')
    if d.get('schema_version') != 1:
        errors.append(f'{f}: schema_version != 1')
    if d.get('content_status') not in {'draft', 'ready'}:
        errors.append(f'{f}: bad content_status')
    refs = sum(1 for a in d.get('acceptable_approaches', []) if a.get('is_reference') is True)
    if refs != 1:
        errors.append(f'{f}: reference approaches={refs}')
    ids = []
    for vp in d.get('verification_points', []):
        ids.append(vp.get('id'))
        if not str(vp.get('id', '')).startswith('vp-'):
            errors.append(f'{f}: bad vp id {vp.get("id")}')
        if vp.get('kind') not in allowed_kinds:
            errors.append(f'{f}: bad vp kind {vp.get("kind")}')
        if not isinstance(vp.get('required'), bool):
            errors.append(f'{f}: vp required not bool')
    if len(ids) != len(set(ids)):
        errors.append(f'{f}: duplicate vp ids')
print(f'files {len(files)}')
print(f'errors {len(errors)}')
for error in errors:
    print('-', error)
sys.exit(1 if errors else 0)
'@ | python -
```

结果：`files 3`，`errors 0`。

```powershell
python backend/scripts/validate_seed_data.py
```

结果：通过，疑似重复题 `0`。有一条既有 Pydantic `model_name` protected namespace warning，非 D 内容范围。

## 下一步

- 推送首批 3 道 JSON 并把 SHA 发给 C、E。
- 继续从现有 18 题目录中扩展到约 12 道正式上下文，优先基础高频题。
- 审查 27 道八股种子内容的手机可读性与状态，只输出可用/待核验清单；不把个人数据库当种子提交。
