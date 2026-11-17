/**
 * Product photos, served from our own address instead of Open Food Facts'.
 *
 * OFF's image server takes ~8 s per photo (even tiny ones), which made the result screen and
 * Similar items crawl. Each photo is downloaded once, kept on disk, and served with a year-long
 * cache header so Cloudflare keeps a copy near the user. The address contains a hash of the
 * source URL, so a new photo on OFF gets a new address (no stale caches).
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { safeOffImageUrl } from '../import/off-json.ts';

let publicBase = '';

/** The API's public address (PUBLIC_URL), e.g. https://api.tappy.company. Empty keeps OFF's URLs. */
export function setImageBase(url: string) {
  publicBase = url.replace(/\/+$/, '');
}

export const imageKey = (src: string) => createHash('sha256').update(src).digest('hex').slice(0, 12);

/** What the app gets as image_url: our cached copy for OFF photos, when PUBLIC_URL is set. */
export function publicImageUrl(id: number, src: string | null): string | null {
  if (!src) return null;
  if (!publicBase || !safeOffImageUrl(src)) return src;
  return `${publicBase}/img/${id}-${imageKey(src)}.jpg`;
}

export const IMAGE_PATH_RE = /^\/img\/(\d{1,15})-([0-9a-f]{12})\.jpg$/;

type Options = {
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Downloads from OFF at the same time (live requests and warming share this). */
  concurrency?: number;
  fetchFn?: typeof fetch;
};

const FAILURE_TTL_MS = 10 * 60_000;
const MAX_FAILURES_REMEMBERED = 10_000;

export class ImageCache {
  private readonly dir: string;
  private readonly opts: Required<Options>;
  private readonly inflight = new Map<string, Promise<Buffer | null>>();
  private readonly failed = new Map<string, number>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(dir: string, opts: Options) {
    this.dir = dir;
    this.opts = { timeoutMs: 25_000, maxBytes: 3_000_000, concurrency: 8, fetchFn: fetch, ...opts };
  }

  fileFor(id: number, src: string) {
    return path.join(this.dir, String(id % 1000).padStart(3, '0'), `${id}-${imageKey(src)}.jpg`);
  }

  /** The photo's bytes: from disk, else downloaded once (concurrent callers share the download). */
  async get(id: number, src: string): Promise<Buffer | null> {
    const file = this.fileFor(id, src);
    try {
      return await readFile(file);
    } catch {
      // not cached yet
    }
    const key = path.basename(file);
    const failedAt = this.failed.get(key);
    if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) return null;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.download(src, file)
        .then((buf) => {
          if (!buf) this.rememberFailure(key);
          return buf;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  /** Start downloading photos the app is about to ask for (e.g. Similar items). Never throws. */
  warm(products: { id: number; image_url: string | null }[]) {
    for (const p of products) if (p.image_url) void this.get(p.id, p.image_url).catch(() => null);
  }

  private rememberFailure(key: string) {
    if (this.failed.size >= MAX_FAILURES_REMEMBERED) this.failed.delete(this.failed.keys().next().value!);
    this.failed.set(key, Date.now());
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.opts.concurrency) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  private async download(src: string, file: string): Promise<Buffer | null> {
    if (!safeOffImageUrl(src)) return null;
    return this.slot(async () => {
      const res = await this.opts.fetchFn(src, {
        headers: { 'User-Agent': this.opts.userAgent },
        signal: AbortSignal.timeout(this.opts.timeoutMs),
        redirect: 'error',
      });
      if (!res.ok) return null;
      if (!/^image\/jpe?g\b/i.test(res.headers.get('content-type') ?? '')) return null;
      if (Number(res.headers.get('content-length') ?? 0) > this.opts.maxBytes) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      // Only real JPEGs of a sane size are kept and served.
      if (buf.length < 100 || buf.length > this.opts.maxBytes || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await writeFile(tmp, buf);
        await rename(tmp, file);
      } catch {
        await rm(tmp, { force: true }).catch(() => {});
      }
      return buf;
    }).catch(() => null);
  }
}
