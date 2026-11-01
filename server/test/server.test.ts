import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createHttpServer, installShutdown } from '../src/http/bootstrap.ts';
import { testDb } from './helpers.ts';

const SERVER_ROOT = path.join(import.meta.dirname, '..');

describe('server process', () => {
  it('starts without an API key (photo scanning off), serves health, and exits 0 on SIGTERM', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tappy-srv-'));
    // Empty values (not deleted) so a developer's server/.env can't fill them back in.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: '0',
      DATABASE_PATH: path.join(dir, 't.db'),
      UPLOADS_DIR: path.join(dir, 'u'),
      ANTHROPIC_API_KEY: '',
      PHOTO_SCANNING: 'auto',
    };
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/http/server.ts'], { cwd: SERVER_ROOT, env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    try {
      const port = await new Promise<number>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 10_000);
        child.stdout.on('data', () => {
          const m = /listening on http:\/\/localhost:(\d+)/.exec(out);
          if (m) {
            clearTimeout(t);
            resolve(Number(m[1]));
          }
        });
        child.on('exit', () => reject(new Error(`server exited early: ${out}`)));
      });
      assert.match(out, /photo scanning is disabled/i);
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.deepEqual(await health.json(), { ok: true, photo_scanning: false, password_reset: false });
      const code = await new Promise<number | null>((resolve) => {
        child.on('exit', (c) => resolve(c));
        child.kill('SIGTERM');
      });
      assert.equal(code, 0);
      assert.match(out, /Shutting down \(SIGTERM\)/);
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast when PHOTO_SCANNING=on and no API key is configured', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tappy-srv-'));
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0', DATABASE_PATH: path.join(dir, 't.db'), PHOTO_SCANNING: 'on', ANTHROPIC_API_KEY: '' };
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/http/server.ts'], { cwd: SERVER_ROOT, env });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const code = await new Promise<number | null>((resolve) => child.on('exit', (c) => resolve(c)));
    rmSync(dir, { recursive: true, force: true });
    assert.equal(code, 1);
    assert.match(err, /ANTHROPIC_API_KEY/);
  });
});

describe('http server hardening', () => {
  it('drops slowloris connections that never finish their headers', async () => {
    const server = createHttpServer((_req, res) => res.end('ok'), { requestTimeoutMs: 1000, headersTimeoutMs: 1000 });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      const started = Date.now();
      const reply = await new Promise<string>((resolve, reject) => {
        const s = connect(port, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\n')); // never sends the blank line
        let data = '';
        s.on('data', (d) => (data += d));
        s.on('close', () => resolve(data));
        s.on('error', reject);
        s.setTimeout(8000, () => s.destroy(new Error('server never closed the slow connection')));
      });
      assert.match(reply, /^HTTP\/1\.1 408/);
      assert.ok(Date.now() - started < 6000);
    } finally {
      server.close();
    }
  });

  it('graceful shutdown lets in-flight requests finish, then closes the DB', async () => {
    const db = testDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createHttpServer(
      async (_req, res) => {
        await gate;
        res.end('done');
      },
      { requestTimeoutMs: 5000, headersTimeoutMs: 5000 },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    let exitCode: number | null = null;
    const shutdown = installShutdown({ server, db, timeoutMs: 5000, exit: (c) => (exitCode = c), processHandlers: false });
    const inflight = fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 100));
    const closing = shutdown('test');
    release();
    assert.equal(await inflight, 'done');
    await closing;
    assert.equal(exitCode, 0);
    assert.equal(db.isOpen, false);
  });
});
