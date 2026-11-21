// Type 2 reel: fetch the real official posters from TMDB for a list of documentaries.
// usage: node posters.mjs <reelDir>
//   reads  <reelDir>/list.txt   one title per line, optional year and kind:
//            Seaspiracy (2021)
//            Bad Surgeon (2023) | tv        <- series: add "| tv"
//            # comments and blank lines are ignored
//   writes <reelDir>/posters/01.jpg ... NN.jpg (in list order) and posters.json (what matched)
// The TMDB key is read from TMDB_API_KEY (env) or pipeline/type-2/.env (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(KIT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.TMDB_API_KEY;
if (!KEY) { console.error('missing TMDB_API_KEY (put it in reel analyse/pipeline/type-2/.env)'); process.exit(1); }

const dir = process.argv[2];
if (!dir) { console.error('usage: node posters.mjs <reelDir>'); process.exit(1); }
const lines = fs.readFileSync(path.join(dir, 'list.txt'), 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const api = async (p, q = {}) => {
  const u = new URL('https://api.themoviedb.org/3' + p);
  u.searchParams.set('api_key', KEY);
  u.searchParams.set('language', 'en-US');
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') u.searchParams.set(k, v);
  const r = await get(u);
  if (!r.ok) throw new Error(`TMDB ${r.status} for ${p}`);
  return r.json();
};
// fetch with retries (dropped connections and rate limits happen)
async function get(u) {
  let err;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(u);
      if (r.status !== 429 && r.status < 500) return r;
      err = new Error('HTTP ' + r.status);
    } catch (e) { err = e; }
    await new Promise((s) => setTimeout(s, 1000 * (i + 1)));
  }
  throw err;
}

// Best match: exact (normalised) title > documentary genre (99) > year > popularity. Must have a poster.
function pick(results, title, year, kind) {
  const t = norm(title);
  let best = null, bestScore = -1;
  for (const r of results) {
    if (!r.poster_path) continue;
    const name = r.title || r.name || '';
    const orig = r.original_title || r.original_name || '';
    const date = r.release_date || r.first_air_date || '';
    let s = 0;
    if (norm(name) === t || norm(orig) === t) s += 100;
    else if (norm(name).startsWith(t) || t.startsWith(norm(name))) s += 40;
    if ((r.genre_ids || []).includes(99)) s += 30;
    if (year && date.startsWith(year)) s += 50;
    else if (year && date && Math.abs(Number(date.slice(0, 4)) - Number(year)) === 1) s += 20;
    s += Math.min(10, Math.log10(1 + (r.vote_count || 0)) * 3);
    if (s > bestScore) { bestScore = s; best = { ...r, kind, score: s }; }
  }
  return best;
}

const outDir = path.join(dir, 'posters');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^\d+\.(jpg|png)$/.test(f)) fs.unlinkSync(path.join(outDir, f));

const report = [];
let n = 0, failed = 0;
for (const line of lines) {
  const [main, kindRaw] = line.split('|').map((s) => s.trim());
  const m = main.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  const title = m ? m[1] : main, year = m ? m[2] : '';
  const kinds = kindRaw === 'tv' ? ['tv'] : kindRaw === 'movie' ? ['movie'] : ['movie', 'tv'];
  let best = null;
  for (const kind of kinds) {
    const res = await api(`/search/${kind}`, { query: title, ...(year ? (kind === 'tv' ? { first_air_date_year: year } : { year }) : {}) });
    let hit = pick(res.results || [], title, year, kind);
    if (!hit && year) hit = pick((await api(`/search/${kind}`, { query: title })).results || [], title, year, kind);
    if (hit && (!best || hit.score > best.score)) best = hit;
  }
  if (!best) { console.log(`  MISSING  ${line}`); report.push({ line, found: false }); failed++; continue; }
  n++;
  const file = String(n).padStart(2, '0') + '.jpg';
  const img = await get('https://image.tmdb.org/t/p/original' + best.poster_path);
  if (!img.ok) throw new Error('poster download failed: ' + best.poster_path);
  fs.writeFileSync(path.join(outDir, file), Buffer.from(await img.arrayBuffer()));
  const name = best.title || best.name, date = (best.release_date || best.first_air_date || '').slice(0, 4);
  const exact = norm(name) === norm(title) || norm(best.original_title || best.original_name || '') === norm(title);
  const doc = (best.genre_ids || []).includes(99);
  const flag = [!exact && 'TITLE DIFFERS', year && date !== year && 'YEAR DIFFERS', !doc && 'NOT TAGGED DOCUMENTARY'].filter(Boolean).join(', ');
  console.log(`  ${file}  ${name} (${date}) [${best.kind} ${best.id}]${flag ? '   <-- check: ' + flag : ''}`);
  report.push({ line, found: true, file, title: name, year: date, kind: best.kind, tmdbId: best.id, documentary: doc, poster: best.poster_path, check: flag || undefined });
}
fs.writeFileSync(path.join(dir, 'posters.json'), JSON.stringify(report, null, 2));
console.log(`posters: ${n} downloaded, ${failed} missing -> ${outDir}`);
if (failed) process.exitCode = 2;
