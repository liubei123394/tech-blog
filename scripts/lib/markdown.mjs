/**
 * 零依赖 Markdown 渲染器
 * ------------------------------------------------------------------
 * 支持：frontmatter、标题、段落、有序/无序列表（含一层嵌套）、引用、
 *       围栏代码块、表格、分割线、图片、链接、行内代码、粗体、斜体、删除线。
 *
 * 同一份 Markdown 会渲染两遍：
 *   wx = false  -> 普通网页 HTML（用 class，交给 style.css）
 *   wx = true   -> 微信公众号 HTML（全部内联 style，因为公众号会过滤 class）
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (/^(javascript|data|vbscript):/i.test(s)) return '#';
  return s;
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

/* ============================== frontmatter ============================== */

function unquote(v) {
  const s = String(v).trim();
  if (s.length > 1 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

export function parseFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text };

  const data = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && key) {
      if (!Array.isArray(data[key])) data[key] = data[key] ? [data[key]] : [];
      data[key].push(unquote(li[1]));
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === '') { data[key] = []; continue; }
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else {
      data[key] = unquote(val);
    }
  }
  return { data, body: text.slice(m[0].length) };
}

/* ================================ inline ================================ */

const WX_INLINE = {
  a: 'color:#2f6fed;text-decoration:none;border-bottom:1px solid #bcd0fa;',
  code: 'background:#f2f4f8;color:#d6336c;padding:2px 5px;border-radius:4px;font-size:14px;font-family:Menlo,Consolas,monospace;',
  strong: 'font-weight:600;color:#111111;',
  em: 'font-style:italic;',
  del: 'text-decoration:line-through;color:#8a91a0;',
  img: 'max-width:100%;height:auto;border-radius:6px;display:block;margin:18px auto;',
};

function wrap(tag, inner, wx) {
  if (wx && WX_INLINE[tag]) return `<${tag} style="${WX_INLINE[tag]}">${inner}</${tag}>`;
  return `<${tag}>${inner}</${tag}>`;
}

