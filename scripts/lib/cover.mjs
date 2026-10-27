/**
 * 封面/贴图生成（Node 侧）—— SVG 模板 → PNG 光栅化 + 落盘
 * ------------------------------------------------------------------
 * 光栅化优先用 @resvg/resvg-js（对 SVG <text> 支持完整，自动加载
 * 系统字体，中文渲染可靠）；sharp 内置的 librsvg 在 Windows 预编译版
 * 缺 pango/text 支持，文字会整块消失，只作为最后兜底。
 * 两者都是 optionalDependency：都没装时只产出 SVG
 * （公众号 API 不收 SVG，同步脚本会自动回退 defaultThumb 封面）。
 *
 * 多比例（2026-10-26）：opts.ratio 见 cover-svg.mjs 的 RATIO_SIZES
 *   （2.35:1 公众号文章封面 / 1:1 贴图封面与小红书方图 / 3:4 小红书竖图
 *    / 4:3 / 16:9）。非默认比例的产出文件名带比例后缀：<slug>@1x1.png。
 */
import fs from 'node:fs';
import path from 'node:path';

import { buildCoverSVG, ratioSize, ratioSuffix } from './cover-svg.mjs';

let rasterFn; // 进程内复用的光栅化函数（按目标宽度光栅化）

async function getRasterFn() {
  if (rasterFn !== undefined) return rasterFn;

  // 1) @resvg/resvg-js（首选：文字渲染完整）
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    rasterFn = (svg, width) => new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      background: 'rgba(0,0,0,0)',
      font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft YaHei' },
    }).render().asPng();
    return rasterFn;
  } catch { /* 未安装，尝试下一个 */ }

  // 2) sharp（兜底：Windows 预编译版可能渲染不出 SVG 文字）
  try {
    const sharp = (await import('sharp')).default;
    if (sharp) {
      rasterFn = (svg, width) => sharp(Buffer.from(svg), { density: 96 })
        .resize(width) // 只限宽，保持 SVG 原始宽高比
        .png({ compressionLevel: 9 })
        .toBuffer();
      return rasterFn;
    }
  } catch { /* 未安装 */ }

  rasterFn = null;
  return null;
}

/** SVG → PNG Buffer；无可用光栅化器时返回 null */
export async function rasterizeSvg(svg, width) {
  const fn = await getRasterFn();
  if (!fn) return null;
  return fn(svg, width);
}

/**
 * 为一篇文章/图集生成封面（PNG + SVG），比例由 opts.ratio 决定
 * @param {object} post  至少含 { slug, title, summary, tags, date }
 * @param {object} opts  { coverDir, brand, template, accent, variant, ratio }
 * @returns {{ pngPath: string|null, svgPath: string, template: string, ratio: string, w: number, h: number }}
 *          无可用光栅化器时 pngPath 为 null
 */
export async function generateCoverFiles(post, opts = {}) {
  const coverDir = opts.coverDir;
  fs.mkdirSync(coverDir, { recursive: true });

  const { svg, template, w, h, ratio } = buildCoverSVG({
    title: post.title,
    summary: post.coverSummary || post.summary,
    tags: post.tags || [],
    date: post.date,
    brand: opts.brand,
    template: opts.template,
    accent: opts.accent,
    variant: opts.variant || 0,
    seedKey: post.seedKey || post.slug,
    ratio: opts.ratio,
  });

  const svgPath = path.join(coverDir, `${post.slug}${ratioSuffix(ratio)}.svg`);
  fs.writeFileSync(svgPath, svg, 'utf8');

  const png = await rasterizeSvg(svg, w);
  let pngPath = null;
  if (png) {
    pngPath = path.join(coverDir, `${post.slug}${ratioSuffix(ratio)}.png`);
    fs.writeFileSync(pngPath, png);
  }
  return { pngPath, svgPath, template, ratio, w, h };
}
