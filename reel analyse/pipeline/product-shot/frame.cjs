// Tappy's barcode scan frame (src/app/(tabs)/scan.tsx styles.frame: 240x240pt, 4pt white border,
// TL/BR radius 60, TR/BL radius 4), scaled to 1080x1920 (x2.667), slightly thicker so it reads on a phone.
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
const out = process.argv[2];
const box = (color) => `<div style="position:absolute;left:220px;top:747px;width:640px;height:640px;box-sizing:border-box;
  border:15px solid ${color};border-radius:160px 11px 160px 11px;
  filter:drop-shadow(0 0 6px rgba(0,0,0,.55)) drop-shadow(0 0 2px rgba(0,0,0,.6));"></div>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [n, c] of [['frame.png', '#fff'], ['frame-hit.png', '#22C55E']]) {
    await p.setContent(`<html><body style="margin:0;background:transparent;width:1080px;height:1920px;position:relative">${box(c)}</body></html>`);
    await p.screenshot({ path: out + '/' + n, omitBackground: true });
  }
  await b.close();
})();
