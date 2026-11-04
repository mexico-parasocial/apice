import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { StreamplaceOAuth } from './streamplace.mjs';
import { equal, Problem, randomToken, requireThat } from './protocol.mjs';

const cookie = (req, name) => req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
export function createMediaServer({ origin, node, handle, did, signingKeys, fetcher = fetch }) {
  for (const value of [origin, node]) { const u = new URL(value); requireThat(u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.pathname === '/', 'MediaRequiresLoopback'); }
  const oauth = new StreamplaceOAuth({ node, origin, handle, did, signingKeys, fetcher }), sessions = new Map();
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  const setCookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/pilot; Max-Age=${age}`;
  const json = (res, status, value, extra = {}) => { res.writeHead(status, { ...headers, 'content-type': 'application/json', ...extra }); res.end(JSON.stringify(value)); };
  function auth(req) { const session = sessions.get(cookie(req, 'apice_media')); requireThat(session && session.expires > Date.now(), 'MediaSignInRequired', 401); return session; }
  const server = http.createServer(async (req, res) => {
    try {
      requireThat(req.headers.host === new URL(origin).host, 'InvalidHost', 403);
      const url = new URL(req.url, origin);
      requireThat(url.origin === origin && req.url.startsWith('/') && !req.url.startsWith('//'), 'InvalidProxyTarget', 400);
      if (!url.pathname.startsWith('/pilot/')) {
        // First-party reverse proxy: no destination supplied by the browser.
        // Preserve the public Host so the node constructs correct upload URLs.
        const upstream = http.request(`${node}${url.pathname}${url.search}`, { method: req.method, headers: { ...req.headers, host: new URL(origin).host, 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': 'http' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
        upstream.on('error', () => { if (!res.headersSent) json(res, 502, { error: 'MediaNodeUnavailable' }); else res.destroy(); });
        req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
      }
      if (req.method === 'GET' && url.pathname === '/pilot/auth/callback') {
        const actor = await oauth.callback(url.searchParams, cookie(req, 'apice_media_oauth'));
        for (const [k, s] of sessions) if (s.expires <= Date.now() || s.actor.did === actor.did) sessions.delete(k);
        const id = randomToken(); sessions.set(id, { actor, csrf: randomToken(), expires: Date.now() + 8 * 3600_000 });
        res.writeHead(303, { ...headers, location: '/pilot/', 'set-cookie': [setCookie('apice_media', id, 8 * 3600), setCookie('apice_media_oauth', '', 0)] }); res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/pilot/api/me') {
        const s = auth(req); json(res, 200, { did: s.actor.did, handle, csrf: s.csrf, authenticatedBy: 'streamplace-oatproxy' }); return;
      }
      if (req.method === 'POST') {
        requireThat(req.headers.origin === origin, 'OriginRejected', 403);
        requireThat(req.headers['content-type']?.startsWith('application/json'), 'JsonRequired', 415);
        let raw = ''; for await (const c of req) { raw += c; requireThat(Buffer.byteLength(raw) <= 8192, 'BodyTooLarge', 413); }
        let body; try { body = JSON.parse(raw); } catch { throw new Problem(400, 'InvalidJson'); }
        if (url.pathname === '/pilot/auth/start') { const result = await oauth.start(); json(res, 200, { url: result.url }, { 'set-cookie': setCookie('apice_media_oauth', result.browser, 600) }); return; }
        const s = auth(req); requireThat(equal(req.headers['x-csrf-token'], s.csrf), 'CsrfRejected', 403);
        if (url.pathname === '/pilot/auth/logout') { sessions.delete(cookie(req, 'apice_media')); json(res, 200, { ok: true }, { 'set-cookie': setCookie('apice_media', '', 0) }); return; }
        // A read-only node call verifies the proxy session without creating an
        // upload or publishing records. A missing upload must return 404, not 401.
        if (url.pathname === '/pilot/api/probe') {
          try { await s.actor.rpc('place.stream.media.getUploadStatus', { uploadId: 'apice-auth-probe-does-not-exist' }, false); }
          catch (e) { if (e.status === 404) { json(res, 200, { authenticated: true }); return; } throw e; }
          json(res, 200, { authenticated: true }); return;
        }
      }
      if (req.method === 'GET' && url.pathname === '/pilot/') {
        res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ápice · Acceso a Streamplace</title><body><main><h1>Acceso de video del piloto</h1><p id="account"></p><p>La contraseña se introduce únicamente en la página de Bluesky. Revisa los permisos que solicita Streamplace antes de autorizar.</p><button id="connect">Continuar con Bluesky</button><button id="probe" hidden>Comprobar sesión sin publicar</button><p id="status" role="status"></p></main><script src="/pilot/client.mjs" type="module"></script></body></html>'); return;
      }
      if (req.method === 'GET' && url.pathname === '/pilot/client.mjs') {
        res.writeHead(200, { ...headers, 'content-type': 'text/javascript' });
        res.end(`let me;const status=document.getElementById('status');async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',...(me?{'x-csrf-token':me.csrf}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}document.getElementById('connect').onclick=async()=>{try{status.textContent='Preparando acceso…';location.assign((await api('/pilot/auth/start',{})).url);}catch(e){status.textContent=e.message;}};document.getElementById('probe').onclick=async()=>{try{await api('/pilot/api/probe',{});status.textContent='Sesión del nodo verificada. No se publicó ningún registro.';}catch(e){status.textContent=e.message;}};try{me=await api('/pilot/api/me');document.getElementById('account').textContent=me.handle+' · '+me.did;document.getElementById('probe').hidden=false;document.getElementById('connect').hidden=true;status.textContent='Cuenta conectada mediante el proxy OAuth de Streamplace.';}catch{}`); return;
      }
      throw new Problem(404, 'NotFound');
    } catch (e) { json(res, e instanceof Problem ? e.status : 503, { error: e instanceof Problem ? e.code : 'MediaUnavailable' }); }
  });
  return { server, oauth };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const signingKeys = JSON.parse(readFileSync(new URL('../.local/streamplace-public-jwks.json', import.meta.url), 'utf8'));
  const { server } = createMediaServer({ origin: 'http://127.0.0.1:38093', node: 'http://127.0.0.1:38094', handle: process.env.PILOT_MEDIA_HANDLE ?? '', did: process.env.PILOT_MEDIA_DID ?? '', signingKeys });
  server.listen(38093, '127.0.0.1', () => console.log('Ápice media authentication: http://127.0.0.1:38093/pilot/'));
}
