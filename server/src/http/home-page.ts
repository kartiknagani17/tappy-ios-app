import { LEGAL_CONTACT } from '../legal/content.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The public home page (tappy.company). Static, inline styles only, no scripts or third-party requests. */
export function renderHomePage(): string {
  const contact = esc(LEGAL_CONTACT);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tappy: find food you can eat</title>
<meta name="description" content="Tappy checks the ingredients of packaged food against your allergies and diets. Scan a barcode, browse groceries and keep lists of what works for you.">
<style>
  :root { --coral: #E04D2A; --ink: #1F1513; --muted: #7A6A66; --line: #EBDFDB; --soft: #FFF6F1; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: var(--ink); font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--coral); }
  .hero { background: var(--coral); color: #fff; padding: 72px 20px 80px; text-align: center; }
  .logo { font: 800 64px/1.1 Arial, Helvetica, sans-serif; letter-spacing: -4px; margin: 0; }
  .hero h1 { font-size: clamp(28px, 6vw, 40px); line-height: 1.2; margin: 20px auto 12px; max-width: 18ch; font-weight: 700; letter-spacing: -0.5px; }
  .hero p { max-width: 46ch; margin: 0 auto; font-size: 19px; opacity: 0.95; }
  .soon { display: inline-block; margin-top: 28px; padding: 12px 22px; border-radius: 999px; background: #fff; color: var(--coral); font-weight: 700; }
  main { max-width: 860px; margin: 0 auto; padding: 56px 20px 24px; }
  h2 { font-size: 26px; letter-spacing: -0.3px; margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin-bottom: 48px; }
  .card { background: var(--soft); border-radius: 16px; padding: 22px; }
  .card h3 { margin: 0 0 6px; font-size: 19px; }
  .card p { margin: 0; color: var(--muted); font-size: 16px; }
  .note { border-top: 1px solid var(--line); padding-top: 28px; color: var(--muted); font-size: 15px; }
  .note p { margin: 0 0 12px; }
  footer { max-width: 860px; margin: 0 auto; padding: 8px 20px 56px; display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 15px; }
  @media (prefers-color-scheme: dark) {
    body { background: #151211; color: #F3ECE9; } .card { background: #231D1B; } .card p, .note { color: #AFA3A0; } .note { border-color: #2E2725; } a { color: #FF8F6F; }
  }
</style>
</head>
<body>
<header class="hero">
  <p class="logo">tappy</p>
  <h1>Find food you can eat</h1>
  <p>Tappy reads the ingredients on packaged food and checks them against your allergies, diets and the ingredients you avoid.</p>
  <span class="soon">Coming soon to the App Store</span>
</header>
<main>
  <h2>How it works</h2>
  <div class="grid">
    <div class="card"><h3>Scan</h3><p>Point your camera at a barcode. Tappy shows a clear verdict and flags every ingredient that matters to you.</p></div>
    <div class="card"><h3>Grocery</h3><p>Browse aisles and search over a million products. See which ones fit your profile at a glance.</p></div>
    <div class="card"><h3>Lists</h3><p>Save what works for you into lists such as Want to Try or Weekly Shopping List.</p></div>
  </div>
  <div class="note">
    <p>Tappy is a guide based on the information on package labels, which can be incomplete or out of date. It is not medical advice. If you have a severe allergy, always read the package yourself.</p>
    <p>Product information comes from <a href="https://world.openfoodfacts.org">Open Food Facts</a> (open database licence ODbL) and the U.S. Department of Agriculture FoodData Central, plus label photos shared by Tappy users.</p>
    <p>Questions? Email <a href="mailto:${contact}">${contact}</a>.</p>
  </div>
</main>
<footer>
  <a href="/privacy">Privacy Policy</a>
  <a href="/terms">Terms of Use</a>
  <a href="mailto:${contact}">Contact</a>
</footer>
</body>
</html>`;
}
