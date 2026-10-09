# DevNotes · 开发手记

一个简约的技术个人博客。用来记录 **AI 编程学习**、**实战小项目**、**开发工具笔记** 和 **Bug 排查过程**。

特点：

- **零依赖** —— 不需要 `npm install`，只用 Node 原生能力，半年后回来照样能跑
- **Markdown 写作** —— 一篇文章一个 `.md` 文件，天然适合 Git 管理
- **一键同步公众号** —— 文章页有「复制到公众号」按钮，复制带内联样式的富文本，粘贴即保留排版
- **纯静态产物** —— `dist/` 目录可直接扔到 GitHub Pages / Vercel / Netlify / 对象存储
- **自带搜索、RSS、站点地图** —— 构建时自动生成，无需额外服务

---

## 快速开始

```bash
# 本地预览（会自动构建，并在你改文件时自动刷新）
npm run dev          # 打开 http://localhost:4321

# 只构建
npm run build        # 产物在 dist/

# 新建一篇文章
npm run new -- "Vite 环境变量踩坑记录" bug
```

> 需要 Node.js 18 或更高版本。项目没有任何第三方依赖，所以**不需要** `npm install`。

---

## 目录结构

```text
.
├── posts/                    # 所有文章（一篇一个 .md）
├── pages/                    # 独立页面，如 about.md → /about.html
├── src/assets/
│   ├── style.css             # 全站样式
│   └── main.js               # 主题切换、搜索、筛选、复制
├── scripts/
│   ├── build.mjs             # 构建入口
│   ├── serve.mjs             # 本地预览服务器（含文件监听）
│   ├── new-post.mjs          # 新建文章脚手架
│   └── lib/
│       ├── markdown.mjs      # Markdown 渲染器（含公众号内联样式模式）
│       └── templates.mjs     # HTML 页面模板
├── site.config.mjs           # 站点配置：名字、导航、分类、部署地址
├── .github/workflows/deploy.yml   # 推送到 main 自动部署到 GitHub Pages
└── dist/                     # 构建产物（已 gitignore）
```

---

## 写一篇文章

### 1. 创建文件

```bash
npm run new -- "文章标题" bug
```

第二个参数是分类，可选 `ai` / `bug` / `project` / `tools`。脚本会生成带 frontmatter 的模板文件，默认 `draft: true`（不会被构建）。

也可以手动在 `posts/` 下新建文件，命名建议：

```text
posts/2026-10-09-my-first-post.md
```

文件名里的日期会被自动剥离成 URL 的一部分（`/posts/my-first-post.html`）。

### 2. 填写 frontmatter

```markdown
---
title: Vite 保存后页面不热更新？三种原因和排查顺序
date: 2026-09-29
category: bug
tags:
  - Vite
  - 前端
summary: 一句话概括这篇文章解决了什么问题，会显示在列表页和搜索结果里。
draft: false          # 删掉这一行也可以
repo: https://github.com/you/repo    # 可选：显示「源码」链接
stack: Vite, Vue                     # 可选：技术栈
---

正文从这里开始。
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `date` | 是 | `YYYY-MM-DD`，决定排序 |
| `category` | 是 | `ai` / `bug` / `project` / `tools` |
| `tags` | 否 | 标签列表，会自动生成标签页 |
| `summary` | 建议 | 列表页和搜索结果的摘要；不写则自动截取正文开头 |
| `draft` | 否 | `true` 时跳过构建 |
| `repo` | 否 | 项目源码链接 |
| `stack` | 否 | 技术栈标签 |

### 3. 支持的 Markdown 语法

标题、段落、**粗体**、*斜体*、~~删除线~~、`行内代码`、链接、图片、有序/无序列表（含一层嵌套）、引用、围栏代码块（带语言标记）、表格、分割线。

### 4. 预览并发布

```bash
npm run dev     # 边写边看
git add -A && git commit -m "docs: 新增 xxx 笔记" && git push
```

推上去之后 GitHub Actions 会自动构建并部署，约 40 秒生效（见下文部署说明）。

---

## 同步到公众号

文章页右上角有 **「复制到公众号」** 按钮。点击后会把正文复制成**带内联样式**的富文本，直接粘贴进公众号编辑器，标题、代码块、引用框、表格的排版都会保留。

原理：`scripts/lib/markdown.mjs` 会把同一份 Markdown 渲染两遍 ——

| 模式 | 输出 | 用途 |
| --- | --- | --- |
| 网页版 | 使用 `class`，样式交给 `style.css` | 网站页面 |
| 公众号版 | 全部写成内联 `style="..."` | 复制粘贴到公众号 |

因为公众号编辑器会过滤掉 `class` 和 `<style>` 标签，只保留内联样式，所以必须渲染两份。

要调整公众号里代码块、引用的配色，改 `markdown.mjs` 里的 `WX_BLOCK` 和 `WX_INLINE` 两张表即可。

---

## 部署

### 方案 A：Cloudflare Pages（推荐）

1. 代码推到 GitHub 仓库
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub，选中刚推上去的仓库
4. 填写构建配置：

   | 配置项 | 值 |
   | --- | --- |
   | Framework preset | `None` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | 环境变量 | `NODE_VERSION` = `20` |

5. 点 **Save and Deploy**，一两分钟后会拿到 `https://<项目名>.pages.dev`

