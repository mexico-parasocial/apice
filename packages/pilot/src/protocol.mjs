import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto';

export const VLPDS_REVISION = 'e215170d27d65b3360a8bd0904bf53a29c0c848b';
export const PERSONAL = 'app.apice.learning';
export const INSTITUTION = 'app.apice.institution';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (s) => createHash('sha256').update(s).digest('base64url');
export const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export class Problem extends Error {
  constructor(status, code, message = code) { super(message); this.status = status; this.code = code; }
}
export function requireThat(ok, code, status = 400) { if (!ok) throw new Problem(status, code); }

export function scopeFor(institution = false) {
  const type = institution ? INSTITUTION : PERSONAL;
  const collections = institution ? ['course', 'enrollment', 'command', 'outbox', 'certificate'] : ['request', 'receipt'];
  return `atproto space:${type}?${collections.map(c => `collection=app.apice.${c}`).join('&')}&action=read&action=create&action=update&manage=create repo:app.civic.${institution ? 'course repo:app.civic.lesson' : 'progress'}`;
}

export class DpopKey {
  nonce;
  constructor() {
    this.key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { kty, crv, x, y } = this.key.publicKey.export({ format: 'jwk' });
    this.jwk = { kty, crv, x, y };
  }
  proof(method, url, access) {
    const u = new URL(url); u.search = ''; u.hash = '';
    const header = { typ: 'dpop+jwt', alg: 'ES256', jwk: this.jwk };
    const payload = { jti: randomToken(), htm: method, htu: u.href, iat: Math.floor(Date.now() / 1000), ...(this.nonce ? { nonce: this.nonce } : {}), ...(access ? { ath: digest(access) } : {}) };
    const input = [header, payload].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return `${input}.${sign('sha256', Buffer.from(input), { key: this.key.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  }
}

// Deliberately bound to ONE configured pilot PDS. No user-supplied URL, issuer,
// resource host or returnTo is fetched. Passwords stay on the PDS's consent page.
export class PilotOAuth {
  pending = new Map();
  constructor(pds, origin, fetcher = fetch, { clientKey } = {}) {
    this.pds = pds.replace(/\/$/, ''); this.origin = origin; this.fetch = fetcher;
    this.redirect = `${origin}/auth/callback`;
    this.production = new URL(origin).protocol === 'https:';
    if (this.production) {
      requireThat(clientKey?.kty === 'EC' && clientKey.crv === 'P-256' && clientKey.d, 'OAuthClientKeyRequired');
      this.clientKey = createPrivateKey({ key: clientKey, format: 'jwk' });
      const { kty, crv, x, y } = createPublicKey(this.clientKey).export({ format: 'jwk' });
      this.publicKey = { kty, crv, x, y, kid: digest(canonical({ kty, crv, x, y })), use: 'sig', alg: 'ES256' };
    }
  }
  clientId(scope) {
    if (this.production) return `${this.origin}/oauth-client-metadata.json`;
    return `http://localhost?${new URLSearchParams({ scope, redirect_uri: this.redirect })}`;
  }
  metadata() {
    requireThat(this.production, 'PublicMetadataRequiresHttps', 404);
    return {
      client_id: this.clientId(), client_name: 'Ápice', client_uri: this.origin,
      application_type: 'web', grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], redirect_uris: [this.redirect],
      scope: [...new Set(`${scopeFor(false)} ${scopeFor(true)}`.split(' '))].join(' '),
      token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true, jwks: { keys: [this.publicKey] },
    };
  }
  clientCredentials() {
    if (!this.production) return {};
    const now = Math.floor(Date.now() / 1000), id = this.clientId();
    const header = { alg: 'ES256', typ: 'JWT', kid: this.publicKey.kid };
    const claims = { iss: id, sub: id, aud: this.pds, iat: now, exp: now + 60, jti: randomToken() };
    const input = [header, claims].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return { client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: `${input}.${sign('sha256', Buffer.from(input), { key: this.clientKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}` };
  }
  async form(path, key, form) {
    for (let n = 0; n < 3; n++) {
      const url = `${this.pds}${path}`;
      const res = await this.fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'content-type': 'application/x-www-form-urlencoded', dpop: key.proof('POST', url) }, body: new URLSearchParams({ ...form, ...this.clientCredentials() }) });
      if (res.headers.has('dpop-nonce')) key.nonce = res.headers.get('dpop-nonce');
      const body = await res.json();
      if (body.error === 'use_dpop_nonce') continue;
      if (!res.ok) throw new Problem(502, 'OAuthRejected', body.error ?? 'OAuthRejected');
      return body;
    }
    throw new Problem(502, 'OAuthNonceRejected');
  }
  async start(handle, institution = false) {
    requireThat(typeof handle === 'string' && /^[a-zA-Z0-9.-]{3,253}$/.test(handle), 'InvalidHandle');
    for (const [k, v] of this.pending) if (v.expires < Date.now()) this.pending.delete(k);
    requireThat(this.pending.size < 100, 'TooManyLogins', 429);
    const state = randomToken(), browser = randomToken(), verifier = randomToken(), key = new DpopKey(), scope = scopeFor(institution), clientId = this.clientId(scope);
    const par = await this.form('/oauth/par', key, { client_id: clientId, response_type: 'code', redirect_uri: this.redirect, scope, state, code_challenge: digest(verifier), code_challenge_method: 'S256', login_hint: handle });
    this.pending.set(state, { browser, verifier, key, scope, clientId, institution, expires: Date.now() + 600_000 });
    return { browser, url: `${this.pds}/oauth/authorize?${new URLSearchParams({ client_id: clientId, request_uri: par.request_uri })}` };
  }
  async callback(params, browser) {
    const state = params.get('state'), pending = this.pending.get(state);
    requireThat(pending && pending.expires > Date.now() && equal(browser, pending.browser), 'OAuthStateMismatch', 401);
    this.pending.delete(state);
    requireThat(!params.has('error') && params.has('code'), 'OAuthDenied', 401);
    requireThat(params.get('iss') === this.pds, 'OAuthIssuerMismatch', 401);
    const tokens = await this.form('/oauth/token', pending.key, { grant_type: 'authorization_code', client_id: pending.clientId, redirect_uri: this.redirect, code: params.get('code'), code_verifier: pending.verifier });
    return { actor: new Actor(this, pending.key, pending.clientId, tokens), institution: pending.institution };
  }
}

