import type { LegalDoc } from '../legal/content.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Public Terms / Privacy page (the URL to give App Store Connect). Same text as the in-app popup. */
export function renderLegalPage(doc: LegalDoc): string {
  const sections = doc.sections
    .map((s) => `<h2>${esc(s.heading)}</h2>\n${s.body.map((p) => `<p>${esc(p)}</p>`).join('\n')}`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tappy ${esc(doc.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; background: #fff; color: #1b1b2a; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 8px; }
  .updated { color: #6e6e73; margin: 0 0 24px; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } .updated { color: #aaa; } }
</style>
</head>
<body>
<main>
<h1>${esc(doc.title)}</h1>
<p class="updated">Last updated ${esc(doc.updated)}</p>
<p>${esc(doc.intro)}</p>
${sections}
</main>
</body>
</html>`;
}
