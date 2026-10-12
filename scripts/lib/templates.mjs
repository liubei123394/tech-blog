/**
 * HTML 页面模板 —— 全部是纯函数，输入数据、输出 HTML 字符串。
 */

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/** 处理站点部署子路径，保证 GitHub Pages 项目页也能正常跳转 */
export function makeUrl(base) {
  const b = (base || '').replace(/\/+$/, '');
  return (p) => {
    if (!p) return b + '/';
    if (/^https?:\/\//i.test(p)) return p;
    return b + (p.startsWith('/') ? p : '/' + p);
  };
}

export function formatDate(d) {
  if (!d) return '';
  const str = String(d);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return str;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function formatDateCN(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (!m) return String(d || '');
  const months = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  return `${m[1]} 年 ${months[Number(m[2]) - 1]}月${Number(m[3])}日`;
}

/* ============================== 通用片段 ============================== */

export function postCard(post, site, url) {
  const cat = site.categories[post.category] || { name: post.category, icon: '' };
  const tags = (post.tags || []).slice(0, 3).map((t) => `<a class="tag" href="${url(`/tags/${encodeURIComponent(t)}.html`)}">${h(t)}</a>`).join('');
  const repo = post.repo ? `<a class="tag tag-repo" href="${h(post.repo)}" target="_blank" rel="noopener">源码 ↗</a>` : '';
  return `<article class="card" data-cat="${h(post.category)}" data-tags="${h((post.tags || []).join(','))}">
  <div class="card-top">
    <a class="cat cat-${h(post.category)}" href="${url(`/category/${post.category}.html`)}"><span class="cat-icon">${cat.icon}</span>${h(cat.name)}</a>
    <time datetime="${h(post.date)}">${formatDate(post.date)}</time>
  </div>
  <h3 class="card-title"><a href="${url(`/posts/${post.slug}.html`)}">${h(post.title)}</a></h3>
  <p class="card-excerpt">${h(post.summary || '')}</p>
  <div class="card-bot">
    <div class="card-tags">${tags}${repo}</div>
    <span class="card-read">${post.readingTime} 分钟</span>
  </div>
</article>`;
}

export function postList(posts, site, url) {
  if (!posts.length) {
    return `<div class="empty"><p>这里还没有文章。</p><p class="empty-sub">在 <code>posts/</code> 目录新建一个 <code>.md</code> 文件就能开始写了。</p></div>`;
  }
  return `<div class="post-grid">${posts.map((p) => postCard(p, site, url)).join('\n')}</div>`;
}

/* ================================ 布局 ================================ */

export function layout({ site, page, content, url }) {
  const title = page.title ? `${page.title} · ${site.title}` : `${site.title} · ${site.subtitle}`;
  const desc = page.description || site.description;
  const canonical = site.url ? site.url.replace(/\/+$/, '') + url(page.path || '/') : '';

  const nav = site.nav.map((n) => {
    const active = n.key === page.active ? ' class="active"' : '';
    return `<a href="${url(n.href)}"${active}>${h(n.label)}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${h(title)}</title>
<meta name="description" content="${h(desc)}">
${page.keywords ? `<meta name="keywords" content="${h(page.keywords)}">` : ''}
${canonical ? `<link rel="canonical" href="${h(canonical)}">` : ''}
<meta property="og:type" content="${page.type === 'article' ? 'article' : 'website'}">
<meta property="og:title" content="${h(page.title || site.title)}">
<meta property="og:description" content="${h(desc)}">
${canonical ? `<meta property="og:url" content="${h(canonical)}">` : ''}
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${url('/favicon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${h(site.title)}" href="${url('/rss.xml')}">
<link rel="stylesheet" href="${url('/assets/style.css')}">
<script>
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
</script>
${page.extraHead || ''}
</head>
<body>
<a class="skip" href="#main">跳到正文</a>
<header class="site-header">
  <div class="wrap header-inner">
    <button class="nav-toggle" type="button" aria-label="展开导航" aria-expanded="false"><span></span><span></span><span></span></button>
    <nav class="site-nav" aria-label="主导航">${nav}
      <button class="icon-btn search-open" type="button" aria-label="搜索">⌕</button>
      <button class="icon-btn theme-toggle" type="button" aria-label="切换主题">◐</button>
    </nav>
  </div>
</header>

<div class="search-modal" id="search-modal" hidden>
  <div class="search-box">
    <div class="search-input-row">
      <span class="search-ico">⌕</span>
      <input type="search" id="search-input" placeholder="搜索标题、标签或正文关键词…" autocomplete="off">
      <button class="search-close" type="button" aria-label="关闭">Esc</button>
    </div>
    <div class="search-results" id="search-results"><p class="search-hint">输入关键词开始搜索</p></div>
  </div>
</div>

<main id="main">
${content}
</main>

<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-col">
      <p class="footer-brand">${h(site.footer.brand || `${site.title} · ${site.subtitle}`)}</p>
      <p class="footer-note">${h(site.footer.note)}</p>
    </div>
    <div class="footer-col footer-links">
      <a href="${url('/rss.xml')}">RSS 订阅</a>
      ${site.repo ? `<a href="${h(site.repo)}" target="_blank" rel="noopener">GitHub</a>` : ''}
      <a href="${url('/archive.html')}">全部文章</a>
      <a href="${url('/about.html')}">关于与联系</a>
    </div>
    ${
      site.wechat && site.wechat.name
        ? `<div class="footer-col footer-wechat">
      <p class="footer-brand">公众号</p>
      <p class="footer-note">${h(site.wechat.name)} · ${h(site.wechat.slogan || '')}</p>
    </div>`
        : ''
    }
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ${h(site.author)}</span>
    ${site.icp ? `<span>${h(site.icp)}</span>` : ''}
  </div>
</footer>

<button class="to-top" type="button" aria-label="回到顶部">↑</button>
<script src="${url('/assets/main.js')}" data-base="${url('')}" defer></script>
</body>
</html>`;
}

/* =============================== 首页 =============================== */

export function renderHome({ site, url, posts, stats }) {
  const cats = Object.entries(site.categories).map(([key, c]) => {
    const n = posts.filter((p) => p.category === key).length;
    return `<a class="cat-card cat-${key}" href="${url(`/category/${key}.html`)}">
      <span class="cat-card-icon">${c.icon}</span>
      <span class="cat-card-body"><strong>${h(c.name)}</strong><em>${h(c.desc)}</em></span>
      <span class="cat-card-num">${n}</span>
    </a>`;
  }).join('\n');

  const content = `<section class="hero">
  <div class="wrap">
    <h1 class="hero-title">${h(site.home.heading)}</h1>
    <p class="hero-intro">${h(site.home.intro)}</p>
    <div class="hero-stats">
      <span><strong>${stats.posts}</strong> 篇文章</span>
      <span><strong>${stats.tags}</strong> 个标签</span>
      <span>最近更新 <strong>${formatDate(stats.latest)}</strong></span>
    </div>
  </div>
</section>

<section class="wrap section">
  <h2 class="section-title">文章分类</h2>
  <div class="cat-grid">${cats}</div>
</section>

<section class="wrap section">
  <div class="section-head">
    <h2 class="section-title">最新文章</h2>
    <div class="filter-bar">
      <button class="pill active" type="button" data-filter="all">全部</button>
      ${Object.entries(site.categories).map(([k, c]) => `<button class="pill" type="button" data-filter="${k}">${h(c.name)}</button>`).join('')}
    </div>
  </div>
  <div id="post-list">${postList(posts, site, url)}</div>
  <p class="filter-empty" hidden>没有符合条件的文章。</p>
</section>`;

  return layout({
    site,
    url,
    page: { title: '', description: site.description, active: 'home', path: '/' },
    content,
  });
}

/* ============================== 分类 / 标签 ============================== */

export function renderCategory({ site, url, category, cat, posts }) {
  const content = `<section class="wrap page-head">
  <nav class="crumb"><a href="${url('/')}">首页</a><span>/</span><span>${h(cat.name)}</span></nav>
  <h1 class="page-title"><span class="cat-icon cat-${category}">${cat.icon}</span>${h(cat.name)}</h1>
  <p class="page-desc">${h(cat.desc)}</p>
  <p class="page-count">共 ${posts.length} 篇</p>
</section>
<section class="wrap section">${postList(posts, site, url)}</section>`;

  return layout({
    site,
    url,
    page: { title: cat.name, description: cat.desc, active: category, path: `/category/${category}.html` },
    content,
  });
}

export function renderTag({ site, url, tag, posts }) {
  const content = `<section class="wrap page-head">
  <nav class="crumb"><a href="${url('/')}">首页</a><span>/</span><span>标签</span></nav>
  <h1 class="page-title"># ${h(tag)}</h1>
  <p class="page-count">共 ${posts.length} 篇</p>
</section>
<section class="wrap section">${postList(posts, site, url)}</section>`;

  return layout({
    site,
    url,
    page: { title: `标签：${tag}`, description: `标签 ${tag} 下的全部文章`, active: '', path: `/tags/${encodeURIComponent(tag)}.html` },
    content,
  });
}

/* =============================== 归档 =============================== */

export function renderArchive({ site, url, posts }) {
  const byYear = new Map();
  posts.forEach((p) => {
    const y = String(p.date || '').slice(0, 4) || '未分类';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(p);
  });

  const groups = [...byYear.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([year, list]) => `
  <div class="archive-year">
    <h2 class="archive-year-title">${h(year)}<span>${list.length} 篇</span></h2>
    <ul class="archive-list">
      ${list.map((p) => {
        const cat = site.categories[p.category] || { name: p.category };
        return `<li>
        <time datetime="${h(p.date)}">${formatDate(p.date)}</time>
        <a href="${url(`/posts/${p.slug}.html`)}">${h(p.title)}</a>
        <span class="archive-cat">${h(cat.name)}</span>
      </li>`;
      }).join('')}
    </ul>
  </div>`).join('\n');

  const content = `<section class="wrap page-head">
  <nav class="crumb"><a href="${url('/')}">首页</a><span>/</span><span>归档</span></nav>
  <h1 class="page-title">全部文章</h1>
  <p class="page-count">共 ${posts.length} 篇，按时间倒序</p>
</section>
<section class="wrap section archive">${groups}</section>`;

  return layout({
    site,
    url,
    page: { title: '归档', description: '按时间浏览全部文章', active: 'archive', path: '/archive.html' },
    content,
  });
}

/* =============================== 文章页 =============================== */

export function renderPost({ site, url, post, prev, next }) {
  const cat = site.categories[post.category] || { name: post.category, icon: '' };
  const tags = (post.tags || []).map((t) => `<a class="tag" href="${url(`/tags/${encodeURIComponent(t)}.html`)}"># ${h(t)}</a>`).join('');

  const toc = post.headings.length >= 3
    ? `<aside class="toc">
    <p class="toc-title">本页目录</p>
    <ul>${post.headings.filter((x) => x.level <= 3).map((x) => `<li class="toc-l${x.level}"><a href="#${x.id}">${h(x.text)}</a></li>`).join('')}</ul>
  </aside>`
    : '';

  const editUrl = site.repo ? `${site.repo.replace(/\/+$/, '')}/edit/${site.repoBranch || 'main'}/posts/${post.file}` : '';
  const wechatNote = site.wechat && site.wechat.name
    ? `<div class="wechat-tip"><strong>同步到公众号</strong><p>点击下方按钮复制带排版的正文，粘贴进公众号编辑器即可保留标题、代码块、引用等样式。</p></div>`
    : '';

  const navLinks = (prev || next)
    ? `<nav class="post-nav">
    ${prev ? `<a class="post-nav-item prev" href="${url(`/posts/${prev.slug}.html`)}"><span>上一篇</span><strong>${h(prev.title)}</strong></a>` : '<span></span>'}
    ${next ? `<a class="post-nav-item next" href="${url(`/posts/${next.slug}.html`)}"><span>下一篇</span><strong>${h(next.title)}</strong></a>` : '<span></span>'}
  </nav>`
    : '';

  const content = `<div class="wrap post-layout${toc ? '' : ' no-toc'}">
  <article class="post">
    <header class="post-head">
      <nav class="crumb"><a href="${url('/')}">首页</a><span>/</span><a href="${url(`/category/${post.category}.html`)}">${h(cat.name)}</a></nav>
      <h1 class="post-title">${h(post.title)}</h1>
      ${post.summary ? `<p class="post-summary">${h(post.summary)}</p>` : ''}
      <div class="post-meta">
        <time datetime="${h(post.date)}">${formatDate(post.date)}</time>
        <span class="dot">·</span><span>${post.readingTime} 分钟阅读</span>
        <span class="dot">·</span><span>${post.wordCount} 字</span>
      </div>
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
    </header>

    <div class="post-actions">
      ${site.wechat && site.wechat.name ? '<button class="btn btn-primary" type="button" data-copy-wechat>复制到公众号</button>' : ''}
      <button class="btn" type="button" data-copy-link>复制链接</button>
      ${editUrl ? `<a class="btn" href="${h(editUrl)}" target="_blank" rel="noopener">编辑此页</a>` : ''}
    </div>
    ${wechatNote}

    <div class="post-body" id="post-body">
${post.html}
    </div>

    <div id="wechat-source" hidden>
${post.wxHtml}
    </div>

    ${navLinks}
  </article>
  ${toc}
</div>`;

  return layout({
    site,
    url,
    page: {
      title: post.title,
      description: post.summary || site.description,
      keywords: (post.tags || []).join(','),
      active: post.category,
      path: `/posts/${post.slug}.html`,
      type: 'article',
    },
    content,
  });
}

/* ============================== 独立页面 ============================== */

export function renderPage({ site, url, page: pg, navKey = '' }) {
  const content = `<section class="wrap page-head">
  <nav class="crumb"><a href="${url('/')}">首页</a><span>/</span><span>${h(pg.title)}</span></nav>
  <h1 class="page-title">${h(pg.title)}</h1>
  ${pg.summary ? `<p class="page-desc">${h(pg.summary)}</p>` : ''}
</section>
<section class="wrap section"><article class="post post-single"><div class="post-body">
${pg.html}
</div></article></section>`;

  return layout({
    site,
    url,
    page: { title: pg.title, description: pg.summary || site.description, active: navKey, path: pg.path },
    content,
  });
}

export function render404({ site, url }) {
  const content = `<section class="wrap page-head not-found">
  <p class="nf-code">404</p>
  <h1 class="page-title">这个页面不见了</h1>
  <p class="page-desc">链接可能已经失效，或者文章还没写。</p>
  <p class="nf-actions"><a class="btn btn-primary" href="${url('/')}">回到首页</a><a class="btn" href="${url('/archive.html')}">看看全部文章</a></p>
</section>`;

  return layout({
    site,
    url,
    page: { title: '页面不存在', description: '404', active: '', path: '/404.html' },
    content,
  });
}
