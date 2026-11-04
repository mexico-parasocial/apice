import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { StreamplaceOAuth, verifyProxyToken } from '../src/streamplace.mjs';
import { canonical, digest, DpopKey } from '../src/protocol.mjs';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', handle = 'fixture.bsky.social';
const pds = 'https://fixture.us-west.host.bsky.network', origin = 'http://127.0.0.1:38093', node = 'http://127.0.0.1:38094';
const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
function signer() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' }), publicKey = pair.publicKey.export({ format: 'jwk' });
  return { publicKey, token: claims => { const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'node' })).toString('base64url'), p = Buffer.from(JSON.stringify(claims)).toString('base64url'), input = `${h}.${p}`; return `${input}.${sign('sha256', Buffer.from(input), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; } };
}
function binding(key, changes = {}) { const now = Math.floor(Date.now() / 1000); return { sub: did, iss: 'https://127.0.0.1:38093', aud: 'did:web:127.0.0.1:38093', nbf: now - 1, exp: now + 3600, cnf: { jkt: digest(canonical(key.jwk)) }, ...changes }; }

test('media sign-in requires a provisioned public key before starting authorization', async () => {
  const fetcher = () => { throw Error('Must not make an authorization request'); };
  for (const signingKeys of [undefined, { keys: [{ d: 'private-key' }] }]) {
    const oauth = new StreamplaceOAuth({ node, origin, handle, did, signingKeys, fetcher });
    await assert.rejects(oauth.start(), { code: 'MediaPublicKeyRequired' });
  }
});

test('proxy JWT requires a signature, exact issuer/audience/subject, expiry and bound key', async () => {
  const nodeKey = signer(), key = new DpopKey();
  const jwks = async () => ({ keys: [{ ...nodeKey.publicKey, kid: 'node' }] });
  const token = claims => ({ token_type: 'DPoP', sub: did, access_token: nodeKey.token(claims) });
  await verifyProxyToken(token(binding(key)), key, origin, did, jwks);
  for (const change of [{ iss: 'https://attacker.invalid' }, { sub: 'did:plc:other' }, { aud: 'other' }, { exp: 1 }, { cnf: { jkt: 'forged' } }]) await assert.rejects(verifyProxyToken(token(binding(key, change)), key, origin, did, jwks), { code: 'InvalidMediaTokenBinding' });
  const forged = signer(); await assert.rejects(verifyProxyToken({ token_type: 'DPoP', sub: did, access_token: forged.token(binding(key)) }, key, origin, did, jwks));
});

test('oatproxy routes requests locally while signing its AS/PDS logical URLs', async () => {
  const calls = [], nodeKey = signer(); let parAttempts = 0;
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init }); const u = new URL(url);
    const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
    if (u.hostname === 'bsky.social') return response({ did });
    if (u.hostname === 'plc.directory') return response({ id: did, alsoKnownAs: [`at://${handle}`], service: [{ id: '#atproto_pds', serviceEndpoint: pds }] });
    if (u.origin === pds) return response({ resource: pds, authorization_servers: ['https://bsky.social'] });
    assert.equal(u.origin, node);
    if (u.pathname.includes('client-metadata')) { const redirect = u.searchParams.get('redirect_uri'); return response({ scope: 'atproto repo:place.stream.video', client_id: `http://localhost?${new URLSearchParams({ scope: 'atproto repo:place.stream.video', redirect_uri: redirect })}`, redirect_uris: [redirect] }); }
    if (u.pathname === '/oauth/par') {
      const proof = decode(init.headers.dpop); assert.equal(proof.htu, 'https://bsky.social/oauth/par');
      if (!parAttempts++) return response({ error: 'use_dpop_nonce' }, 400, { 'dpop-nonce': 'nonce' });
      assert.equal(proof.nonce, 'nonce'); return response({ request_uri: 'urn:example:request' }, 201);
    }
    if (u.pathname === '/oauth/authorize') return new Response(null, { status: 307, headers: { location: 'https://bsky.social/oauth/authorize?request_uri=test' } });
    if (u.pathname === '/oauth/token') {
      assert.equal(decode(init.headers.dpop).htu, 'https://bsky.social/oauth/token');
      const proofHeader = JSON.parse(Buffer.from(init.headers.dpop.split('.')[0], 'base64url'));
      return response({ token_type: 'DPoP', sub: did, access_token: nodeKey.token(binding({ jwk: proofHeader.jwk })), expires_in: 3600 });
    }
    if (u.pathname.startsWith('/xrpc/')) { assert.equal(decode(init.headers.dpop).htu, `${pds}${u.pathname}`); return response({ message: 'upload not found' }, 404); }
    throw Error('Unexpected test URL');
  };
  const oauth = new StreamplaceOAuth({ node, origin, handle, did, signingKeys: { keys: [{ ...nodeKey.publicKey, kid: 'node' }] }, fetcher });
  const flow = await oauth.start(), state = [...oauth.pending.keys()][0];
  const params = new URLSearchParams({ state, code: 'fixture', iss: 'https://bsky.social' });
  await assert.rejects(oauth.callback(params, 'wrong-browser'), { code: 'MediaStateMismatch' });
  const actor = await oauth.callback(params, flow.browser); assert.equal(actor.did, did);
  await assert.rejects(actor.rpc('place.stream.media.getUploadStatus', { uploadId: 'missing' }, false), { status: 404 });
  await assert.rejects(actor.rpc('com.atproto.repo.putRecord', {}, true), { code: 'UnsupportedMediaRpc' });
  assert.equal(calls.filter(c => c.init.method === 'POST').every(c => c.url.startsWith(node)), true);
  assert.equal(JSON.stringify(calls).includes('password'), false);
});