之后每次 `git push`，Cloudflare 会自动重新构建部署。

**不需要修改 `base`** —— `pages.dev` 分配的是域名根路径，保持 `base: ''` 即可。

构建脚本会自动在 `dist/` 生成 `_headers` 文件，Cloudflare Pages 会读取它来设置缓存和安全响应头（其他平台会忽略这个文件）。

拿到 `pages.dev` 域名后，建议把它填进 `site.config.mjs` 的 `url`，这样 RSS 和 sitemap 里的链接才是完整绝对地址。

> 如果不用 Cloudflare Pages，可以删掉或改造 `.github/workflows/deploy.yml`，
> 否则它会在每次推送时尝试部署到 GitHub Pages 并失败。

### 方案 B：GitHub Pages（免费）

1. 把项目推到一个 GitHub 仓库（`main` 分支）
2. 打开仓库 **Settings → Pages**，把 **Source** 改成 **GitHub Actions**
3. 如果站点地址是 `https://用户名.github.io/仓库名/`，修改 `site.config.mjs`：

   ```js
   base: '/仓库名',   // 注意：前后不要多加斜杠
   url: 'https://用户名.github.io/仓库名',
   ```

   > 这一步不能漏。否则 CSS 和页面跳转会 404，因为站点不在域名根目录下。

4. 推送代码，Actions 会自动构建部署

绑定自定义域名时，`base` 改回 `''`，`url` 改成自己的域名，并在仓库 Pages 设置里填 Custom domain。

### 方案 C：Vercel / Netlify

导入仓库后设置：

- **Build Command**：`npm run build`
- **Output Directory**：`dist`

不需要改 `base`（保持 `''`）。

### 方案 D：任意静态托管

```bash
npm run build
# 把 dist/ 整个目录上传即可
```

---

## 配置说明

所有站点级配置都在 `site.config.mjs`：

```js
export default {
  title: 'DevNotes',
  subtitle: '开发手记',
  author: '你的名字',
  url: 'https://example.com',   // 影响 RSS / sitemap / og:url
  base: '',                     // 部署到子路径时填 '/仓库名'
  repo: 'https://github.com/you/devnotes',

  nav: [...],                   // 顶部导航
  categories: { ... },          // 文章分类（key 对应 frontmatter 里的 category）
  wechat: { name: '公众号名' },  // 留空则不显示公众号模块
};
```

改完 `site.config.mjs` 后，`npm run dev` 会自动重新构建。

---

## 构建产物

`npm run build` 会在 `dist/` 下生成：

```text
dist/
├── index.html              首页（分类概览 + 文章列表 + 分类筛选）
├── archive.html            按年份归档
├── about.html              来自 pages/about.md
├── category/{ai,bug,project,tools}.html
├── tags/<标签>.html
├── posts/<slug>.html       每篇文章
├── search-index.json       站内搜索索引
├── rss.xml / sitemap.xml / robots.txt
├── 404.html
└── assets/                 样式与脚本
```

---

## 常见问题

**构建后打开 `dist/index.html` 显示没有样式？**
纯静态页面需要通过 HTTP 服务访问，不能直接双击打开（`file://` 协议下绝对路径会失效）。用 `npm run dev` 或 `npx serve dist`。

**文章没有出现在站点上？**
检查 frontmatter 里有没有 `draft: true`。

**部署到 GitHub Pages 后样式全丢？**
`site.config.mjs` 里的 `base` 没配成仓库名。

**公众号里代码块错位？**
公众号编辑器对 `<pre>` 的处理因版本而异。如果排版有偏差，可以在 `markdown.mjs` 的 `WX_BLOCK.pre` 里把 `white-space:pre` 改成 `pre-wrap` 再试。

---

## 许可

代码可自由使用和修改。文章内容版权归作者所有。
