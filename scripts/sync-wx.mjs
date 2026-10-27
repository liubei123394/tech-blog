#!/usr/bin/env node
/**
 * 博客文章 → 公众号（本地 HTML + 可选 API 推送草稿箱）
 * ------------------------------------------------------------------
 * 两层架构：
 *   第 1 层（永远执行）：扫描 posts/*.md → 渲染公众号内联样式 HTML + 固定尾注
 *                         → 输出 wx-html/（单篇页带"复制全文"按钮 + index.html）
 *   第 2 层（可选）：wx.config.json 配置了 AppID/AppSecret 时，自动推送草稿箱：
 *                         上传正文图 → 上传永久封面 → draft/add 新建草稿
 *                         失败时给出诊断（48001=无权限 / 40164=IP白名单 / 40001=密钥错）
 *
 * 用法：
 *   node scripts/sync-wx.mjs              全流程（未配置凭据则只生成本地 HTML）
 *   node scripts/sync-wx.mjs --html-only  只生成本地 HTML，不碰 API
 *   node scripts/sync-wx.mjs --reset      清空同步记录（下次全部重推/重生成）
 *   node scripts/sync-wx.mjs --no-cover   跳过自动封面（生成与绑定都不生效）
 *
 * 贴图/图集（2026-10-26 新增）：
 *   galleries/*.md 每个文件 = 一条图片消息（article_type: newspic）：
 *     ---
 *     title: 图集标题（必填）
 *     date: 2026-10-26
 *     summary: 摘要（可选，草稿摘要用）
 *     tags: [图集]      # 可选，会出现在贴图卡上
 *     cover: false      # 可选，默认 true：自动生成 1:1 内容贴图卡作为首图（即封面）
 *     footer: false     # 可选，默认把固定尾注作为纯文本附在贴图文字后
 *     images:           # 可选，也可直接在正文里写 ![](...)
 *       - img/01.jpg
 *     ---
 *   图片来源（三种方式随意混用，不限制入口）：
 *     1. 本地文件：把图放进 galleries/、galleries/img/ 或 galleries/<slug>/
 *        后，md 里只写文件名即可（也支持相对路径 / / 开头站内路径）
 *     2. 图片链接：![](https://...) 自动下载缓存到 .wx-cache/remote/ 后上传
 *     3. 对话粘贴：在 AI 助手对话框里粘贴/发送图片，由助手存进 galleries/img/
 *   正文里的图片按出现顺序进入图集（最多 20 张），正文文字作为贴图的
 *   纯文本说明。推送时图片上传为永久素材（material/add_material
 *   type=image），media_id 按内容 hash 缓存复用（.wx-sync.json images）。
 *   自动贴图卡：第 1.6 层基于图集标题/摘要/标签生成（默认 1:1，模板与
 *   文章封面同款，wx-covers/gallery-<slug>@<比例>.png），推送时作为首图
 *   = 贴图封面；wx.config.json galleryCoverRatio 可配 1:1/3:4/4:3/16:9。
 *   本地预览输出到 wx-html/galleries/<slug>.html。
 *
 * 自动封面（第 1.5 层）：每篇文章按标题/摘要/标签渲染 2.35:1 封面
 *   → wx-covers/<slug>.png（+SVG，模板见 scripts/lib/cover-svg.mjs，
 *     手动自定义工具：tools/cover-designer.html），推送草稿时优先
 *   用它作 thumb_media_id；文章未变则复用缓存，缺光栅化依赖时回退 defaultThumb。
 *
 * 配置：博客根目录 wx.config.json（已被 .gitignore 忽略）：
 *   {
 *     "appid": "你的AppID",
 *     "secret": "你的AppSecret",
 *     "author": "双非小文学AI",
 *     "defaultThumb": "src/assets/avatar.png"
 *   }
 *   也可用环境变量 WX_APPID / WX_SECRET 覆盖。
 *
 * 注意（官方权限现状，2026-10 核实）：
 *   - draft/add 不支持云调用；freepublish 仅限企业主体已认证账号
 *   - 未认证个人订阅号调用草稿接口会返回 48001（无权限），届时本脚本
 *     会明确提示并回退到纯本地模式——wx-html/ 里的成品仍可手动粘贴
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, parseBlocks, renderBlocks, blocksToText, readingTime } from './lib/markdown.mjs';
import { generateCoverFiles } from './lib/cover.mjs';
import { ratioSuffix, RATIO_SIZES } from './lib/cover-svg.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUT_DIR = path.join(ROOT, 'wx-html');
const STATE_FILE = path.join(ROOT, '.wx-sync.json');
const CONFIG_FILE = path.join(ROOT, 'wx.config.json');
const COVER_DIR = path.join(ROOT, 'wx-covers'); // 自动生成的文章封面（PNG+SVG）
const GALLERIES_DIR = path.join(ROOT, 'galleries'); // 贴图/图集（newspic 图片消息）
const GALLERY_OUT_DIR = path.join(OUT_DIR, 'galleries'); // 图集本地预览输出目录
const REMOTE_DIR = path.join(ROOT, '.wx-cache', 'remote'); // 外链图片下载缓存

const API = 'https://api.weixin.qq.com/cgi-bin';
const log = (...a) => console.log(...a);

const args = new Set(process.argv.slice(2));
const HTML_ONLY = args.has('--html-only');
const NO_COVER = args.has('--no-cover'); // 跳过自动封面（生成与绑定都不生效）

/* ------------------------------- 固定尾注 ------------------------------- */

