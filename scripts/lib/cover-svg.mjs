/**
 * 公众号封面/贴图 SVG 模板库（纯函数，Node / 浏览器双端通用，零依赖）
 * ------------------------------------------------------------------
 * 支持多比例（2026-10-26 扩展），按 RATIO_SIZES 表驱动画布尺寸：
 *   2.35:1  1800×766   公众号文章封面（默认，与历史行为一致）
 *   1:1     1200×1200  公众号贴图封面 / 小红书方图
 *   3:4     1080×1440  小红书图文竖图
 *   4:3     1200×900   传统横版
 *   16:9    1600×900   通用横屏（B站封面等）
 *
 * 用法：
 *   const { svg, template } = buildCoverSVG({
 *     title:    '标题',
 *     summary:  '摘要（可空）',
 *     tags:     ['Node', 'AI'],
 *     date:     '2026-10-26',
 *     brand:    'DevNotes',
 *     template: 'auto',        // auto | aurora | mint | sunset | ink | code
 *     accent:   '',            // 主题色（可选，如 '#22d3ee'，留空用模板默认）
 *     variant:  0,             // 变体种子（同模板换装饰布局）
 *     ratio:    '2.35:1',      // 画布比例，见 RATIO_SIZES
 *   });
 *
 * ⚠️ 本文件同时被 scripts/sync-wx.mjs（自动封面/贴图卡）和
 *    src/assets/cover-tool.js（站点在线设计器 /cover.html，内嵌同款副本）
 *    使用。修改模板逻辑时，两处必须同步更新，保持视觉一致。
 */

export const COVER_W = 1800;
export const COVER_H = 766; // 1800/766 ≈ 2.35（默认比例）

/** 多比例画布尺寸表：key 为 "宽:高" 字符串 */
export const RATIO_SIZES = {
  '2.35:1': { w: 1800, h: 766, label: '公众号文章封面' },
  '1:1': { w: 1200, h: 1200, label: '贴图封面 / 小红书方图' },
  '3:4': { w: 1080, h: 1440, label: '小红书竖图' },
  '4:3': { w: 1200, h: 900, label: '横版 4:3' },
  '16:9': { w: 1600, h: 900, label: '横屏 16:9' },
};
export const RATIO_IDS = Object.keys(RATIO_SIZES);

/** 比例字符串 → [w, h]；未知比例回退默认 2.35:1 */
export function ratioSize(ratio) {
  const r = RATIO_SIZES[ratio] ? ratio : '2.35:1';
  return [RATIO_SIZES[r].w, RATIO_SIZES[r].h, r];
}

/** 产出文件名用的比例后缀：'1:1' → '@1x1'；默认比例无后缀 */
export function ratioSuffix(ratio) {
  return ratio === '2.35:1' ? '' : '@' + String(ratio).replace(':', 'x');
}

export const TEMPLATE_IDS = ['aurora', 'mint', 'sunset', 'ink', 'code'];

/* ------------------------------- 基础工具 ------------------------------- */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

const FONT = "-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
const MONO = "'JetBrains Mono','Cascadia Code',Consolas,'Courier New',monospace";

const isCJK = (ch) => /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch);

