/**
 * Serves the production build (dist/) and captures the README screenshots
 * with a headless browser at a fixed date (17 Nov 2026), so the images are
 * reproducible. It also runs smoke checks: the worked example's numbers, no
 * console errors, no horizontal scroll at 375 px, every control labelled,
 * keyboard reachability, English, UDIS (lazy-loaded), copy to clipboard, the
 * print view and offline use through the service worker.
 *
 *   npm run build && npm run screenshots
 *
 * Uses the locally installed Google Chrome through playwright-core (no browser
 * download). Set CHROME_PATH to use another Chromium binary.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'assets/screenshots');
const BASE = '/aumento-renta/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function serve(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!pathname.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    const rel = pathname.slice(BASE.length);
    const file = normalize(join(DIST, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body),
      () => res.writeHead(404).end(),
    );
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      ok({ server, url: `http://127.0.0.1:${port}${BASE}` });
    });
  });
}

// Tuesday 17 Nov 2026, 10:00 in Mexico City (UTC-6).
const NOW = new Date('2026-11-17T10:00:00-06:00');

/** The README worked example: $12,000, contract from 2025-12-01, CDMX home, landlord asks 8%. */
const EXAMPLE = '#m=12000&i=inpc&a=2025-12-01&b=2026-12-01&p=published&e=cdmx&u=housing&pk=percent&pv=8';

async function newContext(
  browser: Browser,
  url: string,
  opts: { mobile: boolean; lang?: 'es' | 'en'; serviceWorker?: boolean },
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const serviceWorkers = opts.serviceWorker ? 'allow' : 'block';
  const context = await browser.newContext(
    opts.mobile
      ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers }
      : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark', serviceWorkers },
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(NOW);
  if (opts.lang) {
    const lang = opts.lang;
    await page.addInitScript((v) => localStorage.setItem('aumento-renta:lang', v), lang);
  }
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
  console.log(`  ok  ${message}`);
}

async function smoke(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `${label}: no horizontal scroll (${overflow}px)`);
  const unlabelled = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, button, textarea, a[href]')]
      .filter((el) => {
        const e = el as HTMLInputElement;
        if (e.type === 'hidden' || e.closest('[hidden]')) return false;
        const hasLabel = e.labels && e.labels.length > 0;
        const aria = e.getAttribute('aria-label') ?? e.getAttribute('aria-labelledby');
        const text = (e.textContent as string | null)?.trim() ?? '';
        return !hasLabel && !aria && !text;
      })
      .map((e) => e.outerHTML.slice(0, 80)),
  );
  check(unlabelled.length === 0, `${label}: every control labelled ${unlabelled.join(' ')}`);
}

async function text(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().innerText();
}