const FOOTER_TEXT =
  '我是双非小文学AI，在读大数据专业女选手。为了赶上互联网末班车自学AI 编程，我会记录学习过程和思考，折腾的项目。' +
  '文章同步更新在个人博客，欢迎一起交流学习。如果我的内容对你有启发，动动你发财的小手点赞关注吧。';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderFooter() {
  return [
    '<section style="margin:36px 0 0;padding:18px 16px;background:#f7f8fa;border-radius:8px;">',
    '<p style="margin:0 0 8px;font-size:13px;line-height:1.9;color:#8a91a0;text-align:justify;">',
    esc(FOOTER_TEXT),
    '</p>',
    '<p style="margin:0;font-size:12px;line-height:1.8;color:#b0b6c3;text-align:center;">· END ·</p>',
    '</section>',
  ].join('\n');
}

/* --------------------------------- 状态 --------------------------------- */

function loadState() {
  let state = { posts: {}, covers: {}, galleries: {}, images: {} };
  if (fs.existsSync(STATE_FILE)) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* 损坏则重建 */ }
  }
  if (!state.posts || typeof state.posts !== 'object') state.posts = {};
  if (!state.covers || typeof state.covers !== 'object') state.covers = {};
  if (!state.galleries || typeof state.galleries !== 'object') state.galleries = {};
  if (!state.images || typeof state.images !== 'object') state.images = {}; // 贴图图片永久素材缓存（sha1 -> media_id）
  return state;
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

/* --------------------------------- 配置 --------------------------------- */

function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { log('⚠️  wx.config.json 不是合法 JSON，忽略配置，仅生成本地 HTML'); cfg = {}; }
  }
  cfg.appid = process.env.WX_APPID || cfg.appid || '';
  cfg.secret = process.env.WX_SECRET || cfg.secret || '';
  cfg.author = cfg.author || '双非小文学AI';
  cfg.defaultThumb = cfg.defaultThumb || 'src/assets/avatar.png';
  // 封面生成配置（可选）：brand 品牌名 / coverTemplate 模板（auto|aurora|mint|sunset|ink|code）
  // / coverAccent 主题色（如 '#22d3ee'）/ cover: false 可整体关闭自动封面
  cfg.brand = cfg.brand || 'DevNotes';
  cfg.coverTemplate = cfg.coverTemplate || 'auto';
  cfg.coverAccent = cfg.coverAccent || '';
  cfg.cover = cfg.cover !== false;
  // 图集内容贴图卡比例（1:1 / 3:4 / 4:3 / 16:9 / 2.35:1），默认 1:1 公众号贴图封面
  cfg.galleryCoverRatio = RATIO_SIZES[cfg.galleryCoverRatio] ? cfg.galleryCoverRatio : '1:1';
  return cfg;
}

/* ------------------------------ 读取文章 ------------------------------ */

const str = (v) => (Array.isArray(v) ? v.join('、') : v == null ? '' : String(v).trim());

function collectPosts() {
  if (!fs.existsSync(POSTS_DIR)) { log('⚠️  posts/ 目录不存在'); return []; }
  const out = [];
  for (const file of fs.readdirSync(POSTS_DIR).filter((f) => /\.md$/i.test(f)).sort()) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);

    if (String(data.draft) === 'true') { log(`   · 跳过（draft: true）${file}`); continue; }
    if (String(data.wx) === 'false') { log(`   · 跳过（wx: false）${file}`); continue; }

    const blocks = parseBlocks(body);
    const wx = renderBlocks(blocks, true);
    const plain = blocksToText(blocks);
    const title = str(data.title) || file.replace(/\.md$/i, '');
    const summary = str(data.summary) || str(data.description) || plain.slice(0, 110) + (plain.length > 110 ? '…' : '');
    // 封面专用摘要：不受草稿 120 字限制，取完整 frontmatter 摘要或正文前 200 字（封面模板自适应换行展示）
    const rawCover = str(data.summary) || str(data.description) || plain.replace(/\s+/g, ' ').trim();
    const coverSummary = (() => {
      if (rawCover.length <= 200) return rawCover;
      const head = rawCover.slice(0, 200);
      // 切到最后一个句读符号，避免半句话戛然而止
      const cut = Math.max(...['。', '！', '？', '；', '!', '?', ';'].map((p) => head.lastIndexOf(p)));
      return cut > 60 ? head.slice(0, cut + 1) : head;
    })();

    out.push({
      file,
      slug: file.replace(/\.md$/i, ''),
      title: title.slice(0, 64), // 官方限制 64 字
      summary: summary.slice(0, 119), // 官方限制 120 字
      coverSummary,
      date: str(data.date) || file.slice(0, 10),
      tags: Array.isArray(data.tags) ? data.tags : (str(data.tags) ? [str(data.tags)] : []),
      minutes: readingTime(plain),
      wxHtml: wx.html,
      raw,
    });
  }
  return out;
}

