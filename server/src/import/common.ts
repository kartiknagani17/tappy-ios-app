import { parse, type Options } from 'csv-parse';
import type { Readable } from 'node:stream';
import type { DB } from '../db/index.ts';

/** Stream CSV/TSV rows as objects keyed by header name. Never buffers the file. */
export async function* readRows(input: Readable, options: Options = {}): AsyncGenerator<Record<string, string>> {
  const parser = input.pipe(
    parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      ...options,
    }),
  );
  for await (const row of parser) yield row as Record<string, string>;
}

/** Commits writes in batches so multi-million-row imports stay fast and crash-safe. */
export class BatchWriter {
  private pending = 0;
  private open = false;
  private readonly db: DB;
  private readonly size: number;
  constructor(db: DB, size = 2000) {
    this.db = db;
    this.size = size;
  }
  run(fn: () => void) {
    if (!this.open) {
      this.db.exec('BEGIN');
      this.open = true;
    }
    fn();
    if (++this.pending >= this.size) this.flush();
  }
  flush() {
    if (this.open) this.db.exec('COMMIT');
    this.open = false;
    this.pending = 0;
  }
  abort() {
    if (this.open) this.db.exec('ROLLBACK');
    this.open = false;
    this.pending = 0;
  }
}

export type Logger = (msg: string) => void;

export class Progress {
  read = 0;
  upserted = 0;
  skipped = 0;
  private started = Date.now();
  private lastLog = 0;
  private readonly label: string;
  private readonly log: Logger;
  private readonly every: number;
  constructor(label: string, log: Logger, every = 50_000) {
    this.label = label;
    this.log = log;
    this.every = every;
  }
  tick() {
    this.read++;
    if (this.read - this.lastLog >= this.every) {
      this.lastLog = this.read;
      this.report();
    }
  }
  report(final = false) {
    const secs = (Date.now() - this.started) / 1000;
    const rate = Math.round(this.read / Math.max(secs, 0.001));
    this.log(
      `[${this.label}] ${final ? 'done' : 'progress'}: read ${this.read.toLocaleString()} rows, ` +
        `upserted ${this.upserted.toLocaleString()}, skipped ${this.skipped.toLocaleString()} ` +
        `(${rate.toLocaleString()} rows/s, ${secs.toFixed(0)}s)`,
    );
  }
}

export function startRun(db: DB, source: string, file: string): number {
  return Number(db.prepare('INSERT INTO import_runs (source, file) VALUES (?, ?)').run(source, file).lastInsertRowid);
}

export function finishRun(db: DB, id: number, p: Progress, status: 'done' | 'failed') {
  db.prepare(
    `UPDATE import_runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), rows_read = ?, rows_upserted = ?,
       rows_skipped = ?, status = ? WHERE id = ?`,
  ).run(p.read, p.upserted, p.skipped, status, id);
}

export const clean = (v: string | undefined | null): string | null => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  return t ? t : null;
};

export const toNumber = (v: string | undefined | null): number | null => {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Pull a "Contains: ..." allergen statement out of an ingredient string, if printed there. */
export function extractContainsStatement(ingredients: string | null): string | null {
  if (!ingredients) return null;
  const m = ingredients.match(
    /\bcontains\s*:?\s*([^.]*?(?:milk|egg|wheat|soy|peanut|tree nut|almond|cashew|walnut|pecan|fish|shellfish|shrimp|crab|sesame|coconut)[^.]*)(?:\.|$)/i,
  );
  return m ? `Contains: ${m[1].trim()}` : null;
}
