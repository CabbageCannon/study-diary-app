# 移动端视觉规范：雾绿延续

本目录是视觉与交互 A 的独立交付；不改动 `frontend/`、`backend/` 或产品资源。所有示例均为虚构练习内容，不含个人回答、SQLite 或浏览器数据。

## 已选定方向

客户已于 2026-09-06 选择 **雾绿延续**。本目录现只保留这一套规范：低饱和雾绿纸面、墨色正文、植物绿行动色；ins 感来自留白、细线与克制材质，不来自照片墙、渐变或“AI 助手”装饰。

- [视觉 tokens 与组件规范](visual-spec.md)
- [页面、状态与交互规范](shared-interaction.md)

## 全尺寸页面稿

每张导出均为 **1170 × 2532 px（@3x，390 × 844 CSS px 设计画布）**。PNG 用于直接审阅；同名 SVG 使用 `viewBox="0 0 390 844"`，可检查三倍换算。页面是单独完整画面，不是拼板或裁切缩略图。

- [今日 PNG](exploration/mist-sage/01-today.png) · [SVG](exploration/mist-sage/01-today.svg)
- [八股作答 PNG](exploration/mist-sage/02-interview-answer.png) · [SVG](exploration/mist-sage/02-interview-answer.svg)
- [算法作答 PNG](exploration/mist-sage/03-algorithm-answer.png) · [SVG](exploration/mist-sage/03-algorithm-answer.svg)
- [核对反馈 PNG](exploration/mist-sage/04-check-feedback.png) · [SVG](exploration/mist-sage/04-check-feedback.svg)
- [复习列表 PNG](exploration/mist-sage/05-review-list.png) · [SVG](exploration/mist-sage/05-review-list.svg)

### 必要状态

- [键盘展开 PNG](states/06-keyboard-open.png) · [SVG](states/06-keyboard-open.svg)
- [核对中 PNG](states/07-checking.png) · [SVG](states/07-checking.svg)
- [保存未完成/重试 PNG](states/08-save-failed-retry.png) · [SVG](states/08-save-failed-retry.svg)
- [无内容 PNG](states/09-empty-review.png) · [SVG](states/09-empty-review.svg)
- [核对失败重试 PNG](states/10-evaluation-failed.png) · [SVG](states/10-evaluation-failed.svg)

## 生成探索的视觉参考

移动端视觉生成技能用于探索今日页的氛围、iPhone 安全区和材质感。生成图只用于情绪和构图参考，**所有可交接中文文案、尺寸和状态以本目录内的 SVG、PNG 与 Markdown 规则为准**，避免将生成图中的偶发字形或图标误作实现依据。

- [雾绿方向情绪参考](references/mist-sage-today-imagegen.png)

## 本次边界与待验

- 已按 390 CSS px 构图；规范规定 428 的留白扩展与 375 的可用退化。
- 图稿演示信息层级与状态，不声称已完成 Safari 真机、键盘安全区、语音输入、动态字体、旁白或真实 LLM 链路验收。
- 本机草稿、服务端保存成功、保存结果未知、核对失败是四类不同状态；重试去重、版本关联和真实存储语义以 C 的算法核对协议为准。
