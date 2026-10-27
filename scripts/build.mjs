#!/usr/bin/env node
/**
 * 静态站点构建脚本（零依赖）
 * 运行：npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import site from '../site.config.mjs';
import { parseFrontmatter, parseBlocks, renderBlocks, blocksToText, readingTime } from './lib/markdown.mjs';
import * as T from './lib/templates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const PAGES_DIR = path.join(ROOT, 'pages');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets');
const GALLERIES_DIR = path.join(ROOT, 'galleries');
const OUT = path.join(ROOT, 'dist');

const url = T.makeUrl(site.base);
const log = (...a) => console.log(...a);

/* --------------------------------- utils --------------------------------- */

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

function copyDir(src, dest, filter = null) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (filter && !filter(s, entry)) continue;
    if (entry.isDirectory()) { n += copyDir(s, d, filter); continue; }
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
    n++;
  }
  return n;
}

/** frontmatter 里空值会被解析成 []，这里统一成字符串 */
const str = (v) => (Array.isArray(v) ? '' : v == null ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [String(v)] : []);

function stripMd(text) {
  return String(text).replace(/[`*_~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
}

function toSlug(fileName) {
  // 2026-10-05-my-post.md -> my-post
  return fileName.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}[-_]/, '');
}

/* -------------------------------- 读取文章 -------------------------------- */

function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) { log('⚠️  posts/ 目录不存在，跳过文章'); return []; }
  const posts = [];

  for (const file of fs.readdirSync(POSTS_DIR).filter((f) => /\.md$/i.test(f))) {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);

    if (String(data.draft) === 'true') { log(`   · 跳过草稿 ${file}`); continue; }

    const blocks = parseBlocks(body);
    const web = renderBlocks(blocks, false);
    const wx = renderBlocks(blocks, true);
    const plain = blocksToText(blocks);

    const title = str(data.title) || stripMd(body.split('\n').find((l) => /^#\s+/.test(l)) || '').replace(/^#\s+/, '') || toSlug(file);
    const date = str(data.date) || file.slice(0, 10);
    const category = str(data.category) || 'tools';
    const tags = arr(data.tags).map((t) => String(t));
    const summary = str(data.summary) || str(data.description) || plain.slice(0, 110) + (plain.length > 110 ? '…' : '');

    posts.push({
      file,
      slug: str(data.slug) || toSlug(file),
      title,
      date,
      category,
      tags,
      summary,
      repo: str(data.repo),
      stack: arr(data.stack),
      html: web.html,
      wxHtml: wx.html,
      headings: web.headings,
      plain,
      readingTime: readingTime(plain),
      wordCount: plain.replace(/\s/g, '').length,
    });
  }

  posts.sort((a, b) => (a.date === b.date ? (a.slug < b.slug ? 1 : -1) : a.date < b.date ? 1 : -1));
  return posts;
}

/* --------------------------------- 读取页面 -------------------------------- */

function loadPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  return fs.readdirSync(PAGES_DIR).filter((f) => /\.md$/i.test(f)).map((file) => {
    const raw = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    const blocks = parseBlocks(body);
    const { html } = renderBlocks(blocks, false);
    const name = file.replace(/\.md$/i, '');
    return {
      file,
      name,
      slug: str(data.slug) || name,
      title: str(data.title) || name,
      summary: str(data.summary),
      navKey: str(data.nav) || name,
      path: `/${(str(data.slug) || name)}.html`,
      html,
    };
  });
}

/* --------------------------------- 订阅文件 -------------------------------- */

function renderRss(posts) {
  const base = (site.url || '').replace(/\/+$/, '');
  const items = posts.slice(0, 20).map((p) => `    <item>
      <title>${T.h(p.title)}</title>
      <link>${base}${url(`/posts/${p.slug}.html`)}</link>
      <guid isPermaLink="true">${base}${url(`/posts/${p.slug}.html`)}</guid>
      <pubDate>${new Date(`${p.date}T08:00:00+08:00`).toUTCString()}</pubDate>
      ${p.tags.map((t) => `<category>${T.h(t)}</category>`).join('\n      ')}
      <description>${T.h(p.summary)}</description>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${T.h(site.title)} · ${T.h(site.subtitle)}</title>
    <link>${base}/</link>
    <description>${T.h(site.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${base}${url('/rss.xml')}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

function renderSitemap(posts, pages) {
  const base = (site.url || '').replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { loc: '/', lastmod: today, priority: '1.0' },
    { loc: '/archive.html', lastmod: today, priority: '0.5' },
    { loc: '/cover.html', lastmod: today, priority: '0.5' },
    ...pages.map((p) => ({ loc: p.path, lastmod: today, priority: '0.5' })),
    ...Object.keys(site.categories).map((k) => ({ loc: `/category/${k}.html`, lastmod: today, priority: '0.6' })),
    ...posts.map((p) => ({ loc: `/posts/${p.slug}.html`, lastmod: p.date, priority: '0.8' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${base}${url(e.loc)}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority></url>`).join('\n')}
</urlset>
`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2f6fed"/>
  <path d="M24 22 15 32l9 10M40 22l9 10-9 10M35 18l-6 28" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

/* ---------------------------------- 主流程 --------------------------------- */

function build() {
  const t0 = Date.now();
  log('\n📦 开始构建 DevNotes 静态站点\n');

  const posts = loadPosts();
  const pages = loadPages();
  const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort();

  resetDir(OUT);

  // 静态资源
  const assetCount = copyDir(ASSETS_DIR, path.join(OUT, 'assets'));

  // galleries/ 里的图片（文章正文贴图、图集配图）也进构建产物；
  // 只复制图片类文件，.md 说明文件不发布到线上。
  const isImage = (f) => /\.(png|jpe?g|gif|webp|svg|avif|ico)$/i.test(f);
  const galleryCount = copyDir(GALLERIES_DIR, path.join(OUT, 'galleries'), (s, entry) => {
    if (entry.isDirectory()) return true;
    return isImage(entry.name);
  });
  write('favicon.svg', FAVICON);
  write('robots.txt', `User-agent: *\nAllow: /\n${site.url ? `Sitemap: ${site.url.replace(/\/+$/, '')}${url('/sitemap.xml')}\n` : ''}`);

  // Cloudflare Pages 专属：读取构建产物根目录下的 _headers 文件来设置响应头。
  // 其他平台（Vercel/Netlify）会忽略它，不影响使用。
  write('_headers', [
    '# 由 scripts/build.mjs 生成，请勿手动修改',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=86400',
    '',
    '/*.html',
    '  Cache-Control: public, max-age=0, must-revalidate',
    '',
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: SAMEORIGIN',
    '',
  ].join('\n'));

  // 首页
  write('index.html', T.renderHome({
    site, url, posts,
    stats: { posts: posts.length, tags: allTags.length, latest: posts[0]?.date || '' },
  }));

  // 分类页
  for (const [key, cat] of Object.entries(site.categories)) {
    write(`category/${key}.html`, T.renderCategory({
      site, url, category: key, cat, posts: posts.filter((p) => p.category === key),
    }));
  }

  // 标签页
  for (const tag of allTags) {
    write(`tags/${encodeURIComponent(tag)}.html`, T.renderTag({
      site, url, tag, posts: posts.filter((p) => p.tags.includes(tag)),
    }));
  }

  // 归档
  write('archive.html', T.renderArchive({ site, url, posts }));

  // 公众号封面工具页（在线设计器，/cover.html）
  write('cover.html', T.renderCoverTool({ site, url }));

  // 文章页
  posts.forEach((post, i) => {
    write(`posts/${post.slug}.html`, T.renderPost({
      site, url, post,
      prev: posts[i + 1] || null,   // 更早的一篇
      next: posts[i - 1] || null,   // 更新的一篇
    }));
  });

  // 独立页面
  for (const pg of pages) {
    write(pg.path.replace(/^\//, ''), T.renderPage({ site, url, page: pg, navKey: pg.navKey }));
  }

  // 搜索索引
  write('search-index.json', JSON.stringify(posts.map((p) => ({
    slug: p.slug, title: p.title, date: p.date, category: p.category,
    tags: p.tags, summary: p.summary, text: p.plain.slice(0, 800),
  }))));

  // 订阅与地图
  write('rss.xml', renderRss(posts));
  write('sitemap.xml', renderSitemap(posts, pages));
  write('404.html', T.render404({ site, url }));
  write('.nojekyll', '');

  const ms = Date.now() - t0;
  log(`✅ 构建完成（${ms}ms）`);
  log(`   文章 ${posts.length} 篇 · 标签 ${allTags.length} 个 · 独立页面 ${pages.length} 个 · 资源 ${assetCount + galleryCount} 个`);
  log(`   ${posts.slice(0, 3).map((p) => p.title).join(' / ')}${posts.length > 3 ? ' …' : ''}`);
  log(`   输出目录：${OUT}\n`);
}

build();
