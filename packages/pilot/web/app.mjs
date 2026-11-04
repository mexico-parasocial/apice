const $ = id => document.getElementById(id);
let me, current, players = [], busy = false;
const text = (tag, value) => { const e = document.createElement(tag); e.textContent = value; return e; };
const status = message => { $('status').textContent = message; };
async function api(path, data, key) {
  const res = await fetch(path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { 'content-type': 'application/json' }), ...(me ? { 'x-csrf-token': me.csrf } : {}), ...(key ? { 'idempotency-key': key } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await res.json(); if (!res.ok) throw new Error(value.error); return value;
}
async function run(fn) {
  if (busy) return; busy = true;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { status('Procesando…'); await fn(); status('Listo.'); }
  catch (e) { status(`No se pudo completar: ${e.message}. Puedes reintentar la misma acción.`); }
  finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; }
}
async function command(input) {
  // Persist only command identifiers, scoped by DID; no quiz answers or tokens
  // in localStorage. A network failure reuses the same key and payload.
  const key = `apice-pilot-command:${me.did}`, pending = sessionStorage.getItem(key);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input))))].map(v => v.toString(16).padStart(2, '0')).join('');
  const item = pending ? JSON.parse(pending) : null;
  const id = item?.hash === hash ? item.id : crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ id, hash }));
  const result = await api('/api/command', input, id); sessionStorage.removeItem(key); return result;
}
async function catalog() {
  const courses = await api('/api/courses'); $('catalog').replaceChildren();
  if (!courses.length) $('catalog').append(text('p', 'Aún no hay cursos publicados.'));
  for (const course of courses) { const card = document.createElement('article'); card.className = 'card'; card.append(text('h2', course.title), text('p', course.description)); const button = text('button', 'Abrir curso'); button.onclick = () => run(() => detail(course.id)); card.append(button); $('catalog').append(card); }
}
async function detail(id) {
  for (const player of players) player.destroy(); players = [];
  current = id; const data = await api(`/api/courses/${encodeURIComponent(id)}`), { course, enrollment, certificate } = data, area = $('detail');
  area.hidden = false; area.replaceChildren(text('h1', course.title));
  if (!enrollment) { const button = text('button', 'Inscribirme gratis'); button.onclick = () => run(async () => { await command({ kind: 'enroll', courseId: id }); await detail(id); }); area.append(button); return; }
  area.append(text('p', `Avance: ${enrollment.progress}% · Tu actividad permanece privada.`));
  let unlocked = true;
  for (const lesson of course.lessons) {
    const state = enrollment.lessons[lesson.id], card = document.createElement('article'); card.className = 'card'; card.append(text('h2', lesson.title));
    if (!unlocked) card.append(text('p', 'Completa la lección anterior para continuar.'));
    else {
      const video = document.createElement('video'); video.controls = true; video.preload = 'metadata';
      const playback = `${me.streamplace}/xrpc/place.stream.playback.getVideoPlaylist?${new URLSearchParams({ uri: lesson.videoRef.uri })}`;
      if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = playback;
      else if (globalThis.Hls?.isSupported()) { const player = new globalThis.Hls({ enableWorker: false }); player.loadSource(playback); player.attachMedia(video); players.push(player); }
      else { const link = text('a', 'Abrir playlist HLS (requiere reproductor compatible)'); link.href = playback; link.target = '_blank'; link.rel = 'noreferrer'; card.append(link); }
      video.onloadedmetadata = () => { video.currentTime = Math.min(state?.watchedSeconds ?? 0, video.duration); }; card.append(video);
      const save = text('button', state?.completed ? 'Guardar posición' : 'Guardar avance del video');
      save.onclick = () => run(async () => { await command({ kind: 'watch', courseId: id, lessonId: lesson.id, watchedSeconds: Math.min(lesson.durationSeconds, Math.floor(video.currentTime)) }); await detail(id); }); card.append(save);
      if (lesson.quiz && state?.completed) {
        const form = document.createElement('form');
        lesson.quiz.questions.forEach((q, index) => { const field = document.createElement('fieldset'); field.append(text('legend', q.prompt)); q.options.forEach((option, j) => { const label = text('label', option), radio = document.createElement('input'); radio.type = 'radio'; radio.name = `q${index}`; radio.value = String(j); radio.required = true; label.prepend(radio); field.append(label); }); form.append(field); });
        form.append(text('button', 'Enviar evaluación')); form.onsubmit = e => { e.preventDefault(); const answers = lesson.quiz.questions.map((_, i) => Number(new FormData(form).get(`q${i}`))); run(async () => { await command({ kind: 'quiz', courseId: id, lessonId: lesson.id, answers }); await detail(id); }); }; card.append(form);
        if (state.bestScore != null) card.append(text('p', `Mejor resultado: ${state.bestScore}% · ${state.passed ? 'Aprobada' : 'Puedes reintentar'}`));
      }
    }
    area.append(card); unlocked &&= state?.satisfied === true;
  }
  if (enrollment.progress === 100) {
    const claim = text('button', 'Obtener certificado privado'); claim.onclick = () => run(async () => { await command({ kind: 'claimCertificate', courseId: id }); await detail(id); }); area.append(claim);
    if (certificate) { const card = document.createElement('article'); card.className = 'card'; card.append(text('h2', 'Constancia del piloto'), text('p', `${certificate.courseTitle} · Finalizado ${new Date(certificate.completedAt).toLocaleDateString()}`), text('p', `Folio: ${certificate.id}`), text('p', `Emisor: ${certificate.issuer}`)); area.append(card); }
    const label = text('label', 'Quiero publicar en mi repositorio público que terminé este curso.'); label.className = 'check'; const consent = document.createElement('input'); consent.type = 'checkbox'; label.prepend(consent); area.append(label);
    const publish = text('button', 'Publicar finalización'); publish.onclick = () => run(async () => { if (!consent.checked) throw new Error('Debes confirmar la publicación'); await api('/api/completion/publish', { courseId: id, consent: true }); }); area.append(publish);
  }
}
$('signin').onsubmit = e => { e.preventDefault(); run(async () => { const form = new FormData(e.target), result = await api('/auth/start', { handle: form.get('handle'), institution: form.get('institution') === 'on' }); location.assign(result.url); }); };
$('logout').onclick = () => run(async () => { await api('/auth/logout', {}); location.reload(); });
$('create').onsubmit = e => { e.preventDefault(); run(async () => { const form = new FormData(e.target); const result = await command({ kind: 'createCourse', course: { title: form.get('title'), description: form.get('description'), lessons: JSON.parse(form.get('lessons')) } }); e.target.reset(); status(`Curso ${result.courseId} guardado. Publicando…`); await api('/api/admin/flush', {}); await catalog(); }); };
$('flush').onclick = () => run(async () => { await api('/api/admin/flush', {}); await catalog(); });
$('rebuild').onclick = () => run(async () => { await api('/api/admin/rebuild', {}); await catalog(); });
$('lessons').value = JSON.stringify([{ title: 'Primera lección', durationSeconds: 60, videoRef: { uri: 'at://did:plc:REEMPLAZAR/place.stream.video/REEMPLAZAR', cid: 'REEMPLAZAR' }, quiz: { questions: [{ prompt: '¿El progreso es privado por defecto?', options: ['Sí', 'No'], correctIndex: 0 }] } }], null, 2);
try { me = await api('/api/me'); $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false; $('admin').hidden = me.role !== 'admin'; $('identity').textContent = `${me.did} · ${me.role === 'admin' ? 'Institución' : 'Alumno'}`; await run(catalog); } catch { /* Sign-in form is the default. */ }
