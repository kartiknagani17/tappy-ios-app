// Renders the per-product caption overlays (1080x1920, transparent):
//   label.png  "#1 Cool Ranch Doritos" (white box, Impact)   sub.png  one-line finding under the verdict
// usage: node labels.cjs <productDir> "<label text>" "<sub text>" [subTop px, default 1690]
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
const path = require('path');
const [dir, label, sub, subTop = 1690] = process.argv.slice(2);
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const files = {
  'label.png': `<div style="position:absolute;left:0;right:0;top:1620px;text-align:center;"><span style="display:inline-block;background:#fff;color:#000;font:400 76px/1.12 Impact,'Arial Narrow Bold',sans-serif;padding:6px 22px;">${esc(label)}</span></div>`,
  'sub.png': `<div style="position:absolute;left:0;right:0;top:${subTop}px;text-align:center;"><span style="display:inline-block;background:#fff;color:#000;font:700 40px/1.25 'Segoe UI',Arial,sans-serif;padding:8px 18px;border-radius:4px;max-width:860px;">${esc(sub)}</span></div>`,
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const [name, html] of Object.entries(files)) {
    await p.setContent(`<html><body style="margin:0;background:transparent;width:1080px;height:1920px;position:relative">${html}</body></html>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(dir, name), omitBackground: true });
  }
  await b.close();
  console.log('labels written to', dir);
})();