export class Actor {
  refreshPending;
  constructor(oauth, key, clientId, tokens) { this.oauth = oauth; this.key = key; this.clientId = clientId; this.set(tokens); }
  set(tokens) {
    requireThat(tokens.token_type?.toLowerCase() === 'dpop' && /^did:(plc|web):/.test(tokens.sub ?? ''), 'InvalidOAuthToken', 502);
    if (this.did) requireThat(this.did === tokens.sub, 'OAuthSubjectChanged', 401);
    this.did = tokens.sub; this.tokens = tokens; this.expires = Date.now() + (tokens.expires_in ?? 300) * 1000;
  }
  async refresh() {
    if (!this.refreshPending) this.refreshPending = this.oauth.form('/oauth/token', this.key, { grant_type: 'refresh_token', client_id: this.clientId, refresh_token: this.tokens.refresh_token }).then(t => this.set(t)).finally(() => { this.refreshPending = undefined; });
    await this.refreshPending;
  }
  async rpc(nsid, data = {}, post = false) {
    if (Date.now() > this.expires - 30_000) await this.refresh();
    const url = `${this.oauth.pds}/xrpc/${nsid}${post ? '' : `?${new URLSearchParams(data)}`}`;
    for (let n = 0; n < 3; n++) {
      const res = await this.oauth.fetch(url, { method: post ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { authorization: `DPoP ${this.tokens.access_token}`, dpop: this.key.proof(post ? 'POST' : 'GET', url, this.tokens.access_token), ...(post ? { 'content-type': 'application/json' } : {}) }, ...(post ? { body: JSON.stringify(data) } : {}) });
      if (res.headers.has('dpop-nonce')) this.key.nonce = res.headers.get('dpop-nonce');
      const body = await res.json();
      if (res.status === 401 && body.error === 'use_dpop_nonce') continue;
      if (res.status === 401 && body.error === 'invalid_token' && n === 0) { await this.refresh(); continue; }
      if (!res.ok) throw new Problem(res.status, body.error ?? 'PdsRejected');
      return body;
    }
    throw new Problem(502, 'PdsNonceRejected');
  }
}

