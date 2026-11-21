// Type 2 reel: capture ONE still of the real Tappy result screen (for the phone in the promo / end card).
// usage: [WANT=bad|good] [NAME="<exact card name>"] [SCROLL=<px>] \
//        PLAYWRIGHT_BROWSERS_PATH="D:/playwright-mcp/browsers" node result.cjs "<search query>" <out.png> [cardIndex]
// Needs the preview servers shots-proxy + shots-web running (same as the type-1 verdict recording).
// The profile is seeded with milk = severe, so WANT=bad (default) picks a product Tappy flags.
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');

const [query, out, cardIdx = '0'] = process.argv.slice(2);
if (!query || !out) { console.error('usage: node result.cjs "<search query>" <out.png> [cardIndex]'); process.exit(1); }
const APP = 'http://localhost:8082';
const W = 405, H = 720, DPR = 1080 / 405; // renders at exactly 1080x1920
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
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  await ctx.addInitScript((p) => { try { localStorage.setItem('tappy-store-v1', p); } catch {} }, JSON.stringify(profile));
  const page = await ctx.newPage();
  await page.goto(APP + '/grocery', { waitUntil: 'networkidle' });

  const search = page.getByPlaceholder('Search for a product or brand');
  await search.waitFor();
  await search.fill(query);
  await sleep(2500);
  const want = process.env.WANT || 'bad';
  const status = want === 'good' ? 'Fits your profile' : want === 'bad' ? 'Has something you avoid' : '\\S.*';
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + (process.env.NAME ? esc(process.env.NAME) : '.+') + '\\. ' + status + '$');
  const target = page.getByRole('button', { name: re }).nth(Number(cardIdx));
  if (!(await target.count())) {
    await page.getByTestId('likely-works').click(); // the "Likely works" filter hides bad products: turn it off
    await sleep(3000);
  }
  await target.waitFor();
  console.log('card:', await target.getAttribute('aria-label'));
  await target.click();
  await sleep(3500); // sheet up, product photo loaded
  const px = Number(process.env.SCROLL || 0);
  if (px) { await page.mouse.move(W / 2, H * 0.75); await page.mouse.wheel(0, px); await sleep(1500); }
  await page.screenshot({ path: out });
  await browser.close();
  console.log('result screen:', out);
})().catch((e) => { console.error(e); process.exit(1); });
