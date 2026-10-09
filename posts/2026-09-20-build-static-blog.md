---
title: 用零依赖 Node 脚本搭一个博客：为什么我没选 Hexo 和 Next.js
date: 2026-09-20
category: project
tags:
  - 静态站点
  - 建站
  - 部署
summary: 对比几种博客方案后，我用不到 400 行的原生 Node 脚本把 Markdown 编译成了静态站。这篇记录选型思路、目录设计和构建流程。
repo: https://github.com/yourname/devnotes
stack: Node.js, Markdown, GitHub Actions
---

## 起因

我想有一个地方，专门放三类东西：

- 学习 AI 编程时踩过的坑（报错、原因、怎么修的）
- 做完的小项目（思路、技术选型、上线过程）
- 开发工具的备忘录（命令、配置、快捷键）

试过直接用笔记软件，但笔记软件不好分享，也不方便做版本管理。还是得有个自己的站。

## 选型：先把需求写清楚

在动手之前我把要求列了一遍：

| 需求 | 说明 |
| --- | --- |
| 写作用 Markdown | 不想学新语法，复制粘贴方便 |
| 站点是纯静态 | 部署简单，免费额度足够，不怕流量 |
| 内容进 Git | 每篇文章一次提交，能追溯、能回滚 |
| 模板可改 | 想调样式时不用翻框架源码 |
| 少依赖 | 半年后回来还能跑，不用处理升级报错 |

按这几条对比了一圈：

- **Hexo**：生态成熟，但依赖几百个包，主题改动要读一堆 EJS 模板，构建慢。
- **Next.js / Astro**：功能强，但对"只写博客"来说太重，我只想写文章，不想维护一个前端工程。
- **纯手写 HTML**：最轻，但每篇文章都要复制一遍导航和页脚，改一次样式要改几十个文件。

最后我选了第四条路：**写一个自己的构建脚本**。它只做一件事 —— 把 `posts/*.md` 变成 `dist/*.html`。

## 目录结构

```text
tech-blog/
├── posts/                 # 所有文章，一篇一个 .md
│   └── 2026-09-20-build-static-blog.md
├── pages/                 # 独立页面（关于、友链等）
├── src/assets/            # 样式和脚本，会原样复制到 dist
│   ├── style.css
│   └── main.js
├── scripts/
│   ├── build.mjs          # 构建入口
│   ├── serve.mjs          # 本地预览
│   ├── new-post.mjs       # 新建文章脚手架
│   └── lib/
│       ├── markdown.mjs   # Markdown 渲染器
│       └── templates.mjs  # 页面模板
├── site.config.mjs        # 站点配置（名字、导航、分类）
└── dist/                  # 构建产物，不提交到 Git
```

关键点：**`posts/` 和 `src/` 是源码，`dist/` 是产物**。`dist/` 写进 `.gitignore`，每次部署时重新生成，这样仓库里永远只有干净的源文件。

## 文章长什么样

每篇文章靠 frontmatter 描述自己：

```markdown
---
title: 用零依赖 Node 脚本搭一个博客
date: 2026-09-20
category: project
tags:
  - 静态站点
  - 建站
summary: 一句话说明这篇文章解决了什么问题。
---

正文从这里开始……
```

`summary` 会出现在列表页和搜索结果里，写的时候顺手写一句，之后分享到公众号或社交平台也能直接当导语用。

## 构建流程

`npm run build` 做的事情很直白：

1. 清空 `dist/`
2. 读 `posts/` 下所有 `.md`，解析 frontmatter 和正文
3. 渲染成 HTML，按日期倒序排列
4. 生成首页、分类页、标签页、归档页、每篇文章页
5. 顺便生成 `search-index.json`、`rss.xml`、`sitemap.xml`
6. 复制 `src/assets/` 到 `dist/assets/`

核心代码短到可以一次读完：

```js
const posts = loadPosts();
resetDir(OUT);
write('index.html', renderHome({ site, url, posts }));
for (const p of posts) {
  write(`posts/${p.slug}.html`, renderPost({ site, url, post: p }));
}
```

## 一个意外的好处

因为渲染器是我自己写的，我可以让**同一份 Markdown 渲染出两套 HTML**：

- 渲染成网页时用 `class`，样式交给 CSS 文件
- 渲染成公众号版本时**全部写成内联 `style`**

为什么需要后者？因为公众号编辑器会过滤掉 `class` 属性和 `<style>` 标签，只保留内联样式。现在文章页右上角有个「复制到公众号」按钮，点一下复制富文本，粘贴进公众号后台就能保留标题、代码块和引用框的排版。

这个功能如果用现成框架做，得额外写一套主题 CSS 的转换逻辑；自己写渲染器的话，只是多传一个 `wx: true` 参数。

## 小结

- 需求不复杂的时候，"自己写个小工具"常常比"学一个框架"更快
- 源码和产物分开放，仓库才干净
- 自己控制渲染过程，才能顺手做出"一份内容、多端分发"这种事

后续打算把这个站的构建过程本身也整理成系列文章，包括自动部署、图床和公众号排版。
