import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { DB } from '../db/index.ts';
import { upsertSourceRecord } from '../services/products.ts';
import { BatchWriter, finishRun, Progress, startRun, type Logger } from './common.ts';
import { offRowToRecord } from './off.ts';
import { offJsonToRow } from './off-json.ts';

/**
 * Daily Open Food Facts updates. OFF publishes one file per day with every product changed that
 * day (gzipped JSON, one product per line, ~30 MB) and lists them in index.txt. Each file is applied
 * once (tracked in import_runs as source 'off_delta'), oldest first, so a later edit wins. Only US
 * products are kept, like the bulk import.
 */
export const OFF_DELTA_BASE = 'https://static.openfoodfacts.org/data/delta/';
const FILE_RE = /^openfoodfacts_products_(\d{9,11})_(\d{9,11})\.json\.gz$/;
/** Never look further back than this many files (a server that was down catches up two weeks). */
const MAX_FILES = 14;

export type DeltaOptions = { fetchImpl?: typeof fetch; userAgent: string; base?: string; maxFiles?: number };

/** File names from index.txt, oldest first. Anything that doesn't look like a delta file is ignored. */
export function parseDeltaIndex(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => FILE_RE.test(s))
    .sort((a, b) => Number(FILE_RE.exec(a)![2]) - Number(FILE_RE.exec(b)![2]));
}

/** Which delta files still need applying: not done yet, within the last MAX_FILES, and newer than the last full import. */
export function pendingDeltaFiles(db: DB, files: string[], maxFiles = MAX_FILES): string[] {
  const done = new Set(
    (db.prepare(`SELECT file FROM import_runs WHERE source = 'off_delta' AND status = 'done'`).all() as { file: string }[]).map((r) => r.file),
  );
  const full = db.prepare(`SELECT max(started_at) AS at FROM import_runs WHERE source = 'off' AND status = 'done'`).get() as {
    at: string | null;
  };
  // The bulk file is built daily by OFF; anything that ended two days before our full import is already in it.
  const cutoff = full.at ? Date.parse(full.at) / 1000 - 2 * 86400 : 0;
  return files
    .slice(-maxFiles)
    .filter((f) => !done.has(f) && Number(FILE_RE.exec(f)![2]) > cutoff);
}

/** Apply one delta file from a stream of gzipped JSON lines. Returns the progress counters. */
export async function importOffDeltaStream(db: DB, file: string, gz: Readable, log: Logger = console.log) {
  const progress = new Progress('off_delta', log);
  const run = startRun(db, 'off_delta', file);
  const batch = new BatchWriter(db);
  try {
    const lines = createInterface({ input: gz.pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      progress.tick();
      let p: Record<string, unknown>;
      try {
        p = JSON.parse(line) as Record<string, unknown>;
      } catch {
        progress.skipped++;
        continue;
      }
      const code = typeof p.code === 'string' ? p.code : typeof p._id === 'string' ? p._id : '';
      const rec = code ? offRowToRecord(offJsonToRow(p, code)) : null;
      if (!rec) {
        progress.skipped++;
        batch.flushIfStale();
        continue;
      }
      batch.run(() => {
        if (upsertSourceRecord(db, rec)) progress.upserted++;
      });
    }
    batch.flush();
    progress.report(true);
    finishRun(db, run, progress, 'done');
    return progress;
  } catch (e) {
    batch.abort();
    finishRun(db, run, progress, 'failed');
    throw e;
  }
}

/** Download and apply every pending daily file. Safe to run as often as you like. */
export async function updateOffFromDeltas(db: DB, opts: DeltaOptions, log: Logger = console.log): Promise<number> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.base ?? OFF_DELTA_BASE;
  const headers = { 'User-Agent': opts.userAgent };
  const index = await fetchImpl(`${base}index.txt`, { headers });
  if (!index.ok) throw new Error(`OFF delta index: HTTP ${index.status}`);
  const pending = pendingDeltaFiles(db, parseDeltaIndex(await index.text()), opts.maxFiles);
  if (!pending.length) {
    log('Open Food Facts: already up to date');
    return 0;
  }
  for (const file of pending) {
    log(`Open Food Facts daily update ${file}`);
    const res = await fetchImpl(`${base}${file}`, { headers });
    if (!res.ok || !res.body) throw new Error(`OFF delta ${file}: HTTP ${res.status}`);
    await importOffDeltaStream(db, file, Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>), log);
  }
  return pending.length;
}