/** 行内元素渲染。输入是「未转义的纯文本」。 */
export function renderInline(input, wx = false) {
  let s = esc(input);
  const stash = [];
  const keep = (html) => { stash.push(html); return `\u0001${stash.length - 1}\u0001`; };

  // 行内代码优先，先抽出来避免内部再被解析
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(wrap('code', c, wx)));

  // 图片
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
    const url = safeUrl(src);
    return wx
      ? `<img src="${url}" alt="${esc(alt)}" style="${WX_INLINE.img}">`
      : `<img src="${url}" alt="${esc(alt)}" loading="lazy">`;
  });

  // 链接
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
    const url = safeUrl(href);
    const ext = /^(https?:)?\/\//i.test(url);
    return wx
      ? `<a href="${url}" style="${WX_INLINE.a}">${label}</a>`
      : `<a href="${url}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });

  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, (_, t) => wrap('strong', wrap('em', t, wx), wx));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, t) => wrap('strong', t, wx));
  s = s.replace(/~~([^~]+)~~/g, (_, t) => wrap('del', t, wx));
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, (_, pre, t) => pre + wrap('em', t, wx));

  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[Number(i)]);
}

/* ================================ blocks ================================ */

const FENCE = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9+#._-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(?:[-*_]\s*){3,}$/;
const UL_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const OL_ITEM = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function isListStart(line) { return UL_ITEM.test(line) || OL_ITEM.test(line); }
function matchListItem(line) {
  const ul = UL_ITEM.exec(line);
  if (ul) return { indent: ul[1].length, ordered: false, text: ul[2] };
  const ol = OL_ITEM.exec(line);
  if (ol) return { indent: ol[1].length, ordered: true, text: ol[2] };
  return null;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseList(lines, start) {
  const first = matchListItem(lines[start]);
  const base = first.indent;
  const ordered = first.ordered;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const item = matchListItem(lines[i]);
    if (item) {
      if (item.indent < base) break;
      if (item.indent > base) {
        const sub = parseList(lines, i);
        if (items.length) items[items.length - 1].children = { items: sub.items, ordered: sub.ordered };
        i = sub.next;
        continue;
      }
      if (item.ordered !== ordered) break;
      items.push({ lines: [item.text], children: null });
      i++;
      continue;
    }

    if (lines[i].trim() === '') {
      // 空行：只有后面还跟着更深的列表项才算继续
      const next = lines[i + 1];
      const nm = next ? matchListItem(next) : null;
      if (nm && nm.indent > base - 1 && nm.indent >= base) { i++; continue; }
      break;
    }

    if (/^\s{2,}/.test(lines[i]) && items.length) {
      items[items.length - 1].lines.push(lines[i].trim());
      i++;
      continue;
    }
    break;
  }
  return { items, ordered, next: i };
}

export function parseBlocks(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // 围栏代码块
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] || '';
      const buf = [];
      i++;
      const close = new RegExp('^\\s*' + marker + '{3,}\\s*$');
      while (i < lines.length && !close.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // 跳过收尾围栏
      blocks.push({ type: 'code', lang, code: buf.join('\n') });
      continue;
    }

    if (HR.test(line) && !isListStart(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    const h = HEADING.exec(line);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() }); i++; continue; }

    if (QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE.test(lines[i])) { buf.push(lines[i].replace(QUOTE, '')); i++; }
      blocks.push({ type: 'quote', children: parseBlocks(buf.join('\n')) });
      continue;
    }

    // 表格：当前行是 | ... |，下一行是分隔行
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    if (isListStart(line)) {
      const list = parseList(lines, i);
      blocks.push({ type: 'list', items: list.items, ordered: list.ordered });
      i = list.next;
      continue;
    }

    // 段落：连续的非空行
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i])
      && !QUOTE.test(lines[i]) && !isListStart(lines[i]) && !HR.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'para', text: buf });
  }

  return blocks;
}

/* ============================== block render ============================== */

const WX_BLOCK = {
  p: 'margin:0 0 18px;font-size:16px;line-height:1.9;color:#2b2b2b;letter-spacing:.2px;',
  h1: 'margin:36px 0 18px;font-size:22px;line-height:1.45;font-weight:700;color:#111111;',
  h2: 'margin:34px 0 16px;padding-left:11px;border-left:4px solid #2f6fed;font-size:19px;line-height:1.5;font-weight:700;color:#111111;',
  h3: 'margin:28px 0 14px;font-size:17px;line-height:1.5;font-weight:600;color:#111111;',
  h4: 'margin:24px 0 12px;font-size:16px;line-height:1.5;font-weight:600;color:#111111;',
  hr: 'border:none;border-top:1px dashed #dcdfe6;margin:28px 0;',
  blockquote: 'margin:0 0 18px;padding:14px 16px;border-left:3px solid #2f6fed;background:#f7f9fd;border-radius:0 6px 6px 0;color:#4a5160;font-size:15px;line-height:1.85;',
  pre: 'margin:0 0 18px;padding:15px 16px;background:#f6f8fa;border-radius:8px;overflow-x:auto;',
  code: 'font-family:Menlo,Consolas,"Courier New",monospace;font-size:13.5px;line-height:1.75;color:#24292f;white-space:pre;',
  ul: 'margin:0 0 18px;padding-left:22px;',
  ol: 'margin:0 0 18px;padding-left:22px;',
  li: 'margin:0 0 8px;font-size:16px;line-height:1.9;color:#2b2b2b;',
  table: 'width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14.5px;',
  th: 'border:1px solid #e3e6ec;background:#f5f7fa;padding:9px 12px;text-align:left;font-weight:600;color:#111111;line-height:1.7;',
  td: 'border:1px solid #e3e6ec;padding:9px 12px;color:#2b2b2b;line-height:1.7;',
};

let headingSeq = 0;
export function slugifyHeading(text) {
  const base = String(text).toLowerCase()
    .replace(/`|\*|~|\[|\]|\(|\)|#|!/g, '')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `section-${++headingSeq}`;
}

/** 只在公众号模式下输出内联样式，网页版交给 CSS 处理 */
function wxAttr(tag, wx) {
  if (!wx) return '';
  return WX_BLOCK[tag] ? ` style="${WX_BLOCK[tag]}"` : '';
}

function renderListItems(items, ordered, wx, depth = 0) {
  const tag = ordered ? 'ol' : 'ul';
  const inner = items.map((it) => {
    const text = joinLines(it.lines);
    let html = `<li${wxAttr('li', wx)}>${renderInline(text, wx)}`;
    if (it.children && it.children.items.length) {
      html += renderListItems(it.children.items, it.children.ordered, wx, depth + 1);
    }
    return html + '</li>';
  }).join('');
  if (wx) {
    const sub = depth > 0 ? 'margin:8px 0 0;' : '';
    return `<${tag} style="${sub}${WX_BLOCK[tag]}">${inner}</${tag}>`;
  }
  return `<${tag}>${inner}</${tag}>`;
}

