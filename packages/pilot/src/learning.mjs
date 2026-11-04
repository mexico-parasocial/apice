import { canonical, digest, INSTITUTION, PERSONAL, requireThat, SpaceRepository, tid } from './protocol.mjs';

const collection = (kind) => `app.apice.${kind}`;
const typed = (kind, value) => ({ $type: collection(kind), schemaVersion: 1, ...value });
const write = (kind, rkey, value, exists = false) => ({ action: exists ? 'update' : 'create', collection: collection(kind), rkey, value: typed(kind, value) });
const now = () => new Date().toISOString();
export const enrollmentKey = (did, courseId) => digest(`${did}\n${courseId}`);

export function validateCourse(input) {
  requireThat(input && typeof input === 'object', 'InvalidCourse');
  requireThat(typeof input.title === 'string' && input.title.trim().length > 0 && input.title.length <= 200, 'InvalidTitle');
  requireThat(typeof input.description === 'string' && input.description.length <= 5000, 'InvalidDescription');
  requireThat(Array.isArray(input.lessons) && input.lessons.length > 0 && input.lessons.length <= 30, 'InvalidLessons');
  const lessons = input.lessons.map((lesson, index) => {
    requireThat(typeof lesson.title === 'string' && lesson.title.trim() && lesson.title.length <= 200, 'InvalidLessonTitle');
    requireThat(Number.isSafeInteger(lesson.durationSeconds) && lesson.durationSeconds > 0 && lesson.durationSeconds <= 86400, 'InvalidDuration');
    requireThat(/^at:\/\/did:(plc|web):[^/]+\/place\.stream\.video\/[a-zA-Z0-9._~:-]+$/.test(lesson.videoRef?.uri ?? '') && /^b[a-z2-7]{20,}$/.test(lesson.videoRef?.cid ?? ''), 'InvalidVideoRef');
    const quiz = lesson.quiz;
    if (quiz != null) {
      requireThat(Array.isArray(quiz.questions) && quiz.questions.length > 0 && quiz.questions.length <= 20, 'InvalidQuiz');
      for (const q of quiz.questions) {
        requireThat(typeof q.prompt === 'string' && q.prompt.trim() && q.prompt.length <= 1000, 'InvalidQuestion');
        requireThat(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8 && q.options.every(o => typeof o === 'string' && o.trim() && o.length <= 500), 'InvalidOptions');
        requireThat(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, 'InvalidAnswerKey');
      }
    }
    // Whitelist rather than carrying user-supplied grades, IDs or public fields.
    return { id: tid(), title: lesson.title.trim(), durationSeconds: lesson.durationSeconds, videoRef: { uri: lesson.videoRef.uri, cid: lesson.videoRef.cid }, order: index, ...(quiz ? { quiz: { passPercent: 70, questions: quiz.questions.map(q => ({ prompt: q.prompt, options: [...q.options], correctIndex: q.correctIndex })) } } : {}) };
  });
  return { id: tid(), title: input.title.trim(), description: input.description, createdAt: now(), lessons };
}

export function publicCourse(course) {
  return { id: course.id, title: course.title, description: course.description, createdAt: course.createdAt, courseRef: course.courseRef, publication: course.publication, lessons: course.lessons.map(l => ({ id: l.id, title: l.title, durationSeconds: l.durationSeconds, videoRef: l.videoRef, quiz: l.quiz ? { passPercent: l.quiz.passPercent, questions: l.quiz.questions.map(q => ({ prompt: q.prompt, options: q.options })) } : null })) };
}

