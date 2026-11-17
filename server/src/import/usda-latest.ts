import path from 'node:path';
import type { DB } from '../db/index.ts';

/**
 * USDA publishes a new Branded Foods file about twice a year, with the release date in the file
 * name. Instead of a hard-coded URL (which kept re-importing the same release), read the official
 * download page, take the newest file, and import it only if we haven't already.
 */
export const USDA_DOWNLOAD_PAGE = 'https://fdc.nal.usda.gov/download-datasets/';
const FILE_RE = /FoodData_Central_branded_food_csv_(\d{4}-\d{2}-\d{2})\.zip/g;

/** Newest branded-food CSV release linked from the page HTML, or null if none is found. */
export function newestUsdaRelease(html: string): { name: string; url: string; date: string } | null {
  let best: { name: string; date: string } | null = null;
  for (const m of html.matchAll(FILE_RE)) {
    if (!best || m[1] > best.date) best = { name: m[0], date: m[1] };
  }
  return best ? { ...best, url: `https://fdc.nal.usda.gov/fdc-datasets/${best.name}` } : null;
}

/** File name of the last USDA release that imported successfully, or null. */
export function lastImportedUsda(db: DB): string | null {
  const row = db.prepare(`SELECT file FROM import_runs WHERE source = 'usda' AND status = 'done' ORDER BY id DESC LIMIT 1`).get() as
    | { file: string | null }
    | undefined;
  return row?.file ? path.basename(row.file) : null;
}

export async function findNewUsdaRelease(
  db: DB,
  opts: { fetchImpl?: typeof fetch; userAgent: string },
): Promise<{ name: string; url: string; date: string } | null> {
  const res = await (opts.fetchImpl ?? fetch)(USDA_DOWNLOAD_PAGE, { headers: { 'User-Agent': opts.userAgent } });
  if (!res.ok) throw new Error(`USDA download page: HTTP ${res.status}`);
  const newest = newestUsdaRelease(await res.text());
  if (!newest) throw new Error('USDA download page: no Branded Foods release found (page layout changed?)');
  const last = lastImportedUsda(db);
  // Compare by date: an extracted folder import still counts if its name carries the same release date.
  return last && last.includes(newest.date) ? null : newest;
}
