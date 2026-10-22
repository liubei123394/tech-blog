/**
 * 公众号封面 SVG 模板库（纯函数，Node / 浏览器双端通用，零依赖）
 * ------------------------------------------------------------------
 * 尺寸：2.35:1（画布 1800×766，导出 PNG 即公众号头条封面比例）
 *
 * 用法：
 *   const { svg, template } = buildCoverSVG({
 *     title:    '文章标题',
 *     summary:  '文章摘要（可空）',
 *     tags:     ['Node', 'AI'],
 *     date:     '2026-10-22',
 *     brand:    'DevNotes',
 *     template: 'auto',        // auto | aurora | mint | sunset | ink | code
 *     accent:   '',            // 主题色（可选，如 '#22d3ee'，留空用模板默认）
 *     variant:  0,             // 变体种子（同模板换装饰布局）
 *   });
 *
 * ⚠️ 本文件同时被 scripts/sync-wx.mjs（自动封面）和
 *    tools/cover-designer.html（手动设计器，内嵌同款副本）使用。
 *    修改模板逻辑时，两处必须同步更新，保持视觉一致。
 */

export const COVER_W = 1800;
export const COVER_H = 766; // 1800/766 ≈ 2.35

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

// deco(gen, rnd, accent) → 背景层 SVG 片段；gen 用于生成唯一渐变 id
const THEMES = {
  aurora: {
    label: '极光（深蓝紫渐变）',
    title: '#ffffff', summary: 'rgba(255,255,255,.78)', meta: 'rgba(255,255,255,.6)',
    pillBg: 'rgba(255,255,255,.14)', pillLine: 'rgba(255,255,255,.28)', pillText: '#e0e7ff',
    brand: 'rgba(255,255,255,.66)', accent: '#22d3ee', onAccent: '#0e7490',
    deco: (id, rnd, accent) => {
      const [c1, c2] = ['#312e81', '#6d28d9'];
      const x = 1300 + Math.floor(rnd() * 260), y = -60 + Math.floor(rnd() * 140);
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="#1d4ed8"/>
</linearGradient></defs>
<rect width="${COVER_W}" height="${COVER_H}" fill="url(#${id})"/>
<circle cx="${x}" cy="${y}" r="${300 + Math.floor(rnd() * 120)}" fill="rgba(255,255,255,.07)"/>
<circle cx="${140 + Math.floor(rnd() * 120)}" cy="${620 + Math.floor(rnd() * 90)}" r="${180 + Math.floor(rnd() * 80)}" fill="rgba(255,255,255,.05)"/>
<circle cx="${1520 + Math.floor(rnd() * 120)}" cy="${560 + Math.floor(rnd() * 100)}" r="10" fill="${accent}" opacity=".85"/>
<circle cx="${1620 + Math.floor(rnd() * 90)}" cy="${480 + Math.floor(rnd() * 80)}" r="6" fill="rgba(255,255,255,.5)"/>`;
    },
  },
  mint: {
    label: '薄荷（清新浅绿）',
    title: '#064e3b', summary: '#475569', meta: '#94a3b8',
    pillBg: '#d1fae5', pillLine: '#a7f3d0', pillText: '#047857',
    brand: '#94a3b8', accent: '#10b981', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent) => {
      const bx = 1350 + Math.floor(rnd() * 200);
      return `<rect width="${COVER_W}" height="${COVER_H}" fill="#f0fdf9"/>
<radialGradient id="${id}" cx=".5" cy=".5" r=".5">
<stop offset="0" stop-color="#a7f3d0" stop-opacity=".55"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/>
</radialGradient>
<circle cx="${bx}" cy="${60 + Math.floor(rnd() * 100)}" r="${420 + Math.floor(rnd() * 120)}" fill="url(#${id})"/>
<circle cx="${120 + Math.floor(rnd() * 100)}" cy="${640 + Math.floor(rnd() * 70)}" r="${220 + Math.floor(rnd() * 80)}" fill="url(#${id})"/>`;
    },
  },
  sunset: {
    label: '落日（橙粉渐变）',
    title: '#ffffff', summary: 'rgba(255,255,255,.88)', meta: 'rgba(255,255,255,.7)',
    pillBg: 'rgba(255,255,255,.2)', pillLine: 'rgba(255,255,255,.35)', pillText: '#fff7ed',
    brand: 'rgba(255,255,255,.72)', accent: '#fde047', onAccent: '#92400e',
    deco: (id, rnd, accent) => {
      const cx = 1450 + Math.floor(rnd() * 180), cy = 120 + Math.floor(rnd() * 120);
      return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#fb7185"/><stop offset="1" stop-color="#fb923c"/>
</linearGradient></defs>
<rect width="${COVER_W}" height="${COVER_H}" fill="url(#${id})"/>
<circle cx="${cx}" cy="${cy}" r="${340 + Math.floor(rnd() * 120)}" fill="rgba(255,255,255,.1)"/>
<circle cx="${100 + Math.floor(rnd() * 90)}" cy="${640 + Math.floor(rnd() * 80)}" r="${200 + Math.floor(rnd() * 90)}" fill="rgba(255,255,255,.08)"/>
<circle cx="${1580 + Math.floor(rnd() * 80)}" cy="${600 + Math.floor(rnd() * 80)}" r="9" fill="${accent}" opacity=".9"/>`;
    },
  },
  ink: {
    label: '纸墨（极简白）',
    title: '#0f172a', summary: '#475569', meta: '#94a3b8',
    pillBg: '#e2e8f0', pillLine: '#cbd5e1', pillText: '#475569',
    brand: '#0f172a', accent: '#ef4444', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent) => {
      const x = 1560 + Math.floor(rnd() * 100), y = 80 + Math.floor(rnd() * 90);
      return `<rect width="${COVER_W}" height="${COVER_H}" fill="#fafafa"/>
<rect x="0" y="0" width="${COVER_W}" height="10" fill="${accent}"/>
<rect x="${x}" y="${y}" width="46" height="46" fill="${accent}" transform="rotate(${8 + Math.floor(rnd() * 20)} ${x + 23} ${y + 23})" opacity=".9"/>
<circle cx="${140 + Math.floor(rnd() * 80)}" cy="${660 + Math.floor(rnd() * 50)}" r="6" fill="#cbd5e1"/>`;
    },
  },
  code: {
    label: '终端（深色代码风）',
    title: '#f0f6fc', summary: '#8b949e', meta: '#8b949e',
    pillBg: '#161b22', pillLine: '#30363d', pillText: '#7ee787',
    brand: '#8b949e', accent: '#2f81f7', onAccent: '#ffffff', flat: true,
    deco: (id, rnd, accent) => {
      return `<rect width="${COVER_W}" height="${COVER_H}" fill="#0d1117"/>
<rect x="0" y="0" width="${COVER_W}" height="120" fill="#010409" opacity=".6"/>
<circle cx="96" cy="54" r="14" fill="#ff5f56"/><circle cx="140" cy="54" r="14" fill="#ffbd2e"/><circle cx="184" cy="54" r="14" fill="#27c93f"/>
<rect x="0" y="${COVER_H - 8}" width="${COVER_W}" height="8" fill="${accent}"/>
<rect x="1490" y="${200 + Math.floor(rnd() * 160)}" width="180" height="3" fill="#30363d"/>
<rect x="1560" y="${260 + Math.floor(rnd() * 160)}" width="120" height="3" fill="#21262d"/>`;
    },
  },
};

