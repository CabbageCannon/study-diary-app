# A 视觉设计交接

日期：2026-09-06。当前分支：`codex/mobile-design`。PR：`https://github.com/CabbageCannon/study-diary-app/pull/4`。

## 已完成

- 客户选择“雾绿延续”后，移除暖白纸张感方向，只保留雾绿 tokens、组件和页面稿。
- 所有稿件改为 390 × 844 CSS px 设计画布，导出 1170 × 2532 @3x，不再以物理像素误当 CSS 像素。
- 交付 10 张独立大图：5 个关键页面和 5 个必要状态。
- 复习列表改为“今日待复习”范围，按今天、明天、9月10日分组，混合科目时底部高亮“今日”。
- 保存链路和核对链路分开：本机草稿、保存中、保存未完成/失败、保存成功后核对中、核对失败、完成反馈各有独立文案规则。
- 底部导航图标指定为现有 `@phosphor-icons/react`：`HouseIcon`、`BookOpenIcon`、`TreeStructureIcon`、`UserCircleIcon`，图稿不使用抽象占位符作为实现依据。

## 文件索引

- 入口说明：`docs/mobile-app/design/README.md`
- 视觉 tokens：`docs/mobile-app/design/visual-spec.md`
- 页面与状态交互：`docs/mobile-app/design/shared-interaction.md`
- 真实验证：`docs/mobile-app/design/verification.md`
- SVG/PNG 生成器：`docs/mobile-app/design/tools/build-mockups.mjs`
- 全尺寸稿：`docs/mobile-app/design/exploration/mist-sage/*.png`
- 状态稿：`docs/mobile-app/design/states/*.png`

## 真实验证

- 已运行 `node docs\mobile-app\design\tools\build-mockups.mjs`。
- 已用 ImageMagick 将全部 SVG 渲染为 PNG。
- 已确认 10 张 PNG 均为 1170 × 2532，10 张 SVG 均为 `width="1170" height="2532" viewBox="0 0 390 844"`。
- 已逐屏查看 10 张 PNG：今日、八股长正文、算法作答、反馈、复习分组、键盘展开、核对中、保存未完成、空态、核对失败均无明显文本溢出。

## 未完成 / 需 B/C/E 接续

- B：按 `shared-interaction.md` 实现真实 DOM/CSS；主按钮 52–56 CSS px，高频触控区不小于 44 × 44；专注作答页隐藏底部导航；键盘态用 `visualViewport` 或等价方式把主操作固定到键盘上方。
- B：接 C 的协议 fixture 时，保存结果未知不能显示“回答已保存”；核对失败用重试核对端点，不重复保存。
- C：协议位于 `D:/study-diary-mobile-reasoning/docs/mobile-app/api/README.md`，后续若补齐保存结果未知和幂等字段，B/A 文案应以协议字段为事实源。
- E：PR 基准应为 `codex/mobile-integration`；本分支不合并默认分支，不接管 `frontend/` 或 `backend/`。

## 下一步命令

```powershell
git status --short
git diff --check
git add --all -- docs/mobile-app/design
git commit -m "docs(mobile): correct mist-sage scale and states"
git push origin codex/mobile-design
gh pr edit 4 --base codex/mobile-integration --body-file docs/mobile-app/design/draft-pr.md
```
