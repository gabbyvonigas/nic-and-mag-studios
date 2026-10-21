/*
 * Layout rules this site has broken before, asserted against a real browser.
 *
 * Measuring the DOM is the point. Reading the stylesheet proves what was
 * declared, not what a browser did with it, and every rule here is about the
 * result: where a line actually broke, where a tag actually landed.
 *
 * Run:  node site/tests/layout.test.mjs
 *
 * It serves `site/` itself and drives the Chromium that Playwright finds, so
 * it needs no running server and no configuration. Without Playwright
 * installed it says so and exits 0 rather than failing: this is not part of
 * `npm run verify`, which has no browser.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SITE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8099;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGES = ['/', '/privacy/', '/support/', '/terms/'];

/* The three feature descriptions, checked at every width in this range. */
const SWEEP_FROM = 320;
const SWEEP_TO = 2560;
const SWEEP_STEP = 20;
/* Everything else is checked at the widths a person is most likely on. */
const SPOT_WIDTHS = [1440, 1024, 768, 390];

/* The phone may not grow with the window. See `.phone-kit` in the stylesheet. */
const PHONE_MAX_W = 300;
const PHONE_MAX_H = 640;
const PHONE_CHECK_WIDTHS = [1440, 1920, 2000, 2560];

/* The disc fills the middle 74 percent of its square file, so the visible
   circle is inset this much from the image box. Comparing the boxes instead
   would report an overlap for transparent corners that cannot be seen. */
const DISC_INSET = (1 - 0.74) / 2;

/*
 * The rendered lines of an element, as arrays of words, split at authored
 * <br> breaks first.
 *
 * A <br> is not wrapping. "Plant<br>Care" is two one-line segments and strands
 * nothing; "Group your Knowts by Category." is one segment that wraps, and
 * that is what the no-widow rule is about. Measuring the element as a whole
 * would report the first as a widow and there would be nothing to fix.
 */
const LINES_LIB = `
window.__widow = function (el) {
  const items = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = walk.nextNode())) {
    if (n.nodeType === 1) { if (n.tagName === 'BR') items.push({ br: true }); continue; }
    const re = /\\S+/g; let m;
    while ((m = re.exec(n.nodeValue)) !== null) {
      const r = document.createRange();
      r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const rects = r.getClientRects();
      if (rects.length) items.push({ w: m[0], top: Math.round(rects[0].top * 10) / 10 });
    }
  }
  const segs = [[]];
  for (const it of items) { if (it.br) segs.push([]); else segs[segs.length - 1].push(it); }
  for (const seg of segs) {
    if (!seg.length) continue;
    const lines = [];
    for (const o of seg) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - o.top) < 3) last.words.push(o.w);
      else lines.push({ top: o.top, words: [o.w] });
    }
    if (lines.length > 1 && lines[lines.length - 1].words.length === 1) {
      return { lines: lines.map(l => l.words.join(' ')),
               stranded: lines[lines.length - 1].words[0] };
    }
  }
  return null;
};`;

const failures = [];
const fail = (msg) => failures.push(msg);
let checks = 0;