async function main(): Promise<void> {
  const { server, url } = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    // 1. Desktop, the worked example.
    console.log('desktop');
    {
      const { context, page, errors } = await newContext(browser, url + EXAMPLE, { mobile: false });
      check((await text(page, '#result-amount')) === '$12,450.33', 'worked example: new rent $12,450.33');
      check((await text(page, '.summary-line')).includes('+3.75%'), 'worked example: +3.75%');
      check((await text(page, '.legal')).includes('La propuesta excede el tope con las dos lecturas'), 'CDMX check: 8% exceeds both readings');
      check((await text(page, '.readings')).includes('$12,443.03'), 'CDMX cap reading 1: $12,443.03');
      check((await page.locator('a[href*="codigo=5803352"]').count()) > 0, 'links to the DOF note of October 2026');
      await smoke(page, 'desktop');
      await page.screenshot({ path: join(OUT, 'desktop.png') });

      // Copy the message.
      await page.getByRole('button', { name: 'Copiar mensaje' }).click();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      check(clip.startsWith('Hola. Te escribo sobre la actualización de la renta') && clip.includes('$12,450.33'), 'copy message puts the text on the clipboard');
      check((await text(page, '#copy-status')) === 'Mensaje copiado.', 'copy status is announced');
      await page.getByRole('button', { name: 'Copiar enlace' }).click();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      check(link.endsWith(EXAMPLE), `share link carries only the inputs (${link})`);
      check(errors.length === 0, `desktop: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 2. Phone: top of the page, and the Mexico City check.
    console.log('mobile');
    {
      const { context, page, errors } = await newContext(browser, url + EXAMPLE, { mobile: true });
      await smoke(page, 'mobile');
      check(await page.locator('.mobile-bar').isVisible(), 'the phone result bar is shown at the top of the page');
      await page.locator('.mobile-bar').click();
      await page.waitForTimeout(600);
      check((await page.evaluate(() => document.activeElement?.id)) === 'result-title', 'the result bar moves focus to the result');
      check(page.url().endsWith(EXAMPLE) && (await text(page, '#result-amount')) === '$12,450.33', 'the result bar keeps the inputs');
      await page.locator('#result-title').evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -12));
      await page.screenshot({ path: join(OUT, 'mobile-result.png') });
      await page.locator('#cap-title').evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -12));
      await page.screenshot({ path: join(OUT, 'mobile-cdmx.png') });
      check(errors.length === 0, `mobile: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 3. First visit: empty amount, keyboard only.
    console.log('first visit');
    {
      const { context, page, errors } = await newContext(browser, url, { mobile: true });
      check((await text(page, '#empty-title')).includes('Escribe tu renta'), 'first visit asks for the rent');
      check((await page.inputValue('#f-start')) === '2025-11-17', 'start date defaults to a year ago');
      check((await page.inputValue('#f-increase')) === '2026-11-17', 'increase date defaults to the anniversary');
      await page.keyboard.press('Tab');
      check((await page.evaluate(() => document.activeElement?.className)) === 'skip', 'first Tab reaches the skip link');
      await page.keyboard.press('Enter');
      for (let i = 0; i < 6 && (await page.evaluate(() => document.activeElement?.id)) !== 'f-amount'; i++) await page.keyboard.press('Tab');
      check((await page.evaluate(() => document.activeElement?.id)) === 'f-amount', 'the rent field is reachable by keyboard');
      await page.keyboard.type('15000');
      check((await text(page, '#result-amount')).startsWith('$15,'), 'typing the rent shows the result');
      check((await page.evaluate(() => document.activeElement?.id)) === 'f-amount', 'focus stays in the field while typing');
      check(page.url().includes('#m=15000&'), 'the skip link did not replace the inputs in the URL');
      check(await page.locator('.mobile-bar').isVisible(), 'the phone result bar shows the new rent while the form is on screen');
      await page.locator('#f-amount').fill('quince mil');
      check(await page.locator('#f-amount-error').isVisible(), 'an invalid rent shows an error');
      check((await page.getAttribute('#f-amount', 'aria-invalid')) === 'true', 'the field is marked aria-invalid');
      await page.locator('#f-amount').fill('15000');
      await page.locator('#f-start').fill('2025-06-01');
      check((await page.inputValue('#f-increase')) === '2026-06-01', 'the increase date follows the anniversary');
      check(errors.length === 0, `first visit: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 4. English and UDIS (loaded on demand).
    console.log('english + udis');
    {
      const hash = '#m=15000&i=udis&a=2025-11-17&b=2026-11-17&p=published&e=other';
      const { context, page, errors } = await newContext(browser, url + hash, { mobile: false, lang: 'en' });
      await page.locator('#result-amount').waitFor();
      check((await page.locator('h1').innerText()).includes('your rent go up'), 'English UI');
      check((await text(page, '#result-amount')) === '$15,561.55', 'UDIS update $15,561.55');
      check((await text(page, '.legal')).includes('only checks Mexico City'), 'other states: no rules invented');
      await page.getByRole('button', { name: 'Cambiar a español' }).click();
      check((await page.locator('h1').innerText()).includes('tu renta'), 'language toggle switches to Spanish');
      await smoke(page, 'english');
      check(errors.length === 0, `english: no console errors ${errors.join(' | ')}`);
      await context.close();
    }

    // 5. Print view.
    console.log('print');
    {
      const { context, page } = await newContext(browser, url + EXAMPLE, { mobile: false });
      await page.emulateMedia({ media: 'print' });
      await page.setViewportSize({ width: 820, height: 1160 });
      check(!(await page.locator('#form-root').isVisible()), 'print hides the form');
      check(await page.locator('.print-head').isVisible(), 'print shows the inputs used');
      await page.screenshot({ path: join(OUT, 'print.png') });
      await context.close();
    }

    // 6. Offline: after the first visit the service worker serves everything.
    console.log('offline');
    {
      const { context, page, errors } = await newContext(browser, url + EXAMPLE, { mobile: true, serviceWorker: true });
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      check(await page.evaluate(() => navigator.serviceWorker.controller !== null), 'service worker controls the page');
      await context.setOffline(true);
      await page.goto(`${url}#m=12000&i=udis&a=2025-11-17&b=2026-11-17&p=published&e=cdmx&u=housing`);
      await page.reload();
      await page.locator('#result-amount').waitFor();
      check((await text(page, '#result-amount')) === '$12,449.24', 'offline reload still computes, UDIS included');
      check(errors.filter((e) => !e.includes('ERR_INTERNET_DISCONNECTED')).length === 0, `offline: no console errors ${errors.join(' | ')}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('screenshots written to assets/screenshots');
}

await main();
