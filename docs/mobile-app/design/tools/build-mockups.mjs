import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const themes = {
  mist: {
    label: '雾绿延续', out: 'exploration/mist-sage',
    bg: '#EEF3EE', surface: '#FBFDFC', wash: '#E3ECE5', ink: '#1D2821', muted: '#617066',
    rule: '#C9D4CC', accent: '#35664D', accentSoft: '#DCEBE0', warning: '#855E32', danger: '#9A4A43', dangerSoft: '#F5E9E6',
  },
  paper: {
    label: '暖白纸张', out: 'exploration/warm-paper',
    bg: '#F8F4EC', surface: '#FFFCF6', wash: '#F0E8D9', ink: '#29251F', muted: '#716B60',
    rule: '#D9D0C0', accent: '#596347', accentSoft: '#E8E9D8', warning: '#81633D', danger: '#9B6752', dangerSoft: '#F5E9E4',
  },
};

const screen = { w: 1170, h: 2532, x: 72, r: 46, contentW: 1026 };
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const txt = (x, y, size, value, opts = {}) => `<text x="${x}" y="${y}" font-family="${opts.serif ? 'Songti SC, STSong, Noto Serif CJK SC, serif' : 'PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif'}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill}" text-anchor="${opts.anchor || 'start'}" ${opts.opacity ? `opacity="${opts.opacity}"` : ''}>${esc(value)}</text>`;
const line = (x1, y1, x2, y2, color, width = 2, opacity = 1) => `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;
const round = (x, y, w, h, r, fill, stroke = 'none', sw = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const icon = (x, y, label, color) => `<circle cx="${x}" cy="${y}" r="25" fill="none" stroke="${color}" stroke-width="3"/><text x="${x}" y="${y + 9}" font-family="PingFang SC, sans-serif" font-size="29" font-weight="600" fill="${color}" text-anchor="middle">${label}</text>`;

function top(t, title, detail = '') {
  return `${txt(72, 91, 28, '9:41', { fill: t.ink, weight: 650 })}${round(1018, 64, 52, 26, 6, 'none', t.ink, 2)}${round(1073, 72, 5, 10, 2, t.ink)}${round(1022, 68, 37, 18, 3, t.ink)}
  ${txt(72, 201, 36, title, { fill: t.ink, weight: 650 })}${detail ? txt(72, 246, 25, detail, { fill: t.muted }) : ''}`;
}

function bottom(t, active = '今日') {
  const items = [['今日','●'],['八股','◆'],['算法','▲'],['我的','○']];
  return `${line(0, 2294, 1170, 2294, t.rule, 2)}${items.map(([name, mark], i) => {
    const x = 147 + i * 292.5; const on = name === active;
    return `${txt(x, 2371, 39, mark, { fill: on ? t.accent : t.muted, anchor: 'middle', weight: 550 })}${txt(x, 2432, 25, name, { fill: on ? t.accent : t.muted, anchor: 'middle', weight: on ? 650 : 450 })}`;
  }).join('')}${round(468, 2476, 234, 9, 5, t.ink)}`;
}

function back(t, progress) {
  return `${txt(72, 179, 42, '‹', { fill: t.ink, weight: 400 })}${txt(137, 171, 28, progress, { fill: t.muted, weight: 500 })}${line(72, 219, 1098, 219, t.rule, 2)}`;
}

function button(t, y, label, { secondary = false, disabled = false } = {}) {
  const fill = secondary ? t.surface : (disabled ? t.rule : t.accent);
  const color = secondary ? t.accent : (disabled ? t.muted : '#FFFFFF');
  return `${round(72, y, 1026, 116, 26, fill, secondary ? t.rule : fill, secondary ? 2 : 0)}${txt(585, y + 74, 33, label, { fill: color, anchor: 'middle', weight: 650 })}`;
}

function today(t) {
  return `${top(t, '学习日记')}${txt(72, 321, 29, '9月6日 · 周日', { fill: t.muted })}${txt(72, 399, 57, '今天，慢一点也没关系', { fill: t.ink, serif: t === themes.paper, weight: 560 })}
  ${round(72, 504, 1026, 570, 34, t.surface, t.rule, 2)}${txt(122, 583, 25, '继续上次', { fill: t.accent, weight: 650 })}${txt(122, 674, 54, 'Redis 缓存穿透', { fill: t.ink, weight: 620 })}${txt(122, 735, 29, '还差 1 题', { fill: t.muted })}${line(122, 786, 1048, 786, t.rule, 2)}${button(t, 838, '继续作答')}
  ${txt(72, 1202, 27, '从一件小事开始', { fill: t.muted })}${icon(112, 1286, '文', t.accent)}${txt(163, 1299, 37, '练 3 道八股', { fill: t.ink, weight: 550 })}${txt(1054, 1299, 42, '›', { fill: t.muted, anchor: 'end' })}${line(72, 1354, 1098, 1354, t.rule, 2)}${icon(112, 1440, '算', t.accent)}${txt(163, 1453, 37, '讲一道算法', { fill: t.ink, weight: 550 })}${txt(1054, 1453, 42, '›', { fill: t.muted, anchor: 'end' })}
  ${line(72, 1508, 1098, 1508, t.rule, 2)}${txt(72, 1598, 30, '有 4 项待复习', { fill: t.accent, weight: 600 })}${txt(1054, 1598, 42, '›', { fill: t.accent, anchor: 'end' })}${bottom(t, '今日')}`;
}

function interview(t) {
  return `${back(t, '八股 · 1 / 3')}${txt(72, 326, 25, 'Redis', { fill: t.accent, weight: 650 })}${txt(72, 418, 53, '什么是缓存穿透？', { fill: t.ink, weight: 620 })}${txt(72, 480, 30, '请先用自己的话讲一遍。', { fill: t.muted })}
  ${round(72, 583, 1026, 594, 28, t.surface, t.rule, 2)}${txt(116, 658, 26, '我的回答', { fill: t.muted, weight: 600 })}${txt(116, 746, 34, '请求的数据既不在缓存，', { fill: t.ink })}${txt(116, 802, 34, '也不在数据库，每次都穿过缓存', { fill: t.ink })}${txt(116, 858, 34, '直接查库。', { fill: t.ink })}${txt(116, 1040, 26, '可用键盘语音输入', { fill: t.muted })}
  ${txt(72, 1270, 28, '先回忆，再看参考。', { fill: t.muted })}${button(t, 1375, '核对回答')}${txt(585, 1566, 29, '参考答案  ·  提示', { fill: t.accent, anchor: 'middle', weight: 600 })}`;
}

function algorithm(t) {
  return `${back(t, '算法 · 两数之和')}${txt(72, 321, 25, '数组 / 哈希', { fill: t.accent, weight: 650 })}${txt(72, 413, 51, '两数之和', { fill: t.ink, weight: 650 })}${txt(72, 471, 29, '在数组中找到和为目标值的两个位置。', { fill: t.muted })}
  ${round(72, 551, 1026, 226, 24, t.wash)}${txt(112, 620, 28, '示例', { fill: t.muted, weight: 650 })}${txt(112, 686, 31, 'nums = [2, 7, 11, 15]，target = 9', { fill: t.ink })}${txt(112, 736, 29, '返回 [0, 1]', { fill: t.ink })}
  ${txt(72, 900, 28, '讲讲你的思路', { fill: t.ink, weight: 650 })}${round(72, 954, 1026, 528, 28, t.surface, t.rule, 2)}${txt(114, 1034, 32, '遍历数组，用哈希表存已经见过的数。', { fill: t.ink })}${txt(114, 1093, 32, '每次看 target - 当前数是否已经出现。', { fill: t.ink })}${txt(114, 1420, 27, '可选：复杂度、边界条件、代码', { fill: t.muted })}${button(t, 1584, '帮我核对')}${txt(585, 1770, 28, '提示  ·  暂存草稿', { fill: t.accent, anchor: 'middle', weight: 600 })}`;
}

function feedback(t) {
  return `${back(t, '算法 · 两数之和')}${txt(72, 316, 28, '这次核对', { fill: t.muted, weight: 600 })}${txt(72, 405, 56, '方向成立。', { fill: t.accent, weight: 670 })}${txt(72, 468, 30, '再说明一步，思路就完整了。', { fill: t.ink })}
  ${round(72, 565, 1026, 282, 27, t.accentSoft)}${txt(114, 639, 28, '你已说对', { fill: t.accent, weight: 650 })}${txt(114, 707, 31, '用哈希表记录已出现的数，', { fill: t.ink })}${txt(114, 758, 31, '把查找从 O(n) 降到 O(1)。', { fill: t.ink })}
  ${txt(72, 964, 29, '最值得补充', { fill: t.ink, weight: 650 })}${line(72, 996, 1098, 996, t.rule, 2)}${txt(72, 1080, 34, '先查补数，再存当前值。', { fill: t.ink, weight: 550 })}${txt(72, 1134, 29, '这样不会把同一个位置用两次。', { fill: t.muted })}${line(72, 1201, 1098, 1201, t.rule, 2)}${txt(72, 1281, 34, '复杂度：时间 O(n) · 空间 O(n)', { fill: t.ink, weight: 520 })}
  ${button(t, 1427, '补充后再核对')}${button(t, 1567, '下一题', { secondary: true })}${txt(585, 1771, 28, '查看完整参考思路', { fill: t.accent, anchor: 'middle', weight: 600 })}`;
}

function review(t) {
  const rows = [ ['今天','Redis：缓存穿透','再说一次'], ['明天','两数之和','补充边界'], ['9月10日','TCP 三次握手','回忆要点'] ];
  return `${top(t, '复习')}${txt(72, 310, 29, '按到期时间排好，慢慢来。', { fill: t.muted })}${txt(72, 423, 28, '今天', { fill: t.accent, weight: 650 })}${rows.map((r, i) => { const y = 474 + i * 232; return `${round(72, y, 1026, 190, 24, t.surface, t.rule, 2)}${txt(110, y + 60, 25, r[0], { fill: t.muted, weight: 600 })}${txt(110, y + 119, 35, r[1], { fill: t.ink, weight: 570 })}${txt(1051, y + 119, 26, r[2], { fill: t.accent, anchor: 'end', weight: 650 })}`; }).join('')}${txt(72, 1231, 28, '本周', { fill: t.muted, weight: 650 })}${round(72, 1281, 1026, 177, 24, t.wash)}${txt(110, 1350, 32, '还有 4 项，完成后会自动排下次。', { fill: t.ink })}${txt(110, 1406, 27, '不把阅读参考直接算作掌握。', { fill: t.muted })}${bottom(t, '八股')}`;
}

function keyboard(t) {
  const keys = [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['上','Z','X','C','V','B','N','M','删'],['123','空格','完成']];
  return `${back(t, '八股 · 1 / 3')}${txt(72, 324, 48, '什么是缓存穿透？', { fill: t.ink, weight: 620 })}${round(72, 428, 1026, 515, 28, t.surface, t.accent, 3)}${txt(112, 507, 26, '我的回答', { fill: t.accent, weight: 650 })}${txt(112, 598, 32, '请求的数据既不在缓存，也不在', { fill: t.ink })}${txt(112, 654, 32, '数据库，每次直接查库。', { fill: t.ink })}${txt(112, 719, 32, '我会…', { fill: t.ink })}${line(72, 989, 1098, 989, t.rule, 2)}${txt(72, 1054, 27, '输入时，主要操作固定在键盘上方。', { fill: t.muted })}${button(t, 1101, '核对回答')}
  ${round(0, 1290, 1170, 1242, 0, '#D2D5DA')}${txt(72, 1365, 28, '键盘语音可直接写入此输入框', { fill: '#4C5057', weight: 550 })}${keys.map((row, rowIndex) => { const y = 1433 + rowIndex * 129; const total = row.length; return row.map((key, i) => { const w = rowIndex === 3 ? (i === 1 ? 480 : 190) : 95; const start = rowIndex === 3 ? 115 + (i === 0 ? 0 : i === 1 ? 208 : 706) : (1170 - total * 103) / 2; const x = start + (rowIndex === 3 ? 0 : i * 103); return `${round(x, y, w, 96, 12, '#FFFFFF')}${txt(x + w / 2, y + 63, 35, key, { fill: '#22242A', anchor: 'middle', weight: 520 })}`; }).join(''); }).join('')}`;
}

function checking(t) {
  return `${back(t, '算法 · 两数之和')}${txt(72, 405, 54, '正在核对…', { fill: t.ink, weight: 650 })}${txt(72, 468, 29, '已安全保存这次回答。', { fill: t.muted })}<circle cx="585" cy="923" r="88" fill="none" stroke="${t.rule}" stroke-width="9"/><path d="M 585 835 A 88 88 0 0 1 667 891" fill="none" stroke="${t.accent}" stroke-width="9" stroke-linecap="round"/>
  ${txt(585, 1060, 35, '在对照题目条件与思路要点', { fill: t.ink, anchor: 'middle', weight: 550 })}${txt(585, 1121, 28, '网络较慢时可以留在这里，也可以稍后回来。', { fill: t.muted, anchor: 'middle' })}${round(72, 1277, 1026, 214, 26, t.wash)}${txt(112, 1349, 27, '这次回答', { fill: t.muted, weight: 650 })}${txt(112, 1412, 33, '遍历数组，用哈希表存已经见过的数…', { fill: t.ink })}${button(t, 1603, '正在核对', { disabled: true })}`;
}

function failed(t) {
  return `${back(t, '算法 · 两数之和')}${txt(72, 330, 27, '这次回答已保存', { fill: t.muted, weight: 600 })}${txt(72, 422, 54, '暂时没有核对成功。', { fill: t.ink, weight: 650 })}${txt(72, 485, 30, '不是答案有问题，可能是网络或服务稍后再试。', { fill: t.muted })}${round(72, 601, 1026, 252, 27, t.dangerSoft)}${txt(114, 679, 28, '可以安心离开', { fill: t.danger, weight: 650 })}${txt(114, 747, 31, '你的思路草稿还在，不会重复生成练习记录。', { fill: t.ink })}${button(t, 984, '重新核对')}${button(t, 1124, '返回题目', { secondary: true })}${txt(585, 1326, 28, '需要时，可先修改思路再重新核对。', { fill: t.muted, anchor: 'middle' })}`;
}

function empty(t) {
  return `${top(t, '复习')}${txt(72, 310, 29, '按到期时间排好，慢慢来。', { fill: t.muted })}${line(72, 400, 1098, 400, t.rule, 2)}${icon(585, 821, '✓', t.accent)}${txt(585, 938, 50, '今天没有待复习。', { fill: t.ink, anchor: 'middle', weight: 620 })}${txt(585, 1001, 30, '可以练 3 道八股，或讲一道算法。', { fill: t.muted, anchor: 'middle' })}${button(t, 1123, '练 3 道八股')}${txt(585, 1308, 30, '讲一道算法', { fill: t.accent, anchor: 'middle', weight: 650 })}${bottom(t, '八股')}`;
}

function documentSvg(t, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${screen.w}" height="${screen.h}" viewBox="0 0 ${screen.w} ${screen.h}" role="img" aria-label="${title}">
  <defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .035"/></feComponentTransfer></filter></defs>
  <rect width="1170" height="2532" fill="${t.bg}"/><rect width="1170" height="2532" filter="url(#grain)" opacity=".8"/>
  ${body}</svg>`;
}

const pages = { '01-today': today, '02-interview-answer': interview, '03-algorithm-answer': algorithm, '04-check-feedback': feedback, '05-review-list': review };
for (const t of Object.values(themes)) {
  for (const [name, render] of Object.entries(pages)) {
    const output = resolve(root, t.out, `${name}.svg`);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, documentSvg(t, render(t), `${t.label} · ${name}`));
  }
}
const statePages = { '06-keyboard-open': keyboard, '07-checking': checking, '08-failed-retry': failed, '09-empty-review': empty };
for (const [name, render] of Object.entries(statePages)) {
  const output = resolve(root, 'states', `${name}.svg`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, documentSvg(themes.mist, render(themes.mist), `状态设计 · ${name}`));
}
