# 视觉稿验证记录

日期：2026-09-06。分支：`codex/mobile-design`。范围仅限 `docs/mobile-app/design/`。

## 实际尺寸检查

命令：

```powershell
node docs\mobile-app\design\tools\build-mockups.mjs
Get-ChildItem -LiteralPath 'docs\mobile-app\design\exploration\mist-sage','docs\mobile-app\design\states' -Filter '*.svg' | ForEach-Object { magick $_.FullName -background none ($_.FullName -replace '\.svg$', '.png') }
Get-ChildItem -LiteralPath 'docs\mobile-app\design\exploration\mist-sage','docs\mobile-app\design\states' -Filter '*.png' | Sort-Object Name | ForEach-Object { magick identify -format '%f %wx%h\n' $_.FullName }
```

结果：

| 文件 | PNG 实际尺寸 | SVG 坐标 |
| --- | --- | --- |
| `01-today.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `02-interview-answer.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `03-algorithm-answer.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `04-check-feedback.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `05-review-list.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `06-keyboard-open.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `07-checking.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `08-save-failed-retry.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `09-empty-review.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |
| `10-evaluation-failed.png` | 1170 × 2532 | `viewBox="0 0 390 844"` |

## 视觉检查

- 字号：正文为 17 CSS px，标签为 14 CSS px，标题为 26/30 CSS px；实际导出为 3 倍物理像素，未再使用 10–11 px 的误缩放正文。
- 主按钮：生成器固定 350 × 52 CSS px，圆角 14 CSS px；键盘态按钮底部在 y=379，系统键盘示意从 y=397 开始，保留 18 CSS px 间隔。
- 今日：大标题、继续上次卡片、三个入口和底部导航均未溢出。
- 八股作答：长中文回答以两行展示，输入框高度可读，未压缩按钮。
- 算法作答：题意/示例/口述思路/核对按钮顺序清晰，没有要求先写代码。
- 复习列表：今天、明天、9月10日分组正确；跨科目列表属于“今日待复习”，底部高亮“今日”。
- 保存未完成：文案为“还不能确认已保存”，核对尚未开始，重试保存使用同一草稿。
- 核对失败：文案为“回答已保存，暂时没有核对结果”，重试核对不重复生成练习记录。
- 无内容：对勾为 SVG path 绘制，不依赖字体 glyph。

## 未覆盖

- 未做 Safari 真机截图、PWA 安装态、真实 iOS 键盘、听写、动态字体、旁白或端到端 LLM 验收。
- 图稿是交互和视觉规范，不是前端实现；B 仍需用真实 DOM/CSS 和 C 的 API fixture 验证运行态。
