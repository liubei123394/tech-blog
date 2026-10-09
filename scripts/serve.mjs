#!/usr/bin/env node
/**
 * 本地预览服务器（零依赖）
 * 运行：npm run dev
 * 会先构建一次，然后监听 posts/ pages/ src/ 的变化自动重新构建。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function runBuild() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(__dirname, 'build.mjs')], { stdio: 'inherit' });
    p.on('close', resolve);
  });
}

function serve() {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(parsed.pathname);

    // 关掉 site.config 里的 base 前缀（本地预览始终从根目录访问）
    let file = path.join(DIST, pathname);
    if (pathname === '/' || pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

    // 防止路径穿越
    if (!path.resolve(file).startsWith(path.resolve(DIST))) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (!fs.existsSync(file)) {
      const notFound = path.join(DIST, '404.html');
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not Found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });

  server.listen(PORT, () => {
    console.log(`\n🚀 本地预览已启动： http://localhost:${PORT}\n   （监听 posts/ pages/ src/ 变化，自动重新构建；Ctrl+C 退出）\n`);
  });
}

let timer = null;
function watch() {
  const targets = ['posts', 'pages', 'src', path.join('scripts')].map((d) => path.join(ROOT, d));
  for (const dir of targets) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.watch(dir, { recursive: true }, (event, name) => {
        if (name && /(^|[\\/])\.|~$/.test(name)) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
          console.log(`\n🔁 检测到变化（${name || ''}），重新构建…`);
          await runBuild();
        }, 250);
      });
    } catch { /* 某些平台不支持递归监听，忽略 */ }
  }
  fs.watch(ROOT, (event, name) => {
    if (name !== 'site.config.mjs') return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log('\n🔁 站点配置已更新，重新构建…');
      await runBuild();
    }, 250);
  });
}

await runBuild();
serve();
watch();
