import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PERSONAL, randomToken, SpaceRepository } from '../src/protocol.mjs';
import { account, login } from './helpers.mjs';

const pds = process.env.PILOT_TEST_PDS_URL, mode = process.env.PILOT_RESTORE_TEST;
const file = new URL('../.local/restore-fixture.json', import.meta.url);
test('private Space and PDS identity survive a full bucket backup restored into fresh volumes', { skip: !pds || !['prepare','verify'].includes(mode), timeout: 30_000 }, async () => {
  if (mode === 'prepare') {
    const acct = await account(pds, 'backup'), actor = await login(pds, acct), repo = new SpaceRepository(actor, PERSONAL);
    await repo.ensure(); const nonce = randomToken();
    await repo.put('app.apice.request', 'backup-proof', { $type: 'app.apice.request', schemaVersion: 1, nonce });
    await writeFile(file, JSON.stringify({ acct: { did: acct.did, handle: acct.handle, password: acct.password }, nonce }), { mode: 0o600 });
    return;
  }
  // The fixture is external to the backup: its matching nonce proves we
  // recovered data, rather than merely creating a new empty Space.
  const { acct, nonce } = JSON.parse(await readFile(file, 'utf8'));
  const actor = await login(pds, acct), repo = new SpaceRepository(actor, PERSONAL);
  assert.equal(actor.did, acct.did);
  assert.equal((await repo.get('app.apice.request', 'backup-proof')).nonce, nonce);
});
