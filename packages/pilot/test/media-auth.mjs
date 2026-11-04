import { test } from 'node:test';
import assert from 'node:assert/strict';
import { account } from './helpers.mjs';

const pds = process.env.PILOT_TEST_PDS_URL, streamplace = process.env.PILOT_TEST_STREAMPLACE_URL;
test('Streamplace refuses a PDS Bearer token as an upload session', { skip: !pds || !streamplace, timeout: 30_000 }, async () => {
  const acct = await account(pds, 'media');
  const res = await fetch(`${streamplace}/xrpc/place.stream.media.createUpload`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${acct.accessJwt}` }, body: JSON.stringify({ size: 100, mimeType: 'video/mp4', filename: 'probe.mp4' }), signal: AbortSignal.timeout(15_000) });
  assert.equal(res.status, 401);
  const result = await res.json(); assert.equal(result.message, 'oauth session required');
});