async function main() {
  let chromium;
  try {
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      console.log('Playwright is not installed, so the layout test did not run.');
      console.log('Install it and run this again to check widows, tag overlap and the phone cap.');
      return 0;
    }
  }

  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: SITE, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch {} };
  process.on('exit', stop);

  for (let i = 0; i < 50; i += 1) {
    try { await fetch(ORIGIN + '/'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await checkWidowSweep(page);
  await checkWidowsEverywhere(page);
  await checkNoOverlap(page);
  await checkPhoneCap(page);

  await browser.close();
  stop();

  if (failures.length) {
    console.error(`\n${failures.length} layout failure(s):`);
    for (const f of failures) console.error('  ' + f);
    return 1;
  }
  console.log(`${checks} checks passed`);
  return 0;
}

/* Rule 1a: the three feature descriptions, every width in the sweep. */
async function checkWidowSweep(page) {
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (let w = SWEEP_FROM; w <= SWEEP_TO; w += SWEEP_STEP) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(8);
    const bad = await page.evaluate((lib) => {
      eval(lib);
      const out = [];
      for (const e of document.querySelectorAll('.system-copy p')) {
        const wd = window.__widow(e);
        if (wd) out.push({ text: e.textContent.trim(), ...wd });
      }
      return out;
    }, LINES_LIB);
    checks += 1;
    for (const x of bad) {
      fail(`widow at ${w}px: "${x.text}" leaves "${x.stranded}" alone on its last line`);
    }
  }
}

/* Rule 1b: every other block of text, at the spot widths. */
async function checkWidowsEverywhere(page) {
  const SEL = 'p, h1, h2, h3, h4, li, .btn, figcaption, blockquote';
  for (const pagePath of PAGES) {
    for (const w of SPOT_WIDTHS) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.goto(ORIGIN + pagePath, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(40);
      const bad = await page.evaluate(({ lib, sel }) => {
        eval(lib);
        const out = [];
        for (const e of document.querySelectorAll(sel)) {
          if (e.querySelector(sel)) continue;
          if (getComputedStyle(e).display === 'none' || !e.textContent.trim()) continue;
          const wd = window.__widow(e);
          if (wd) out.push({ text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), ...wd });
        }
        return out;
      }, { lib: LINES_LIB, sel: SEL });
      checks += 1;
      for (const x of bad) {
        fail(`widow on ${pagePath} at ${w}px: "${x.text}" leaves "${x.stranded}" alone`);
      }
    }
  }
}

/*
 * Rule 2: no tag may touch the phone, at any width.
 *
 * This has regressed once already, from percentages that looked right at the
 * width they were tuned at and crossed somewhere else.
 */
async function checkNoOverlap(page) {
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (let w = SWEEP_FROM; w <= SWEEP_TO; w += SWEEP_STEP) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(8);
    const hit = await page.evaluate((inset) => {
      const phone = document.querySelector('.phone-kit');
      if (!phone) return null;
      const p = phone.getBoundingClientRect();
      const out = [];
      document.querySelectorAll('.tag-cluster .tag-disc').forEach((d, i) => {
        const b = d.getBoundingClientRect();
        const dx = b.width * inset, dy = b.height * inset;
        const c = { left: b.left + dx, right: b.right - dx, top: b.top + dy, bottom: b.bottom - dy };
        if (c.left < p.right && c.right > p.left && c.top < p.bottom && c.bottom > p.top) {
          out.push({ i: i + 1, overlapX: Math.round(Math.min(c.right, p.right) - Math.max(c.left, p.left)) });
        }
      });
      return out;
    }, DISC_INSET);
    checks += 1;
    if (hit) for (const x of hit) fail(`tag ${x.i} overlaps the phone by ${x.overlapX}px at ${w}px wide`);
  }
}

/* Rule 3: the phone does not scale up with the window on a wide screen. */
async function checkPhoneCap(page) {
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const w of PHONE_CHECK_WIDTHS) {
    await page.setViewportSize({ width: w, height: 1100 });
    await page.waitForTimeout(40);
    const m = await page.evaluate(() => {
      const e = document.querySelector('.phone-kit');
      const p = document.querySelector('.kit-panel');
      if (!e || !p) return null;
      const b = e.getBoundingClientRect(), q = p.getBoundingClientRect();
      return { pw: Math.round(b.width), ph: Math.round(b.height),
               panelH: Math.round(q.height) };
    });
    checks += 1;
    if (!m) { fail(`no kit panel found at ${w}px`); continue; }
    if (m.pw > PHONE_MAX_W) fail(`the phone is ${m.pw}px wide at ${w}px, over the ${PHONE_MAX_W}px cap`);
    if (m.ph > PHONE_MAX_H) fail(`the phone is ${m.ph}px tall at ${w}px, over the ${PHONE_MAX_H}px cap`);
  }
}

process.exit(await main());
