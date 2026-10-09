---
title: Git 提交信息怎么写：一套能坚持下来的规范
date: 2026-10-08
category: tools
tags:
  - Git
  - 规范
  - 备忘录
summary: 从「update」「fix bug」到能自动生成更新日志，记录我实际在用的提交规范，以及怎么用工具强制自己遵守。
---

## 问题

以前我的提交记录长这样：

```text
update
fix bug
改了一下
再改
最终版
最终版2
```

三个月后回头找"上次改播放器音量是在哪个提交"，完全找不到。

## 我用的格式

```
<类型>(<范围>): <简短描述>

<可选的详细说明>

<可选的关联 issue>
```

只有前两段是强制的。实际提交时常用的是这些：

| 类型 | 用在哪 |
| --- | --- |
| `feat` | 新增功能 |
| `fix` | 修 bug |
| `docs` | 只改文档、注释、README |
| `style` | 格式调整，不影响逻辑（空格、分号、缩进） |
| `refactor` | 重构，既不加功能也不修 bug |
| `perf` | 性能优化 |
| `test` | 加测试或改测试 |
| `chore` | 构建流程、依赖升级、配置修改 |
| `revert` | 回滚某次提交 |

真实例子：

```bash
git commit -m "feat(blog): 支持复制正文到公众号"
git commit -m "fix(cors): 放行 OPTIONS 预检请求，避免鉴权中间件误拦截"
git commit -m "docs: 新增 Vite 热更新排查笔记"
git commit -m "chore(deps): 升级 Node 到 20"
```

## 为什么这套格式好用

### 一、一眼看出这次改动的性质

看 `fix` 就知道要去验证什么，看 `docs` 就知道可以跳过代码审查，看 `refactor` 就知道行为应该没变、重点看有没有引入回归。

### 二、能直接生成更新日志

工具可以按类型过滤：

```bash
# 看这个版本加了哪些功能
git log v1.0.0..v1.1.0 --oneline --grep="^feat"

# 看修了哪些 bug
git log v1.0.0..v1.1.0 --oneline --grep="^fix"
```

配合 `standard-version` 这类工具，可以自动生成 CHANGELOG 和版本号。

### 三、能自动判断版本号怎么升

- 有 `BREAKING CHANGE` → 主版本号 +1
- 有 `feat` → 次版本号 +1
- 只有 `fix` → 修订号 +1

## 描述部分怎么写

一条原则：**写完这句话，别人能不能判断出要不要看这次提交**。

```text
# ❌ 看不出改了什么
fix: 修复问题
fix: 更新代码

# ✅ 具体到行为
fix: 修复文章列表在移动端宽度溢出
fix: 处理 API 限流时的重试逻辑
```

如果改动需要解释，用空行隔开再写正文：

```bash
git commit -m "fix(api): 增加指数退避重试

批量翻译时偶发 429 限流，直接失败会让整批任务中断。
改为最多重试 4 次，间隔按 2 的幂次增长并加入随机抖动，
避免多个请求同时重试再次撞在一起。"
```

正文里说清 **为什么这么改**，而不是重复描述改了什么 —— 改了什么，`git diff` 自己会说。

## 怎么强制自己遵守

靠自觉是坚持不下来的，得让工具拦着。用 husky + commitlint：

```bash
npm install --save-dev husky @commitlint/cli @commitlint/config-conventional
npx husky init
```

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
  },
};
```

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

之后再写 `git commit -m "update"`，会被直接拒绝，并提示正确的格式。刚开始有点烦，但两周就形成肌肉记忆了。

## 分支和提交的关系

我现在用的简单模型：

```text
main          ──●───────●────────●──→  始终可发布
                 \     / \      /
feature/xxx       ●───●   ●────●       功能分支，每个提交小而完整
```

- `main` 分支上的每个提交都应该能正常构建
- 功能开发在 `feature/xxx` 分支上做，完成后再合并
- 一个提交只做一件事，方便出问题时单独回滚

## 小结

- `类型(范围): 描述` 三段式，只有前两段必须写
- 描述写"改了什么行为"，正文写"为什么这么改"
- 用 commitlint 强制约束，比靠自觉靠谱
- 一个提交只做一件事，回滚时才不牵连别的改动
