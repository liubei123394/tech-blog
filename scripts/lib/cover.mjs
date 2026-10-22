/**
 * 封面生成（Node 侧）—— SVG 模板 → PNG 光栅化 + 落盘
 * ------------------------------------------------------------------
 * 光栅化优先用 @resvg/resvg-js（对 SVG <text> 支持完整，自动加载
 * 系统字体，中文渲染可靠）；sharp 内置的 librsvg 在 Windows 预编译版
 * 缺 pango/text 支持，文字会整块消失，只作为最后兜底。
 * 两者都是 optionalDependency：都没装时只产出 SVG
 * （公众号 API 不收 SVG，同步脚本会自动回退 defaultThumb 封面）。
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildCoverSVG, COVER_W, COVER_H } from './cover-svg.mjs';

let rasterFn; // 进程内复用的光栅化函数

async function getRasterFn() {
  if (rasterFn !== undefined) return rasterFn;

  // 1) @resvg/resvg-js（首选：文字渲染完整）
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    rasterFn = (svg) => new Resvg(svg, {
      fitTo: { mode: 'width', value: COVER_W },
      background: 'rgba(0,0,0,0)',
      font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft YaHei' },
    }).render().asPng();
    return rasterFn;
  } catch { /* 未安装，尝试下一个 */ }

  // 2) sharp（兜底：Windows 预编译版可能渲染不出 SVG 文字）
  try {
    const sharp = (await import('sharp')).default;
    if (sharp) {
      rasterFn = (svg) => sharp(Buffer.from(svg), { density: 96 })
        .resize(COVER_W, COVER_H)
        .png({ compressionLevel: 9 })
        .toBuffer();
      return rasterFn;
    }
  } catch { /* 未安装 */ }

  rasterFn = null;
  return null;
}

/** SVG → PNG Buffer；无可用光栅化器时返回 null */
export async function rasterizeSvg(svg) {
  const fn = await getRasterFn();
  if (!fn) return null;
  return fn(svg);
}

/**
 * 为一篇文章生成封面文件（PNG + SVG）
 * @param {object} post  至少含 { slug, title, summary, tags, date }
 * @param {object} opts  { coverDir, brand, template, accent, variant }
 * @returns {{ pngPath: string|null, svgPath: string, template: string }}
 *          无可用光栅化器时 pngPath 为 null
 */
export async function generateCoverFiles(post, opts = {}) {
  const coverDir = opts.coverDir;
  fs.mkdirSync(coverDir, { recursive: true });

  const { svg, template } = buildCoverSVG({
    title: post.title,
    summary: post.coverSummary || post.summary,
    tags: post.tags || [],
    date: post.date,
    brand: opts.brand,
    template: opts.template,
    accent: opts.accent,
    variant: opts.variant || 0,
    seedKey: post.slug,
  });

  const svgPath = path.join(coverDir, `${post.slug}.svg`);
  fs.writeFileSync(svgPath, svg, 'utf8');

  const png = await rasterizeSvg(svg);
  let pngPath = null;
  if (png) {
    pngPath = path.join(coverDir, `${post.slug}.png`);
    fs.writeFileSync(pngPath, png);
  }
  return { pngPath, svgPath, template };
}
