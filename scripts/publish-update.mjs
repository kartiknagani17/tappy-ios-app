#!/usr/bin/env node
/**
 * Publish an instant (over-the-air) update to installed apps, without a new build.
 *
 *   npm run update -- "Fix the Grocery search"            (production channel)
 *   npm run update -- "Try this first" --channel preview
 *
 * Builds get EXPO_PUBLIC_* values from their eas.json profile, but `eas update` does not read
 * eas.json's env. Without this script an update would fall back to http://localhost:8787 and break
 * the app, so the values are copied from the matching build profile here.
 *
 * Only JavaScript and images can change this way. Native changes (new native libraries, app.json
 * plugins, permissions, icon, Expo SDK upgrades) need a new build AND a new "version" in app.json,
 * so an update made for the new native code never reaches builds that don't have it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const channelAt = args.indexOf('--channel');
const channel = channelAt >= 0 ? args[channelAt + 1] : 'production';
const message = args.filter((_, i) => i !== channelAt && i !== channelAt + 1).join(' ').trim();

if (!message) {
  console.error('Say what changed: npm run update -- "Fix the Grocery search"');
  process.exit(1);
}
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
const profile = Object.values(eas.build).find((p) => p.channel === channel);
if (!profile) {
  console.error(`No build profile in eas.json uses channel "${channel}".`);
  process.exit(1);
}
const env = profile.env ?? {};
if (!/^https:\/\//.test(env.EXPO_PUBLIC_API_URL ?? '')) {
  console.error(`The "${channel}" profile has no https EXPO_PUBLIC_API_URL; refusing to publish an update that can't reach the server.`);
  process.exit(1);
}

console.log(`Publishing to "${channel}" with API ${env.EXPO_PUBLIC_API_URL}: ${message}`);
const easArgs = ['eas-cli@latest', 'update', '--channel', channel, '--environment', channel === 'preview' ? 'preview' : 'production', '--message', message, '--non-interactive'];
// On Windows npx is a .cmd and needs a shell; quote every argument so the message stays one argument.
const win = process.platform === 'win32';
const res = spawnSync('npx', win ? easArgs.map((a) => `"${a.replace(/["%^&|<>]/g, ' ')}"`) : easArgs, {
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, ...env },
});
process.exit(res.status ?? 1);
