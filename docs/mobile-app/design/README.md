# 移动端视觉探索（Draft）

本目录是视觉与交互 A 的独立交付；不改动 `frontend/`、`backend/` 或产品资源。所有示例均为虚构练习内容，不含个人回答、SQLite 或浏览器数据。

## 审阅顺序

请先在两种路线中选择一种，再进入实现规范化阶段。两套页面使用同一任务流和排版骨架，方便只比较视觉语言：

1. [雾绿延续](direction-mist-sage.md)：延续当前浅绿变量，读起来更轻、更像安静的学习空间。
2. [暖白纸张](direction-warm-paper.md)：暖象牙纸、细横线和少量衬线日期，更像随身学习册。
3. [共用交互与落地草案](shared-interaction.md)：五屏信息结构、键盘和失败状态、尺寸与组件规则。

尚未选择前，本文档不是最终视觉规范。客户只需回复“选雾绿延续”或“选暖白纸张”（也可指出需调整之处）；我会删去未选路线、补全最终 tokens、组件状态与前端交接说明后更新本 PR。

## 全尺寸页面稿

每张导出均为 **1170 × 2532 px（@3x，390 CSS px 宽）**。PNG 用于直接审阅；同名 SVG 是可检查的矢量源。页面是单独完整画面，不是拼板或裁切缩略图。

### 雾绿延续

- [今日 PNG](exploration/mist-sage/01-today.png) · [SVG](exploration/mist-sage/01-today.svg)
- [八股作答 PNG](exploration/mist-sage/02-interview-answer.png) · [SVG](exploration/mist-sage/02-interview-answer.svg)
- [算法作答 PNG](exploration/mist-sage/03-algorithm-answer.png) · [SVG](exploration/mist-sage/03-algorithm-answer.svg)
- [核对反馈 PNG](exploration/mist-sage/04-check-feedback.png) · [SVG](exploration/mist-sage/04-check-feedback.svg)
- [复习列表 PNG](exploration/mist-sage/05-review-list.png) · [SVG](exploration/mist-sage/05-review-list.svg)

### 暖白纸张

- [今日 PNG](exploration/warm-paper/01-today.png) · [SVG](exploration/warm-paper/01-today.svg)
- [八股作答 PNG](exploration/warm-paper/02-interview-answer.png) · [SVG](exploration/warm-paper/02-interview-answer.svg)
- [算法作答 PNG](exploration/warm-paper/03-algorithm-answer.png) · [SVG](exploration/warm-paper/03-algorithm-answer.svg)
- [核对反馈 PNG](exploration/warm-paper/04-check-feedback.png) · [SVG](exploration/warm-paper/04-check-feedback.svg)
- [复习列表 PNG](exploration/warm-paper/05-review-list.png) · [SVG](exploration/warm-paper/05-review-list.svg)

### 必要状态（采用雾绿展示；选定后换成最终 tokens）

- [键盘展开 PNG](states/06-keyboard-open.png) · [SVG](states/06-keyboard-open.svg)
- [核对中 PNG](states/07-checking.png) · [SVG](states/07-checking.svg)
- [失败重试 PNG](states/08-failed-retry.png) · [SVG](states/08-failed-retry.svg)
- [无内容 PNG](states/09-empty-review.png) · [SVG](states/09-empty-review.svg)

## 生成探索的视觉参考

移动端视觉生成技能用于探索两套今日页的氛围、iPhone 安全区和材质感。生成图只用于情绪和构图参考，**所有可交接中文文案、尺寸和状态以本目录内的 SVG、PNG 与 Markdown 规则为准**，避免将生成图中的偶发字形或图标误作实现依据。

- [雾绿方向情绪参考](references/mist-sage-today-imagegen.png)
- [暖白方向情绪参考](references/warm-paper-today-imagegen.png)

## 本次边界与待验

- 已按 390 CSS px 构图；共用规则规定 428 的留白扩展与 375 的可用退化。
- 图稿演示信息层级与状态，不声称已完成 Safari 真机、键盘安全区、语音输入、动态字体、旁白或真实 LLM 链路验收。
- “失败重试”假定后端复用同一份已保存回答；接口的记录去重与版本关联仍由后端负责人确认。
