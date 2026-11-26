import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LEGAL_CONTACT } from '../legal/content.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SITE = new URL('./site/', import.meta.url);
// Browsers turn CRLF into LF before hashing an inline script for CSP, so normalize here too or a
// Windows checkout would serve a hash that never matches.
const read = (name: string) => readFileSync(new URL(name, SITE), 'utf8').replace(/\r\n?/g, '\n');

const SCRIPT = read('site.js');

/**
 * CSP for the home page: its one inline script is allowed by hash, styles are inline, the favicon is a
 * data: URI. Still no third-party requests of any kind.
 */
export const HOME_PAGE_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${createHash('sha256').update(SCRIPT).digest('base64')}'`,
  "style-src 'unsafe-inline'",
  'img-src data:',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Built once at startup: the page is static apart from the contact address. */
const PAGE = read('index.html')
  .replace('/*CSS*/', () => read('site.css'))
  .replace('/*JS*/', () => SCRIPT)
  .replaceAll('{{CONTACT}}', esc(LEGAL_CONTACT));

/** The public home page (tappy.company). Self-contained: inline CSS and JS, no third-party requests. */
export function renderHomePage(): string {
  return PAGE;
}
