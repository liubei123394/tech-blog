---
title: Vite 保存后页面不热更新？三种原因和排查顺序
date: 2026-09-29
category: bug
tags:
  - Vite
  - 前端
  - 热更新
summary: 代码改了、终端也打印了 hmr update，但浏览器纹丝不动。按「文件是否被监听 → 是否真的改变 → 浏览器是否收到」三层顺序排查，五分钟能定位。
---

## 现象

改一行文字，保存，终端确实打印了：

```bash
[vite] hmr update /src/pages/Home.vue
```

但浏览器里的内容没有任何变化，手动刷新才生效。终端没有报错。

## 排查：从"链路"倒推

热更新其实是三段链路：

```text
文件变化 → Vite 编译 → WebSocket 推送 → 浏览器替换模块
```

任何一段断了都会表现为"没反应"。所以按顺序验证每一段。

### 第一段：文件到底有没有被监听

先确认 Vite 有没有看到你的改动。如果终端**根本没打印** `hmr update`，问题在这里。

常见原因是编辑器用了「原子保存」：先写临时文件，再重命名覆盖。某些情况下文件系统事件会被丢。

另一个原因是项目路径里有软链接，或者项目放在了虚拟机共享目录（比如 `/mnt/c/...`）里，文件事件传不过去。

对应改法：

```js
// vite.config.js
export default defineConfig({
  server: {
    watch: {
      // 轮询模式，兼容共享目录和部分 Docker 挂载
      usePolling: true,
      interval: 300,
    },
  },
});
```

轮询会增加一些 CPU 占用，只在确实需要时打开。

### 第二段：改动内容在不在 HMR 的范围内

终端打印了 `hmr update`，但浏览器没变。这时候要看改的是什么。

有一个很容易忽略的情况：**只改 `<style>` 里的 CSS 变量定义**。如果变量是定义在 `<style>` 里、却被 JS 动态读取的，Vite 能更新样式，但 JS 里缓存的值不会重新计算。此时需要整页刷新。

更常见的是改了一个**被多个模块共享的纯 JS 常量文件**。如果没有任何组件对这个文件建立 HMR 边界，Vite 会往上冒泡找边界，找不到就只能整页刷新 —— 但有些配置下它并不会刷新，而是静默地什么都不做。

验证方法：直接改页面里的一段文本，看是否生效。

- 改文本生效 → HMR 链路正常，问题在你改的那个文件
- 改文本也不生效 → 往下看第三段

### 第三段：浏览器有没有收到推送

打开 DevTools → Network → WS，找到那条 WebSocket 连接，看 Messages 里有没有消息进来。

没有消息，通常是这两种情况：

1. **用了 HTTPS 访问本地服务**，或者通过反向代理（Nginx、ngrok）转发，WebSocket 没被转发过去。
2. **浏览器插件拦截**，某些广告拦截插件会拦 `ws://localhost`。

代理配置里需要显式转发 upgrade 头：

```nginx
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 我最后是怎么解决的

我这次的原因是第二段：改的文件是 `src/config/constants.js`，一个纯导出的对象，没有依赖任何组件，也没有组件显式接受它的 HMR。

解决办法是给这个文件主动声明 HMR 边界：

```js
// 在 constants.js 末尾
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // 这里可以做一些手动更新，或者直接整页刷新
    window.location.reload();
  });
}
```

更省事的方案是把常量放进 Vue 的 `reactive` 里，让改动天然进入响应式系统。

## 小结

排查顺序固定，能少走弯路：

1. 终端有没有 `hmr update` → 没有就是文件监听问题
2. 改页面文本能否生效 → 不能就是链路问题
3. Network 里 WS 有没有消息 → 没有就是代理或端口问题
4. 以上都正常 → 你改的那个文件没有 HMR 边界

> 顺带一提：`vite --force` 可以先排除缓存问题。如果清缓存后就好了，多半是依赖预构建的缓存过期，不是 HMR 本身的锅。
