/**
 * 公众号封面设计器（站点路由页 /cover.html 的交互逻辑）
 * ------------------------------------------------------------------
 * 由 scripts/lib/templates.mjs 的 renderCoverTool() 引入，
 * 在 #cover-tool-root 里注入控件与实时预览，一键导出 PNG。
 * 支持多比例（2026-10-26）：2.35:1 公众号文章封面 / 1:1 贴图封面与
 * 小红书方图 / 3:4 小红书竖图 / 4:3 / 16:9。
 * 样式全部使用站点设计令牌（style.css 的 --text/--border/--accent 等），
 * 自动跟随明暗主题。
 *
 * ⚠️ 内嵌的封面模板渲染逻辑与 scripts/lib/cover-svg.mjs
 *    （npm run sync 自动封面/贴图卡用的是它）是同一份实现的副本，
 *    修改模板时两处必须同步更新。
 */
(function () {
  'use strict';

  /* ====================== 封面模板渲染（与 cover-svg.mjs 同步） ====================== */

  var RATIO_SIZES = {
    '2.35:1': { w: 1800, h: 766, label: '公众号文章封面' },
    '1:1': { w: 1200, h: 1200, label: '贴图封面 / 小红书方图' },
    '3:4': { w: 1080, h: 1440, label: '小红书竖图' },
    '4:3': { w: 1200, h: 900, label: '横版 4:3' },
    '16:9': { w: 1600, h: 900, label: '横屏 16:9' }
  };
  var RATIO_IDS = Object.keys(RATIO_SIZES);
  function ratioSize(ratio) {
    var r = RATIO_SIZES[ratio] ? ratio : '2.35:1';
    return [RATIO_SIZES[r].w, RATIO_SIZES[r].h];
  }
  function ratioSuffix(ratio) {
    return ratio === '2.35:1' ? '' : '@' + String(ratio).replace(':', 'x');
  }
  var TEMPLATE_IDS = ['aurora', 'mint', 'sunset', 'ink', 'code'];
  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
  var FONT = "-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
  var MONO = "'JetBrains Mono','Cascadia Code',Consolas,'Courier New',monospace";
  function isCJK(ch) { return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch); }
  function charW(ch, size) {
    if (isCJK(ch)) return size;
    if (/[A-Z0-9@#%&MW]/.test(ch)) return size * 0.66;
    if (/\s/.test(ch)) return size * 0.3;
    if ('iljtf.,:;|!()[]\'"'.indexOf(ch) >= 0) return size * 0.34;
    return size * 0.55;
  }
  function textW(s, size) { var w = 0; for (var _i = 0, _a = String(s); _i < _a.length; _i++) w += charW(_a[_i], size); return w; }
  function tokenize(text) {
    var units = [], buf = '';
    for (var _i = 0, _a = String(text); _i < _a.length; _i++) {
      var ch = _a[_i];
      if (isCJK(ch) || ch === ' ') { if (buf) { units.push(buf); buf = ''; } units.push(ch); }
      else buf += ch;
    }
    if (buf) units.push(buf);
    return units;
  }
  function wrapText(text, size, maxW, maxLines) {
    var lines = [], cur = '';
    for (var _i = 0, _a = tokenize(String(text || '').trim()); _i < _a.length; _i++) {
      var u = _a[_i];
      var cand = cur + u;
      if (cur && textW(cand, size) > maxW) { lines.push(cur); cur = u.replace(/^\s+/, ''); }
      else cur = cand;
    }
    if (cur.trim()) lines.push(cur);
    if (lines.length > maxLines) {
      var kept = lines.slice(0, maxLines);
      var last = kept[maxLines - 1];
      while (last && textW(last + '…', size) > maxW) last = last.slice(0, -1);
      kept[maxLines - 1] = last + '…';
      return kept;
    }
    return lines;
  }
  function fitLines(text, sizes, maxW, maxLines) {
    for (var i = 0; i < sizes.length; i++) {
      var lines = wrapText(text, sizes[i], maxW, maxLines);
      if (lines.length <= maxLines && !lines[lines.length - 1].endsWith('…')) return { size: sizes[i], lines: lines };
    }
    var s = sizes[sizes.length - 1];
    return { size: s, lines: wrapText(text, s, maxW, maxLines) };
  }
  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var THEMES = {
    aurora: {
      title: '#ffffff', summary: 'rgba(255,255,255,.78)', meta: 'rgba(255,255,255,.6)',
      pillBg: 'rgba(255,255,255,.14)', pillLine: 'rgba(255,255,255,.28)', pillText: '#e0e7ff',
      brand: 'rgba(255,255,255,.66)', accent: '#22d3ee',
      deco: function (id, rnd, accent, W, H) {
        var base = Math.min(W, H);
        var x = Math.round(W * (0.72 + rnd() * 0.145)), y = Math.round(H * (-0.08 + rnd() * 0.18));
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">\n' +
'<stop offset="0" stop-color="#312e81"/><stop offset=".55" stop-color="#6d28d9"/><stop offset="1" stop-color="#1d4ed8"/>\n' +
'</linearGradient></defs>\n' +
'<rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + x + '" cy="' + y + '" r="' + Math.round(base * (0.39 + rnd() * 0.16)) + '" fill="rgba(255,255,255,.07)"/>\n' +
'<circle cx="' + Math.round(W * (0.08 + rnd() * 0.065)) + '" cy="' + Math.round(H * (0.81 + rnd() * 0.12)) + '" r="' + Math.round(base * (0.235 + rnd() * 0.105)) + '" fill="rgba(255,255,255,.05)"/>\n' +
'<circle cx="' + Math.round(W * (0.84 + rnd() * 0.07)) + '" cy="' + Math.round(H * (0.73 + rnd() * 0.13)) + '" r="' + Math.round(base * 0.013) + '" fill="' + accent + '" opacity=".85"/>\n' +
'<circle cx="' + Math.round(W * (0.9 + rnd() * 0.05)) + '" cy="' + Math.round(H * (0.63 + rnd() * 0.1)) + '" r="' + Math.round(base * 0.008) + '" fill="rgba(255,255,255,.5)"/>';
      },
    },
    mint: {
      title: '#064e3b', summary: '#475569', meta: '#94a3b8',
      pillBg: '#d1fae5', pillLine: '#a7f3d0', pillText: '#047857',
      brand: '#94a3b8', accent: '#10b981',
      deco: function (id, rnd, accent, W, H) {
        var base = Math.min(W, H);
        var bx = Math.round(W * (0.75 + rnd() * 0.11));
        return '<rect width="' + W + '" height="' + H + '" fill="#f0fdf9"/>\n' +
'<radialGradient id="' + id + '" cx=".5" cy=".5" r=".5">\n' +
'<stop offset="0" stop-color="#a7f3d0" stop-opacity=".55"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/>\n' +
'</radialGradient>\n' +
'<circle cx="' + bx + '" cy="' + Math.round(H * (0.08 + rnd() * 0.13)) + '" r="' + Math.round(base * (0.55 + rnd() * 0.16)) + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + Math.round(W * (0.067 + rnd() * 0.055)) + '" cy="' + Math.round(H * (0.84 + rnd() * 0.09)) + '" r="' + Math.round(base * (0.29 + rnd() * 0.1)) + '" fill="url(#' + id + ')"/>';
      },
    },
    sunset: {
      title: '#ffffff', summary: 'rgba(255,255,255,.88)', meta: 'rgba(255,255,255,.7)',
      pillBg: 'rgba(255,255,255,.2)', pillLine: 'rgba(255,255,255,.35)', pillText: '#fff7ed',
      brand: 'rgba(255,255,255,.72)', accent: '#fde047',
      deco: function (id, rnd, accent, W, H) {
        var base = Math.min(W, H);
        var cx = Math.round(W * (0.81 + rnd() * 0.1)), cy = Math.round(H * (0.16 + rnd() * 0.16));
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">\n' +
'<stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#fb7185"/><stop offset="1" stop-color="#fb923c"/>\n' +
'</linearGradient></defs>\n' +
'<rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + cx + '" cy="' + cy + '" r="' + Math.round(base * (0.44 + rnd() * 0.16)) + '" fill="rgba(255,255,255,.1)"/>\n' +
'<circle cx="' + Math.round(W * (0.055 + rnd() * 0.05)) + '" cy="' + Math.round(H * (0.84 + rnd() * 0.1)) + '" r="' + Math.round(base * (0.26 + rnd() * 0.12)) + '" fill="rgba(255,255,255,.08)"/>\n' +
'<circle cx="' + Math.round(W * (0.88 + rnd() * 0.045)) + '" cy="' + Math.round(H * (0.78 + rnd() * 0.11)) + '" r="' + Math.round(base * 0.012) + '" fill="' + accent + '" opacity=".9"/>';
      },
    },
    ink: {
      title: '#0f172a', summary: '#475569', meta: '#94a3b8',
      pillBg: '#e2e8f0', pillLine: '#cbd5e1', pillText: '#475569',
      brand: '#0f172a', accent: '#ef4444',
      deco: function (id, rnd, accent, W, H) {
        var sq = Math.round(W * 0.0256);
        var x = Math.round(W * (0.867 + rnd() * 0.055)), y = Math.round(H * (0.104 + rnd() * 0.117));
        return '<rect width="' + W + '" height="' + H + '" fill="#fafafa"/>\n' +
'<rect x="0" y="0" width="' + W + '" height="' + Math.max(6, Math.round(H * 0.013)) + '" fill="' + accent + '"/>\n' +
'<rect x="' + x + '" y="' + y + '" width="' + sq + '" height="' + sq + '" fill="' + accent + '" transform="rotate(' + (8 + Math.floor(rnd() * 20)) + ' ' + (x + sq / 2) + ' ' + (y + sq / 2) + ')" opacity=".9"/>\n' +
'<circle cx="' + Math.round(W * (0.078 + rnd() * 0.044)) + '" cy="' + Math.round(H * (0.86 + rnd() * 0.065)) + '" r="6" fill="#cbd5e1"/>';
      },
    },
    code: {
      title: '#f0f6fc', summary: '#8b949e', meta: '#8b949e',
      pillBg: '#161b22', pillLine: '#30363d', pillText: '#7ee787',
      brand: '#8b949e', accent: '#2f81f7',
      deco: function (id, rnd, accent, W, H) {
        var barH = Math.round(H * 0.157);
        var r = Math.round(barH * 0.117);
        var cx1 = Math.round(W * 0.053);
        return '<rect width="' + W + '" height="' + H + '" fill="#0d1117"/>\n' +
'<rect x="0" y="0" width="' + W + '" height="' + barH + '" fill="#010409" opacity=".6"/>\n' +
'<circle cx="' + cx1 + '" cy="' + Math.round(barH * 0.45) + '" r="' + r + '" fill="#ff5f56"/><circle cx="' + (cx1 + r * 3.1) + '" cy="' + Math.round(barH * 0.45) + '" r="' + r + '" fill="#ffbd2e"/><circle cx="' + (cx1 + r * 6.2) + '" cy="' + Math.round(barH * 0.45) + '" r="' + r + '" fill="#27c93f"/>\n' +
'<rect x="0" y="' + (H - Math.max(6, Math.round(H * 0.0105))) + '" width="' + W + '" height="' + Math.max(6, Math.round(H * 0.0105)) + '" fill="' + accent + '"/>\n' +
'<rect x="' + Math.round(W * 0.828) + '" y="' + Math.round(H * (0.26 + rnd() * 0.21)) + '" width="' + Math.round(W * 0.1) + '" height="3" fill="#30363d"/>\n' +
'<rect x="' + Math.round(W * 0.867) + '" y="' + Math.round(H * (0.34 + rnd() * 0.21)) + '" width="' + Math.round(W * 0.0667) + '" height="3" fill="#21262d"/>';
      },
    },
  };
  function buildCoverSVG(options) {
    options = options || {};
    var title = options.title != null ? options.title : '文章标题';
    var summary = options.summary || '';
    var tags = options.tags || [];
    var date = options.date || '';
    var brand = options.brand != null ? options.brand : 'DevNotes';
    var template = options.template || 'auto';
    var accent = options.accent || '';
    var variant = options.variant || 0;
    var seedKey = options.seedKey || '';
    var ratio = RATIO_IDS.indexOf(options.ratio) >= 0 ? options.ratio : '2.35:1';
    var size = ratioSize(ratio);
    var W = size[0], H = size[1];

    var key = seedKey || String(title) + String(variant);
    var tid = TEMPLATE_IDS.indexOf(template) >= 0 ? template
      : TEMPLATE_IDS[hashSeed(key) % TEMPLATE_IDS.length];
    var theme = THEMES[tid];
    var PAD = Math.round(W * 0.053), maxW = W - PAD * 2;
    var accentColor = accent || theme.accent;
    var fit = fitLines(title, [104, 92, 80, 70, 62], maxW, 2);
    var titleSize = fit.size, titleLH = titleSize * 1.26;
    // 摘要自适应字号，最多 4 行——装不下自动缩小字号（36→26px），保证完整展示不出现省略号
    var sumFit = summary ? fitLines(summary, [36, 32, 28, 26], maxW, 4) : null;
    var sumLines = sumFit ? sumFit.lines : [];
    var sumSize = sumFit ? sumFit.size : 36;
    var sumLH = sumSize * 1.6;
    var metaH = 130;
    var blockH = fit.lines.length * titleLH + (sumLines.length ? 34 + sumLines.length * sumLH : 0);
    var y = Math.round((H - metaH - blockH) / 2 + titleSize);
    y = Math.max(y, titleSize + 20);
    var parts = [];
    var gid = 'g' + hashSeed(tid + key + variant).toString(36);
    var rnd = rng(hashSeed(key + variant));
    parts.push(theme.deco(gid, rnd, accentColor, W, H));
    var textX = PAD;
    if (tid === 'mint') {
      parts.push('<rect x="' + PAD + '" y="' + Math.round(y - titleSize * 0.92) + '" width="12" height="' + Math.round(blockH * 0.92) + '" rx="6" fill="' + accentColor + '"/>');
      textX = PAD + 40;
    }
    if (tid === 'code' && tags.length) {
      var commentY = Math.max(y - titleLH - 18, Math.round(H * 0.157) * 0.93);
      parts.push('<text x="' + textX + '" y="' + Math.round(commentY) + '" font-family="' + MONO + '" font-size="30" fill="#7ee787">// ' + esc(tags.slice(0, 4).join(' · ')) + '</text>');
    }
    for (var i = 0; i < fit.lines.length; i++) {
      parts.push('<text x="' + textX + '" y="' + Math.round(y + i * titleLH) + '" font-family="' + FONT + '" font-size="' + titleSize + '" font-weight="700" fill="' + theme.title + '">' + esc(fit.lines[i]) + '</text>');
    }
    var sy = y + (fit.lines.length - 1) * titleLH + 34 + sumSize;
    for (var j = 0; j < sumLines.length; j++) {
      parts.push('<text x="' + textX + '" y="' + Math.round(sy) + '" font-family="' + FONT + '" font-size="' + sumSize + '" fill="' + theme.summary + '">' + esc(sumLines[j]) + '</text>');
      sy += sumLH;
    }
    var metaY = H - 66;
    var mx = textX;
    if (date) {
      parts.push('<text x="' + mx + '" y="' + metaY + '" font-family="' + FONT + '" font-size="30" fill="' + theme.meta + '">' + esc(date) + '</text>');
      mx += textW(date, 30) + 28;
    }
    if (tags.length && tid !== 'code') {
      for (var k = 0; k < Math.min(tags.length, 3); k++) {
        var t = String(tags[k]).slice(0, 12);
        var pw = Math.round(textW(t, 28) + 44);
        parts.push('<rect x="' + Math.round(mx) + '" y="' + (metaY - 38) + '" width="' + pw + '" height="48" rx="24" fill="' + theme.pillBg + '" stroke="' + theme.pillLine + '" stroke-width="1.5"/>');
        parts.push('<text x="' + Math.round(mx + 22) + '" y="' + metaY + '" font-family="' + FONT + '" font-size="28" fill="' + theme.pillText + '">' + esc(t) + '</text>');
        mx += pw + 16;
      }
    }
    if (brand) {
      var bw = textW(brand, 32);
      parts.push('<text x="' + (W - PAD - bw) + '" y="' + metaY + '" font-family="' + FONT + '" font-size="32" font-weight="600" fill="' + theme.brand + '">' + esc(brand) + '</text>');
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">\n' + parts.join('\n') + '\n</svg>';
    return { svg: svg, template: tid, w: W, h: H, ratio: ratio };
  }

  /* ================================ 页面交互 ================================ */

  var TPL_LABELS = { aurora: '极光', mint: '薄荷', sunset: '落日', ink: '纸墨', code: '终端' };
  var STYLE = [
    '.cover-tool { display: grid; grid-template-columns: minmax(300px, 400px) 1fr; gap: 28px; align-items: start; }',
    '@media (max-width: 900px) { .cover-tool { grid-template-columns: 1fr; } }',
    '.ct-panel { background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 22px; }',
    '.ct-group + .ct-group { margin-top: 22px; padding-top: 18px; border-top: 1px dashed var(--border); }',
    '.ct-group-title { font-size: 12px; font-weight: 700; letter-spacing: .12em; color: var(--text-3); margin: 0 0 12px; }',
    '.ct-panel label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: var(--text-2); }',
    '.ct-group label:first-of-type { margin-top: 0; }',
    '.ct-panel label small { font-weight: 400; color: var(--text-3); }',
    '.ct-panel input[type="text"], .ct-panel textarea, .ct-panel select {',
    '  width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm);',
    '  font-size: 14px; font-family: inherit; background: var(--bg-soft); color: var(--text); box-sizing: border-box; transition: border-color .15s, box-shadow .15s;',
    '}',
    '.ct-panel textarea { resize: vertical; min-height: 72px; line-height: 1.6; }',
    '.ct-panel #ct-summary { min-height: 180px; max-height: 320px; overflow-y: auto; }',
    '.ct-panel input:focus, .ct-panel textarea:focus, .ct-panel select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }',
    '.ct-row { display: flex; gap: 10px; }',
    '.ct-row > div { flex: 1; min-width: 0; }',
    '.ct-color-row { display: flex; align-items: center; gap: 10px; }',
    '.ct-color-row input[type="color"] { width: 46px; height: 38px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; cursor: pointer; }',
    '.ct-color-row .ct-hint { font-size: 12px; color: var(--text-3); }',
    '.ct-btns { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }',
    '.ct-btns .btn { flex: 1 1 auto; justify-content: center; text-align: center; }',
    '.ct-btn-svg { background: var(--bg-soft) !important; }',
    '.ct-tips { margin: 12px 0 0; font-size: 12.5px; color: var(--text-3); line-height: 1.8; }',
    '.ct-tips code { padding: 1px 6px; border-radius: 6px; background: var(--code-bg); border: 1px solid var(--code-border); font-size: 12px; }',
    '#ct-tip { color: #17864a; font-weight: 600; }',
    '[data-theme="dark"] #ct-tip { color: #6ee7a4; }',
    '.ct-preview-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13px; color: var(--text-3); }',
    '.ct-preview-meta b { color: var(--text); }',
    '.ct-preview-sticky { position: sticky; top: 84px; }',
    '@media (max-width: 900px) { .ct-preview-sticky { position: static; } }',
    '.ct-preview-frame { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: var(--bg-elev); box-shadow: var(--shadow-lift); }',
    '.ct-preview-frame svg { display: block; width: 100%; height: auto; }',
  ].join('\n');

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function init() {
    var root = document.getElementById('cover-tool-root');
    if (!root) return;

    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    root.innerHTML =
      '<div class="cover-tool">' +
      '  <div>' +
      '    <div class="ct-panel">' +
      '      <div class="ct-group">' +
      '        <p class="ct-group-title">内容</p>' +
      '        <label>标题 <small>（超长自动换行/缩放）</small></label>' +
      '        <textarea id="ct-title">用零依赖 Node 脚本把 Markdown 编译成静态博客</textarea>' +
      '        <label>摘要 <small>（选填，最多三行）</small></label>' +
      '        <textarea id="ct-summary">不依赖任何框架，200 行代码搞定构建、RSS 与 SEO，记录一次完整的造轮子过程。</textarea>' +
      '        <label>标签 <small>（英文逗号分隔，最多 3 个）</small></label>' +
      '        <input type="text" id="ct-tags" value="Node, 静态博客">' +
      '        <div class="ct-row">' +
      '          <div><label>日期</label><input type="text" id="ct-date" value=""></div>' +
      '          <div><label>品牌名 / 站点名</label><input type="text" id="ct-brand" value="DevNotes"></div>' +
      '        </div>' +
      '      </div>' +
      '      <div class="ct-group">' +
      '        <p class="ct-group-title">样式</p>' +
      '        <label>画布比例 <small>（适配不同平台）</small></label>' +
      '        <select id="ct-ratio">' +
      '          <option value="2.35:1">2.35:1 · 公众号文章封面（1800×766）</option>' +
      '          <option value="1:1">1:1 · 贴图封面 / 小红书方图（1200×1200）</option>' +
      '          <option value="3:4">3:4 · 小红书竖图（1080×1440）</option>' +
      '          <option value="4:3">4:3 · 横版（1200×900）</option>' +
      '          <option value="16:9">16:9 · 横屏（1600×900）</option>' +
      '        </select>' +
      '        <label>封面模板</label>' +
      '        <select id="ct-template">' +
      '          <option value="auto">自动（按内容挑选，同一篇恒定）</option>' +
      '          <option value="aurora">极光（深蓝紫渐变）</option>' +
      '          <option value="mint">薄荷（清新浅绿）</option>' +
      '          <option value="sunset">落日（橙粉渐变）</option>' +
      '          <option value="ink">纸墨（极简白）</option>' +
      '          <option value="code">终端（深色代码风）</option>' +
      '        </select>' +
      '        <label>主题色 <small>（选填，覆盖模板默认点缀色）</small></label>' +
      '        <div class="ct-color-row">' +
      '          <input type="color" id="ct-accent" value="#22d3ee">' +
      '          <span class="ct-hint">不动则使用各模板默认配色</span>' +
      '        </div>' +
      '      </div>' +
      '      <div class="ct-btns">' +
      '        <button type="button" class="btn btn-primary" id="ct-dl-png">⬇️ 导出 PNG</button>' +
      '        <button type="button" class="btn ct-btn-svg" id="ct-dl-svg">导出 SVG</button>' +
      '        <button type="button" class="btn" id="ct-reroll">🎲 换一批</button>' +
      '      </div>' +
      '      <p class="ct-tips" id="ct-tip"></p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ct-preview-sticky">' +
      '    <div class="ct-preview-meta"><span>实时预览 · <b id="ct-tpl-name">—</b></span><span id="ct-dims">—</span></div>' +
      '    <div class="ct-preview-frame" id="ct-preview"></div>' +
      '    <p class="ct-tips">写完文章推送到 GitHub，流水线会按同样的模板自动生成封面并同步公众号草稿；图集会自动生成 1:1 贴图卡作为首图。也可以在这里手动导出 PNG，到公众号后台「封面」处上传。</p>' +
      '  </div>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    var variant = 0;

    function currentOptions() {
      return {
        title: $('ct-title').value.trim() || '文章标题',
        summary: $('ct-summary').value.trim(),
        tags: $('ct-tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
        date: $('ct-date').value.trim(),
        brand: $('ct-brand').value.trim(),
        template: $('ct-template').value,
        accent: $('ct-accent').value || '',
        variant: variant,
        ratio: $('ct-ratio').value,
      };
    }
    function render() {
      var r = buildCoverSVG(currentOptions());
      $('ct-preview').innerHTML = r.svg;
      $('ct-tpl-name').textContent = (TPL_LABELS[r.template] || r.template) + ' 模板';
      $('ct-dims').textContent = r.w + ' × ' + r.h + '（' + r.ratio + '）';
      $('ct-dl-png').textContent = '⬇️ 导出 PNG（' + r.w + '×' + r.h + '）';
    }
    function fileBase() {
      var t = $('ct-title').value.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
      return (t || 'cover').slice(0, 40);
    }
    function download(blob, name) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    }

    $('ct-dl-png').addEventListener('click', function () {
      var r = buildCoverSVG(currentOptions());
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = r.w; canvas.height = r.h;
        canvas.getContext('2d').drawImage(img, 0, 0, r.w, r.h);
        canvas.toBlob(function (blob) {
          if (!blob) { $('ct-tip').textContent = '导出失败，请换 Chrome/Edge 再试'; return; }
          download(blob, fileBase() + '-cover' + ratioSuffix(r.ratio) + '.png');
          $('ct-tip').textContent = '✅ PNG（' + r.w + '×' + r.h + '）已导出，去公众号后台「封面」处上传';
        }, 'image/png');
      };
      img.onerror = function () { $('ct-tip').textContent = '渲染失败：请确认没有特殊字符'; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
    });
    $('ct-dl-svg').addEventListener('click', function () {
      var r = buildCoverSVG(currentOptions());
      download(new Blob([r.svg], { type: 'image/svg+xml' }), fileBase() + '-cover' + ratioSuffix(r.ratio) + '.svg');
    });
    $('ct-reroll').addEventListener('click', function () { variant++; render(); });
    ['ct-title', 'ct-summary', 'ct-tags', 'ct-date', 'ct-brand', 'ct-ratio', 'ct-template', 'ct-accent'].forEach(function (id) {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });

    // 支持 ?title=&summary=&tags=&date=&brand=&ratio=&template=&accent= 预填
    var q = new URLSearchParams(location.search);
    [['title', 'ct-title'], ['summary', 'ct-summary'], ['tags', 'ct-tags'], ['date', 'ct-date'], ['brand', 'ct-brand'], ['ratio', 'ct-ratio'], ['template', 'ct-template'], ['accent', 'ct-accent']]
      .forEach(function (pair) {
        var v = q.get(pair[0]);
        if (v) $(pair[1]).value = v;
      });
    if (!$('ct-date').value) $('ct-date').value = new Date().toISOString().slice(0, 10);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