// The sole institutional writer. Never instantiate two runtimes for this DID.
// Every command atomically stores its official outcome + receipt + outbox in
// this ONE repo. Cross-space delivery is a replayable, idempotent operation.
export class Learning {
  tail = Promise.resolve();
  institution;
  courses = new Map();
  constructor({ institutionDid, repository = (actor, type) => new SpaceRepository(actor, type), verifyVideo = async () => {} }) {
    this.institutionDid = institutionDid; this.repository = repository; this.verifyVideo = verifyVideo;
  }
  serial(fn) {
    const task = this.tail.then(fn); this.tail = task.catch(() => {}); return task;
  }
  ready() { requireThat(this.institution, 'InstitutionMustReconnect', 503); return this.institution; }
  async connect(actor, asInstitution = false) {
    return this.serial(async () => {
      if (asInstitution) {
        requireThat(actor.did === this.institutionDid, 'NotInstitution', 403);
        const repo = this.repository(actor, INSTITUTION); await repo.ensure();
        const rows = await repo.snapshot();
        this.institution = repo; this.rebuild(rows);
        return { did: actor.did, role: 'admin' };
      }
      const repo = this.repository(actor, PERSONAL); await repo.ensure();
      return { did: actor.did, role: 'learner' };
    });
  }
  rebuild(rows) {
    const courses = new Map();
    for (const row of rows) if (row.collection === collection('course') && row.value?.$type === collection('course') && row.value.schemaVersion === 1) courses.set(row.rkey, row.value);
    this.courses = courses;
  }
  async rebuildIndex() { return this.serial(async () => { this.rebuild(await this.ready().snapshot()); return { courses: this.courses.size }; }); }
  catalog() { this.ready(); return [...this.courses.values()].filter(c => c.publication === 'published').map(publicCourse); }
  async state(actor, courseId) {
    return this.serial(async () => {
      const repo = this.ready(), c = this.courses.get(courseId); requireThat(c?.publication === 'published', 'CourseNotFound', 404);
      const e = await repo.get(collection('enrollment'), enrollmentKey(actor.did, courseId));
      return { course: publicCourse(c), enrollment: e ?? null, certificate: e?.certificateId ? await repo.get(collection('certificate'), e.certificateId) : null };
    });
  }
  async execute(actor, requestId, input) {
    requireThat(typeof requestId === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(requestId), 'IdempotencyKeyRequired');
    requireThat(input && typeof input.kind === 'string', 'InvalidCommand');
    const admin = input.kind === 'createCourse';
    if (admin) requireThat(actor.did === this.institutionDid, 'NotInstitution', 403);
    const key = digest(`${actor.did}\n${requestId}`), hash = digest(canonical(input));
    return this.serial(async () => {
      const repo = this.ready();
      const personal = admin ? null : this.repository(actor, PERSONAL);
      // The input is durable in the learner's space before we acknowledge it.
      if (personal) {
        const request = await personal.get(collection('request'), key);
        if (request) requireThat(request.hash === hash, 'IdempotencyConflict', 409);
        else await personal.batch([write('request', key, { hash, input, createdAt: now() })]);
      }
      const prior = await repo.get(collection('command'), key);
      if (prior) {
        requireThat(prior.actorDid === actor.did && prior.hash === hash, 'IdempotencyConflict', 409);
        if (admin) {
          const course = await repo.get(collection('course'), prior.result.courseId);
          requireThat(course, 'MissingCommittedCourse', 503);
          this.courses.set(course.id, course);
        }
        await this.deliverPersonal(personal, key, prior.result);
        return prior.result;
      }
      const outcome = await this.reduce(actor, key, input);
      const result = outcome.result;
      await repo.batch([...outcome.writes, write('command', key, { actorDid: actor.did, hash, input, result, appliedAt: now() })]);
      // Do not update the reconstructible index until the batch is durable.
      if (outcome.course) this.courses.set(outcome.course.id, typed('course', outcome.course));
      await this.deliverPersonal(personal, key, result);
      return result;
    });
  }
  async deliverPersonal(personal, key, result) {
    if (!personal) return;
    // A copy is convenience, never evidence for an official grade/certificate.
    try { await personal.put(collection('receipt'), key, typed('receipt', { issuer: this.institutionDid, result })); }
    catch { /* The official receipt survives. Retrying the SAME key redelivers. */ }
  }
  async reduce(actor, commandKey, input) {
    const repo = this.ready();
    if (input.kind === 'createCourse') {
      const course = { ...validateCourse(input.course), publication: 'pending' };
      for (const l of course.lessons) await this.verifyVideo(l.videoRef);
      return { course, result: { courseId: course.id, publication: 'pending' }, writes: [write('course', course.id, course), write('outbox', commandKey, { kind: 'publishCourse', courseId: course.id, delivered: false, createdAt: now() })] };
    }
    const course = this.courses.get(input.courseId);
    requireThat(course?.publication === 'published', 'CourseNotFound', 404);
    const rkey = enrollmentKey(actor.did, course.id), previous = await repo.get(collection('enrollment'), rkey);
    const e = previous ? structuredClone(previous) : typed('enrollment', { learnerDid: actor.did, courseId: course.id, enrolledAt: now(), lessons: {}, progress: 0 });
    if (input.kind === 'enroll') return { result: e, writes: previous ? [] : [write('enrollment', rkey, e)] };
    requireThat(previous, 'EnrollmentRequired', 403);
    requireThat(['watch', 'quiz', 'claimCertificate'].includes(input.kind), 'UnknownCommand');
    if (input.kind !== 'claimCertificate') {
      const position = course.lessons.findIndex(l => l.id === input.lessonId); requireThat(position >= 0, 'LessonNotFound', 404);
      const lesson = course.lessons[position];
      requireThat(course.lessons.slice(0, position).every(l => e.lessons[l.id]?.satisfied), 'LessonLocked', 423);
      const state = e.lessons[lesson.id] ?? { watchedSeconds: 0, completed: false, passed: false, satisfied: false };
      if (input.kind === 'watch') {
        requireThat(Number.isSafeInteger(input.watchedSeconds) && input.watchedSeconds >= 0 && input.watchedSeconds <= lesson.durationSeconds, 'InvalidWatchTime');
        state.watchedSeconds = Math.max(state.watchedSeconds, input.watchedSeconds);
        // This is self-reported activity, not proctoring or proof of viewing.
        if (state.watchedSeconds >= Math.ceil(lesson.durationSeconds * 0.9)) state.completed = true;
      } else {
        requireThat(lesson.quiz && state.completed, 'WatchBeforeQuiz', 409);
        const questions = lesson.quiz.questions;
        requireThat(Array.isArray(input.answers) && input.answers.length === questions.length && input.answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < questions[i].options.length), 'InvalidAnswers');
        const score = Math.round(100 * questions.filter((q, i) => q.correctIndex === input.answers[i]).length / questions.length);
        state.lastScore = score; state.bestScore = Math.max(state.bestScore ?? 0, score); state.attempts = (state.attempts ?? 0) + 1;
        state.passed ||= score >= lesson.quiz.passPercent;
      }
      state.satisfied = state.completed && (!lesson.quiz || state.passed);
      e.lessons[lesson.id] = state;
    }
    e.progress = Math.round(100 * course.lessons.filter(l => e.lessons[l.id]?.satisfied).length / course.lessons.length);
    if (e.progress === 100 && !e.completedAt) e.completedAt = now();
    const writes = [];
    if (input.kind === 'claimCertificate') {
      requireThat(e.progress === 100, 'CourseIncomplete', 409);
      e.certificateId ??= digest(`certificate\n${rkey}`);
      const existing = await repo.get(collection('certificate'), e.certificateId);
      const certificate = existing ?? { id: e.certificateId, issuer: this.institutionDid, learnerDid: actor.did, courseId: course.id, courseRef: course.courseRef, courseTitle: course.title, completedAt: e.completedAt, issuedAt: now() };
      if (!existing) writes.push(write('certificate', e.certificateId, certificate));
      writes.push(write('enrollment', rkey, e, true));
      return { writes, result: { enrollment: e, certificate } };
    }
    writes.push(write('enrollment', rkey, e, true));
    return { writes, result: e };
  }
  async flushOutbox() {
    return this.serial(async () => {
      const repo = this.ready(), rows = await repo.snapshot(); let delivered = 0;
      // A prior batch may have committed despite a lost HTTP response. Refresh
      // the cache before consuming its outbox, even without an app restart.
      this.rebuild(rows);
      for (const row of rows.filter(r => r.collection === collection('outbox') && !r.value.delivered)) {
        const item = row.value, course = this.courses.get(item.courseId);
        requireThat(item.kind === 'publishCourse' && course, 'InvalidOutbox', 500);
        const courseRecord = { $type: 'app.civic.course', title: course.title, description: course.description, ownerDid: this.institutionDid, createdAt: course.createdAt };
        const put = (type, rkey, record) => repo.actor.rpc('com.atproto.repo.putRecord', { repo: this.institutionDid, collection: type, rkey, record }, true);
        // Stable TIDs and timestamps: an uncertain response can safely replay.
        const initial = await put('app.civic.course', course.id, courseRecord), lessonRefs = [];
        for (const lesson of course.lessons) {
          const r = await put('app.civic.lesson', lesson.id, { $type: 'app.civic.lesson', title: lesson.title, durationSeconds: lesson.durationSeconds, courseRef: { uri: initial.uri, cid: initial.cid }, videoRef: lesson.videoRef, createdAt: course.createdAt, order: lesson.order });
          lessonRefs.push({ uri: r.uri, cid: r.cid });
        }
        const published = await put('app.civic.course', course.id, { ...courseRecord, sections: [{ title: course.title, lessons: lessonRefs }] });
        const updated = { ...course, publication: 'published', courseRef: { uri: published.uri, cid: published.cid } };
        await repo.batch([write('course', course.id, updated, true), write('outbox', row.rkey, { ...item, delivered: true }, true)]);
        this.courses.set(course.id, updated); delivered++;
      }
      return { delivered };
    });
  }
  async publishCompletion(actor, courseId, consent) {
    requireThat(consent === true, 'ExplicitConsentRequired');
    return this.serial(async () => {
      const repo = this.ready(), course = this.courses.get(courseId);
      const e = await repo.get(collection('enrollment'), enrollmentKey(actor.did, courseId));
      requireThat(course && e?.progress === 100 && e.completedAt, 'CourseIncomplete', 409);
      const personal = this.repository(actor, PERSONAL), rkey = digest(`completion\n${courseId}`);
      const prior = await personal.get(collection('receipt'), rkey);
      const publicKey = prior?.publicKey ?? tid();
      // Persist publication intent BEFORE the cross-repo write. Same TID after
      // a crash; no grades, answers, watch logs or certificate are published.
      if (!prior) await personal.put(collection('receipt'), rkey, typed('receipt', { publicKey, courseId, consentedAt: now() }));
      const result = await actor.rpc('com.atproto.repo.putRecord', { repo: actor.did, collection: 'app.civic.progress', rkey: publicKey, record: { $type: 'app.civic.progress', learnerDid: actor.did, courseRef: course.courseRef, completedAt: e.completedAt, progressPercent: 100 } }, true);
      return { uri: result.uri, cid: result.cid };
    });
  }
}
