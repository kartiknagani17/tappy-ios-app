// Records a Tappy verdict-sheet clip from the web build as timestamped frames.
// usage: node record.js <search query> <outDir> [cardIndex]
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const [query, outDir, cardIdx = '0'] = process.argv.slice(2);
const APP = 'http://localhost:8082';
const W = 405, H = 720, DPR = 1080 / 405; // 9:16, renders at exactly 1080x1920

const profile = {
  state: {
    onboarded: true, agreedToTerms: true, trialActive: true, askedPush: true,
    accountPromptDismissed: true, seenIngredientIntro: true,
    restrictions: { milk: { level: 'severe' } },
  },
  version: 1,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=' + DPR] }); // real 1080x1920 screencast frames
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript((p) => { try { localStorage.setItem('tappy-store-v1', p); } catch {} }, JSON.stringify(profile));
  const page = await ctx.newPage();
  await page.goto(APP + '/grocery', { waitUntil: 'networkidle' });

  const search = page.getByPlaceholder('Search for a product or brand');
  await search.waitFor();
  await search.fill(query);
  await sleep(2500);
  // ProductCard's Pressable is labelled "<name>. <status>".
  // WANT=bad picks cards that don't fit the profile (the "caught it" moment); WANT=good picks ones that fit.
  // NAME (optional) = exact product name as shown on the card; WANT = bad|good picks the verdict.
  const status = process.env.WANT === 'good' ? 'Fits your profile' : process.env.WANT === 'bad' ? 'Has something you avoid' : '\\S.*';
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const want = new RegExp('^' + (process.env.NAME ? esc(process.env.NAME) : '.+') + '\\. ' + status + '$');
  const target = page.getByRole('button', { name: want }).nth(Number(cardIdx));
  if (!(await target.count())) {
    await page.getByTestId('likely-works').click(); // "Likely works" filter is on: turn it off
    await sleep(3000);
  }
  await target.waitFor();
  console.log('card:', await target.getAttribute('aria-label'));

  // Warm-up: open once so the product image and data are cached, then close.
  await target.click();
  await sleep(2500);
  const imgs = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.src).filter((s) => /^https?:/.test(s)));
  fs.writeFileSync(path.join(outDir, 'product-image.txt'), imgs.join('\n'));
  await page.mouse.move(W / 2, H * 0.75);
  await page.mouse.wheel(0, 3000); await sleep(800); // preload lower sections
  await page.keyboard.press('Escape'); await sleep(300);
  const close = page.getByLabel(/close/i).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await sleep(1500);

  // --- record ---
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });

  const green = process.env.BG === 'green';
  if (green) {
    // Sheet-only mode: everything behind the sheet becomes pure green (keyed out later and
    // replaced by the camera view + tappy logo, like the real scan screen). The dim backdrop
    // is cleared here and re-added in ffmpeg so the key stays clean.
    await page.addStyleTag({ content: '#root{opacity:0 !important} html,body{background:#ff00ff !important}' });
    await page.evaluate(() => {
      const clear = () => document.querySelectorAll('body > div:not(#root) div').forEach((d) => {
        if (d.style && /rgba\(31,\s*21,\s*19,\s*0\.45\)/.test(d.style.backgroundColor)) d.style.backgroundColor = 'transparent';
      });
      new MutationObserver(clear).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });
  }
  await sleep(green ? 300 : 900);         // results grid (nothing to see in green mode)
  await target.click({ force: true });    // sheet slides up
  await sleep(2200);                      // hold on the verdict
  const smooth = async (px, ms) => {      // eased wheel scroll
    const steps = Math.round(ms / 16);
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const e = 0.5 - Math.cos((Math.PI * i) / steps) / 2;
      const to = Math.round(px * e);
      await page.mouse.wheel(0, to - done); done = to;
      await sleep(16);
    }
  };
  await page.mouse.move(W / 2, H * 0.75);
  await smooth(560, 1800);                // down to Diet overview + highlighted ingredients
  await sleep(2600);                      // hold on the red MILK / WHEY words
  await smooth(330, 1300);                // to "Contains: milk."
  await sleep(1500);

  await cdp.send('Page.stopScreencast');
  await sleep(300);
  await browser.close();

  // Write frames + an ffconcat with real timings.
  let list = 'ffconcat version 1.0\n';
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(outDir, name), Buffer.from(f.data, 'base64'));
    const dur = i + 1 < frames.length ? frames[i + 1].t - f.t : 0.5;
    list += `file ${name}\nduration ${dur.toFixed(4)}\n`;
  });
  list += `file f${String(frames.length - 1).padStart(5, '0')}.jpg\n`;
  fs.writeFileSync(path.join(outDir, 'frames.ffconcat'), list);
  console.log(`frames=${frames.length} span=${(frames.at(-1).t - frames[0].t).toFixed(2)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
