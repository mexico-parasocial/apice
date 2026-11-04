import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Learning } from './learning.mjs';
import { equal, PilotOAuth, Problem, randomToken, requireThat, VLPDS_REVISION } from './protocol.mjs';
import { checkedOrigin, readPrivateJson } from './config.mjs';

const assets = new URL('../web/', import.meta.url);
const require = createRequire(import.meta.url);
const cookie = (req, name) => req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
export function createPilot({ origin, pds, institutionDid, streamplace, mode = 'development', clientKey, allowedDids = [], fetcher = fetch, learning: injectedLearning, oauth: injectedOAuth }) {
  requireThat(['development', 'production'].includes(mode), 'InvalidRuntimeMode');
  const production = mode === 'production', base = checkedOrigin(origin, production);
  origin = base.origin;
  const pdsUrl = new URL(pds), videoUrl = new URL(streamplace);
  for (const u of [pdsUrl, videoUrl]) requireThat(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost', 'host.docker.internal'].includes(u.hostname)), 'UnsafeServiceUrl');
  if (production) {
    pds = checkedOrigin(pds, true).origin; streamplace = checkedOrigin(streamplace, true).origin;
    requireThat(Array.isArray(allowedDids) && allowedDids.length > 0 && allowedDids.length <= 100 && allowedDids.includes(institutionDid) && allowedDids.every(did => /^did:(plc|web):[^\s/]+$/.test(did)), 'BetaInviteListRequired');
  }
  requireThat(/^did:(plc|web):[^\s/]+$/.test(institutionDid), 'InstitutionDidRequired');
  const oauth = injectedOAuth ?? new PilotOAuth(pds, origin, fetcher, { clientKey }), sessions = new Map();
  const learning = injectedLearning ?? new Learning({ institutionDid, verifyVideo: async (ref) => {
    const res = await fetcher(`${streamplace}/xrpc/place.stream.playback.getVideoPlaylist?${new URLSearchParams({ uri: ref.uri })}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    requireThat(res.ok && (await res.text()).startsWith('#EXTM3U'), 'VideoNotPlayable', 422);
    // A strong ref's CID must match the record on this pilot's PDS.
    const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(ref.uri);
    const record = await fetcher(`${pds}/xrpc/com.atproto.repo.getRecord?${new URLSearchParams({ repo: m[1], collection: m[2], rkey: m[3] })}`, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    requireThat(record.ok && (await record.json()).cid === ref.cid, 'VideoCidMismatch', 422);
  } });
  const sessionCookie = production ? '__Host-apice' : 'apice_pilot', flowCookie = production ? '__Host-apice_oauth' : 'apice_oauth';
  const setCookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${production ? '; Secure' : ''}`;
  function auth(req) {
    const key = cookie(req, sessionCookie), s = sessions.get(key);
    requireThat(s && s.expires > Date.now(), 'SignInRequired', 401);
    return s;
  }
  function reply(res, status, data, headers = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); }
  async function body(req) {
    requireThat((req.headers['content-type'] ?? '').startsWith('application/json'), 'JsonRequired', 415);
    let text = ''; for await (const chunk of req) { text += chunk; requireThat(Buffer.byteLength(text) <= 256 * 1024, 'BodyTooLarge', 413); }
    try { return JSON.parse(text); } catch { throw new Problem(400, 'InvalidJson'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'no-referrer');
    if (production) res.setHeader('strict-transport-security', 'max-age=31536000');
    res.setHeader('content-security-policy', `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${videoUrl.origin}; media-src 'self' blob: ${videoUrl.origin}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    try {
      const url = new URL(req.url, origin), path = url.pathname;
      requireThat(req.headers.host === base.host, 'InvalidHost', 403);
      requireThat(url.origin === base.origin && req.url.startsWith('/') && !req.url.startsWith('//'), 'InvalidRequestTarget', 400);
      if (production && req.method === 'GET' && path === '/oauth-client-metadata.json') { reply(res, 200, oauth.metadata()); return; }
      if (req.method === 'GET' && path === '/hls.min.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(await readFile(require.resolve('hls.js/dist/hls.min.js'))); return;
      }
      if (req.method === 'GET' && ['/','/app.mjs','/style.css'].includes(path)) {
        const name = path === '/' ? 'index.html' : path.slice(1);
        res.writeHead(200, { 'content-type': path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); res.end(await readFile(new URL(name, assets))); return;
      }
      if (req.method === 'GET' && path === '/health') { reply(res, 200, { pilot: true, vlpdsRevision: VLPDS_REVISION, institutionConnected: Boolean(learning.institution), im8Required: false }); return; }
      if (req.method === 'GET' && path === '/ready') { reply(res, learning.institution ? 200 : 503, { ready: Boolean(learning.institution), reason: learning.institution ? null : 'InstitutionMustReconnect' }); return; }
      if (req.method === 'GET' && path === '/auth/callback') {
        const { actor, institution } = await oauth.callback(url.searchParams, cookie(req, flowCookie));
        if (production) requireThat(allowedDids.includes(actor.did), 'BetaInviteRequired', 403);
        const identity = await learning.connect(actor, institution);
        for (const [k, s] of sessions) if (s.expires <= Date.now() || s.actor.did === actor.did) sessions.delete(k);
        requireThat(sessions.size < 100, 'PilotSessionLimit', 429);
        const key = randomToken(), csrf = randomToken();
        sessions.set(key, { actor, identity, csrf, expires: Date.now() + 8 * 3600_000 });
        res.writeHead(303, { location: '/', 'set-cookie': [setCookie(sessionCookie, key, 8 * 3600), setCookie(flowCookie, '', 0)] }); res.end(); return;
      }
      if (req.method === 'POST') {
        requireThat(req.headers.origin === origin, 'OriginRejected', 403);
        const input = await body(req);
        if (path === '/auth/start') {
          const flow = await oauth.start(input.handle, input.institution === true);
          reply(res, 200, { url: flow.url }, { 'set-cookie': setCookie(flowCookie, flow.browser, 600) }); return;
        }
        const s = auth(req); requireThat(equal(req.headers['x-csrf-token'], s.csrf), 'CsrfRejected', 403);
        if (path === '/auth/logout') { sessions.delete(cookie(req, sessionCookie)); reply(res, 200, { ok: true }, { 'set-cookie': setCookie(sessionCookie, '', 0) }); return; }
        if (path === '/api/command') { reply(res, 200, await learning.execute(s.actor, req.headers['idempotency-key'], input)); return; }
        if (path === '/api/completion/publish') { reply(res, 200, await learning.publishCompletion(s.actor, input.courseId, input.consent)); return; }
        if (path === '/api/admin/flush' || path === '/api/admin/rebuild') {
          requireThat(s.identity.role === 'admin', 'AdminRequired', 403);
          reply(res, 200, path.endsWith('flush') ? await learning.flushOutbox() : await learning.rebuildIndex()); return;
        }
      }
      if (req.method === 'GET') {
        const s = auth(req);
        if (path === '/api/me') { reply(res, 200, { ...s.identity, csrf: s.csrf, institutionConnected: Boolean(learning.institution), streamplace }); return; }
        if (path === '/api/courses') { reply(res, 200, learning.catalog()); return; }
        if (path.startsWith('/api/courses/')) { reply(res, 200, await learning.state(s.actor, decodeURIComponent(path.slice(13)))); return; }
      }
      throw new Problem(404, 'NotFound');
    } catch (e) {
      const status = e instanceof Problem && e.status >= 400 && e.status < 600 ? e.status : 503;
      reply(res, status, { error: e instanceof Problem ? e.code : 'UpstreamUnavailable', retryWithSameKey: req.url === '/api/command' });
    }
  });
  // Outbox work survives restarts in Spaces; reconnect the institution to resume.
  const timer = setInterval(() => { if (learning.institution) learning.flushOutbox().catch(() => {}); }, 10_000); timer.unref();
  server.on('close', () => clearInterval(timer));
  return { server, learning, oauth };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origin = process.env.PILOT_ORIGIN ?? 'http://127.0.0.1:8010';
  const mode = process.env.NODE_ENV === 'production' ? 'production' : (process.env.PILOT_MODE ?? 'development');
  const { server } = createPilot({ origin, mode, clientKey: mode === 'production' ? readPrivateJson(process.env.PILOT_OAUTH_KEY_FILE) : undefined, allowedDids: (process.env.PILOT_ALLOWED_DIDS ?? '').split(',').map(s => s.trim()).filter(Boolean), pds: process.env.PILOT_PDS_URL ?? 'http://127.0.0.1:2593', institutionDid: process.env.PILOT_INSTITUTION_DID ?? '', streamplace: process.env.PILOT_STREAMPLACE_URL ?? 'http://127.0.0.1:38093' });
  const port = Number(process.env.PILOT_LISTEN_PORT ?? (mode === 'production' ? 28010 : new URL(origin).port || 8010));
  requireThat(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'InvalidListenPort');
  server.listen(port, '127.0.0.1', () => console.log(`Ápice Spaces ${mode}: ${origin} (loopback:${port})`));
}
