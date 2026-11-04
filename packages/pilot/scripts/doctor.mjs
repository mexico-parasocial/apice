import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { VLPDS_REVISION } from '../src/protocol.mjs';

let failed = false;
const check = (ok, message) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); failed ||= !ok; };
const compose = JSON.parse(execFileSync('docker', ['compose', '-f', new URL('../infra/compose.yaml', import.meta.url).pathname, '--profile', 'container-pds', 'config', '--format', 'json'], { encoding: 'utf8' }));
const config = JSON.stringify(compose);
check(!/postgres|prisma|DATABASE_URL|PGHOST/i.test(config), 'Pilot deployment has no PostgreSQL services, URLs or Prisma');
check(Object.keys(compose.volumes).length === 5, 'All five durable stores have volumes');
const filer = await readFile(new URL('../infra/filer.toml', import.meta.url), 'utf8');
check(filer.includes('[leveldb2]') && filer.includes('enabled = true'), 'SeaweedFS filer uses embedded LevelDB');
check(compose.services.streamplace.environment.SP_DB_URL.startsWith('sqlite://') && compose.services.streamplace.environment.SP_LOCAL_DB_URL.startsWith('sqlite://'), 'Both Streamplace databases use SQLite');
check(compose.services.pds.build.context.endsWith(VLPDS_REVISION), 'VLPDS source is pinned');
for (const [name, url] of [['VLPDS', 'http://127.0.0.1:2593/xrpc/_health'], ['Streamplace', 'http://127.0.0.1:38093/xrpc/_health'], ['Ápice', 'http://127.0.0.1:8010/health']]) {
  try { const res = await fetch(url, { signal: AbortSignal.timeout(5000) }); check(res.ok, `${name} reachable`); } catch { check(false, `${name} reachable`); }
}
console.log('PENDING: Streamplace OAuth upload acceptance against isolated VLPDS (see README).');
console.log('A successful doctor validates topology, not full media acceptance.');
process.exitCode = failed ? 1 : 0;
