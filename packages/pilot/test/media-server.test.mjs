import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaServer } from '../src/media-server.mjs';

test('media proxy remains bound to its backend and rejects untrusted origins', async t => {
  let received;
  const backend = http.createServer((req, res) => { received = { url: req.url, host: req.headers.host, forwarded: req.headers['x-forwarded-host'] }; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  await new Promise(r => backend.listen(0, '127.0.0.1', r)); t.after(() => backend.close());
  const reservation = net.createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r)); const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = `http://127.0.0.1:${port}`, { server } = createMediaServer({ origin, node: `http://127.0.0.1:${backend.address().port}`, handle: 'fixture.bsky.social', did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' });
  await new Promise(r => server.listen(port, '127.0.0.1', r)); t.after(() => server.close());
  const response = await fetch(`${origin}/xrpc/_health`, { headers: { 'x-forwarded-host': 'attacker.invalid' } }); assert.equal(response.status, 200);
  assert.equal(received.host, new URL(origin).host); assert.equal(received.forwarded, new URL(origin).host); assert.equal(received.url, '/xrpc/_health');
  const me = await fetch(`${origin}/pilot/api/me`); assert.equal(me.status, 401);
  const rejected = await fetch(`${origin}/pilot/auth/start`, { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{}' }); assert.equal(rejected.status, 403);
  const arbitraryTarget = await new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: '//attacker.invalid/steal', headers: { host: new URL(origin).host } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); }); assert.equal(arbitraryTarget, 400);
  assert.equal((await fetch(`${origin}/pilot/`)).headers.get('cache-control'), 'no-store');
});
