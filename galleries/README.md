# galleries/ — 贴图 / 图集

这个目录下的每个 `.md` 文件（README.md 除外）会被 `npm run sync` 当作一条**公众号贴图（图片消息，newspic）**推送到草稿箱。与 `posts/` 不同，这里的文件**不会**出现在博客站点上。

## 文件格式

```markdown
---
title: 图集标题（必填，建议 ≤32 字）
date: 2026-10-26
summary: 摘要（可选，不填则取正文文字开头）
tags: [生活]          # 可选，会显示在自动贴图卡上
cover: true           # 可选，默认 true：自动生成 1:1 内容贴图卡作为首图（即封面）
footer: true          # 可选，默认 true：把固定尾注附在贴图文字说明末尾；false 则不加
images:               # 可选：也可以不写这里，直接在正文用 ![]() 引用
  - 01.jpg            # 裸文件名：在 galleries/、galleries/<图集名>/、galleries/img/ 中搜索
  - sub/02.png        # 相对路径（相对本 md）
  - /src/assets/x.jpg # / 开头：相对站点根目录
  - https://a.com/x.jpg  # 外链：自动下载缓存到 .wx-cache/remote/ 再上传
---

这里是贴图的文字说明（纯文本，会成为图片消息的正文）。

![图片1](01.jpg)
```

## 图片来源（三种方式随意混用）

1. **本地文件**：把图片放进 `galleries/`、`galleries/img/` 或 `galleries/<图集名>/`，md 里只写**文件名**即可，脚本会自动按 `galleries/` → `galleries/<图集名>/` → `galleries/img/` 顺序搜索。
2. **图片链接**：正文或 `images:` 里直接写 `https://...`，同步时自动下载到 `.wx-cache/remote/`（按 URL 哈希缓存，不重复下载）再上传；下载失败只警告不中断。
3. **对话框粘贴**：在 AI 助手对话里直接粘贴/发送图片，让助手存进 `galleries/img/`，然后 md 里写文件名引用。

## 规则

- 图片按出现顺序进入图集：`frontmatter images` 在前，正文图片在后；最多 **20 张**（微信限制），**首张即封面**。
- 自动贴图卡（`cover: true`，默认开）：第 1.6 层用与文章封面同款的模板，基于图集标题/摘要/标签生成一张内容图，推送时排在第 1 位（即贴图封面）；若图集照片已满 20 张放不下卡会报错，此时写 `cover: false`。
- 贴图卡比例默认 `1:1`，`wx.config.json` 里 `galleryCoverRatio` 可改 `3:4`（小红书竖图）/ `4:3` / `16:9` / `2.35:1`；卡文件在 `wx-covers/gallery-<图集名>@<比例>.png`。
- 仅支持**本地图片**与可下载的 http(s) 图片；不支持 data: 内联；不支持 **webp**（微信永久素材限制），请用 jpg/png/gif。
- `draft: true` 或 `wx: false` 可跳过单个图集。
- 本地预览：`wx-html/galleries/<slug>.html`（核对图片顺序与文字说明），总览在 `wx-html/index.html` 底部「图集」区。
- 推送后到公众号后台「草稿箱」确认并群发；文字说明（content）为纯文本，粘贴类富文本对贴图不适用。
- 想手动设计贴图/封面图：站点在线工具 `/cover.html` 支持 2.35:1 / 1:1 / 3:4 / 4:3 / 16:9 五种比例导出。
