/**
 * 公众号封面设计器（站点路由页 /cover.html 的交互逻辑）
 * ------------------------------------------------------------------
 * 由 scripts/lib/templates.mjs 的 renderCoverTool() 引入，
 * 在 #cover-tool-root 里注入控件与实时预览，一键导出 PNG（1800×766）。
 *
 * ⚠️ 内嵌的封面模板渲染逻辑与 scripts/lib/cover-svg.mjs
 *    （npm run sync 自动封面用的是它）是同一份实现的副本，
 *    修改模板时两处必须同步更新。
 */
(function () {
  'use strict';

  /* ====================== 封面模板渲染（与 cover-svg.mjs 同步） ====================== */

  var COVER_W = 1800, COVER_H = 766;
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
      deco: function (id, rnd, accent) {
        var x = 1300 + Math.floor(rnd() * 260), y = -60 + Math.floor(rnd() * 140);
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">\n' +
'<stop offset="0" stop-color="#312e81"/><stop offset=".55" stop-color="#6d28d9"/><stop offset="1" stop-color="#1d4ed8"/>\n' +
'</linearGradient></defs>\n' +
'<rect width="' + COVER_W + '" height="' + COVER_H + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + x + '" cy="' + y + '" r="' + (300 + Math.floor(rnd() * 120)) + '" fill="rgba(255,255,255,.07)"/>\n' +
'<circle cx="' + (140 + Math.floor(rnd() * 120)) + '" cy="' + (620 + Math.floor(rnd() * 90)) + '" r="' + (180 + Math.floor(rnd() * 80)) + '" fill="rgba(255,255,255,.05)"/>\n' +
'<circle cx="' + (1520 + Math.floor(rnd() * 120)) + '" cy="' + (560 + Math.floor(rnd() * 100)) + '" r="10" fill="' + accent + '" opacity=".85"/>\n' +
'<circle cx="' + (1620 + Math.floor(rnd() * 90)) + '" cy="' + (480 + Math.floor(rnd() * 80)) + '" r="6" fill="rgba(255,255,255,.5)"/>';
      },
    },
    mint: {
      title: '#064e3b', summary: '#475569', meta: '#94a3b8',
      pillBg: '#d1fae5', pillLine: '#a7f3d0', pillText: '#047857',
      brand: '#94a3b8', accent: '#10b981',
      deco: function (id, rnd, accent) {
        var bx = 1350 + Math.floor(rnd() * 200);
        return '<rect width="' + COVER_W + '" height="' + COVER_H + '" fill="#f0fdf9"/>\n' +
'<radialGradient id="' + id + '" cx=".5" cy=".5" r=".5">\n' +
'<stop offset="0" stop-color="#a7f3d0" stop-opacity=".55"/><stop offset="1" stop-color="#a7f3d0" stop-opacity="0"/>\n' +
'</radialGradient>\n' +
'<circle cx="' + bx + '" cy="' + (60 + Math.floor(rnd() * 100)) + '" r="' + (420 + Math.floor(rnd() * 120)) + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + (120 + Math.floor(rnd() * 100)) + '" cy="' + (640 + Math.floor(rnd() * 70)) + '" r="' + (220 + Math.floor(rnd() * 80)) + '" fill="url(#' + id + ')"/>';
      },
    },
    sunset: {
      title: '#ffffff', summary: 'rgba(255,255,255,.88)', meta: 'rgba(255,255,255,.7)',
      pillBg: 'rgba(255,255,255,.2)', pillLine: 'rgba(255,255,255,.35)', pillText: '#fff7ed',
      brand: 'rgba(255,255,255,.72)', accent: '#fde047',
      deco: function (id, rnd, accent) {
        var cx = 1450 + Math.floor(rnd() * 180), cy = 120 + Math.floor(rnd() * 120);
        return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">\n' +
'<stop offset="0" stop-color="#f472b6"/><stop offset=".5" stop-color="#fb7185"/><stop offset="1" stop-color="#fb923c"/>\n' +
'</linearGradient></defs>\n' +
'<rect width="' + COVER_W + '" height="' + COVER_H + '" fill="url(#' + id + ')"/>\n' +
'<circle cx="' + cx + '" cy="' + cy + '" r="' + (340 + Math.floor(rnd() * 120)) + '" fill="rgba(255,255,255,.1)"/>\n' +
'<circle cx="' + (100 + Math.floor(rnd() * 90)) + '" cy="' + (640 + Math.floor(rnd() * 80)) + '" r="' + (200 + Math.floor(rnd() * 90)) + '" fill="rgba(255,255,255,.08)"/>\n' +
'<circle cx="' + (1580 + Math.floor(rnd() * 80)) + '" cy="' + (600 + Math.floor(rnd() * 80)) + '" r="9" fill="' + accent + '" opacity=".9"/>';
      },
    },
    ink: {
      title: '#0f172a', summary: '#475569', meta: '#94a3b8',
      pillBg: '#e2e8f0', pillLine: '#cbd5e1', pillText: '#475569',
      brand: '#0f172a', accent: '#ef4444',
      deco: function (id, rnd, accent) {
        var x = 1560 + Math.floor(rnd() * 100), y = 80 + Math.floor(rnd() * 90);
        return '<rect width="' + COVER_W + '" height="' + COVER_H + '" fill="#fafafa"/>\n' +
'<rect x="0" y="0" width="' + COVER_W + '" height="10" fill="' + accent + '"/>\n' +
'<rect x="' + x + '" y="' + y + '" width="46" height="46" fill="' + accent + '" transform="rotate(' + (8 + Math.floor(rnd() * 20)) + ' ' + (x + 23) + ' ' + (y + 23) + ')" opacity=".9"/>\n' +
'<circle cx="' + (140 + Math.floor(rnd() * 80)) + '" cy="' + (660 + Math.floor(rnd() * 50)) + '" r="6" fill="#cbd5e1"/>';
      },
    },
    code: {
      title: '#f0f6fc', summary: '#8b949e', meta: '#8b949e',
      pillBg: '#161b22', pillLine: '#30363d', pillText: '#7ee787',
      brand: '#8b949e', accent: '#2f81f7',
      deco: function (id, rnd, accent) {
        return '<rect width="' + COVER_W + '" height="' + COVER_H + '" fill="#0d1117"/>\n' +
'<rect x="0" y="0" width="' + COVER_W + '" height="120" fill="#010409" opacity=".6"/>\n' +
'<circle cx="96" cy="54" r="14" fill="#ff5f56"/><circle cx="140" cy="54" r="14" fill="#ffbd2e"/><circle cx="184" cy="54" r="14" fill="#27c93f"/>\n' +
'<rect x="0" y="' + (COVER_H - 8) + '" width="' + COVER_W + '" height="8" fill="' + accent + '"/>\n' +
'<rect x="1490" y="' + (200 + Math.floor(rnd() * 160)) + '" width="180" height="3" fill="#30363d"/>\n' +
'<rect x="1560" y="' + (260 + Math.floor(rnd() * 160)) + '" width="120" height="3" fill="#21262d"/>';
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

    var key = seedKey || String(title) + String(variant);
    var tid = TEMPLATE_IDS.indexOf(template) >= 0 ? template
      : TEMPLATE_IDS[hashSeed(key) % TEMPLATE_IDS.length];
    var theme = THEMES[tid];
    var PAD = 96, maxW = COVER_W - PAD * 2;
    var accentColor = accent || theme.accent;
    var fit = fitLines(title, [104, 92, 80, 70, 62], maxW, 2);
    var titleSize = fit.size, titleLH = titleSize * 1.26;
    var sumLines = summary ? wrapText(summary, 36, maxW, 2) : [];
    var sumLH = 36 * 1.55;
    var metaH = 120;
    var blockH = fit.lines.length * titleLH + (sumLines.length ? 34 + sumLines.length * sumLH : 0);
    var y = Math.round((COVER_H - metaH - blockH) / 2 + titleSize);
    y = Math.max(y, titleSize + 20);
    var parts = [];
    var gid = 'g' + hashSeed(tid + key + variant).toString(36);
    var rnd = rng(hashSeed(key + variant));
    parts.push(theme.deco(gid, rnd, accentColor));
    var textX = PAD;
    if (tid === 'mint') {
      parts.push('<rect x="' + PAD + '" y="' + Math.round(y - titleSize * 0.92) + '" width="12" height="' + Math.round(blockH * 0.92) + '" rx="6" fill="' + accentColor + '"/>');
      textX = PAD + 40;
    }
    if (tid === 'code' && tags.length) {
      var commentY = Math.max(y - titleLH - 18, 112);
      parts.push('<text x="' + textX + '" y="' + commentY + '" font-family="' + MONO + '" font-size="30" fill="#7ee787">// ' + esc(tags.slice(0, 4).join(' · ')) + '</text>');
    }
    for (var i = 0; i < fit.lines.length; i++) {
      parts.push('<text x="' + textX + '" y="' + Math.round(y + i * titleLH) + '" font-family="' + FONT + '" font-size="' + titleSize + '" font-weight="700" fill="' + theme.title + '">' + esc(fit.lines[i]) + '</text>');
    }
    var sy = y + (fit.lines.length - 1) * titleLH + 34 + 36;
    for (var j = 0; j < sumLines.length; j++) {
      parts.push('<text x="' + textX + '" y="' + Math.round(sy) + '" font-family="' + FONT + '" font-size="36" fill="' + theme.summary + '">' + esc(sumLines[j]) + '</text>');
      sy += sumLH;
    }
    var metaY = COVER_H - 66;
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
      parts.push('<text x="' + (COVER_W - PAD - bw) + '" y="' + metaY + '" font-family="' + FONT + '" font-size="32" font-weight="600" fill="' + theme.brand + '">' + esc(brand) + '</text>');
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + COVER_W + '" height="' + COVER_H + '" viewBox="0 0 ' + COVER_W + ' ' + COVER_H + '">\n' + parts.join('\n') + '\n</svg>';
    return { svg: svg, template: tid };
  }

  /* ================================ 页面交互 ================================ */

  var TPL_LABELS = { aurora: '极光', mint: '薄荷', sunset: '落日', ink: '纸墨', code: '终端' };
  var STYLE = [
    '.cover-tool { display: grid; grid-template-columns: minmax(300px, 380px) 1fr; gap: 24px; align-items: start; }',
    '@media (max-width: 900px) { .cover-tool { grid-template-columns: 1fr; } }',
    '.ct-panel { background: var(--card, #fff); border: 1px solid var(--line, #e2e8f0); border-radius: 12px; padding: 20px; }',
    '.ct-panel label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; color: var(--text, inherit); }',
    '.ct-panel label:first-child { margin-top: 0; }',
    '.ct-panel label small { font-weight: 400; color: var(--muted, #64748b); }',
    '.ct-panel input[type="text"], .ct-panel textarea, .ct-panel select {',
    '  width: 100%; padding: 9px 12px; border: 1px solid var(--line, #e2e8f0); border-radius: 8px;',
    '  font-size: 14px; font-family: inherit; background: var(--bg-soft, #f8fafc); color: var(--text, inherit); box-sizing: border-box;',
    '}',
    '.ct-panel textarea { resize: vertical; min-height: 64px; line-height: 1.6; }',
    '.ct-panel input:focus, .ct-panel textarea:focus, .ct-panel select:focus { outline: 2px solid rgba(47,111,237,.35); border-color: #2f6fed; }',
    '.ct-row { display: flex; gap: 10px; }',
    '.ct-row > * { flex: 1; min-width: 0; }',
    '.ct-color-row { display: flex; align-items: center; gap: 10px; }',
    '.ct-color-row input[type="color"] { width: 46px; height: 38px; padding: 2px; border: 1px solid var(--line, #e2e8f0); border-radius: 8px; background: transparent; cursor: pointer; }',
    '.ct-color-row .ct-hint { font-size: 12px; color: var(--muted, #64748b); }',
    '.ct-btns { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }',
    '.ct-btns button { padding: 10px 16px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }',
    '#ct-dl-png { background: #2f6fed; color: #fff; }',
    '#ct-dl-svg { background: #059669; color: #fff; }',
    '#ct-reroll { background: rgba(47,111,237,.1); color: #2f6fed; }',
    '.ct-preview-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13px; color: var(--muted, #64748b); }',
    '.ct-preview-meta b { color: var(--text, inherit); }',
    '.ct-preview-frame { border: 1px solid var(--line, #e2e8f0); border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 2px 10px rgba(15,23,42,.06); }',
    '.ct-preview-frame svg { display: block; width: 100%; height: auto; }',
    '.ct-tips { margin-top: 12px; font-size: 12.5px; color: var(--muted, #64748b); line-height: 1.8; }',
    '#ct-tip { color: #059669; font-weight: 600; }',
    '[data-theme="dark"] .ct-preview-frame { background: #0f172a; }',
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

    // 取脚本上的 data-base（含部署子路径前缀），供拉取 search-index.json
    var script = document.currentScript || document.querySelector('script[data-base]');
    var base = (script && script.getAttribute('data-base')) || '/';

    root.innerHTML =
      '<div class="cover-tool">' +
      '  <div>' +
      '    <div class="ct-panel">' +
      '      <label>从博客文章导入 <small>（自动填充标题/摘要/标签/日期）</small></label>' +
      '      <select id="ct-post-pick"><option value="">— 选择一篇已发布文章 —</option></select>' +
      '      <label>文章标题 <small>（超长自动换行/缩放）</small></label>' +
      '      <textarea id="ct-title">用零依赖 Node 脚本把 Markdown 编译成静态博客</textarea>' +
      '      <label>摘要 <small>（选填，最多两行）</small></label>' +
      '      <textarea id="ct-summary">不依赖任何框架，200 行代码搞定构建、RSS 与 SEO。</textarea>' +
      '      <label>标签 <small>（英文逗号分隔，最多 3 个）</small></label>' +
      '      <input type="text" id="ct-tags" value="Node, 静态博客">' +
      '      <div class="ct-row">' +
      '        <div><label>日期</label><input type="text" id="ct-date" value=""></div>' +
      '        <div><label>品牌名 / 站点名</label><input type="text" id="ct-brand" value="DevNotes"></div>' +
      '      </div>' +
      '      <label>封面模板</label>' +
      '      <select id="ct-template">' +
      '        <option value="auto">自动（按内容挑选，同一篇恒定）</option>' +
      '        <option value="aurora">极光（深蓝紫渐变）</option>' +
      '        <option value="mint">薄荷（清新浅绿）</option>' +
      '        <option value="sunset">落日（橙粉渐变）</option>' +
      '        <option value="ink">纸墨（极简白）</option>' +
      '        <option value="code">终端（深色代码风）</option>' +
      '      </select>' +
      '      <label>主题色 <small>（选填，覆盖模板默认点缀色）</small></label>' +
      '      <div class="ct-color-row">' +
      '        <input type="color" id="ct-accent" value="#22d3ee">' +
      '        <span class="ct-hint">不动则使用各模板默认配色</span>' +
      '      </div>' +
      '      <div class="ct-btns">' +
      '        <button type="button" id="ct-dl-png">⬇️ 导出 PNG（1800×766）</button>' +
      '        <button type="button" id="ct-dl-svg">导出 SVG</button>' +
      '        <button type="button" id="ct-reroll">🎲 换一批花样</button>' +
      '      </div>' +
      '      <p class="ct-tips" id="ct-tip"></p>' +
      '    </div>' +
      '  </div>' +
      '  <div>' +
      '    <div class="ct-preview-meta"><span>实时预览 · <b id="ct-tpl-name">—</b></span><span>1800 × 766（2.35:1）</span></div>' +
      '    <div class="ct-preview-frame" id="ct-preview"></div>' +
      '    <p class="ct-tips">导出后可到公众号后台「封面」处手动上传；写完文章后运行 <code>npm run sync</code>，脚本会按同样的模板自动生成封面并绑定到草稿箱，无需手动操作。</p>' +
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
      };
    }
    function render() {
      var r = buildCoverSVG(currentOptions());
      $('ct-preview').innerHTML = r.svg;
      $('ct-tpl-name').textContent = (TPL_LABELS[r.template] || r.template) + ' 模板';
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
      var svg = buildCoverSVG(currentOptions()).svg;
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = COVER_W; canvas.height = COVER_H;
        canvas.getContext('2d').drawImage(img, 0, 0, COVER_W, COVER_H);
        canvas.toBlob(function (blob) {
          if (!blob) { $('ct-tip').textContent = '导出失败，请换 Chrome/Edge 再试'; return; }
          download(blob, fileBase() + '-cover.png');
          $('ct-tip').textContent = '✅ PNG 已导出，去公众号后台「封面」处上传';
        }, 'image/png');
      };
      img.onerror = function () { $('ct-tip').textContent = '渲染失败：请确认没有特殊字符'; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    $('ct-dl-svg').addEventListener('click', function () {
      var svg = buildCoverSVG(currentOptions()).svg;
      download(new Blob([svg], { type: 'image/svg+xml' }), fileBase() + '-cover.svg');
    });
    $('ct-reroll').addEventListener('click', function () { variant++; render(); });
    ['ct-title', 'ct-summary', 'ct-tags', 'ct-date', 'ct-brand', 'ct-template', 'ct-accent'].forEach(function (id) {
      $(id).addEventListener('input', render);
      $(id).addEventListener('change', render);
    });

    // 从博客文章导入（构建产物 search-index.json）
    fetch(base.replace(/\/?$/, '/') + 'search-index.json')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (posts) {
        if (!posts || !posts.length) return;
        var sel = $('ct-post-pick');
        posts.forEach(function (p, i) {
          var opt = el('option', { value: String(i) }, esc(p.title));
          sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
          var p = posts[Number(sel.value)];
          if (!p) return;
          $('ct-title').value = p.title || '';
          $('ct-summary').value = p.summary || '';
          $('ct-tags').value = (p.tags || []).join(', ');
          $('ct-date').value = p.date || '';
          render();
        });
      })
      .catch(function () { /* 拉取失败不影响手动使用 */ });

    // 支持 ?title=&summary=&tags=&date=&brand=&template=&accent= 预填
    var q = new URLSearchParams(location.search);
    [['title', 'ct-title'], ['summary', 'ct-summary'], ['tags', 'ct-tags'], ['date', 'ct-date'], ['brand', 'ct-brand'], ['template', 'ct-template'], ['accent', 'ct-accent']]
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
