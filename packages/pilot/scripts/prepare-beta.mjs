import { createECDH, generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkedOrigin, readPrivateJson } from '../src/config.mjs';

const config = JSON.parse(readFileSync(new URL('../infra/beta-domain.json', import.meta.url), 'utf8'));
for (const origin of Object.values(config.origins)) checkedOrigin(origin, true);
const root = new URL('../.local/beta/', import.meta.url), secrets = new URL('secrets/', root);
mkdirSync(secrets, { recursive: true, mode: 0o700 });
function once(name, value) {
  const path = new URL(name, secrets);
  if (!existsSync(path)) writeFileSync(path, value, { mode: 0o600, flag: 'wx' });
  return fileURLToPath(path);
}
// Idempotent: rerunning never rotates signing/encryption/storage keys.
const keyFile = once('oauth-client.json', JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })));
readPrivateJson(keyFile);
for (const name of ['jwt', 'admin', 'internal', 's3-secret']) once(name, randomBytes(32).toString('base64url'));
once('s3-access', randomBytes(15).toString('base64url'));
once('kek', randomBytes(32).toString('hex'));
const rotation = createECDH('secp256k1'); rotation.generateKeys(); once('plc-rotation', rotation.getPrivateKey('hex'));
const appEnv = new URL('app.env', root);
if (!existsSync(appEnv)) writeFileSync(appEnv, [
  'NODE_ENV=production', 'PILOT_MODE=production', `PILOT_ORIGIN=${config.origins.app}`,
  `PILOT_PDS_URL=${config.origins.pds}`, `PILOT_STREAMPLACE_URL=${config.origins.video}`,
  `PILOT_LISTEN_PORT=${config.loopbackPorts.app}`, `PILOT_OAUTH_KEY_FILE=${keyFile}`,
  '# Fill with registered DIDs after creating accounts on the production PDS.',
  'PILOT_INSTITUTION_DID=', 'PILOT_ALLOWED_DIDS=', '',
].join('\n'), { mode: 0o600, flag: 'wx' });
console.log(`Prepared private beta configuration in ${fileURLToPath(root)}. No DNS, cloud resources or public routes were created.`);
