import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadConfig } from './config.ts';
import { migrate, openDb } from './db/index.ts';
import { importOff } from './import/off.ts';
import { updateOffFromDeltas } from './import/off-delta.ts';
import { importUsda, openUsdaSource } from './import/usda.ts';
import { findNewUsdaRelease } from './import/usda-latest.ts';
import { displayName } from './lib/names.ts';
import { approveContribution, pendingContributions, rejectContribution } from './services/products.ts';

const HELP = `Tappy data CLI

  node src/cli.ts migrate                 Create/upgrade the database schema
  node src/cli.ts download [usda|off|all] Stream the bulk files into RAW_DATA_DIR (default: all)
  node src/cli.ts import-usda [path]      Import USDA Branded Foods (.zip or extracted folder)
  node src/cli.ts import-off [path]       Import Open Food Facts US products (.csv or .csv.gz)
  node src/cli.ts update                  Daily refresh: Open Food Facts daily changes + any new USDA release
  node src/cli.ts update-off              Apply Open Food Facts' daily change files not applied yet
  node src/cli.ts update-usda             Download and import the newest USDA release if it's new
  node src/cli.ts names [n]               Products whose names the app cleans up (default: 30)
  node src/cli.ts review [n]              Ingredient-label photos waiting for review, next to current data
  node src/cli.ts approve <id>            Use a reviewed label photo as the product's data for everyone
  node src/cli.ts reject <id>             Discard a label photo
  node src/cli.ts stats                   Row counts and vision spend
  node src/cli.ts feedback [n]            Latest feedback messages (default: 50)
  node src/cli.ts backup [dir] [keep]     Consistent snapshot of the live database (default: keep 2)

Imports are idempotent: re-running with the same file changes nothing.`;