/* ------------------------------- SVG 组装 ------------------------------- */

/**
 * 生成一张 1800×766 的公众号封面 SVG
 * @returns {{ svg: string, template: string }}
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
  } = options;

  // 模板选择：auto = 由内容哈希决定（同一篇文章恒定），否则用指定模板
  const key = seedKey || String(title) + String(variant);
  const tid = TEMPLATE_IDS.includes(template) ? template
    : TEMPLATE_IDS[hashSeed(key) % TEMPLATE_IDS.length];
  const theme = THEMES[tid];

  const PAD = 96;
  const maxW = COVER_W - PAD * 2;
  const accentColor = accent || theme.accent;

  // 标题：自适应字号，最多 2 行
  const fit = fitLines(title, [104, 92, 80, 70, 62], maxW, 2);
  const titleSize = fit.size;
  const titleLH = titleSize * 1.26;

  // 摘要：36px，最多 3 行，行距放宽，保证完整展示
  const sumLines = summary ? wrapText(summary, 36, maxW, 3) : [];
  const sumLH = 36 * 1.6;

  // 底部 meta 行高度
  const metaH = 130;
  const blockH = fit.lines.length * titleLH + (sumLines.length ? 34 + sumLines.length * sumLH : 0);
  let y = Math.round((COVER_H - metaH - blockH) / 2 + titleSize); // 第一行标题基线
  y = Math.max(y, titleSize + 20);

  const parts = [];
  const gid = `g${hashSeed(tid + key + variant).toString(36)}`;
  const rnd = rng(hashSeed(key + variant));

  // 背景
  parts.push(theme.deco(gid, rnd, accentColor));

  // mint：标题左侧竖向色条
  let textX = PAD;
  if (tid === 'mint') {
    parts.push(`<rect x="${PAD}" y="${Math.round(y - titleSize * 0.92)}" width="12" height="${Math.round(blockH * 0.92)}" rx="6" fill="${accentColor}"/>`);
    textX = PAD + 40;
  }
  // code：标题上方 mono 注释行（替代独立标签胶囊区），基线不与窗口圆点重叠
  if (tid === 'code' && tags.length) {
    const commentY = Math.max(y - titleLH - 18, 112);
    parts.push(`<text x="${textX}" y="${commentY}" font-family="${MONO}" font-size="30" fill="#7ee787">// ${esc(tags.slice(0, 4).join(' · '))}</text>`);
  }

  // 标题
  for (let i = 0; i < fit.lines.length; i++) {
    parts.push(`<text x="${textX}" y="${Math.round(y + i * titleLH)}" font-family="${FONT}" font-size="${titleSize}" font-weight="700" fill="${theme.title}">${esc(fit.lines[i])}</text>`);
  }

  // 摘要
  let sy = y + (fit.lines.length - 1) * titleLH + 34 + 36;
  for (const line of sumLines) {
    parts.push(`<text x="${textX}" y="${Math.round(sy)}" font-family="${FONT}" font-size="36" fill="${theme.summary}">${esc(line)}</text>`);
    sy += sumLH;
  }

  // 底部 meta：日期 + 标签胶囊（code 模板已在注释行展示标签，不重复）
  const metaY = COVER_H - 66;
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
    parts.push(`<text x="${COVER_W - PAD - bw}" y="${metaY}" font-family="${FONT}" font-size="32" font-weight="600" fill="${theme.brand}">${esc(brand)}</text>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}" height="${COVER_H}" viewBox="0 0 ${COVER_W} ${COVER_H}">\n${parts.join('\n')}\n</svg>`;
  return { svg, template: tid };
}

/** 供设计器列出模板（Node 侧日志也可用） */
export function templateLabel(id) { return THEMES[id] ? THEMES[id].label : id; }
