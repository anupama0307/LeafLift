/**
 * Start ngrok tunnels for LeafLift services and update .env endpoints.
 *
 * Usage:
 *   1) Export NGROK_AUTHTOKEN in your shell or .env
 *   2) Start local servers (API, admin API, rider web, admin web)
 *   3) Run: npm run ngrok
 */

import ngrok from '@ngrok/ngrok';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE = path.join(__dirname, '.env');

const MAIN_API_PORT = parseInt(process.env.PORT || '5001', 10);
const ADMIN_API_PORT = parseInt(process.env.ADMIN_PORT || '5002', 10);
const RIDER_WEB_PORT = parseInt(process.env.VITE_DEV_PORT || '3005', 10);
const ADMIN_WEB_PORT = parseInt(process.env.ADMIN_DEV_PORT || '3006', 10);

const token = process.env.NGROK_AUTHTOKEN;
if (!token) {
  console.error('Missing NGROK_AUTHTOKEN. Add it to .env or your terminal session first.');
  process.exit(1);
}

const originalEnv = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
let restored = false;

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, 'm');
  return matcher.test(content)
    ? content.replace(matcher, line)
    : `${content}${content.endsWith('\n') || content.length === 0 ? '' : '\n'}${line}\n`;
}

async function createTunnel(name, port) {
  const listener = await ngrok.forward({
    addr: port,
    authtoken: token,
    proto: 'http',
  });
  const url = listener.url();
  console.log(`${name}: ${url} -> localhost:${port}`);
  return { name, url, port };
}

async function restoreAndExit(code = 0) {
  if (restored) return;
  restored = true;
  try {
    fs.writeFileSync(ENV_FILE, originalEnv);
    await ngrok.disconnect();
    console.log('Restored .env and closed ngrok tunnels.');
  } catch (err) {
    console.error('Cleanup error:', err.message || err);
  }
  process.exit(code);
}

async function main() {
  console.log('Starting ngrok tunnels...');

  const [mainApi, adminApi, riderWeb, adminWeb] = await Promise.all([
    createTunnel('Main API', MAIN_API_PORT),
    createTunnel('Admin API', ADMIN_API_PORT),
    createTunnel('Rider Web', RIDER_WEB_PORT),
    createTunnel('Admin Web', ADMIN_WEB_PORT),
  ]);

  let env = originalEnv;
  env = upsertEnv(env, 'VITE_API_BASE_URL', mainApi.url);
  env = upsertEnv(env, 'VITE_ADMIN_SOCKET_URL', adminApi.url);
  env = upsertEnv(env, 'VITE_ADMIN_API_BASE_URL', adminApi.url);
  env = upsertEnv(env, 'MAIN_SERVER_URL', mainApi.url);
  env = upsertEnv(env, 'CORS_ORIGIN', `${riderWeb.url},${adminWeb.url}`);
  fs.writeFileSync(ENV_FILE, env);

  console.log('');
  console.log('Endpoints written to .env');
  console.log(`Rider Web: ${riderWeb.url}`);
  console.log(`Admin Web: ${adminWeb.url}`);
  console.log(`Main API:  ${mainApi.url}`);
  console.log(`Admin API: ${adminApi.url}`);
  console.log('');
  console.log('Restart local servers so they pick updated env values.');
  console.log('Press Ctrl+C to stop tunnels and restore .env.');

  process.on('SIGINT', () => restoreAndExit(0));
  process.on('SIGTERM', () => restoreAndExit(0));
  process.stdin.resume();
}

main().catch(async (err) => {
  console.error('ngrok startup failed:', err.message || err);
  await restoreAndExit(1);
});
