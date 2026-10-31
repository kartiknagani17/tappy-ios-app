import { createServer } from 'node:http';
import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { OffLiveClient } from '../services/off-live.ts';
import { ScanService } from '../services/scan.ts';
import { createVisionProvider, VisionService } from '../services/vision/index.ts';
import { createApp } from './app.ts';

const config = loadConfig();
const db = openDb(config.dbPath);
const vision = new VisionService(db, createVisionProvider(config), {
  primaryModel: config.visionModel,
  escalationModel: config.visionEscalationModel,
  escalateBelow: config.visionEscalateBelow,
});
const offLive = config.offLiveLookup
  ? new OffLiveClient({ userAgent: config.offUserAgent, maxPerMinute: config.offLiveMaxPerMinute })
  : null;
const scan = new ScanService({ db, config, vision, offLive });

createServer(createApp({ db, config, scan })).listen(config.port, () => {
  const count = (db.prepare('SELECT count(*) AS n FROM products').get() as { n: number }).n;
  console.log(
    `Tapi API listening on http://localhost:${config.port} (${count.toLocaleString()} products, vision model ${config.visionModel})`,
  );
});
