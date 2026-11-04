import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Learning, enrollmentKey } from '../src/learning.mjs';
import { INSTITUTION, PERSONAL, Problem, PilotOAuth, scopeFor, tid } from '../src/protocol.mjs';
import { sample } from './helpers.mjs';

function fixture() {
  const db = new Map(), calls = []; let loseAck = false, failPersonal = false, failPublication = false;
  const institution = { did: 'did:plc:institution', rpc: async (method, body) => { calls.push({ method, body }); if (failPublication) throw new Error('Network failure'); return { uri: `at://${body.repo}/${body.collection}/${body.rkey}`, cid: 'bafyreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }; } };
  const student = { did: 'did:plc:student', rpc: institution.rpc }, other = { did: 'did:plc:other', rpc: institution.rpc };
  const repository = (actor, type) => {
    const id = `${actor.did}|${type}`;
    if (!db.has(id)) db.set(id, new Map());
    const records = db.get(id);
    return { actor, ensure: async () => {}, get: async (c, k) => structuredClone(records.get(`${c}/${k}`)), put: async (c, k, v) => { if (failPersonal && type === PERSONAL) throw new Error('Disconnected'); records.set(`${c}/${k}`, structuredClone(v)); }, snapshot: async () => [...records].map(([key, value]) => ({ collection: key.split('/')[0], rkey: key.split('/')[1], value: structuredClone(value) })), batch: async writes => {
      const next = new Map(records);
      for (const w of writes) { const k = `${w.collection}/${w.rkey}`; assert.equal(next.has(k), w.action === 'update'); next.set(k, structuredClone(w.value)); }
      records.clear(); for (const [k, v] of next) records.set(k, v);
      if (loseAck && type === INSTITUTION) { loseAck = false; throw new Error('Lost ack after durable commit'); }
    } };
  };
  const make = () => new Learning({ institutionDid: institution.did, repository });
  return { db, calls, institution, student, other, repository, make, loseAck: () => { loseAck = true; }, failPersonal: () => { failPersonal = true; }, failPublication: value => { failPublication = value; } };
}
const key = n => `request_number_${String(n).padStart(4, '0')}`;
async function setup() {
  const f = fixture(), service = f.make(); await service.connect(f.institution, true); await service.connect(f.student); await service.connect(f.other);
  const created = await service.execute(f.institution, key(1), { kind: 'createCourse', course: sample() }); await service.flushOutbox();
  return { ...f, service, course: service.catalog()[0], courseId: created.courseId };
}

test('full journey: sequential lessons, private answers, institutional certificate, explicit public completion', async () => {
  const f = await setup(), { service: s, student: a, courseId: id, course } = f, [first, second] = course.lessons;
  assert.equal(JSON.stringify(course).includes('correctIndex'), false);
  await assert.rejects(s.execute(a, key(2), { kind: 'watch', courseId: id, lessonId: first.id, watchedSeconds: 100 }), { code: 'EnrollmentRequired' });
  await s.execute(a, key(3), { kind: 'enroll', courseId: id });
  await assert.rejects(s.execute(a, key(4), { kind: 'watch', courseId: id, lessonId: second.id, watchedSeconds: 10 }), { code: 'LessonLocked' });
  await assert.rejects(s.execute(a, key(5), { kind: 'claimCertificate', courseId: id }), { code: 'CourseIncomplete' });
  await s.execute(a, key(6), { kind: 'watch', courseId: id, lessonId: first.id, watchedSeconds: 90 });
  const failed = await s.execute(a, key(7), { kind: 'quiz', courseId: id, lessonId: first.id, answers: [1], passed: true, score: 100 }); assert.equal(failed.progress, 0);
  await s.execute(a, key(8), { kind: 'quiz', courseId: id, lessonId: first.id, answers: [0] });
  await s.execute(a, key(9), { kind: 'watch', courseId: id, lessonId: second.id, watchedSeconds: 10 });
  const result = await s.execute(a, key(10), { kind: 'claimCertificate', courseId: id });
  assert.equal(result.certificate.issuer, f.institution.did); assert.equal(result.enrollment.progress, 100);
  assert.equal(f.calls.some(c => c.body.collection === 'app.civic.progress'), false);
  await assert.rejects(s.publishCompletion(a, id, false), { code: 'ExplicitConsentRequired' });
  const published = await s.publishCompletion(a, id, true); assert.ok(published.uri.startsWith(`at://${a.did}/`));
  const record = f.calls.at(-1).body.record; assert.deepEqual(Object.keys(record).sort(), ['$type','completedAt','courseRef','learnerDid','progressPercent'].sort());
  const other = await s.state(f.other, id); assert.equal(other.enrollment, null); assert.equal(other.certificate, null);
});

test('lost acknowledgement, restart and replay never double-grade or double-create a course', async () => {
  const f = await setup(), input = { kind: 'enroll', courseId: f.courseId }; f.loseAck();
  await assert.rejects(f.service.execute(f.student, key(22), input), /Lost ack/);
  const s = f.make(); await s.connect(f.institution, true);
  const one = await s.execute(f.student, key(22), input), two = await s.execute(f.student, key(22), input); assert.deepEqual(one, two);
  await assert.rejects(s.execute(f.student, key(22), { ...input, inject: true }), { code: 'IdempotencyConflict' });
  const courseInput = { kind: 'createCourse', course: sample() }; f.loseAck();
  await assert.rejects(s.execute(f.institution, key(23), courseInput));
  const restarted = f.make(); await restarted.connect(f.institution, true); await restarted.execute(f.institution, key(23), courseInput); await restarted.flushOutbox(); assert.equal(restarted.catalog().length, 2);
});

test('public outbox resumes after failure; deleting all local indexes preserves data', async () => {
  const f = await setup(), input = { kind: 'createCourse', course: sample() };
  await f.service.execute(f.institution, key(24), input); f.failPublication(true);
  await assert.rejects(f.service.flushOutbox()); assert.equal(f.service.catalog().length, 1);
  f.failPublication(false); await f.service.flushOutbox(); const before = f.service.catalog();
  f.service.courses.clear(); await f.service.rebuildIndex(); assert.deepEqual(f.service.catalog(), before);
  assert.equal((await f.service.flushOutbox()).delivered, 0);
  const publicData = JSON.stringify(f.calls); assert.equal(publicData.includes('correctIndex'), false); assert.equal(publicData.includes('answers'), false);
});

test('learner-controlled receipts cannot award grades; receipt copy failure is recoverable', async () => {
  const f = await setup(), personal = f.repository(f.student, PERSONAL);
  await personal.put('app.apice.receipt', 'forged', { progress: 100, certificateId: 'forged' });
  await f.service.execute(f.student, key(25), { kind: 'enroll', courseId: f.courseId });
  assert.equal((await f.service.state(f.student, f.courseId)).enrollment.progress, 0);
  f.failPersonal(); const result = await f.service.execute(f.student, key(26), { kind: 'enroll', courseId: f.courseId }); assert.equal(result.progress, 0);
  await assert.rejects(f.service.execute(f.student, key(27), { kind: 'createCourse', course: sample() }), { code: 'NotInstitution' });
  await assert.rejects(f.service.connect(f.student, true), { code: 'NotInstitution' });
});

test('concurrent watch commands preserve monotonic progress', async () => {
  const f = await setup(), a = f.student, id = f.courseId, lessonId = f.course.lessons[0].id;
  await f.service.execute(a, key(30), { kind: 'enroll', courseId: id });
  await Promise.all([90, 10, 80].map((watchedSeconds, i) => f.service.execute(a, key(31 + i), { kind: 'watch', courseId: id, lessonId, watchedSeconds })));
  const e = await f.repository(f.institution, INSTITUTION).get('app.apice.enrollment', enrollmentKey(a.did, id)); assert.equal(e.lessons[lessonId].watchedSeconds, 90);
});

test('uncertain course and publication commits recover in the same process', async () => {
  const f = await setup(), input = { kind: 'createCourse', course: sample() };
  f.loseAck(); await assert.rejects(f.service.execute(f.institution, key(40), input), /Lost ack/);
  await f.service.execute(f.institution, key(40), input);
  f.loseAck(); await assert.rejects(f.service.flushOutbox(), /Lost ack/);
  await f.service.flushOutbox(); assert.equal(f.service.catalog().length, 2);
});

test('TIDs meet public lexicon keys; spaces grants are explicit; OAuth rejects unbound callbacks', async () => {
  const ids = Array.from({ length: 1000 }, tid); assert.equal(new Set(ids).size, 1000); assert.ok(ids.every(s => /^[234567a-z]{13}$/.test(s)));
  assert.ok(scopeFor().includes('collection=app.apice.request')); assert.ok(!scopeFor().includes(INSTITUTION));
  const oauth = new PilotOAuth('http://127.0.0.1:2593', 'http://127.0.0.1:8010');
  await assert.rejects(oauth.callback(new URLSearchParams({ state: 'unknown', code: 'fake' }), 'fake'), { code: 'OAuthStateMismatch' });
});
