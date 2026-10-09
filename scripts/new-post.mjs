#!/usr/bin/env node
/**
 * 新建文章脚手架
 * 用法：npm run new -- "文章标题" bug
 *   category 可选 ai | bug | project | tools，默认 tools
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../site.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS = path.join(ROOT, 'posts');

const title = process.argv[2];
let category = process.argv[3] || 'tools';

if (!title) {
  console.log('\n用法：npm run new -- "文章标题" [ai|bug|project|tools]\n');
  process.exit(1);
}
if (!site.categories[category]) {
  console.log(`\n⚠️  未知分类 "${category}"，已回退为 tools。可选：${Object.keys(site.categories).join(' / ')}\n`);
  category = 'tools';
}

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const slug = title.toLowerCase()
  .replace(/[\s_]+/g, '-')
  .replace(/[^\w\u4e00-\u9fff-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '') || 'untitled';

const file = path.join(POSTS, `${date}-${slug}.md`);
if (fs.existsSync(file)) {
  console.log(`\n⚠️  文件已存在：${file}\n`);
  process.exit(1);
}

const tpl = `---
title: ${title}
date: ${date}
category: ${category}
tags:
  - 待补充
summary: 用一两句话概括这篇文章解决了什么问题，会显示在列表页和搜索结果里。
draft: true
---

## 背景

（什么场景下遇到的？）

## 现象

（报错信息、截图描述、复现步骤）

\`\`\`bash
# 相关命令
\`\`\`

## 原因

（根因是什么）

## 解决

（一步一步怎么改的）

## 小结

- 关键结论一
- 关键结论二

> 写完后把 frontmatter 里的 \`draft: true\` 删掉或改成 false，文章才会出现在站点上。
`;

fs.mkdirSync(POSTS, { recursive: true });
fs.writeFileSync(file, tpl, 'utf8');

console.log(`\n✅ 已创建：posts/${path.basename(file)}`);
console.log(`   分类：${site.categories[category].name}（${category}）`);
console.log(`   提示：文章默认 draft: true，写完后删掉这一行即可发布。\n`);
console.log(`   运行 npm run dev 可以边写边看效果。\n`);
