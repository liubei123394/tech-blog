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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUT_DIR = path.join(ROOT, 'wx-html');
const STATE_FILE = path.join(ROOT, '.wx-sync.json');
const CONFIG_FILE = path.join(ROOT, 'wx.config.json');
const COVER_DIR = path.join(ROOT, 'wx-covers'); // 自动生成的文章封面（PNG+SVG）

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
  let state = { posts: {}, covers: {} };
  if (fs.existsSync(STATE_FILE)) {
    try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch { /* 损坏则重建 */ }
  }
  if (!state.posts || typeof state.posts !== 'object') state.posts = {};
  if (!state.covers || typeof state.covers !== 'object') state.covers = {};
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

function buildIndex(posts) {
  const items = posts.map((p) => `
  <a href="${encodeURIComponent(p.slug)}.html" style="display:block;padding:16px;background:#fff;border-radius:8px;margin-bottom:12px;text-decoration:none;box-shadow:0 1px 3px rgba(0,0,0,.05);">
    <div style="font-size:16px;font-weight:600;color:#111;">${esc(p.title)}</div>
    <div style="margin-top:6px;font-size:13px;color:#8a91a0;">${esc(p.date)}${p.tags.length ? ' · ' + esc(p.tags.join(' / ')) : ''}</div>
    <div style="margin-top:6px;font-size:13px;color:#4a5160;line-height:1.7;">${esc(p.summary)}</div>
  </a>`).join('\n');

  return pageShell({
    title: '公众号文章预览',
    sub: `${posts.length} 篇 · 点开单篇 → 复制全文 → 粘贴到公众号编辑器`,
    helper: false,
    body: `<h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111;">公众号文章预览</h1>
<p style="margin:0 0 22px;font-size:13px;color:#8a91a0;line-height:1.8;">使用流程：点开一篇文章 → 点右上「复制全文」→ 打开公众号后台「图文消息」→ 新建图文 → 正文区 Ctrl+V → 填标题和摘要 → 群发前用手机预览。</p>
${items}`,
  });
}

function writeLocalOutputs(posts) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const p of posts) {
    const html = pageShell({ title: p.title, sub: `${p.date} · 复制后粘贴到公众号编辑器`, body: articleBody(p) });
    fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), html, 'utf8');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), buildIndex(posts), 'utf8');
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

async function wxUpload(cfg, endpoint, filename, buf, mime) {
  const t = await getToken(cfg);
  const form = new FormData();
  form.append('media', new Blob([buf], { type: mime }), filename);
  const res = await fetch(`${API}/${endpoint}?access_token=${t}`, { method: 'POST', body: form });
  return res.json();
}

/** 找出 html 里的本地图片，返回 [{ src, absPath }] */
function findLocalImages(html) {
  const imgs = [];
  const re = /<img src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (/^(https?:|data:)/i.test(src)) continue; // 外链/内联图片不处理
    let abs;
    if (src.startsWith('/')) abs = path.join(ROOT, src);
    else abs = path.resolve(ROOT, 'posts', src);
    if (fs.existsSync(abs)) imgs.push({ src, absPath: abs });
    else log(`   ⚠️  图片文件不存在，跳过: ${src}`);
  }
  return imgs;
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** 推送单篇文章到草稿箱，成功返回 media_id */
async function pushDraft(cfg, p, state) {
  // 1. 上传正文内本地图片并替换 src
  let content = p.wxHtml + renderFooter();
  for (const img of findLocalImages(content)) {
    const ext = path.extname(img.absPath).slice(1).toLowerCase() || 'png';
    const data = await wxUpload(cfg, 'media/uploadimg', `img.${ext}`, fs.readFileSync(img.absPath), MIME[ext] || 'image/png');
    if (!data.url) throw apiError('上传正文图片', data);
    content = content.split(`src="${img.src}"`).join(`src="${data.url}"`);
    log(`   ↳ 正文图片已上传: ${path.basename(img.absPath)}`);
  }

  // 2. 封面：优先自动生成的文章封面（wx-covers/）→ 配置的 defaultThumb → 正文首图（必须永久素材）
  const firstLocal = findLocalImages(p.wxHtml)[0];
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
  if (!posts.length) { log('⚠️  没有可同步的文章'); return; }

  /* ---- 第 1 层：本地 HTML（永远执行） ---- */
  writeLocalOutputs(posts);
  const added = [], updated = [];
  for (const p of posts) {
    const hash = sha1(Buffer.from(p.raw, 'utf8'));
    const rec = state.posts[p.file];
    if (!rec) added.push(p.file);
    else if (rec.hash !== hash) updated.push(p.file);
    state.posts[p.file] = { ...(state.posts[p.file] || {}), hash, title: p.title, generatedAt: new Date().toISOString() };
  }
  log(`\n✅ 本地 HTML 已生成 ${posts.length} 篇 → wx-html/`);
  if (added.length) log(`   🆕 新增：${added.join(', ')}`);
  if (updated.length) log(`   ✏️  更新：${updated.length} 篇`);
  if (!added.length && !updated.length) log('   · 无新增/更新');

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
    return;
  }
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
      if (m && ['48001', '40001', '40164', '41001', '41002', '41004'].includes(m[1])) {
        aborted = true;
      }
    }
    saveState(state);
  }

  log('');
  if (okCount) log(`🎉 成功推送 ${okCount} 篇到草稿箱！打开「订阅号助手」或 mp.weixin.qq.com → 草稿箱 预览、确认并群发`);
  if (aborted) {
    log('⚠️  推送中止：账号级问题未解决。wx-html/ 里的成品 HTML 仍可手动复制粘贴发布，不受影响。');
    log('    修复问题后重新运行 `npm run sync` 即可续推。');
  }
}

main().catch((e) => { log(`❌ ${e.message}`); process.exit(1); });
