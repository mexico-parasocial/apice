import { readFileSync } from 'node:fs';
import { resolveNs } from 'node:dns/promises';
import { VLPDS_REVISION } from '../src/protocol.mjs';

const config = JSON.parse(readFileSync(new URL('../infra/beta-domain.json', import.meta.url), 'utf8'));
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'PENDING'} ${label}`); if (!ok) failures++; };
async function json(url) { const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }); if (!r.ok) throw Error('Unavailable'); return r.json(); }
const local = `http://127.0.0.1:${config.loopbackPorts.pds}`;
try {
  const health = await json(`${local}/xrpc/_health`); check(health.version === `1.1.0+${VLPDS_REVISION.slice(0, 10)}`, 'Pinned beta PDS is running locally');
  const description = await json(`${local}/xrpc/com.atproto.server.describeServer`); check(description.inviteCodeRequired === true && description.vlpds?.spaces === true, 'PDS requires invitations and supports Spaces');
  const metadata = await json(`${local}/.well-known/oauth-authorization-server`); check(metadata.issuer === config.origins.pds, 'PDS advertises the selected HTTPS domain');
} catch { check(false, 'Beta PDS local health and configuration'); }
try { const r = await fetch(`http://127.0.0.1:${config.loopbackPorts.storage}/minio/health/live`, { signal: AbortSignal.timeout(5000) }); check(r.ok, 'Private beta object storage is running'); } catch { check(false, 'Private beta object storage is running'); }
let nameservers = [];
try { nameservers = await resolveNs(config.domain); } catch { /* Expected while registration is in progress. */ }
check(nameservers.length > 0, `${config.domain} has public nameservers`);
if (nameservers.length) {
  try {
    const metadata = await json(`${config.origins.app}/oauth-client-metadata.json`);
    check(metadata.client_id === `${config.origins.app}/oauth-client-metadata.json` && metadata.token_endpoint_auth_method === 'private_key_jwt' && metadata.jwks?.keys?.length > 0 && metadata.jwks.keys.every(k => !k.d), 'Public HTTPS OAuth metadata is reachable');
  } catch { check(false, 'Public HTTPS OAuth metadata is reachable'); }
} else check(false, 'Public HTTPS verification waits for domain registration and Tunnel');
console.log('Full acceptance still requires real accounts, client integration, media, session recovery and offsite restore.');
process.exitCode = failures ? 1 : 0;
