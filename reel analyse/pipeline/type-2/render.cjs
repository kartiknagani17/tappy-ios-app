// Type 2 reel: renders the still overlays (all 1080x1920 PNG) into <outDir>.
// usage: node render.cjs <outDir>      (build.sh calls it; settings come from env vars)
//   title.png    hook title, white serif, upper third (transparent)           TITLE  (lines split by |)
//   tag.png      optional tag line under the title ("Part 2", "Allergy Edition") TAG
//   promo.png    promo text, two short lines near the top (transparent)        PROMO_TEXT (paragraphs split by |)
//   phone.png    phone mockup with the Tappy result screen, bottom-left (transparent)  RESULT (+ optional BADGE)
//   endcard.png  Tappy App Store end card (opaque)                              HEADLINE, SUBLINE, RESULT
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
const KIT = __dirname;
const REPO = path.resolve(KIT, '../../..');
const env = (k, d = '') => (process.env[k] === undefined ? d : process.env[k]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&rsquo;');
const lines = (s) => s.split('|').map((l) => esc(l.trim())).filter(Boolean);
const dataUrl = (f) => `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`;

const TITLE = env('TITLE', "Documentaries to watch|if you're waking up");
const TAG = env('TAG');
const PROMO_TEXT = env('PROMO_TEXT', "You'll want to know what's in your food, trust me|I use the Tappy app to scan everything I buy");
const RESULT = env('RESULT');
const BADGE = env('BADGE');
const HEADLINE = env('HEADLINE', 'Scan food.|Know if it fits.');
const SUBLINE = env('SUBLINE', 'Scan any grocery product and see if it fits your allergies and diet.');
const CORAL = '#E04D2A', INK = '#1F1513', CREAM = '#FFF6F1';

// Same look as the reference reels: white serif, soft shadow, no box.
const SERIF = "font-family:Georgia,'Times New Roman',serif;color:#fff;text-shadow:0 2px 3px rgba(0,0,0,.35),0 0 18px rgba(0,0,0,.35);";
const resultImg = RESULT && fs.existsSync(RESULT) ? dataUrl(RESULT) : null;
const icon = path.join(REPO, 'assets/icon.png');
const iconImg = fs.existsSync(icon) ? dataUrl(icon) : null;
const badgeFile = path.join(KIT, 'assets/appstore-badge.png'); // drop Apple's official badge here to use it

const phone = (w, extra = '') => `
  <div style="position:relative;width:${w}px;${extra}">
    <div style="background:#0d0d0f;border-radius:${w * 0.15}px;padding:${w * 0.035}px;box-shadow:0 30px 70px rgba(0,0,0,.45),inset 0 0 0 2px #3a3a3e;">
      <div style="position:relative;border-radius:${w * 0.12}px;overflow:hidden;background:#fff;">
        <img src="${resultImg}" style="display:block;width:100%;">
        <div style="position:absolute;top:${w * 0.025}px;left:50%;transform:translateX(-50%);width:${w * 0.3}px;height:${w * 0.075}px;border-radius:99px;background:#0d0d0f;"></div>
      </div>
    </div>
    ${BADGE ? `<div style="position:absolute;right:${-w * 0.16}px;top:44%;background:${CORAL};color:#fff;font:800 ${w * 0.085}px/1.1 'Segoe UI',Arial,sans-serif;padding:${w * 0.04}px ${w * 0.06}px;border-radius:${w * 0.05}px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:${w * 0.75}px;text-align:center;">${esc(BADGE)}</div>` : ''}
  </div>`;

const appStore = fs.existsSync(badgeFile)
  ? `<img src="${dataUrl(badgeFile)}" style="height:96px;display:block;">`
  : `<div style="background:#000;color:#fff;border-radius:18px;padding:12px 30px 14px;border:2px solid #a6a6a6;font-family:'Segoe UI',Arial,sans-serif;line-height:1;">
       <div style="font-size:21px;font-weight:500;letter-spacing:.3px;">Download on the</div>
       <div style="font-size:44px;font-weight:600;letter-spacing:-.5px;margin-top:4px;">App Store</div>
     </div>`;

const files = {
  'title.png': `<div style="position:absolute;left:60px;right:60px;top:280px;text-align:center;${SERIF}font-size:66px;line-height:1.36;text-wrap:balance">${lines(TITLE).join('<br>')}</div>`,
  ...(TAG ? { 'tag.png': `<div style="position:absolute;left:60px;right:60px;top:${280 + lines(TITLE).length * 90 + 75}px;text-align:center;${SERIF}font-size:62px;line-height:1.36;">${esc(TAG)}</div>` } : {}),
  'promo.png': `<div style="position:absolute;left:60px;right:60px;top:200px;text-align:center;${SERIF}font-size:50px;line-height:1.3;">${lines(PROMO_TEXT).map((l) => `<div style="margin-bottom:36px;text-wrap:balance">${l}</div>`).join('')}</div>`,
  ...(resultImg ? { 'phone.png': `<div style="position:absolute;left:64px;top:1040px;">${phone(370)}</div>` } : {}),
  // With a result screen: like the viral end card (badge top-right, brand + headline top-left, big phone below).
  // Without one: everything centred (big icon, headline, subline, badge).
  'endcard.png': resultImg ? `
    <div style="position:absolute;inset:0;background:${CORAL};"></div>
    <div style="position:absolute;right:56px;top:64px;">${appStore}</div>
    <div style="position:absolute;left:84px;top:250px;display:flex;align-items:center;gap:22px;">
      ${iconImg ? `<img src="${iconImg}" style="width:92px;height:92px;border-radius:22px;box-shadow:0 6px 18px rgba(0,0,0,.18);">` : ''}
      <div style="font:800 50px 'Segoe UI',Arial,sans-serif;color:#fff;letter-spacing:-.5px;">Tappy</div>
    </div>
    <div style="position:absolute;left:84px;right:84px;top:380px;font:800 104px/1.08 'Segoe UI',Arial,sans-serif;color:#fff;letter-spacing:-2px;">${lines(HEADLINE).join('<br>')}</div>
    <div style="position:absolute;left:84px;right:120px;top:640px;font:500 36px/1.35 'Segoe UI',Arial,sans-serif;color:${CREAM};opacity:.95;">${esc(SUBLINE)}</div>
    <div style="position:absolute;left:50%;top:820px;transform:translateX(-50%);">${phone(560)}</div>` : `
    <div style="position:absolute;inset:0;background:${CORAL};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px;gap:0;">
      ${iconImg ? `<img src="${iconImg}" style="width:260px;height:260px;border-radius:60px;box-shadow:0 18px 50px rgba(0,0,0,.25);">` : ''}
      <div style="font:800 58px 'Segoe UI',Arial,sans-serif;color:#fff;margin-top:36px;letter-spacing:-.5px;">Tappy</div>
      <div style="font:800 118px/1.08 'Segoe UI',Arial,sans-serif;color:#fff;letter-spacing:-2px;margin-top:70px;">${lines(HEADLINE).join('<br>')}</div>
      <div style="font:500 40px/1.35 'Segoe UI',Arial,sans-serif;color:${CREAM};margin-top:40px;max-width:820px;">${esc(SUBLINE)}</div>
      <div style="margin-top:80px;transform:scale(1.25);">${appStore}</div>
    </div>`,
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const f of ['title.png', 'tag.png', 'promo.png', 'phone.png', 'endcard.png']) fs.rmSync(path.join(out, f), { force: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [name, html] of Object.entries(files)) {
    await p.setContent(`<html><body style="margin:0;background:transparent;width:1080px;height:1920px;position:relative;overflow:hidden">${html}</body></html>`);
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(out, name), omitBackground: name !== 'endcard.png' });
  }
  await b.close();
  console.log('rendered:', Object.keys(files).join(' '));
})().catch((e) => { console.error(e); process.exit(1); });
