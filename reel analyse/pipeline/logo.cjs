// Renders the scan screen's white "tappy" wordmark (Logo size 34, weight 800, -0.06em) at 1080x1920.
const { chromium } = require('D:/playwright-mcp/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1080 / 405 });
  await p.setContent(`<html><body style="margin:0;background:transparent">
    <div style="position:absolute;left:0;right:0;top:40px;text-align:center;font:800 34px/1.15 -apple-system,'SF Pro Display','Segoe UI',system-ui,sans-serif;letter-spacing:-2.04px;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.35)">tappy</div></body></html>`);
  await p.screenshot({ path: process.argv[2], omitBackground: true });
  await b.close();
})();
