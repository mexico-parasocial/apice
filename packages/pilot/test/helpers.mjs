import { randomToken, PilotOAuth } from '../src/protocol.mjs';

// Test accounts only. Credentials are generated per run, sent ONLY to this
// explicitly supplied loopback PDS, and never printed or persisted by Ápice.
export async function account(pds, label) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(pds).hostname)) throw new Error('Live tests require an isolated loopback PDS');
  const handle = `${label}-${randomToken().slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, 'a')}.pilot.test`, password = randomToken();
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createAccount`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle, email: `${handle}@example.invalid`, password }) });
  const body = await res.json(); if (!res.ok) throw new Error(`createAccount: ${body.error}: ${body.message}`);
  return { ...body, handle, password };
}

export async function login(pds, acct, institution = false) {
  const oauth = new PilotOAuth(pds, 'http://127.0.0.1:8010'), flow = await oauth.start(acct.handle, institution);
  const requestUri = new URL(flow.url).searchParams.get('request_uri');
  let device;
  async function page(url, values) {
    const r = await fetch(url, { method: values ? 'POST' : 'GET', redirect: 'manual', headers: { ...(device ? { cookie: device } : {}), ...(values ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, ...(values ? { body: new URLSearchParams(values) } : {}) });
    for (const c of r.headers.getSetCookie()) if (c.startsWith('vlpds-device=')) device = c.split(';')[0];
    return { r, html: await r.text() };
  }
  const hidden = (html, name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1].replaceAll('&amp;', '&');
  let p = await page(flow.url);
  if (p.html.includes('Choose an account')) p = await page(`${pds}/oauth/authorize/select`, { request_uri: requestUri, csrf: hidden(p.html, 'csrf'), did: '' });
  p = await page(`${pds}/oauth/authorize/sign-in`, { request_uri: requestUri, csrf: hidden(p.html, 'csrf'), identifier: acct.handle, password: acct.password, action: 'sign-in' });
  if (!p.html.includes('Authorize access')) throw new Error(`Expected consent, got HTTP ${p.r.status}`);
  p = await page(`${pds}/oauth/authorize/consent`, { request_uri: requestUri, csrf: hidden(p.html, 'csrf'), did: acct.did, action: 'allow' });
  if (p.r.status !== 303) throw new Error(`Consent failed: ${p.r.status}`);
  const url = new URL(p.r.headers.get('location'));
  return (await oauth.callback(url.searchParams, flow.browser)).actor;
}

export const sample = () => ({ title: 'Curso de prueba', description: 'Un curso de prueba aislado', lessons: [{ title: 'Primera', durationSeconds: 100, videoRef: { uri: 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/place.stream.video/3abc234567abc', cid: 'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, quiz: { questions: [{ prompt: '¿Privado por defecto?', options: ['Sí', 'No'], correctIndex: 0 }] } }, { title: 'Segunda', durationSeconds: 10, videoRef: { uri: 'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/place.stream.video/3abc234567abd', cid: 'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }] });