/** 估算字符宽度（CJK 全宽，西文按比例），供换行使用 */
function charW(ch, size) {
  if (isCJK(ch)) return size;
  if (/[A-Z0-9@#%&MW]/.test(ch)) return size * 0.66;
  if (/\s/.test(ch)) return size * 0.3;
  if ('iljtf.,:;|!()[]\'"'.includes(ch)) return size * 0.34;
  return size * 0.55;
}

const textW = (s, size) => { let w = 0; for (const ch of String(s)) w += charW(ch, size); return w; };

/** 把文本切成可断行单元：CJK 逐字、西文整词、空格独立 */
function tokenize(text) {
  const units = [];
  let buf = '';
  for (const ch of String(text)) {
    if (isCJK(ch) || ch === ' ') {
      if (buf) { units.push(buf); buf = ''; }
      units.push(ch);
    } else buf += ch;
  }
  if (buf) units.push(buf);
  return units;
}

/** 贪心换行；超出 maxLines 时末行截断加省略号 */
function wrapText(text, size, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const u of tokenize(String(text || '').trim())) {
    const cand = cur + u;
    if (cur && textW(cand, size) > maxW) { lines.push(cur); cur = u.trimStart(); }
    else cur = cand;
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && textW(last + '…', size) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

/** 从候选字号里挑第一个能容纳且未触发省略号的 */
function fitLines(text, sizes, maxW, maxLines) {
  for (const s of sizes) {
    const lines = wrapText(text, s, maxW, maxLines);
    if (lines.length <= maxLines && !lines[lines.length - 1].endsWith('…')) return { size: s, lines };
  }
  const s = sizes[sizes.length - 1];
  return { size: s, lines: wrapText(text, s, maxW, maxLines) };
}

/** 简易字符串哈希 → 32 位种子（同 slug 恒定，auto 模板据此确定） */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** mulberry32：种子随机数，保证同一 variant 结果恒定 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------- 主题 --------------------------------- */

// deco(id, rnd, accent, W, H) → 背景层 SVG 片段
// 装饰坐标一律按 W/H 比例布局，任意比例下视觉均衡（基准即原 1800×766）
const THEMES = {
  aurora: {
    label: '极光（深蓝紫渐变）',
    title: '#ffffff', summary: 'rgba(255,255,255,.78)', meta: 'rgba(255,255,255,.6)',
    pillBg: 'rgba(255,255,255,.14)', pillLine: 'rgba(255,255,255,.28)', pillText: '#e0e7ff',
    brand: 'rgba(255,255,255,.66)', accent: '#22d3ee', onAccent: '#0e7490',
    deco: (id, rnd, accent, W, H) => {
      const base = Math.min(W, H);
      const [c1, c2] = ['#312e81', '#6d28d9'];
      const x = W * (0.72 + rnd() * 0.145), y = H * (-0.08 + rnd() * 0.18);
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="#1d4ed8"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#${id})"/>
<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${Math.round(base * (0.39 + rnd() * 0.16))}" fill="rgba(255,255,255,.07)"/>
<circle cx="${Math.round(W * (0.08 + rnd() * 0.065))}" cy="${Math.round(H * (0.81 + rnd() * 0.12))}" r="${Math.round(base * (0.235 + rnd() * 0.105))}" fill="rgba(255,255,255,.05)"/>
<circle cx="${Math.round(W * (0.84 + rnd() * 0.07))}" cy="${Math.round(H * (0.73 + rnd() * 0.13))}" r="${Math.round(base * 0.013)}" fill="${accent}" opacity=".85"/>
<circle cx="${Math.round(W * (0.9 + rnd() * 0.05))}" cy="${Math.round(H * (0.63 + rnd() * 0.1))}" r="${Math.round(base * 0.008)}" fill="rgba(255,255,255,.5)"/>`;
    },
  },
  mint: {
    label: '薄荷（清新浅绿）',
    title: '#064e3b', summary: '#475569', meta: '#94a3b8',
    pillBg: '#d1fae5', pillLine: '#a7f3d0', pillText: '#047857',
    brand: '#94a3b8', accent: '#10b981', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent, W, H) => {
      const base = Math.min(W, H);
      const bx = W * (0.75 + rnd() * 0.11);
      return `<rect width="${W}" height="${H}" fill="#f0fdf9"/>
<radialGradient id="${id}" cx=".5" cy=".5" r=".5">
<stop offset="0" stop-color="#a7f3d0" stop-opacity=".55"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/>
</radialGradient>
<circle cx="${Math.round(bx)}" cy="${Math.round(H * (0.08 + rnd() * 0.13))}" r="${Math.round(base * (0.55 + rnd() * 0.16))}" fill="url(#${id})"/>
<circle cx="${Math.round(W * (0.067 + rnd() * 0.055))}" cy="${Math.round(H * (0.84 + rnd() * 0.09))}" r="${Math.round(base * (0.29 + rnd() * 0.1))}" fill="url(#${id})"/>`;
    },
  },
  sunset: {
    label: '落日（橙粉渐变）',
    title: '#ffffff', summary: 'rgba(255,255,255,.88)', meta: 'rgba(255,255,255,.7)',
    pillBg: 'rgba(255,255,255,.2)', pillLine: 'rgba(255,255,255,.35)', pillText: '#fff7ed',
    brand: 'rgba(255,255,255,.72)', accent: '#fde047', onAccent: '#92400e',
    deco: (id, rnd, accent, W, H) => {
      const base = Math.min(W, H);
      const cx = W * (0.81 + rnd() * 0.1), cy = H * (0.16 + rnd() * 0.16);
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#fb7185"/><stop offset="1" stop-color="#fb923c"/>
</linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#${id})"/>
<circle cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="${Math.round(base * (0.44 + rnd() * 0.16))}" fill="rgba(255,255,255,.1)"/>
<circle cx="${Math.round(W * (0.055 + rnd() * 0.05))}" cy="${Math.round(H * (0.84 + rnd() * 0.1))}" r="${Math.round(base * (0.26 + rnd() * 0.12))}" fill="rgba(255,255,255,.08)"/>
<circle cx="${Math.round(W * (0.88 + rnd() * 0.045))}" cy="${Math.round(H * (0.78 + rnd() * 0.11))}" r="${Math.round(base * 0.012)}" fill="${accent}" opacity=".9"/>`;
    },
  },
  ink: {
    label: '纸墨（极简白）',
    title: '#0f172a', summary: '#475569', meta: '#94a3b8',
    pillBg: '#e2e8f0', pillLine: '#cbd5e1', pillText: '#475569',
    brand: '#0f172a', accent: '#ef4444', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent, W, H) => {
      const sq = Math.round(W * 0.0256);
      const x = Math.round(W * (0.867 + rnd() * 0.055)), y = Math.round(H * (0.104 + rnd() * 0.117));
      return `<rect width="${W}" height="${H}" fill="#fafafa"/>
<rect x="0" y="0" width="${W}" height="${Math.max(6, Math.round(H * 0.013))}" fill="${accent}"/>
<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="${accent}" transform="rotate(${8 + Math.floor(rnd() * 20)} ${x + sq / 2} ${y + sq / 2})" opacity=".9"/>
<circle cx="${Math.round(W * (0.078 + rnd() * 0.044))}" cy="${Math.round(H * (0.86 + rnd() * 0.065))}" r="6" fill="#cbd5e1"/>`;
    },
  },
  code: {
    label: '终端（深色代码风）',
    title: '#f0f6fc', summary: '#8b949e', meta: '#8b949e',
    pillBg: '#161b22', pillLine: '#30363d', pillText: '#7ee787',
    brand: '#8b949e', accent: '#2f81f7', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent, W, H) => {
      const barH = Math.round(H * 0.157);
      const r = Math.round(barH * 0.117);
      const cx1 = Math.round(W * 0.053);
      return `<rect width="${W}" height="${H}" fill="#0d1117"/>
<rect x="0" y="0" width="${W}" height="${barH}" fill="#010409" opacity=".6"/>
<circle cx="${cx1}" cy="${Math.round(barH * 0.45)}" r="${r}" fill="#ff5f56"/><circle cx="${cx1 + r * 3.1}" cy="${Math.round(barH * 0.45)}" r="${r}" fill="#ffbd2e"/><circle cx="${cx1 + r * 6.2}" cy="${Math.round(barH * 0.45)}" r="${r}" fill="#27c93f"/>
<rect x="0" y="${H - Math.max(6, Math.round(H * 0.0105))}" width="${W}" height="${Math.max(6, Math.round(H * 0.0105))}" fill="${accent}"/>
<rect x="${Math.round(W * 0.828)}" y="${Math.round(H * (0.26 + rnd() * 0.21))}" width="${Math.round(W * 0.1)}" height="3" fill="#30363d"/>
<rect x="${Math.round(W * 0.867)}" y="${Math.round(H * (0.34 + rnd() * 0.21))}" width="${Math.round(W * 0.0667)}" height="3" fill="#21262d"/>`;
    },
  },
};

/* ------------------------------- SVG 组装 ------------------------------- */

/**
 * 生成一张封面/贴图 SVG（比例由 ratio 决定，默认 2.35:1 公众号文章封面）
 * @returns {{ svg: string, template: string, w: number, h: number, ratio: string }}
 */
export function buildCoverSVG(options = {}) {
  const {
    title = '文章标题',
    summary = '',
    tags = [],
    date = '',
    brand = 'DevNotes',
    template = 'auto',
    accent = '',
    variant = 0,
    seedKey = '',
    ratio = '2.35:1',
  } = options;

  const [W, H] = ratioSize(ratio);
  const usedRatio = RATIO_IDS.includes(ratio) ? ratio : '2.35:1';

  // 模板选择：auto = 由内容哈希决定（同一篇文章恒定），否则用指定模板
  const key = seedKey || String(title) + String(variant);
  const tid = TEMPLATE_IDS.includes(template) ? template
    : TEMPLATE_IDS[hashSeed(key) % TEMPLATE_IDS.length];
  const theme = THEMES[tid];

  const PAD = Math.round(W * 0.053); // 基准 96/1800
  const maxW = W - PAD * 2;
  const accentColor = accent || theme.accent;

  // 标题：自适应字号，最多 2 行
  const fit = fitLines(title, [104, 92, 80, 70, 62], maxW, 2);
  const titleSize = fit.size;
  const titleLH = titleSize * 1.26;

  // 摘要：自适应字号，最多 4 行——装不下自动缩小字号（36→26px），保证完整展示不出现省略号
  const sumFit = summary ? fitLines(summary, [36, 32, 28, 26], maxW, 4) : null;
  const sumLines = sumFit ? sumFit.lines : [];
  const sumSize = sumFit ? sumFit.size : 36;
  const sumLH = sumSize * 1.6;

  // 底部 meta 行高度
  const metaH = 130;
  const blockH = fit.lines.length * titleLH + (sumLines.length ? 34 + sumLines.length * sumLH : 0);
  let y = Math.round((H - metaH - blockH) / 2 + titleSize); // 第一行标题基线
  y = Math.max(y, titleSize + 20);

  const parts = [];
  const gid = `g${hashSeed(tid + key + variant).toString(36)}`;
  const rnd = rng(hashSeed(key + variant));

  // 背景
  parts.push(theme.deco(gid, rnd, accentColor, W, H));

  // mint：标题左侧竖向色条
  let textX = PAD;
  if (tid === 'mint') {
    parts.push(`<rect x="${PAD}" y="${Math.round(y - titleSize * 0.92)}" width="12" height="${Math.round(blockH * 0.92)}" rx="6" fill="${accentColor}"/>`);
    textX = PAD + 40;
  }
  // code：标题上方 mono 注释行（替代独立标签胶囊区），基线不与窗口圆点重叠
  if (tid === 'code' && tags.length) {
    const commentY = Math.max(y - titleLH - 18, Math.round(H * 0.157) * 0.93);
    parts.push(`<text x="${textX}" y="${Math.round(commentY)}" font-family="${MONO}" font-size="30" fill="#7ee787">// ${esc(tags.slice(0, 4).join(' · '))}</text>`);
  }

  // 标题
  for (let i = 0; i < fit.lines.length; i++) {
    parts.push(`<text x="${textX}" y="${Math.round(y + i * titleLH)}" font-family="${FONT}" font-size="${titleSize}" font-weight="700" fill="${theme.title}">${esc(fit.lines[i])}</text>`);
  }

  // 摘要
  let sy = y + (fit.lines.length - 1) * titleLH + 34 + sumSize;
  for (const line of sumLines) {
    parts.push(`<text x="${textX}" y="${Math.round(sy)}" font-family="${FONT}" font-size="${sumSize}" fill="${theme.summary}">${esc(line)}</text>`);
    sy += sumLH;
  }

  // 底部 meta：日期 + 标签胶囊（code 模板已在注释行展示标签，不重复）
  const metaY = H - 66;
  let mx = textX;
  if (date) {
    parts.push(`<text x="${mx}" y="${metaY}" font-family="${FONT}" font-size="30" fill="${theme.meta}">${esc(date)}</text>`);
    mx += textW(date, 30) + 28;
  }
  if (tags.length && tid !== 'code') {
    for (const tag of tags.slice(0, 3)) {
      const t = String(tag).slice(0, 12);
      const tw = textW(t, 28);
      const pw = Math.round(tw + 44);
      parts.push(`<rect x="${Math.round(mx)}" y="${metaY - 38}" width="${pw}" height="48" rx="24" fill="${theme.pillBg}" stroke="${theme.pillLine}" stroke-width="1.5"/>`);
      parts.push(`<text x="${Math.round(mx + 22)}" y="${metaY}" font-family="${FONT}" font-size="28" fill="${theme.pillText}">${esc(t)}</text>`);
      mx += pw + 16;
    }
  }

  // 右下角品牌
  if (brand) {
    const bw = textW(brand, 32);
    parts.push(`<text x="${W - PAD - bw}" y="${metaY}" font-family="${FONT}" font-size="32" font-weight="600" fill="${theme.brand}">${esc(brand)}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join('\n')}\n</svg>`;
  return { svg, template: tid, w: W, h: H, ratio: usedRatio };
}

/** 供设计器列出模板（Node 侧日志也可用） */
export function templateLabel(id) { return THEMES[id] ? THEMES[id].label : id; }
