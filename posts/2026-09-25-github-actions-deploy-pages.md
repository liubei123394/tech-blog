---
title: GitHub Actions 自动部署到 Pages：改完文章 push 一下就上线
date: 2026-09-25
category: tools
tags:
  - GitHub Actions
  - 部署
  - CI/CD
summary: 记录从手动上传 dist 到 push 后自动构建部署的完整过程，包含权限配置、base 路径这两个最容易踩的坑。
---

## 为什么不用手动部署

一开始我是本地 `npm run build`，然后把 `dist/` 拖到托管平台。用了两次就烦了：

- 换电脑就得重新配环境
- 容易忘记构建，推上去的是旧内容
- 没法确认"仓库里这份代码到底能不能构建成功"

交给 GitHub Actions 之后，流程变成：写文章 → `git push` → 等一分钟 → 自动上线。

## 基本流程

在仓库里放一个 workflow 文件：

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

因为项目零依赖，我把 `npm ci` 那一步也省了 —— 没有 `node_modules` 要装，构建直接跑。

## 坑一：Settings 里要先选 Source

第一次跑完 workflow 全是绿的，但站点打开是 404。原因是仓库的 **Settings → Pages → Build and deployment → Source** 还是默认的 "Deploy from a branch"，需要手动切成 **GitHub Actions**。

这个设置只需要改一次，但大多数人第一次都会漏掉，然后对着成功的构建日志发呆。

## 坑二：子路径导致样式和链接全挂

用 `https://用户名.github.io/仓库名/` 这种地址时，站点不在域名根目录，而在 `/仓库名/` 下面。

结果就是：

- `/assets/style.css` 请求到了 `https://用户名.github.io/assets/style.css` → 404
- 文章之间的跳转全部 404

解决办法是在配置里加一个 `base`：

```js
// site.config.mjs
export default {
  base: '/tech-blog',   // 仓库名，前后都要有斜杠的语义自己处理
  // ...
};
```

然后所有链接统一走一个函数生成：

```js
const url = (p) => {
  const b = base.replace(/\/+$/, '');
  return b + (p.startsWith('/') ? p : '/' + p);
};
```

模板里不再直接写 `/assets/style.css`，而是写 `url('/assets/style.css')`。这样本地开发（`base` 为空）和线上子路径部署都能正常工作。

## 坑三：404 页面

Pages 服务对找不到的路径会返回站点根目录的 `404.html`。所以需要生成一个 404 页面，否则用户看到的是 GitHub 的默认页，和站点风格完全不搭。

另外如果项目不用 Jekyll，建议在输出目录里放一个空的 `.nojekyll` 文件，跳过 Jekyll 处理，能省几秒构建时间，也避免某些以下划线开头的文件被忽略。

## 现在的发布流程

```bash
# 写一篇文章
npm run new -- "K8s 本地环境搭建" tools

# 本地预览，确认样式没问题
npm run dev

# 推上去，剩下的交给 Actions
git add -A
git commit -m "docs: 新增 K8s 本地环境搭建笔记"
git push
```

推完大约 40 秒，站点就更新了。手机上看公众号草稿的同时，网页版也已经上线。

## 小结

- `permissions` 和 Pages 的 Source 设置是最容易漏的两处
- 部署到子路径时，所有资源引用都必须走统一的 `url()` 函数
- 零依赖的构建脚本让 CI 配置简单很多，不需要缓存 `node_modules` 那套东西
