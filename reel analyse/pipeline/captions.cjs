// Renders 1080x1920 transparent caption overlays in the reference reels' style:
// black condensed bold text on white boxes. usage: node captions.cjs <outDir>
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
const path = require('path');
const out = process.argv[2];

const BIG = "font:400 64px/1.12 Impact,'Arial Narrow Bold',sans-serif;";
const box = (lines, { top, size = 64, pad = '6px 22px' } = {}) => `
  <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;">
    ${lines.map((l) => `<div><span style="display:inline-block;background:#fff;color:#000;${BIG}font-size:${size}px;padding:${pad};margin:0;">${l}</span></div>`).join('')}
  </div>`;
// A solid card (used where it must hide text burned into the reference footage).
const card = (lines, { top, height, size = 70 }) => `
  <div style="position:absolute;left:120px;right:120px;top:${top}px;height:${height}px;background:#fff;border-radius:6px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
    ${lines.map((l) => `<div style="${BIG}font-size:${size}px;color:#000;text-align:center;">${l}</div>`).join('')}
  </div>`;
const small = (text, top) => `
  <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;">
    <span style="display:inline-block;background:#fff;color:#000;font:700 40px/1.25 'Segoe UI',Arial,sans-serif;padding:8px 18px;border-radius:4px;max-width:860px;">${text}</span>
  </div>`;
const tag = `<div style="position:absolute;left:24px;top:24px;background:rgba(200,0,0,.85);color:#fff;font:700 26px 'Segoe UI',Arial;padding:6px 14px;border-radius:6px;">REFERENCE FOOTAGE · PLACEHOLDER · NOT FOR POSTING</div>`;

const files = {
  'hook.png': tag + card(['Dairy-free?', 'These 3 snacks are', 'hiding MILK 😳'], { top: 1030, height: 570, size: 92 }),
  'cta.png': tag + card(['Comment “TAPPY”', 'and I’ll send you', 'the app 👇'], { top: 1030, height: 570, size: 92 }),
  'label1.png': box(['#1 Cool Ranch Doritos'], { top: 1620, size: 76 }),
  'label2.png': box(['#2 Pringles BBQ'], { top: 1620, size: 76 }),
  'label3.png': box(['#3 The swap: SkinnyPop'], { top: 1620, size: 76 }),
  'sub1.png': small('Lactose, whey, skim milk AND buttermilk 😬', 1690),
  'sub2.png': small('Whey hiding in the BBQ seasoning 🫠', 1690),
  'sub3.png': small('Popcorn, oil, salt. Zero dairy ✅', 1690),
  // Tappy's own barcode-mode hint (MODE_HINT.barcode in src/app/(tabs)/scan.tsx).
  'hint.png': `<div style="position:absolute;left:0;right:0;top:300px;text-align:center;"><span style="background:rgba(0,0,0,.55);color:#fff;font:600 40px 'Segoe UI',Arial;padding:12px 26px;border-radius:30px;">Center the barcode in the frame</span></div>`,
  'scanning.png': `<div style="position:absolute;left:0;right:0;top:1790px;text-align:center;"><span style="background:rgba(0,0,0,.55);color:#fff;font:600 40px 'Segoe UI',Arial;padding:12px 26px;border-radius:30px;">Scanning…</span></div>`,
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [name, html] of Object.entries(files)) {
    await p.setContent(`<html><body style="margin:0;background:transparent;width:1080px;height:1920px;position:relative">${html}</body></html>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(out, name), omitBackground: true });
  }
  await b.close();
  console.log('captions:', Object.keys(files).join(' '));
})();