const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function download(url: string, dest: string) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const total = Number(head.headers.get('content-length') ?? 0);
  if (existsSync(dest) && total && statSync(dest).size === total) {
    log(`${path.basename(dest)} already downloaded (${(total / 1e6).toFixed(0)} MB)`);
    return;
  }
  log(`Downloading ${url}${total ? ` (${(total / 1e6).toFixed(0)} MB)` : ''}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  let done = 0;
  let lastPct = -1;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (c: Buffer) => {
    done += c.length;
    const pct = total ? Math.floor((done / total) * 100) : -1;
    if (pct !== lastPct && pct % 5 === 0) {
      lastPct = pct;
      log(`  ${path.basename(dest)} ${pct}% (${(done / 1e6).toFixed(0)} MB)`);
    }
  });
  const tmp = `${dest}.part`;
  await pipeline(body, createWriteStream(tmp));
  renameSync(tmp, dest);
  log(`Saved ${dest}`);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const config = loadConfig();
  const usdaFile = path.join(config.rawDataDir, path.basename(new URL(config.usdaBrandedCsvUrl).pathname));
  const offFile = path.join(config.rawDataDir, path.basename(new URL(config.offCsvUrl).pathname));

  switch (cmd) {
    case 'migrate': {
      const db = openDb(config.dbPath, { migrate: false });
      const applied = migrate(db);
      log(applied.length ? `Applied ${applied.join(', ')}` : 'Schema is up to date');
      log(`Database: ${config.dbPath}`);
      return;
    }
    case 'download': {
      if (!arg || arg === 'all' || arg === 'usda') await download(config.usdaBrandedCsvUrl, usdaFile);
      if (!arg || arg === 'all' || arg === 'off') await download(config.offCsvUrl, offFile);
      return;
    }
    case 'import-usda': {
      const db = openDb(config.dbPath);
      const source = await openUsdaSource(arg ? path.resolve(arg) : usdaFile);
      log(`Importing USDA Branded Foods from ${source.describe}`);
      await importUsda(db, source, log);
      return;
    }
    case 'import-off': {
      const db = openDb(config.dbPath);
      const file = arg ? path.resolve(arg) : offFile;
      if (!existsSync(file)) throw new Error(`${file} not found. Run "npm run data:download -- off" first.`);
      log(`Importing Open Food Facts (US only) from ${file}`);
      await importOff(db, file, log);
      return;
    }
    case 'update':
    case 'update-off':
    case 'update-usda': {
      const db = openDb(config.dbPath);
      // OFF first: it's small and daily. A USDA failure must not undo it, and vice versa.
      let failed = false;
      if (cmd !== 'update-usda') {
        try {
          await updateOffFromDeltas(db, { userAgent: config.offUserAgent }, log);
        } catch (e) {
          failed = true;
          log(`Open Food Facts update failed: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (cmd !== 'update-off') {
        try {
          const release = await findNewUsdaRelease(db, { userAgent: config.offUserAgent });
          if (!release) log('USDA: already on the newest release');
          else {
            log(`USDA: new release ${release.date}`);
            const file = path.join(config.rawDataDir, release.name);
            await download(release.url, file);
            await importUsda(db, await openUsdaSource(file), log);
          }
        } catch (e) {
          failed = true;
          log(`USDA update failed: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (failed) process.exitCode = 1;
      return;
    }
    case 'review': {
      const db = openDb(config.dbPath);
      const rows = pendingContributions(db, Number(arg) || 20);
      for (const r of rows) {
        console.log(`#${r.id}  ${r.created_at.slice(0, 10)}  ${r.product_name ?? '(no product yet)'}  barcode ${r.gtin14}`);
        console.log(`  photo: ${r.ingredients_text}`);
        if (r.allergens_text) console.log(`         ${r.allergens_text}`);
        console.log(`  now:   ${r.current_ingredients ?? '(none)'}\n`);
      }
      console.log(rows.length ? 'Approve with: approve <id>   Reject with: reject <id>' : 'Nothing waiting for review.');
      return;
    }
    case 'approve':
    case 'reject': {
      const db = openDb(config.dbPath);
      const id = Number(arg);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Usage: node src/cli.ts ${cmd} <contribution id>`);
      const out = cmd === 'approve' ? approveContribution(db, id) : rejectContribution(db, id);
      if (!out.ok) throw new Error(`Can't ${cmd} #${id}: ${out.reason}`);
      log(cmd === 'approve' ? `Approved #${id}: everyone now sees the photographed ingredients.` : `Rejected #${id}.`);
      return;
    }
    case 'names': {
      const db = openDb(config.dbPath);
      const rows = db.prepare('SELECT name, brand, category FROM products ORDER BY random() LIMIT 20000').all() as {
        name: string;
        brand: string | null;
        category: string | null;
      }[];
      let shown = 0;
      for (const r of rows) {
        const out = displayName(r.name, r.brand, r.category);
        if (out !== r.name && shown++ < (Number(arg) || 30)) console.log(`${r.name}  →  ${out}`);
      }
      return;
    }
    case 'backup': {
      // VACUUM INTO writes a consistent, compacted copy even while the API is serving traffic.
      const dir = path.resolve(arg ?? path.join(path.dirname(config.dbPath), 'backups'));
      const keep = Math.max(1, Number(process.argv[4] ?? 2));
      mkdirSync(dir, { recursive: true });
      const target = path.join(dir, `tappy-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      const db = openDb(config.dbPath, { migrate: false });
      log(`Backing up ${config.dbPath} -> ${target}`);
      db.prepare('VACUUM INTO ?').run(target);
      db.close();
      const old = readdirSync(dir)
        .filter((f) => /^tappy-.*\.db$/.test(f))
        .sort()
        .slice(0, -keep);
      for (const f of old) rmSync(path.join(dir, f));
      log(`Done (${(statSync(target).size / 1e6).toFixed(0)} MB). Removed ${old.length} old backup(s).`);
      return;
    }
    case 'stats': {
      const db = openDb(config.dbPath);
      const q = (sql: string) => db.prepare(sql).all();
      console.table(
        q(`SELECT source, count(*) AS products, sum(ingredients_text IS NOT NULL) AS with_ingredients FROM products GROUP BY source`),
      );
      console.table(q(`SELECT status, count(*) AS contributions FROM contributions GROUP BY status`));
      console.table(q(`SELECT count(*) AS flagged FROM products WHERE needs_review = 1`));
      console.table(
        q(`SELECT substr(created_at, 1, 10) AS day, model, count(*) AS calls, sum(input_tokens) AS input_tokens,
             sum(output_tokens) AS output_tokens, round(sum(est_cost_usd), 4) AS est_cost_usd, round(avg(latency_ms)) AS avg_ms
           FROM vision_calls GROUP BY day, model ORDER BY day DESC LIMIT 30`),
      );
      return;
    }
    case 'feedback': {
      const db = openDb(config.dbPath);
      const rows = db
        .prepare(`SELECT id, datetime(created_at, 'unixepoch') AS at, topic, message FROM feedback ORDER BY id DESC LIMIT ?`)
        .all(Number(arg) || 50) as { id: number; at: string; topic: string; message: string }[];
      for (const r of rows.reverse()) console.log(`#${r.id}  ${r.at} UTC  [${r.topic}]
${r.message}
`);
      if (!rows.length) console.log('No feedback yet.');
      return;
    }
    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
