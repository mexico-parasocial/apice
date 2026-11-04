import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPilot } from '../src/main.mjs';
import { equal } from '../src/protocol.mjs';

test('HTTP rejects cross-origin writes, forged CSRF, missing login and non-institution roles', async (t) => {
  const identity = { did: 'did:plc:student', role: 'learner' }, actor = { did: identity.did };
  const learning = { connect: async () => identity, execute: async () => ({ ok: true }), catalog: () => [], institution: null };
  const oauth = { start: async () => ({ browser: 'bound', url: 'http://127.0.0.1:2593/oauth/authorize' }), callback: async () => ({ actor, institution: false }) };
  // Reserve an ephemeral port before creating the origin-bound app.
  const net = await import('node:net'); const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const { server } = createPilot({ origin, pds: 'http://127.0.0.1:2593', streamplace: 'http://127.0.0.1:38093', institutionDid: 'did:plc:institution', learning, oauth });
  await new Promise(r => server.listen(port, '127.0.0.1', r)); t.after(() => server.close());
  const post = (path, headers = {}, body = {}) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
  assert.equal((await post('/auth/start', { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await post('/api/command')).status, 401);
  const callback = await fetch(`${origin}/auth/callback?code=test`, { redirect: 'manual' }); assert.equal(callback.status, 303);
  const cookie = callback.headers.getSetCookie()[0].split(';')[0];
  const me = await fetch(`${origin}/api/me`, { headers: { cookie } }); const session = await me.json(); assert.equal(session.role, 'learner');
  assert.equal((await post('/api/command', { cookie, 'x-csrf-token': 'forged' })).status, 403);
  assert.equal((await post('/api/admin/rebuild', { cookie, 'x-csrf-token': session.csrf })).status, 403);
  assert.equal((await post('/api/command', { cookie, 'x-csrf-token': session.csrf })).status, 200);
  const html = await fetch(origin); assert.ok(html.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal((await fetch(`${origin}/hls.min.js`)).status, 200);
  await post('/auth/logout', { cookie, 'x-csrf-token': session.csrf }); assert.equal((await fetch(`${origin}/api/me`, { headers: { cookie } })).status, 401);
  assert.equal(equal('é', 'a'), false);
});
