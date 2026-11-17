/**
 * Renders the PNG app icons from public/icons/icon.svg and the social preview
 * (og.png) from the README banner, with a headless browser, so the repo only
 * keeps SVG sources plus their exports.
 *
 *   node scripts/icons.ts
 *
 * Uses the locally installed Google Chrome through playwright-core (no browser
 * download). Set CHROME_PATH to use another Chromium binary.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const ICONS = resolve(ROOT, 'public/icons');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main(): Promise<void> {
  const source = await readFile(resolve(ICONS, 'icon.svg'), 'utf8');
  const inner = source.replace(/^[\s\S]*?<rect width="512" height="512" rx="112" fill="#0a0c10"\/>/, '').replace(/<\/svg>\s*$/, '');
  // Square tile (the OS rounds it), with the mark scaled down for maskable safe zones.
  const tile = (size: number, scale: number): string => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0c10"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${inner}</g>
</svg>`;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const shots: [string, string, number][] = [
    ['icon-192.png', tile(192, 1.12), 192],
    ['icon-512.png', tile(512, 1.12), 512],
    ['maskable-512.png', tile(512, 0.86), 512],
    ['apple-touch-icon.png', tile(180, 1.05), 180],
  ];
  for (const [name, svg, size] of shots) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:#0a0c10;overflow:hidden">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`);
    await writeFile(resolve(ICONS, name), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }));
    await page.close();
  }

  // Social preview: the README banner as a static frame (animations off).
  const banner = await readFile(resolve(ROOT, 'assets/banner.svg'), 'utf8');
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1200, height: 630 } });
  await page.setContent(
    `<html><head><style>*{animation:none!important}.draw{stroke-dashoffset:0!important}body{margin:0;background:#0a0c10;display:grid;place-items:center;height:630px}svg{width:1200px;height:auto}</style></head><body>${banner}</body></html>`,
  );
  await page.waitForTimeout(300);
  await writeFile(resolve(ICONS, 'og.png'), await page.screenshot({ type: 'png' }));
  await browser.close();
  console.log('icons written to public/icons');
}

await main();