export class SpaceRepository {
  constructor(actor, type) { this.actor = actor; this.type = type; this.space = `at://${actor.did}/space/${type}/apice-pilot`; }
  async ensure() {
    const policy = { $type: 'com.atproto.simplespace.defs#memberListPolicy' };
    try {
      await this.actor.rpc('com.atproto.simplespace.createSpace', { spaceType: this.type, skey: 'apice-pilot', readPolicy: policy, writePolicy: policy, appAccess: { $type: 'com.atproto.simplespace.defs#open' } }, true);
    } catch (e) { if (e.code !== 'SpaceAlreadyExists') throw e; }
    const config = await this.actor.rpc('com.atproto.simplespace.getSpace', { space: this.space });
    requireThat(config.readPolicy?.$type === policy.$type && config.writePolicy?.$type === policy.$type, 'UnsafeSpacePolicy', 409);
    // An existing space must have no foreign members. Refuse reuse, never
    // silently change a space's ACL or remove a user's grants.
    const members = await this.actor.rpc('com.atproto.simplespace.listMembers', { space: this.space });
    requireThat(!members.cursor && members.members.every(m => m.did === this.actor.did), 'UnexpectedSpaceMembers', 409);
  }
  async get(collection, rkey) {
    try { return (await this.actor.rpc('com.atproto.space.getRecord', { space: this.space, repo: this.actor.did, collection, rkey })).value; }
    catch (e) { if (['RecordNotFound', 'RepoNotFound'].includes(e.code)) return undefined; throw e; }
  }
  async batch(writes) {
    requireThat(writes.length > 0 && writes.length <= 200, 'InvalidBatch');
    return this.actor.rpc('com.atproto.space.applyWrites', { space: this.space, repo: this.actor.did, writes: writes.map(w => ({ ...w, $type: `com.atproto.space.applyWrites#${w.action}`, action: undefined })) }, true);
  }
  async put(collection, rkey, value) {
    return this.actor.rpc('com.atproto.space.putRecord', { space: this.space, repo: this.actor.did, collection, rkey, record: value }, true);
  }
  async snapshot() {
    // Bracket paginated scans with the head revision. A concurrent writer must
    // not yield a mixed snapshot. No Jetstream and no private-data disk index.
    const head = async () => {
      try { return (await this.actor.rpc('com.atproto.space.getLatestCommit', { space: this.space, repo: this.actor.did })).commit.rev; }
      catch (e) { if (e.code === 'RepoNotFound') return null; throw e; }
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await head(), rows = []; let cursor;
      do {
        let page;
        try { page = await this.actor.rpc('com.atproto.space.listRecords', { space: this.space, repo: this.actor.did, limit: '1000', ...(cursor ? { cursor } : {}) }); }
        catch (e) { if (e.code === 'RepoNotFound' && before === null) page = { records: [] }; else throw e; }
        rows.push(...page.records); cursor = page.cursor;
      } while (cursor);
      if (before === await head()) return rows;
    }
    throw new Problem(503, 'SnapshotChanged');
  }
}

let lastTid = 0n;
export function tid() {
  let n = BigInt(Date.now()) * 1_024_000n;
  lastTid = n > lastTid ? n : lastTid + 1n; n = lastTid;
  let text = ''; const alphabet = '234567abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < 13; i++) { text = alphabet[Number(n & 31n)] + text; n >>= 5n; }
  return text;
}
