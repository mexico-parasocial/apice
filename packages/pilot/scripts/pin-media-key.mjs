import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// Read only our pilot volume, with no network. Never export the private JWK
// or OAuth sessions: the child prints only the derived public access key.
const script = `import { DatabaseSync } from 'node:sqlite';
import { createPrivateKey, createPublicKey } from 'node:crypto';
const db = new DatabaseSync('/state/state.sqlite', {readOnly:true});
const row = db.prepare('SELECT value FROM configs WHERE key = ?').get('access-jwk');
const key = createPublicKey(createPrivateKey({key:JSON.parse(Buffer.from(row.value)),format:'jwk'})).export({format:'jwk'});
process.stdout.write(JSON.stringify({keys:[key]}));`;
const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--mount', 'type=volume,source=apice-spaces-pilot_streamplace_state,target=/state,readonly', 'node:24-alpine', 'node', '--input-type=module', '-e', script], { encoding: 'utf8' });
if (result.status !== 0) throw Error('Could not export the pilot node public key; ensure its state volume exists.');
const value = JSON.parse(result.stdout);
if (value.keys?.length !== 1 || value.keys[0].d || value.keys[0].kty !== 'EC' || value.keys[0].crv !== 'P-256') throw Error('Invalid pilot public key');
mkdirSync(new URL('../.local/', import.meta.url), { recursive: true, mode: 0o700 });
writeFileSync(new URL('../.local/streamplace-public-jwks.json', import.meta.url), JSON.stringify(value), { mode: 0o600 });
console.log('Pinned the isolated Streamplace node public access key.');