function joinLines(lines) {
  let out = '';
  lines.forEach((line, idx) => {
    const hardBreak = / {2,}$/.test(line) || /\\$/.test(line);
    const clean = line.replace(/ {2,}$/, '').replace(/\\$/, '');
    if (idx > 0) {
      const prevChar = out.slice(-1);
      const nextChar = clean.trim().slice(0, 1);
      out += (CJK.test(prevChar) || CJK.test(nextChar)) ? '' : ' ';
    }
    out += clean;
    if (hardBreak && idx < lines.length - 1) out += '\n\n\u0000BR\u0000';
  });
  return out.replace(/\u0000BR\u0000/g, '<br>');
}

export function renderBlocks(blocks, wx = false) {
  const headings = [];

  const render = (list) => list.map((b) => {
    switch (b.type) {
      case 'heading': {
        const level = Math.min(b.level, wx ? 4 : 6);
        const tag = `h${level}`;
        const id = slugifyHeading(b.text);
        const text = renderInline(b.text, wx);
        if (level <= 3) headings.push({ level, text: b.text, id });
        if (wx) return `<${tag}${wxAttr(tag, wx)}>${text}</${tag}>`;
        return `<${tag} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</${tag}>`;
      }
      case 'para':
        return wx
          ? `<p${wxAttr('p', wx)}>${renderInline(joinLines(b.text), true)}</p>`
          : `<p>${renderInline(joinLines(b.text), false)}</p>`;
      case 'code': {
        const cls = b.lang ? ` class="language-${esc(b.lang)}"` : '';
        if (wx) {
          return `<pre${wxAttr('pre', wx)}><code${wxAttr('code', wx)}>${esc(b.code)}</code></pre>`;
        }
        const label = b.lang ? `<span class="code-lang">${esc(b.lang)}</span>` : '';
        return `<figure class="code-block">${label}<button class="code-copy" type="button" aria-label="复制代码">复制</button><pre><code${cls}>${esc(b.code)}</code></pre></figure>`;
      }
      case 'quote':
        if (wx) return `<blockquote${wxAttr('blockquote', wx)}>${render(b.children)}</blockquote>`;
        return `<blockquote>${render(b.children)}</blockquote>`;
      case 'list':
        return renderListItems(b.items, !!b.ordered, wx);
      case 'hr':
        return wx ? `<hr${wxAttr('hr', wx)}>` : '<hr>';
      case 'table': {
        const head = `<tr>${b.head.map((c) => `<th${wxAttr('th', wx)}>${renderInline(c, wx)}</th>`).join('')}</tr>`;
        const body = b.rows.map((r) => `<tr>${b.head.map((_, ci) => `<td${wxAttr('td', wx)}>${renderInline(r[ci] || '', wx)}</td>`).join('')}</tr>`).join('');
        if (wx) return `<table${wxAttr('table', wx)}><thead>${head}</thead><tbody>${body}</tbody></table>`;
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
      }
      default:
        return '';
    }
  }).join('\n');

  const html = render(blocks);
  return { html, headings, plain: blocksToText(blocks) };
}

export function blocksToText(blocks) {
  const out = [];
  const walk = (list) => list.forEach((b) => {
    if (b.type === 'para') out.push(joinLines(b.text));
    else if (b.type === 'heading') out.push(b.text);
    else if (b.type === 'code') out.push(b.code);
    else if (b.type === 'quote') walk(b.children);
    else if (b.type === 'table') { out.push(b.head.join(' ')); b.rows.forEach((r) => out.push(r.join(' '))); }
    else if (b.type === 'list') {
      b.items.forEach((it) => {
        out.push(it.lines.join(' '));
        if (it.children && it.children.items) walk([{ type: 'list', items: it.children.items }]);
      });
    }
  });
  walk(blocks);
  return out.join('\n')
    .replace(/`|\*\*|\*|~~|!\[|\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 中文按字数、英文按词数估算阅读时长（分钟） */
export function readingTime(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(1, Math.round((cjk / 400 + words / 220)));
}
