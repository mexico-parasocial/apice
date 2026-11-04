import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { createPilot } from '../src/main.mjs';
import { PilotOAuth } from '../src/protocol.mjs';
import { checkedOrigin, readPrivateJson } from '../src/config.mjs';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'https://para-g0v.site', pds = 'https://pds.para-g0v.site', streamplace = 'https://vod.para-g0v.site';
const institutionDid = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', learnerDid = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const key = () => generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const options = () => ({ origin, pds, streamplace, institutionDid, mode: 'production', clientKey: key(), allowedDids: [institutionDid, learnerDid] });

test('public mode rejects unsafe origins, absent keys and missing beta invitations', () => {
  for (const value of ['http://para-g0v.site', 'https://127.0.0.1', 'https://user:pass@para-g0v.site', 'https://para-g0v.site/path', 'https://para-g0v.site?returnTo=evil', 'https://para-g0v.site:8443', 'https://fixture.test']) assert.throws(() => checkedOrigin(value, true));
  assert.throws(() => createPilot({ ...options(), clientKey: undefined }), { code: 'OAuthClientKeyRequired' });
  assert.throws(() => createPilot({ ...options(), allowedDids: [] }), { code: 'BetaInviteListRequired' });
  assert.throws(() => createPilot({ ...options(), pds: 'http://127.0.0.1:2593' }), { code: 'PublicHttpsOriginRequired' });
  assert.throws(() => createPilot({ ...options(), mode: 'development' }), { code: 'PilotRequiresLoopback' });
});

test('confidential OAuth publishes only its public key and signs fresh assertions for PAR and refresh', async () => {
  const bodies = [];
  const oauth = new PilotOAuth(pds, origin, async (url, init) => {
    const body = new URLSearchParams(init.body); bodies.push(body);
    return new Response(JSON.stringify(url.endsWith('/par') ? { request_uri: 'urn:fixture' } : { ok: true }), { status: 200 });
  }, { clientKey: key() });
  const metadata = oauth.metadata(), publicJwk = metadata.jwks.keys[0];
  assert.equal(metadata.client_id, `${origin}/oauth-client-metadata.json`);
  assert.deepEqual(metadata.redirect_uris, [`${origin}/auth/callback`]);
  assert.equal(metadata.token_endpoint_auth_method, 'private_key_jwt');
  assert.equal(publicJwk.d, undefined);
  assert.equal(new Set(metadata.scope.split(' ')).size, metadata.scope.split(' ').length);
  await oauth.start('learner.para-g0v.site');
  await oauth.form('/oauth/token', [...oauth.pending.values()][0].key, { client_id: oauth.clientId(), grant_type: 'refresh_token', refresh_token: 'fixture-token' });
  const claims = [];
  for (const body of bodies) {
    assert.equal(body.get('client_id'), metadata.client_id);
    assert.equal(body.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    const parts = body.get('client_assertion').split('.');
    const head = JSON.parse(Buffer.from(parts[0], 'base64url')), payload = JSON.parse(Buffer.from(parts[1], 'base64url')); claims.push(payload);
    assert.equal(head.kid, publicJwk.kid);
    assert.equal(payload.iss, metadata.client_id); assert.equal(payload.sub, metadata.client_id); assert.equal(payload.aud, pds);
    assert.equal(payload.exp - payload.iat, 60);
    assert.equal(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')), true);
  }
  assert.notEqual(claims[0].jti, claims[1].jti);
});

test('public HTTP handler binds host/origin, protects cookies and denies uninvited DIDs before touching Spaces', async t => {
  let did = learnerDid, connected = 0;
  const oauth = new PilotOAuth(pds, origin, fetch, { clientKey: key() });
  oauth.start = async () => ({ browser: 'bound', url: `${pds}/oauth/authorize` });
  oauth.callback = async () => ({ actor: { did }, institution: false });
  const learning = { institution: null, connect: async actor => { connected++; return { did: actor.did, role: 'learner' }; }, catalog: () => [], execute: async () => ({ ok: true }) };
  const { server } = createPilot({ ...options(), oauth, learning });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const call = (path, { method = 'GET', headers = {}, value } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers: { host: 'para-g0v.site', ...(value ? { 'content-type': 'application/json', origin } : {}), ...headers } }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: text ? JSON.parse(text) : null }));
    }); req.on('error', reject); req.end(value ? JSON.stringify(value) : undefined);
  });
  const md = await call('/oauth-client-metadata.json'); assert.equal(md.status, 200); assert.equal(md.data.jwks.keys[0].d, undefined);
  assert.equal((await call('/health', { headers: { host: 'attacker.invalid' } })).status, 403);
  assert.equal((await call('//attacker.invalid/steal')).status, 400);
  assert.equal((await call('/ready')).status, 503);
  const flow = await call('/auth/start', { method: 'POST', value: {} });
  assert.match(flow.headers['set-cookie'][0], /^__Host-apice_oauth=/); assert.match(flow.headers['set-cookie'][0], /; Secure$/);
  const callback = await call('/auth/callback?code=fixture'); assert.equal(callback.status, 303);
  const cookie = callback.headers['set-cookie'][0].split(';')[0]; assert.match(cookie, /^__Host-apice=/);
  const me = await call('/api/me', { headers: { cookie } }); assert.equal(me.status, 200);
  assert.match(me.headers['strict-transport-security'], /max-age=/);
  assert.equal((await call('/api/command', { method: 'POST', value: {}, headers: { cookie, origin: 'https://attacker.invalid', 'x-csrf-token': me.data.csrf } })).status, 403);
  assert.equal((await call('/api/command', { method: 'POST', value: {}, headers: { cookie, 'x-csrf-token': me.data.csrf } })).status, 200);
  did = 'did:plc:cccccccccccccccccccccccc'; assert.equal((await call('/auth/callback?code=fixture')).status, 403); assert.equal(connected, 1);
  learning.institution = {}; assert.equal((await call('/ready')).status, 200);
});

test('OAuth key files must be private regular files', t => {
  const dir = mkdtempSync(join(tmpdir(), 'apice-key-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'key.json'); writeFileSync(path, JSON.stringify(key()), { mode: 0o600 }); assert.equal(readPrivateJson(path).kty, 'EC');
  chmodSync(path, 0o644); assert.throws(() => readPrivateJson(path), { code: 'PrivateFilePermissionsRequired' });
});
