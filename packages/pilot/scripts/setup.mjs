import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { account } from '../test/helpers.mjs';

const root = new URL('../', import.meta.url), env = new URL('.env', root), dir = new URL('.local/', root);
try { await access(env); throw new Error('Pilot .env exists; refusing to create or overwrite identities'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const pds = process.env.PILOT_PDS_URL ?? 'http://127.0.0.1:2593';
const institution = await account(pds, 'institution'), learner = await account(pds, 'student');
await mkdir(dir, { recursive: true, mode: 0o700 });
const credentials = new URL('test-accounts.json', dir);
await writeFile(credentials, JSON.stringify({ pds, institution: { did: institution.did, handle: institution.handle, password: institution.password }, learner: { did: learner.did, handle: learner.handle, password: learner.password } }, null, 2), { mode: 0o600, flag: 'wx' });
await writeFile(env, `PILOT_ORIGIN=http://127.0.0.1:8010\nPILOT_PDS_URL=${pds}\nPILOT_STREAMPLACE_URL=http://127.0.0.1:38093\nPILOT_INSTITUTION_DID=${institution.did}\n`, { mode: 0o600, flag: 'wx' });
console.log(`Created isolated PDS test accounts. Credentials: ${fileURLToPath(credentials)}\nRuntime config: ${fileURLToPath(env)}`);
