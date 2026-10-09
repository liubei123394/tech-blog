---
title: CORS 报错别急着加 Access-Control-Allow-Origin，先看清楚是谁拦的
date: 2026-10-07
category: bug
tags:
  - CORS
  - 跨域
  - 前后端
summary: 前端请求本地后端接口报跨域错误，改了三处配置都没用。最后发现请求根本没到后端——被 OPTIONS 预检挡住了。
---

## 现象

前端跑在 `http://localhost:5173`，后端跑在 `http://localhost:8000`。前端发请求后控制台报：

```text
Access to fetch at 'http://localhost:8000/api/translate'
from origin 'http://localhost:5173' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

第一反应是后端没配 CORS。于是在后端加了：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

重启，还是同样的错误。

## 关键判断：请求到底有没有到后端

这一步能省下大量时间。在 FastAPI 里加一行日志：

```python
@app.middleware("http")
async def log_requests(request, call_next):
    print(f">>> {request.method} {request.url.path}")
    return await call_next(request)
```

发请求，看终端。**如果连 `OPTIONS /api/translate` 都没打印出来，说明请求根本没到达后端**，那再怎么改后端的 CORS 配置都是白费力气。

我这次的情况：日志里只有 `POST`，没有 `OPTIONS`。

## 为什么没有 OPTIONS

浏览器的跨域请求分两类：

- **简单请求**：直接发出去，只检查响应头
- **预检请求**：先发一个 `OPTIONS` 问服务器"我能不能这么请求"，得到允许后才发真正的请求

触发预检的条件之一是 **`Content-Type: application/json`**。

这一点特别坑：大部分前端同学发 JSON 都用 `fetch` 默认写法，而 `application/json` 正好是触发预检的三种类型之外的 —— 也就是说，用 JSON 发 POST，一定会先发 OPTIONS。

而 OPTIONS 请求被谁拦下了？我之前的中间件顺序有问题：

```python
# 错误顺序：CORS 中间件加在最后，但前面有中间件提前返回了响应
@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path.startswith("/api"):
        if not request.headers.get("authorization"):
            return JSONResponse({"error": "unauthorized"}, status_code=401)  # 这里
    return await call_next(request)

app.add_middleware(CORSMiddleware, ...)   # 加在 auth 之后
```

登录校验中间件在 CORS 之前执行，OPTIONS 预检请求不带 `authorization` 头，直接被 401 拒绝。浏览器看到预检失败，就报了跨域错误 —— 但**真实原因是鉴权，不是跨域**。

修法是让预检请求直接放行：

```python
@app.middleware("http")
async def auth_middleware(request, call_next):
    # 预检请求不做鉴权，交给 CORS 中间件处理
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/api"):
        if not request.headers.get("authorization"):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
    return await call_next(request)
```

同时确认 CORS 中间件在 `app` 上注册得足够早。

## 为什么 CORS 错误信息会误导人

浏览器出于安全考虑，**不会把预检失败的具体原因告诉前端代码**。不管后端返回的是 401、404 还是 500，前端看到的都是同一句话："没有 Access-Control-Allow-Origin 头"。

所以看到 CORS 错误时，正确的思路是：

```text
CORS 报错
  ├─ 请求到达后端了吗？（看后端日志）
  │    ├─ 没到 → 查代理、端口、中间件提前返回
  │    └─ 到了 ↓
  ├─ 是 OPTIONS 预检吗？（看 Network 面板）
  │    ├─ 是 → 检查预检是否被鉴权/路由拦截
  │    └─ 否 ↓
  └─ 检查响应头是否包含正确的 Allow-Origin
```

## 开发阶段的省事方案

如果只是本地开发，最省心的做法是**用开发服务器代理**，让请求同源，从根本上绕开 CORS：

```js
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

前端代码里直接请求 `/api/translate`，浏览器认为它是同源请求，不发预检、不做跨域检查。

> 注意这只是开发期的便利。**生产环境必须正确配置后端的 CORS**，不能靠代理掩盖问题。

## 生产环境的检查清单

- `allow_origins` 写具体域名，不要图省事写 `"*"`
- 如果需要带 Cookie，`allow_credentials=True` 时 `allow_origins` **不能**是 `"*"`
- `allow_headers` 要包含你实际用到的自定义头，比如 `Authorization`、`X-Request-Id`
- 记得处理 `OPTIONS` 的缓存，`Access-Control-Max-Age` 可以减少预检次数

## 小结

- CORS 报错是**表象**，不是原因。先确认请求有没有到后端
- `Content-Type: application/json` 一定会触发 OPTIONS 预检
- 鉴权中间件拦截 OPTIONS 是最隐蔽的一种"假跨域"错误
- 开发用代理，生产配 CORS，别用代理糊生产环境
