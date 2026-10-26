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
const SPOT_WIDTHS = [1440, 1280, 1024, 957, 768, 390];
/*
 * Widths the step misses. A sweep in 20px steps never lands on an odd window
 * size, and 957 is a real one: a Chrome window on a Mac, reported as the width
 * where the kit phone looked far too big. Anything checked only on a round
 * number is checked on a width nobody actually has.
 */
const ODD_WIDTHS = [957, 1023, 1279, 1365, 1439];

/* The phone may not grow with the window. See `.phone-kit` in the stylesheet. */
const PHONE_MAX_W = 300;
const PHONE_MAX_H = 640;
/* 19.05mm of tag against 71.9mm of phone. */
const TAG_RATIO = 19.05 / 71.9;
const TAG_RATIO_TOLERANCE_PCT = 2;
const TAG_SCALE_WIDTHS = [1440, 1280, 957, 768, 390];

const PHONE_CHECK_WIDTHS = (() => {
  const w = [957, 1440, 1920, 2000, 2560];
  /* 900 to 1100 is where the panel is narrowest while still side by side,
     so it is where the phone has least room to be too big in. */
  for (let x = 900; x <= 1100; x += 20) w.push(x);
  return [...new Set(w)].sort((a, b) => a - b);
})();

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

/* The sweep, plus the odd widths the step would skip. */
function sweepWidths() {
  const w = [];
  for (let x = SWEEP_FROM; x <= SWEEP_TO; x += SWEEP_STEP) w.push(x);
  for (const x of ODD_WIDTHS) if (x >= SWEEP_FROM && x <= SWEEP_TO) w.push(x);
  return [...new Set(w)].sort((a, b) => a - b);
}

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
  await checkPhoneCap(page);
  await checkTagScale(page);
  await checkTagClearsTabBar(page);

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
  for (const w of sweepWidths()) {
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
  const SEL = 'p, h1, h2, h3, h4, li, .btn, figcaption, blockquote, .kit-platform, .eyebrow';
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
 * Rule 2 is gone with the thing it guarded.
 *
 * It checked that none of the five tags in the kit cluster touched the phone
 * beside them. The cluster has been removed from that section, so there is
 * nothing left to overlap and the check passed vacuously. Deleting it rather
 * than leaving it green: a test that cannot fail is not reporting anything.
 */

/*
 * Rule 4: every tag drawn beside a phone is life size against it.
 *
 * 19.05mm of tag against 71.9mm of phone is 0.2650, and that ratio has to
 * hold at every width, because the whole point of driving it from `--mm` is
 * that it cannot drift when a column or a breakpoint is touched.
 *
 * The used width is read from getComputedStyle, not from a client rect: the
 * cluster discs carry rotate(), and a rect is the rotated bounding box, which
 * is wider than the element by cos(a) + sin(a). offsetWidth avoids that but
 * rounds to a whole pixel, which on the 12px badge is an 8 percent error.
 */
async function checkTagScale(page) {
  const places = [
    ['hero', '.phone-hero', '.tag-hero', 1],
    /*
     * The Tap badge is deliberately not in this list. It is an icon in a row
     * of tiles, not a tag beside a phone, and at life size against the drawn
     * phone it was a 12px speck.
     */
  ];
  for (const [name, psel, tsel, frac] of places) {
    for (const w of TAG_SCALE_WIDTHS) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(40);
      const m = await page.evaluate(({ psel, tsel, inset, frac }) => {
        const p = document.querySelector(psel), t = document.querySelector(tsel);
        if (!p || !t) return null;
        const used = (e) => parseFloat(getComputedStyle(e).width);
        return { pw: used(p) * frac, disc: used(t) * (1 - 2 * inset) };
      }, { psel, tsel, inset: DISC_INSET, frac });
      checks += 1;
      if (!m || !m.pw) { fail(`${name}: nothing to measure at ${w}px`); continue; }
      const ratio = m.disc / m.pw;
      const off = Math.abs(ratio - TAG_RATIO) / TAG_RATIO * 100;
      if (off > TAG_RATIO_TOLERANCE_PCT) {
        fail(`${name} at ${w}px: tag is ${ratio.toFixed(4)} of the phone, `
          + `wanted ${TAG_RATIO.toFixed(4)}, off by ${off.toFixed(1)} percent`);
      }
      if (process.env.LAYOUT_VERBOSE) {
        console.log(`  ${name.padEnd(9)} ${String(w).padStart(5)}px: phone `
          + `${m.pw.toFixed(1)} disc ${m.disc.toFixed(1)} ratio ${ratio.toFixed(4)}`);
      }
    }
  }
}

/*
 * Rule 5: the hero tag never covers the tab bar.
 *
 * The Daily / Knowts / Log pill and the plus button occupy x 0.0927 to 0.9308
 * and y 0.8374 to 0.9031 of phone-hero.png, measured off the file. The disc
 * rests on the corner below and to the right of that. Re-measure these if the
 * screenshot is replaced: how much app background sits under the bar decides
 * where the bar lands in the frame.
 */
async function checkTagClearsTabBar(page) {
  const K = { x0: 0.0927, x1: 0.9308, y0: 0.8374, y1: 0.9031 };
  for (const w of TAG_SCALE_WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(40);
    const m = await page.evaluate(({ inset, K }) => {
      const ph = document.querySelector('.phone-hero');
      const tg = document.querySelector('.tag-hero');
      if (!ph || !tg) return null;
      const p = ph.getBoundingClientRect(), t = tg.getBoundingClientRect();
      const r = parseFloat(getComputedStyle(tg).width) * (1 - 2 * inset) / 2;
      const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
      const l = p.left + K.x0 * p.width, rr = p.left + K.x1 * p.width;
      const tp = p.top + K.y0 * p.height, b = p.top + K.y1 * p.height;
      const dx = Math.max(l - cx, 0, cx - rr);
      const dy = Math.max(tp - cy, 0, cy - b);
      return { clear: Math.hypot(dx, dy) - r };
    }, { inset: DISC_INSET, K });
    checks += 1;
    if (!m) { fail(`no hero tag at ${w}px`); continue; }
    if (m.clear <= 0) {
      fail(`the hero tag covers the tab bar by ${(-m.clear).toFixed(1)}px at ${w}px`);
    }
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
    if (process.env.LAYOUT_VERBOSE) {
      console.log(`  ${String(w).padStart(4)}px: phone ${m.pw} x ${m.ph}, panel height ${m.panelH}`);
    }
  }
}

process.exit(await main());
