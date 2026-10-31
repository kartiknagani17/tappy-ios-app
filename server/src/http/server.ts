import type { AddressInfo } from 'node:net';
import { loadConfig, photoScanningEnabled, validateConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { logError, registerSecret } from '../lib/log.ts';
import { OffLiveClient } from '../services/off-live.ts';
import { ScanService } from '../services/scan.ts';
import { createVisionProvider, VisionService } from '../services/vision/index.ts';
import { createApp } from './app.ts';
import { createHttpServer, installShutdown } from './bootstrap.ts';

const config = loadConfig();
registerSecret(config.anthropicApiKey);
registerSecret(config.usdaApiKey);
try {
  for (const w of validateConfig(config)) console.warn(`Warning: ${w}`);
} catch (e) {
  logError('Startup', e);
  process.exit(1);
}

const db = openDb(config.dbPath);
const vision = new VisionService(db, createVisionProvider(config), {
  primaryModel: config.visionModel,
  escalationModel: config.visionEscalationModel,
  escalateBelow: config.visionEscalateBelow,
  dailyBudgetUsd: config.visionDailyBudgetUsd,
});
const offLive = config.offLiveLookup
  ? new OffLiveClient({ userAgent: config.offUserAgent, maxPerMinute: config.offLiveMaxPerMinute })
  : null;
const scan = new ScanService({ db, config, vision, offLive });

const server = createHttpServer(createApp({ db, config, scan }), config);
installShutdown({ server, db, timeoutMs: config.shutdownTimeoutMs });

server.listen(config.port, config.host, () => {
  const count = (db.prepare('SELECT count(*) AS n FROM products').get() as { n: number }).n;
  const { port } = server.address() as AddressInfo;
  console.log(
    `Tapi API listening on http://localhost:${port} (bound to ${config.host}; ${count.toLocaleString()} products, ` +
      `photo scanning ${photoScanningEnabled(config) ? `on, vision model ${config.visionModel}` : 'off'})`,
  );
});
