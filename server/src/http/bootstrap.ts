import { createServer, type RequestListener, type Server } from 'node:http';
import type { Config } from '../config.ts';
import type { DB } from '../db/index.ts';
import { logError } from '../lib/log.ts';

/** node:http server with slowloris / idle-connection protections. */
export function createHttpServer(
  handler: RequestListener,
  config: Pick<Config, 'requestTimeoutMs' | 'headersTimeoutMs'>,
): Server {
  const server = createServer(
    {
      requestTimeout: config.requestTimeoutMs, // whole request (headers + body) must arrive within this
      headersTimeout: Math.min(config.headersTimeoutMs, config.requestTimeoutMs),
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16 * 1024,
      connectionsCheckingInterval: 2_000,
    },
    handler,
  );
  server.maxRequestsPerSocket = 1000;
  server.maxHeadersCount = 100;
  server.on('clientError', (err: NodeJS.ErrnoException, socket) => {
    if (!socket.writable) return socket.destroy();
    const status = err.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : err.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400;
    socket.end(`HTTP/1.1 ${status} ${status === 408 ? 'Request Timeout' : status === 431 ? 'Request Header Fields Too Large' : 'Bad Request'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
  return server;
}

export type ShutdownOptions = {
  server: Server;
  db: DB;
  timeoutMs: number;
  exit?: (code: number) => void;
  /** Register SIGTERM/SIGINT/unhandledRejection/uncaughtException handlers on `process`. */
  processHandlers?: boolean;
};

/**
 * Graceful shutdown: stop accepting connections, close idle keep-alive sockets, let in-flight
 * requests finish (up to timeoutMs, then force-close), then close the database and exit.
 */
export function installShutdown({ server, db, timeoutMs, exit = (c) => process.exit(c), processHandlers = true }: ShutdownOptions) {
  let shuttingDown = false;
  const shutdown = (reason: string, code = 0): Promise<void> => {
    if (shuttingDown) return Promise.resolve();
    shuttingDown = true;
    console.log(`Shutting down (${reason})...`);
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          if (db.isOpen) db.close();
        } catch (e) {
          logError('closing database', e);
        }
        resolve();
        exit(code);
      };
      const force = setTimeout(() => {
        server.closeAllConnections();
        finish();
      }, timeoutMs);
      force.unref();
      server.close(() => {
        clearTimeout(force);
        finish();
      });
      server.closeIdleConnections();
    });
  };

  if (processHandlers) {
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => logError('Unhandled promise rejection', reason));
    process.on('uncaughtException', (err) => {
      logError('Uncaught exception', err);
      void shutdown('uncaughtException', 1);
    });
  }
  return shutdown;
}
