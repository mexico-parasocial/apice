import { createPublicKey, verify } from 'node:crypto';
import { canonical, digest, DpopKey, equal, Problem, randomToken, requireThat } from './protocol.mjs';

// Adapter for oatproxy's PUBLIC/loopback mode at Streamplace v0.11.13.
// HTTP goes to the local node; DPoP htu is the upstream AS/PDS, as that mode
// explicitly requires. It never forwards the account password or a PDS token.
export class StreamplaceOAuth {
  pending = new Map();
  constructor({ node, origin, handle, did, signingKeys, fetcher = fetch }) {
    this.node = node; this.origin = origin; this.handle = handle; this.did = did; this.fetch = fetcher;
    this.redirect = `${origin}/pilot/auth/callback`;
    // v0.11.13 advertises /oauth/jwks but does not implement it. Pin only
    // the public access key exported from our own isolated node instead.
    this.signingKeys = signingKeys;
  }
  async json(url) {
    const res = await this.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    requireThat(res.ok, 'MetadataUnavailable', 502); return res.json();
  }
  async form(path, key, issuer, data) {
    for (let i = 0; i < 3; i++) {
      const res = await this.fetch(`${this.node}${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'content-type': 'application/x-www-form-urlencoded', dpop: key.proof('POST', `${issuer}${path}`) }, body: new URLSearchParams(data) });
      if (res.headers.has('dpop-nonce')) key.nonce = res.headers.get('dpop-nonce');
      const value = await res.json();
      if (value.error === 'use_dpop_nonce') continue;
      requireThat(res.ok, 'StreamplaceOAuthRejected', 502);
      return value;
    }
    throw new Problem(502, 'StreamplaceNonceRejected');
  }
  async start() {
    requireThat(this.signingKeys?.keys?.length === 1 && !this.signingKeys.keys[0].d, 'MediaPublicKeyRequired', 503);
    for (const [s, p] of this.pending) if (p.expires < Date.now()) this.pending.delete(s);
    requireThat(this.pending.size < 10, 'TooManyLogins', 429);
    // Only the explicitly configured Bluesky account, not arbitrary SSRF URLs.
    requireThat(/^[a-z0-9.-]+\.bsky\.social$/.test(this.handle) && /^did:plc:[a-z2-7]{24}$/.test(this.did), 'UnsupportedMediaAccount');
    const identity = await this.json(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?${new URLSearchParams({ handle: this.handle })}`);
    requireThat(identity.did === this.did, 'MediaIdentityChanged', 409);
    const doc = await this.json(`https://plc.directory/${this.did}`);
    requireThat(doc.id === this.did && doc.alsoKnownAs?.includes(`at://${this.handle}`), 'MediaIdentityMismatch', 409);
    const pds = doc.service?.find(s => s.id === '#atproto_pds')?.serviceEndpoint;
    const pdsURL = new URL(pds);
    requireThat(pdsURL.protocol === 'https:' && pdsURL.hostname.endsWith('.host.bsky.network') && pdsURL.pathname === '/', 'UnexpectedMediaPds', 409);
    const resource = await this.json(`${pds}/.well-known/oauth-protected-resource`);
    requireThat(resource.resource === pds && resource.authorization_servers?.length === 1 && resource.authorization_servers[0] === 'https://bsky.social', 'UnexpectedMediaIssuer', 409);
    const issuer = resource.authorization_servers[0];
    const metadata = await this.json(`${this.node}/oauth/downstream/client-metadata.json?${new URLSearchParams({ redirect_uri: this.redirect })}`);
    const client = new URL(metadata.client_id);
    requireThat(client.origin === 'http://localhost' && client.searchParams.get('redirect_uri') === this.redirect && metadata.redirect_uris?.includes(this.redirect) && client.searchParams.get('scope') === metadata.scope, 'UnexpectedProxyClient', 502);
    const key = new DpopKey(), state = randomToken(), browser = randomToken(), verifier = randomToken();
    const par = await this.form('/oauth/par', key, issuer, { client_id: metadata.client_id, redirect_uri: this.redirect, scope: metadata.scope, response_type: 'code', response_mode: 'query', code_challenge: digest(verifier), code_challenge_method: 'S256', state, login_hint: this.handle });
    const authorize = await this.fetch(`${this.node}/oauth/authorize?${new URLSearchParams({ client_id: metadata.client_id, request_uri: par.request_uri })}`, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    requireThat([302,303,307].includes(authorize.status), 'ProxyAuthorizeRejected', 502);
    const target = new URL(authorize.headers.get('location'));
    requireThat(target.origin === issuer && target.pathname === '/oauth/authorize', 'UnexpectedAuthorizationTarget', 502);
    this.pending.set(state, { key, browser, verifier, issuer, pds, clientId: metadata.client_id, expires: Date.now() + 600_000 });
    return { url: target.href, browser };
  }
  async callback(params, browser) {
    const state = params.get('state'), p = this.pending.get(state);
    requireThat(p && p.expires > Date.now() && equal(p.browser, browser), 'MediaStateMismatch', 401);
    this.pending.delete(state);
    requireThat(params.get('iss') === p.issuer && params.has('code') && !params.has('error'), 'MediaAuthorizationRejected', 401);
    const tokens = await this.form('/oauth/token', p.key, p.issuer, { client_id: p.clientId, redirect_uri: this.redirect, grant_type: 'authorization_code', code_verifier: p.verifier, code: params.get('code') });
    await verifyProxyToken(tokens, p.key, this.origin, this.did, async () => this.signingKeys);
    return new StreamplaceSession(this, p, tokens);
  }
}

export async function verifyProxyToken(tokens, key, origin, did, jwks) {
  requireThat(tokens.sub === did && tokens.token_type?.toLowerCase() === 'dpop', 'MediaSubjectMismatch', 401);
  const parts = tokens.access_token?.split('.'); requireThat(parts?.length === 3, 'InvalidMediaToken', 401);
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { throw new Problem(401, 'InvalidMediaToken'); }
  requireThat(header.alg === 'ES256', 'InvalidMediaAlgorithm', 401);
  const keys = (await jwks()).keys?.filter(k => k.kty === 'EC' && k.crv === 'P-256' && (!header.kid || k.kid === header.kid));
  requireThat(keys?.length === 1 && !keys[0].d, 'InvalidMediaSigningKey', 401);
  const signatureOK = verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: keys[0], format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
  const host = new URL(origin).host, now = Math.floor(Date.now() / 1000);
  requireThat(signatureOK && claims.iss === `https://${host}` && claims.aud === `did:web:${host}` && claims.sub === did && Number.isFinite(claims.exp) && claims.exp > now && claims.nbf <= now + 30 && claims.cnf?.jkt === digest(canonical(key.jwk)), 'InvalidMediaTokenBinding', 401);
}

export class StreamplaceSession {
  constructor(oauth, flow, tokens) { this.oauth = oauth; this.flow = flow; this.tokens = tokens; this.did = tokens.sub; this.expires = Date.now() + (tokens.expires_in ?? 300) * 1000; }
  async rpc(name, input, post = true) {
    requireThat(['place.stream.media.createUpload','place.stream.media.getUploadStatus','place.stream.media.publishVideo'].includes(name), 'UnsupportedMediaRpc');
    requireThat(this.expires > Date.now() + 10_000, 'MediaSignInAgain', 401);
    const path = `/xrpc/${name}`, query = post ? '' : `?${new URLSearchParams(input)}`;
    for (let i = 0; i < 3; i++) {
      const res = await this.oauth.fetch(`${this.oauth.node}${path}${query}`, { method: post ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization: `DPoP ${this.tokens.access_token}`, dpop: this.flow.key.proof(post ? 'POST' : 'GET', `${this.flow.pds}${path}`, this.tokens.access_token), ...(post ? { 'content-type': 'application/json' } : {}) }, ...(post ? { body: JSON.stringify(input) } : {}) });
      if (res.headers.has('dpop-nonce')) this.flow.key.nonce = res.headers.get('dpop-nonce');
      const value = await res.json();
      if (value.error === 'use_dpop_nonce') continue;
      requireThat(res.ok, 'MediaRequestRejected', res.status);
      return value;
    }
    throw new Problem(502, 'MediaNonceRejected');
  }
}
