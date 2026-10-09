/* ==========================================================================
   DevNotes 前端交互
   主题切换 / 站内搜索 / 分类筛选 / 一键复制到公众号 / 代码复制 / 目录高亮
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  var BASE = (script && script.dataset.base) || '/';
  if (!BASE.endsWith('/')) BASE += '/';
  var link = function (p) { return BASE + String(p).replace(/^\//, ''); };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------ 主题切换 ------------------------------ */

  var themeBtn = $('.theme-toggle');
  if (themeBtn) {
    var syncThemeBtn = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeBtn.textContent = dark ? '☀' : '◐';
      themeBtn.setAttribute('aria-label', dark ? '切换到亮色模式' : '切换到暗色模式');
    };
    syncThemeBtn();
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncThemeBtn();
    });
  }

  /* ------------------------------ 移动端导航 ------------------------------ */

  var navToggle = $('.nav-toggle');
  var siteNav = $('.site-nav');
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', function () {
      var open = siteNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ------------------------------ 回到顶部 ------------------------------ */

  var toTop = $('.to-top');
  if (toTop) {
    var onScroll = function () { toTop.classList.toggle('show', window.scrollY > 620); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ------------------------------ 首页分类筛选 ------------------------------ */

  var pills = $$('.pill[data-filter]');
  if (pills.length) {
    var cards = $$('#post-list .card');
    var emptyTip = $('.filter-empty');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        var f = pill.dataset.filter;
        var shown = 0;
        cards.forEach(function (card) {
          var ok = f === 'all' || card.dataset.cat === f;
          card.hidden = !ok;
          if (ok) shown++;
        });
        if (emptyTip) emptyTip.hidden = shown !== 0;
      });
    });
  }

  /* ------------------------------ 复制工具 ------------------------------ */

  function copyRich(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]).then(function () { return true; }).catch(function () { return copyLegacy(html); });
    }
    return Promise.resolve(copyLegacy(html));
  }

  function copyLegacy(html) {
    try {
      var box = document.createElement('div');
      box.setAttribute('contenteditable', 'true');
      box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      box.innerHTML = html;
      document.body.appendChild(box);
      var range = document.createRange();
      range.selectNodeContents(box);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = document.execCommand('copy');
      sel.removeAllRanges();
      document.body.removeChild(box);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function flash(btn, text) {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = text;
    btn.classList.add('done');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1800);
  }

  // 复制到公众号：复制带内联样式的富文本，粘贴进公众号编辑器可保留排版
  var wxBtn = $('[data-copy-wechat]');
  if (wxBtn) {
    wxBtn.addEventListener('click', function () {
      var src = $('#wechat-source');
      var body = $('#post-body');
      if (!src) return;
      var title = ($('.post-title') || {}).textContent || document.title;
      var html = '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.45;font-weight:700;color:#111111;">'
        + esc(title) + '</h1>' + src.innerHTML.trim();
      copyRich(html, body ? body.innerText : src.innerText).then(function (ok) {
        flash(wxBtn, ok ? '✓ 已复制，去公众号粘贴' : '复制失败，请手动选中');
      });
    });
  }

  var linkBtn = $('[data-copy-link]');
  if (linkBtn) {
    linkBtn.addEventListener('click', function () {
      var url = window.location.href;
      var done = function () { flash(linkBtn, '✓ 链接已复制'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () {
          copyLegacy(esc(url)) && done();
        });
      } else {
        copyLegacy(esc(url)) && done();
      }
    });
  }

  // 代码块复制
  $$('.code-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = $('code', btn.parentElement);
      if (!code) return;
      var text = code.textContent;
      var done = function () { flash(btn, '已复制'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { copyLegacy(esc(text)) && done(); });
      } else {
        copyLegacy(esc(text)) && done();
      }
    });
  });

  /* ------------------------------ 站内搜索 ------------------------------ */

  var modal = $('#search-modal');
  var input = $('#search-input');
  var results = $('#search-results');
  var openBtn = $('.search-open');
  var index = null;
  var loading = false;
  var activeIdx = -1;

  function loadIndex() {
    if (index || loading) return Promise.resolve(index || []);
    loading = true;
    return fetch(link('search-index.json'))
      .then(function (r) { return r.json(); })
      .then(function (d) { index = d; loading = false; return d; })
      .catch(function () { loading = false; return []; });
  }

  function openSearch() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    loadIndex().then(function () { if (input) input.focus(); });
  }

  function closeSearch() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  function highlight(text, kw) {
    var safe = esc(text);
    if (!kw) return safe;
    try {
      var re = new RegExp('(' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return safe.replace(re, '<mark>$1</mark>');
    } catch (e) { return safe; }
  }

  function snippet(text, kw) {
    if (!text) return '';
    var lower = text.toLowerCase();
    var pos = lower.indexOf(kw.toLowerCase());
    if (pos < 0) return text.slice(0, 88);
    var start = Math.max(0, pos - 34);
    return (start > 0 ? '…' : '') + text.slice(start, start + 96) + '…';
  }

  function doSearch(kw) {
    kw = String(kw || '').trim();
    activeIdx = -1;
    if (!kw) {
      results.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>';
      return;
    }
    var k = kw.toLowerCase();
    var hits = (index || []).map(function (p) {
      var score = 0;
      if (p.title.toLowerCase().indexOf(k) >= 0) score += 100;
      if ((p.tags || []).join(',').toLowerCase().indexOf(k) >= 0) score += 40;
      if ((p.summary || '').toLowerCase().indexOf(k) >= 0) score += 22;
      if ((p.text || '').toLowerCase().indexOf(k) >= 0) score += 10;
      return { p: p, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || (a.p.date < b.p.date ? 1 : -1); })
      .slice(0, 12);

    if (!hits.length) {
      results.innerHTML = '<p class="search-hint">没有找到「' + esc(kw) + '」相关的文章</p>';
      return;
    }

    results.innerHTML = hits.map(function (x) {
      var p = x.p;
      return '<a class="sr-item" href="' + esc(link('posts/' + p.slug + '.html')) + '">'
        + '<div class="sr-title">' + highlight(p.title, kw) + '</div>'
        + '<div class="sr-meta"><span>' + esc(p.date) + '</span>'
        + (p.tags || []).slice(0, 3).map(function (t) { return '<span># ' + esc(t) + '</span>'; }).join('')
        + '</div>'
        + '<div class="sr-text">' + highlight(snippet(p.summary || p.text, kw), kw) + '</div>'
        + '</a>';
    }).join('');
  }

  if (openBtn) openBtn.addEventListener('click', openSearch);
  var closeBtn = $('.search-close');
  if (closeBtn) closeBtn.addEventListener('click', closeSearch);
  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSearch(); });
  }

  if (input) {
    input.addEventListener('input', function () { doSearch(input.value); });
    input.addEventListener('keydown', function (e) {
      var items = $$('.sr-item', results);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        activeIdx += e.key === 'ArrowDown' ? 1 : -1;
        if (activeIdx < 0) activeIdx = items.length - 1;
        if (activeIdx >= items.length) activeIdx = 0;
        items.forEach(function (el, i) { el.classList.toggle('active', i === activeIdx); });
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        var target = items[activeIdx] || items[0];
        if (target) window.location.href = target.getAttribute('href');
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    var metaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    if (metaK) { e.preventDefault(); modal && modal.hidden ? openSearch() : closeSearch(); return; }
    if (e.key === 'Escape' && modal && !modal.hidden) { closeSearch(); return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && modal && modal.hidden) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ------------------------------ 目录高亮 ------------------------------ */

  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var el = document.getElementById(id);
      if (el) map[id] = a;
    });
    var visible = new Set();
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target.id);
        else visible.delete(en.target.id);
      });
      var first = null;
      $$('.post-body h2, .post-body h3').forEach(function (head) {
        if (!first && visible.has(head.id)) first = head.id;
      });
      tocLinks.forEach(function (a) { a.classList.remove('active'); });
      if (first && map[first]) map[first].classList.add('active');
    }, { rootMargin: '-84px 0px -68% 0px', threshold: 0 });
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) obs.observe(el);
    });
  }
})();