/* ----------------------------- 图片来源解析 ----------------------------- */

/** 下载远程图片到 .wx-cache/remote/（按 URL sha1 缓存），返回 { absPath, ext } */
async function fetchRemoteImage(src) {
  fs.mkdirSync(REMOTE_DIR, { recursive: true });
  const key = sha1(Buffer.from(src, 'utf8'));
  const hit = fs.readdirSync(REMOTE_DIR).find((f) => f.startsWith(key + '.'));
  if (hit) return { absPath: path.join(REMOTE_DIR, hit), ext: path.extname(hit).slice(1).toLowerCase() };
  const res = await fetch(src, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('响应为空');
  const urlExt = (/\.(png|jpe?g|gif)(?:[?#]|$)/i.exec(src) || [])[1];
  const ctExt = (/image\/(png|jpe?g|gif)/i.exec(String(res.headers.get('content-type') || '')) || [])[1];
  const ext = (urlExt || ctExt || 'png').toLowerCase().replace('jpeg', 'jpg');
  const file = path.join(REMOTE_DIR, `${key}.${ext}`);
  fs.writeFileSync(file, buf);
  return { absPath: file, ext };
}

/**
 * 把任意图片来源解析成本地文件（图集与文章正文共用）：
 *   http(s) 链接        → 下载并缓存到 .wx-cache/remote/，可重复使用
 *   / 开头              → 相对站点根目录（可复用 src/assets/ 等）
 *   裸文件名 / 相对路径  → 依次尝试 baseDir/ → baseDir/<slug>/ → baseDir/img/
 *                         （对话框粘贴的图片放进 galleries/img/ 后写文件名即可）
 * 返回 { src(规范化), absPath, ext }；解析失败返回 null（已打日志）
 */
async function resolveImage(src, ctx = {}) {
  if (!src) return null;
  const baseDir = ctx.baseDir || GALLERIES_DIR;
  if (/^data:/i.test(src)) { log(`   ⚠️ 内联 data: 图片不支持，跳过`); return null; }
  try {
    if (/^https?:/i.test(src)) {
      const { absPath, ext } = await fetchRemoteImage(src);
      if (ext === 'webp') { log(`   ⚠️ 微信素材不支持 webp，跳过外链: ${src}`); return null; }
      const relRoot = path.relative(ROOT, absPath).split(path.sep).join('/');
      return { src: '/' + relRoot, absPath, ext };
    }
    const candidates = [];
    if (src.startsWith('/')) {
      candidates.push(path.join(ROOT, src));
    } else {
      candidates.push(path.resolve(baseDir, src));
      if (ctx.slug) candidates.push(path.resolve(baseDir, ctx.slug, src));
      candidates.push(path.resolve(baseDir, 'img', src));
    }
    const abs = candidates.find((p) => fs.existsSync(p));
    if (!abs) { log(`   ⚠️ 图片文件不存在，跳过: ${src}`); return null; }
    const ext = path.extname(abs).slice(1).toLowerCase() || 'png';
    if (ext === 'webp') { log(`   ⚠️ 微信素材不支持 webp，请转成 jpg/png 后再同步: ${src}`); return null; }
    const relRoot = path.relative(ROOT, abs).split(path.sep).join('/');
    const normSrc = src.startsWith('/') ? src : (relRoot.startsWith('galleries/') ? relRoot.slice('galleries/'.length) : '/' + relRoot);
    return { src: normSrc, absPath: abs, ext };
  } catch (e) {
    log(`   ⚠️ 图片获取失败，跳过 ${src} —— ${e.message}`);
    return null;
  }
}

/* ----------------------------- 读取图集 ----------------------------- */

/** 收集 galleries/*.md 贴图/图集（article_type: newspic） */
async function collectGalleries() {
  if (!fs.existsSync(GALLERIES_DIR)) return [];
  const out = [];
  for (const file of fs.readdirSync(GALLERIES_DIR).filter((f) => /\.md$/i.test(f) && !/^readme\.md$/i.test(f)).sort()) {
    const raw = fs.readFileSync(path.join(GALLERIES_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);

    if (String(data.draft) === 'true') { log(`   · 跳过（draft: true）galleries/${file}`); continue; }
    if (String(data.wx) === 'false') { log(`   · 跳过（wx: false）galleries/${file}`); continue; }

    const blocks = parseBlocks(body);
    const rendered = renderBlocks(blocks, true).html;
    const bodyText = blocksToText(blocks);
    const slug = file.replace(/\.md$/i, '');

    // 图片列表：frontmatter images + 正文图片，按出现顺序，本地文件去重
    // 来源不限：本地文件名 / 相对路径 / 站内 / 路径 / http(s) 外链（自动下载缓存）
    const images = [];
    const pushImage = async (src) => {
      const r = await resolveImage(src, { baseDir: GALLERIES_DIR, slug });
      if (r && !images.some((i) => i.absPath === r.absPath)) images.push({ src: r.src, absPath: r.absPath });
    };
    if (Array.isArray(data.images)) for (const s of data.images) await pushImage(str(s));
    else if (str(data.images)) await pushImage(str(data.images));
    for (const m of rendered.matchAll(/<img src="([^"]+)"/g)) await pushImage(m[1]);

    // 贴图文字说明（newspic 的 content 只支持纯文本）：正文文字，默认追加固定尾注
    const withFooter = String(data.footer) !== 'false';
    const content = [bodyText, withFooter ? FOOTER_TEXT : ''].filter(Boolean).join('\n\n').slice(0, 2000);

    out.push({
      file,
      slug,
      title: (str(data.title) || slug).slice(0, 32), // 贴图标题限制更短，保守 32 字
      summary: (str(data.summary) || bodyText.slice(0, 110) + (bodyText.length > 110 ? '…' : '')).slice(0, 119),
      date: str(data.date) || file.slice(0, 10),
      tags: Array.isArray(data.tags) ? data.tags : (str(data.tags) ? [str(data.tags)] : []),
      cover: String(data.cover) !== 'false', // 自动贴图卡开关，默认开
      images,
      content,
      raw,
    });
  }
  return out;
}

/* ----------------------------- 本地 HTML 输出 ----------------------------- */

const COPY_HELPER = `
<script>
(function () {
  var btn = document.getElementById('copy-btn');
  var tip = document.getElementById('copy-tip');
  btn.addEventListener('click', async function () {
    var node = document.getElementById('wx-article');
    var html = node.innerHTML;
    var text = node.innerText;
    try {
      if (window.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]);
      } else {
        var range = document.createRange();
        range.selectNodeContents(node);
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
      }
      btn.textContent = '✅ 已复制，去公众号编辑器粘贴';
      tip.textContent = '小提示：粘贴后如果标题没有单独填，记得在公众号编辑器顶部补上标题和摘要';
    } catch (e) {
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      tip.textContent = '自动复制失败，已全选正文，请按 Ctrl+C 手动复制';
    }
  });
})();
</script>`;

function pageShell({ title, sub, body, helper = true }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#e8eaee;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
<div style="max-width:677px;margin:0 auto;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
    <div style="min-width:0;">
      <div style="font-size:15px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(title)}</div>
      <div style="font-size:12px;color:#8a91a0;margin-top:2px;">${esc(sub)}</div>
    </div>
    <button id="copy-btn" type="button" style="flex-shrink:0;padding:9px 18px;border:none;border-radius:6px;background:#07c160;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">📋 复制全文</button>
  </div>
  <p id="copy-tip" style="margin:0 0 14px;font-size:12px;color:#8a91a0;">复制后直接粘贴到公众号编辑器，内联排版会保留。</p>
  <article id="wx-article" style="padding:28px 24px 24px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
${body}
  </article>
</div>
${helper ? COPY_HELPER : ''}
</body>
</html>`;
}

function articleBody(p) {
  return [
    `<h1 style="margin:0 0 10px;font-size:21px;line-height:1.5;font-weight:700;color:#111111;">${esc(p.title)}</h1>`,
    `<p style="margin:0 0 26px;font-size:13px;color:#8a91a0;">${esc(p.date)} · 约 ${p.minutes} 分钟</p>`,
    p.wxHtml,
    renderFooter(),
  ].join('\n');
}

/** 图集本地预览页：核对图片顺序 / 文字说明（贴图无可粘贴富文本，推送走 API） */
function galleryPage(g) {
  const rel = (src) => (src.startsWith('/') ? '../../' + src.slice(1) : '../../galleries/' + src);
  const imgs = g.images.map((i, idx) =>
    `<figure style="margin:0 0 18px;"><img src="${esc(rel(i.src))}" style="width:100%;display:block;border-radius:8px;background:#f2f4f8;" alt="${esc(path.basename(i.src))}"><figcaption style="margin-top:6px;font-size:12px;color:#8a91a0;text-align:center;">第 ${idx + 1} 张${idx === 0 ? ' · 将作为贴图封面' : ''}</figcaption></figure>`
  ).join('\n');
  return pageShell({
    title: `【图集】${g.title}`,
    sub: `${g.date} · ${g.images.length} 张 · 推送后进公众号草稿箱（图片消息）`,
    helper: false,
    body: [
      `<h1 style="margin:0 0 10px;font-size:21px;line-height:1.5;font-weight:700;color:#111111;">${esc(g.title)}</h1>`,
      `<p style="margin:0 0 20px;font-size:13px;color:#8a91a0;">${esc(g.date)} · ${g.images.length} 张图片 · 类型：贴图（newspic）</p>`,
      g.content ? `<div style="margin:0 0 22px;padding:14px 16px;background:#f7f8fa;border-radius:8px;font-size:14px;line-height:1.9;color:#2b2b2b;white-space:pre-wrap;">${esc(g.content)}</div>` : '',
      imgs || '<p style="color:#c0392b;">⚠️ 这个图集没有收集到任何本地图片</p>',
    ].join('\n'),
  });
}

function buildIndex(posts, galleries = []) {
  const items = posts.map((p) => `
  <a href="${encodeURIComponent(p.slug)}.html" style="display:block;padding:16px;background:#fff;border-radius:8px;margin-bottom:12px;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.05);">
    <div style="font-size:16px;font-weight:600;color:#111;">${esc(p.title)}</div>
    <div style="margin-top:6px;font-size:13px;color:#8a91a0;">${esc(p.date)}${p.tags.length ? ' · ' + esc(p.tags.join(' / ')) : ''}</div>
    <div style="margin-top:6px;font-size:13px;color:#4a5160;line-height:1.7;">${esc(p.summary)}</div>
  </a>`).join('\n');

  const galleryItems = galleries.map((g) => `
  <a href="galleries/${encodeURIComponent(g.slug)}.html" style="display:block;padding:16px;background:#fff;border-radius:8px;margin-bottom:12px;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.05);">
    <div style="font-size:16px;font-weight:600;color:#111;">🖼 ${esc(g.title)} <span style="font-size:12px;font-weight:400;color:#8a91a0;">贴图</span></div>
    <div style="margin-top:6px;font-size:13px;color:#8a91a0;">${esc(g.date)} · ${g.images.length} 张图</div>
  </a>`).join('\n');

  return pageShell({
    title: '公众号文章预览',
    sub: `${posts.length} 篇文章${galleries.length ? ` · ${galleries.length} 个图集` : ''} · 点开单篇 → 复制全文 → 粘贴到公众号编辑器`,
    helper: false,
    body: `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111;">公众号文章预览</h1>
<p style="margin:0 0 22px;font-size:13px;color:#8a91a0;line-height:1.8;">使用流程：点开一篇文章 → 点右上「复制全文」→ 打开公众号后台「图文消息」→ 新建图文 → 正文区 Ctrl+V → 填标题和摘要 → 群发前用手机预览。图集（贴图）预览页仅用于核对图片顺序和文字，推送后直接进草稿箱。</p>
${items}
${galleries.length ? `<h2 style="margin:26px 0 14px;font-size:16px;font-weight:700;color:#111;">图集 / 贴图</h2>${galleryItems}` : ''}`,
  });
}

function writeLocalOutputs(posts, galleries = []) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const p of posts) {
    const html = pageShell({ title: p.title, sub: `${p.date} · 复制后粘贴到公众号编辑器`, body: articleBody(p) });
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), html, 'utf8');
  }
  if (galleries.length) {
    fs.mkdirSync(GALLERY_OUT_DIR, { recursive: true });
    for (const g of galleries) {
      fs.writeFileSync(path.join(GALLERY_OUT_DIR, `${g.slug}.html`), galleryPage(g), 'utf8');
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndex(posts, galleries), 'utf8');
}

/* ------------------------------- 微信 API 层 ------------------------------- */

let token = null; // 仅存内存

async function getToken(cfg) {
  if (token) return token;
  const res = await fetch(`${API}/token?grant_type=client_credential&appid=${cfg.appid}&secret=${cfg.secret}`);
  const data = await res.json();
  if (!data.access_token) throw apiError('获取 access_token', data);
  token = data.access_token;
  return token;
}

/** 把常见 errcode 翻译成人话 */
function apiError(what, data) {
  const map = {
    40001: 'AppSecret 不正确或已被重置',
    41001: '缺少 access_token',
    42001: 'access_token 已过期（脚本会自动重取，重试即可）',
    40164: 'IP 不在白名单：登录 mp.weixin.qq.com → 设置与开发 → 基本配置 → IP白名单，添加本机出口 IP（curl ifconfig.me 查看）',
    48001: '账号没有该接口权限：个人未认证订阅号无草稿箱权限，API 推送不可用，请回退手动粘贴',
    45009: '接口调用次数超限（每日限额），明天再试',
    40007: 'media_id 无效（通常是封面素材上传失败）',
  };
  const hint = map[data.errcode] || '';
  return new Error(`${what}失败 errcode=${data.errcode} ${data.errmsg || ''}${hint ? ' —— ' + hint : ''}`);
}

async function wxPostJSON(cfg, endpoint, payload) {
  const t = await getToken(cfg);
  const res = await fetch(`${API}/${endpoint}?access_token=${t}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function wxUpload(cfg, endpoint, filename, buf, mime, type) {
  const t = await getToken(cfg);
  const form = new FormData();
  form.append('media', new Blob([buf], { type: mime }), filename);
  const res = await fetch(`${API}/${endpoint}?access_token=${t}${type ? `&type=${type}` : ''}`, { method: 'POST', body: form });
  return res.json();
}

/** 找出 html 里的图片并解析为本地文件，返回 [{ src, absPath }]（外链自动下载缓存） */
async function findLocalImages(html) {
  const imgs = [];
  const re = /<img src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const r = await resolveImage(m[1], { baseDir: POSTS_DIR });
    if (r) imgs.push({ src: m[1], absPath: r.absPath });
    else log(`   ⚠️  正文图片无法解析，推送时保留原样: ${m[1]}`);
  }
  return imgs;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** 推送单篇文章到草稿箱，成功返回 media_id */
async function pushDraft(cfg, p, state) {
  // 1. 上传正文内图片并替换 src（本地直接传，外链先下载缓存再传）
  let content = p.wxHtml + renderFooter();
  for (const img of await findLocalImages(content)) {
    const ext = path.extname(img.absPath).slice(1).toLowerCase() || 'png';
    const data = await wxUpload(cfg, 'media/uploadimg', `img.${ext}`, fs.readFileSync(img.absPath), MIME[ext] || 'image/png');
    if (!data.url) throw apiError('上传正文图片', data);
    content = content.split(`src="${img.src}"`).join(`src="${data.url}"`);
    log(`   ↳ 正文图片已上传: ${path.basename(img.absPath)}`);
  }

  // 2. 封面：优先自动生成的文章封面（wx-covers/）→ 配置的 defaultThumb → 正文首图（必须永久素材）
  const firstLocal = (await findLocalImages(p.wxHtml))[0];
  let coverPath;
  const autoCover = path.join(COVER_DIR, `${p.slug}.png`);
  if (!NO_COVER && fs.existsSync(autoCover)) {
    coverPath = autoCover;
    log(`   ↳ 使用自动生成封面: wx-covers/${p.slug}.png`);
  } else if (cfg.defaultThumb) {
    coverPath = path.join(ROOT, cfg.defaultThumb);
  } else {
    coverPath = firstLocal?.absPath;
  }
  if (!coverPath || !fs.existsSync(coverPath)) {
    throw new Error('没有可用封面图（配置 defaultThumb 或在正文放一张本地图片）');
  }
  const coverKey = sha1(fs.readFileSync(coverPath));
  let thumbMediaId = state.covers[coverKey];
  if (thumbMediaId) {
    log('   ↳ 封面命中缓存');
  } else {
    const ext = path.extname(coverPath).slice(1).toLowerCase() || 'png';
    const data = await wxUpload(cfg, 'material/add_material', `cover.${ext}`, fs.readFileSync(coverPath), MIME[ext] || 'image/png');
    if (!data.media_id) throw apiError('上传永久封面', data);
    thumbMediaId = data.media_id;
    state.covers[coverKey] = thumbMediaId;
    log(`   ↳ 封面已上传: ${path.basename(coverPath)}`);
  }

  // 3. 新建草稿
  const data = await wxPostJSON(cfg, 'draft/add', {
    articles: [{
      title: p.title,
      author: cfg.author,
      digest: p.summary,
      content,
      thumb_media_id: thumbMediaId,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    }],
  });
  if (!data.media_id) throw apiError('新建草稿', data);
  return data.media_id;
}

/* --------------------------------- 主流程 --------------------------------- */

/** 账号级错误码：一旦出现，后续推送必然同样失败，直接中止 */
const ACCOUNT_ERRCODES = ['48001', '40001', '40164', '41001', '41002', '41004'];

/** 推送贴图/图集草稿（article_type: newspic），成功返回 media_id */
async function pushGalleryDraft(cfg, g, state) {
  // 0. 自动贴图卡（第 1.5 层基于内容生成）作为首图 = 贴图封面
  const list = [...g.images];
  const cardPath = path.join(COVER_DIR, `gallery-${g.slug}${ratioSuffix(cfg.galleryCoverRatio)}.png`);
  if (g.cover && cfg.cover && !NO_COVER && fs.existsSync(cardPath)) {
    if (list.length >= 20) throw new Error('图集已满 20 张，放不下自动贴图卡（frontmatter 写 cover: false 可关闭，或删减图片）');
    list.unshift({ src: 'cover-card', absPath: cardPath });
    log('   ↳ 使用自动生成的贴图卡作为首图（即封面）');
  }
  if (!list.length) throw new Error('图集没有可用图片（在 galleries/<名称>.md 正文写 ![](图片路径/文件名/外链)，图片可放 galleries/img/ 下）');
  if (list.length > 20) throw new Error(`贴图最多 20 张，当前收集到 ${list.length} 张，请删减`);

  // 1. 图片上传为永久素材（newspic 要求 image_media_id 为永久素材，首张即封面）
  const imageList = [];
  for (const img of list) {
    const key = sha1(fs.readFileSync(img.absPath));
    let mediaId = state.images[key];
    if (mediaId) {
      log(`   ↳ 图片命中素材缓存: ${path.basename(img.absPath)}`);
    } else {
      const ext = path.extname(img.absPath).slice(1).toLowerCase() || 'png';
      const data = await wxUpload(cfg, 'material/add_material', `pic.${ext}`, fs.readFileSync(img.absPath), MIME[ext] || 'image/png', 'image');
      if (!data.media_id) throw apiError('上传贴图素材', data);
      mediaId = data.media_id;
      state.images[key] = mediaId;
      log(`   ↳ 图片已传永久素材: ${path.basename(img.absPath)}`);
    }
    imageList.push({ image_media_id: mediaId });
  }

  // 2. 新建贴图草稿（无封面字段，首图即封面；content 为纯文本说明）
  const data = await wxPostJSON(cfg, 'draft/add', {
    articles: [{
      article_type: 'newspic',
      title: g.title,
      author: cfg.author,
      digest: g.summary,
      content: g.content,
      need_open_comment: 1,
      only_fans_can_comment: 0,
      image_info: { image_list: imageList },
    }],
  });
  if (!data.media_id) throw apiError('新建贴图草稿', data);
  return data.media_id;
}

async function main() {
  if (args.has('--reset') && fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    log('🔄 已清空同步记录\n');
  }

  const cfg = loadConfig();
  const canPush = !!(cfg.appid && cfg.secret);
  if (HTML_ONLY) log('📄 --html-only：只生成本地 HTML，不调用微信接口');
  else if (canPush) log('🔑 已读取凭据（wx.config.json / 环境变量），将尝试推送草稿箱');
  else log('ℹ️  未配置凭据（wx.config.json），仅生成本地 HTML');

  const state = loadState();
  const posts = collectPosts();
  const galleries = await collectGalleries();
  if (!posts.length && !galleries.length) { log('⚠️  没有可同步的文章或图集'); return; }

  /* ---- 第 1 层：本地 HTML（永远执行） ---- */
  writeLocalOutputs(posts, galleries);
  const added = [], updated = [];
  for (const p of posts) {
    const hash = sha1(Buffer.from(p.raw, 'utf8'));
    const rec = state.posts[p.file];
    if (!rec) added.push(p.file);
    else if (rec.hash !== hash) updated.push(p.file);
    state.posts[p.file] = { ...(state.posts[p.file] || {}), hash, title: p.title, generatedAt: new Date().toISOString() };
  }
  log(`\n✅ 本地 HTML 已生成 ${posts.length} 篇${galleries.length ? ` + ${galleries.length} 个图集预览` : ''} → wx-html/`);
  if (added.length) log(`   🆕 新增：${added.join(', ')}`);
  if (updated.length) log(`   ✏️  更新：${updated.length} 篇`);
  if (!added.length && !updated.length) log('   · 无新增/更新');

  const galAdded = [];
  for (const g of galleries) {
    const hash = sha1(Buffer.from(g.raw, 'utf8'));
    const rec = state.galleries[g.file];
    if (!rec) galAdded.push(g.file);
    state.galleries[g.file] = { ...(state.galleries[g.file] || {}), hash, title: g.title, images: g.images.length, generatedAt: new Date().toISOString() };
  }
  if (galAdded.length) log(`   🖼 新增图集：${galAdded.join(', ')}`);

  /* ---- 第 1.5 层：自动封面（可选，任何失败都不影响主流程） ---- */
  if (NO_COVER) {
    log('🚫 --no-cover：跳过自动封面，推送时将使用默认封面');
  } else if (cfg.cover) {
    let noSharp = false;
    let coverMade = 0;
    for (const p of posts) {
      const rec = state.posts[p.file] || {};
      const pngPath = path.join(COVER_DIR, `${p.slug}.png`);
      if (rec.coverHash && rec.coverHash === rec.hash && fs.existsSync(pngPath)) continue; // 文章未变且封面已生成
      try {
        const r = await generateCoverFiles(p, {
          coverDir: COVER_DIR,
          brand: cfg.brand,
          template: cfg.coverTemplate,
          accent: cfg.coverAccent,
        });
        if (!r.pngPath) { noSharp = true; break; }
        state.posts[p.file] = { ...rec, coverHash: rec.hash, coverTemplate: r.template };
        coverMade++;
        log(`   🖼 封面: wx-covers/${p.slug}.png（模板 ${r.template}）`);
      } catch (e) {
        log(`   ⚠️ 封面生成失败（不影响同步）: ${p.slug} —— ${e.message}`);
      }
    }
    if (coverMade) log(`✅ 自动封面已生成/更新 ${coverMade} 张 → wx-covers/`);
    if (noSharp) log('⚠️  未安装 @resvg/resvg-js（npm i @resvg/resvg-js），只产出 SVG；推送草稿将回退默认头像封面');
    saveState(state);
  }

  /* ---- 第 1.6 层：图集内容贴图卡（可选，基于标题/摘要/标签生成，作为贴图首图=封面） ---- */
  if (NO_COVER || !cfg.cover) {
    log('🚫 自动封面已关闭：图集推送时不再前置生成贴图卡');
  } else if (galleries.length) {
    const galRatio = cfg.galleryCoverRatio;
    let galCoverMade = 0;
    let galNoSharp = false;
    for (const g of galleries) {
      if (g.cover === false) continue;
      const rec = state.galleries[g.file] || {};
      const pngPath = path.join(COVER_DIR, `gallery-${g.slug}${ratioSuffix(galRatio)}.png`);
      if (rec.coverHash && rec.coverHash === rec.hash && fs.existsSync(pngPath)) continue; // 图集未变且贴图卡已生成
      try {
        const r = await generateCoverFiles(
          { slug: `gallery-${g.slug}`, title: g.title, coverSummary: g.summary || g.title, tags: g.tags.length ? g.tags : ['图集'], date: g.date, seedKey: `gallery-${g.slug}` },
          { coverDir: COVER_DIR, brand: cfg.brand, template: cfg.coverTemplate, accent: cfg.coverAccent, ratio: galRatio }
        );
        if (!r.pngPath) { galNoSharp = true; break; }
        state.galleries[g.file] = { ...rec, coverHash: rec.hash, coverRatio: galRatio, coverTemplate: r.template };
        galCoverMade++;
        log(`   🖼 贴图卡: wx-covers/gallery-${g.slug}${ratioSuffix(galRatio)}.png（${galRatio} · 模板 ${r.template}）`);
      } catch (e) {
        log(`   ⚠️ 贴图卡生成失败（不影响同步）: ${g.slug} —— ${e.message}`);
      }
    }
    if (galCoverMade) log(`✅ 图集贴图卡已生成/更新 ${galCoverMade} 张 → wx-covers/（比例 ${galRatio}，wx.config.json galleryCoverRatio 可改）`);
    if (galNoSharp) log('⚠️  未安装 @resvg/resvg-js，贴图卡只有 SVG；推送时将跳过贴图卡，直接用图集首图当封面');
    saveState(state);
  }

  /* ---- 第 2 层：API 推送（可选） ---- */
  if (HTML_ONLY || !canPush) {
    log('\n👉 浏览器打开 wx-html/index.html → 单篇 →「复制全文」→ 粘贴到公众号编辑器');
    saveState(state);
    return;
  }

  const pushPending = posts.filter((p) => {
    const rec = state.posts[p.file];
    return !rec.pushedHash || rec.pushedHash !== rec.hash;
  });

  if (!pushPending.length) {
    log('\n✅ 所有文章均已推送过草稿箱，无需重推（改文章后会自动重推）');
  } else {
    log(`\n📤 待推送草稿箱 ${pushPending.length} 篇：${pushPending.map((p) => p.file).join(', ')}\n`);

    let aborted = false;
    let okCount = 0;
    for (const p of pushPending) {
      if (aborted) { log(`⏭️  跳过 ${p.file}（前面的失败属于账号级问题）`); continue; }
      log(`→ ${p.file}`);
      try {
        const mediaId = await pushDraft(cfg, p, state);
        state.posts[p.file].pushedHash = state.posts[p.file].hash;
        state.posts[p.file].pushedAt = new Date().toISOString();
        state.posts[p.file].draftMediaId = mediaId;
        okCount++;
        log(`   ✅ 已进草稿箱（media_id: ${mediaId.slice(0, 24)}…）`);
      } catch (e) {
        log(`   ❌ ${e.message}`);
        // 账号级错误（无权限/密钥/IP），后续文章必然同样失败，直接中止
        const m = /errcode=(\d+)/.exec(e.message);
        if (m && ACCOUNT_ERRCODES.includes(m[1])) aborted = true;
      }
      saveState(state);
    }

    log('');
    if (okCount) log(`🎉 成功推送 ${okCount} 篇文章草稿！`);
  }

  /* ---- 第 2.5 层：图集（贴图）推送 ---- */
  if (!galleries.length) return;

  const galPending = galleries.filter((g) => {
    const rec = state.galleries[g.file];
    return !rec.pushedHash || rec.pushedHash !== rec.hash;
  });

  if (!galPending.length) {
    log('✅ 所有图集均已推送过，无需重推（改 md 或换图后会自动重推）');
    return;
  }
  log(`\n🖼 待推送贴图 ${galPending.length} 个：${galPending.map((g) => `galleries/${g.file}`).join(', ')}\n`);

  let galAborted = false;
  let galOk = 0;
  for (const g of galPending) {
    if (galAborted) { log(`⏭️  跳过 galleries/${g.file}（前面的失败属于账号级问题）`); continue; }
    log(`→ galleries/${g.file}（${g.images.length} 张）`);
    try {
      const mediaId = await pushGalleryDraft(cfg, g, state);
      state.galleries[g.file].pushedHash = state.galleries[g.file].hash;
      state.galleries[g.file].pushedAt = new Date().toISOString();
      state.galleries[g.file].draftMediaId = mediaId;
      galOk++;
      log(`   ✅ 贴图已进草稿箱（media_id: ${mediaId.slice(0, 24)}…）`);
    } catch (e) {
      log(`   ❌ ${e.message}`);
      const m = /errcode=(\d+)/.exec(e.message);
      if (m && ACCOUNT_ERRCODES.includes(m[1])) galAborted = true;
    }
    saveState(state);
  }

  log('');
  if (galOk) log(`🎉 成功推送 ${galOk} 个贴图草稿！打开「订阅号助手」或 mp.weixin.qq.com → 草稿箱 预览、确认并群发`);
  if (galAborted) {
    log('⚠️  贴图推送中止：账号级问题未解决。修复后重新运行 `npm run sync` 即可续推。');
  }
}

main().catch((e) => { log(`❌ ${e.message}`); process.exit(1); });
