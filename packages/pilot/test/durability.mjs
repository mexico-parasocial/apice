import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Learning } from '../src/learning.mjs';
import { randomToken } from '../src/protocol.mjs';
import { account, login, sample } from './helpers.mjs';

const bin = process.env.VLPDS_BIN, endpoint = process.env.PILOT_TEST_S3_ENDPOINT;
test('durable Spaces acknowledgement survives SIGKILL and a cold application index', { skip: !bin || !endpoint, timeout: 120_000 }, async () => {
  const pds = 'http://127.0.0.1:2594', prefix = `durability-${randomToken().slice(0, 12)}`;
  let proc;
  async function start() {
    const flags = ['--dev-mode','--spaces','--plc-mode','unregistered','--listen','127.0.0.1:2594','--public-url',pds,'--handle-domain','pilot.test','--s3-endpoint',endpoint,'--s3-bucket','apice-pilot-pds','--prefix',prefix,'--s3-access-key','apice-pilot-only','--s3-secret-key','apice-pilot-test-secret','--shards','2','--workers','2','--io-threads','2','--memory-budget-mb','2048','--firehose-ring-mb','16','--firehose-merge-queue-mb','16','--live-ring-mb','16','--backfill-cache-mb','16','--backfill-readahead-mb','1','--firehose-max-backfills','1','--max-exports','1','--lazy-mst-node-cache-mb','16'];
    proc = spawn(bin, flags, { stdio: ['ignore','ignore','pipe'] }); let err = ''; proc.stderr.on('data', c => { err = (err + c).slice(-5000); });
    for (let i = 0; i < 100; i++) {
      if (proc.exitCode !== null) throw new Error(`PDS stopped: ${err}`);
      try {
        const r = await fetch(`${pds}/metrics`, { signal: AbortSignal.timeout(500) });
        const metrics = await r.text();
        if (r.ok && /^vlpds_owned_partitions(?:\{[^}]*\})? 2$/m.test(metrics)) return;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('PDS startup timeout');
  }
  async function stop(signal) { if (proc && proc.exitCode === null) { const exited = new Promise(r => proc.once('exit', r)); proc.kill(signal); await exited; } }
  try {
    await start(); const adminAcct = await account(pds, 'durable'), studentAcct = await account(pds, 'student');
    let admin = await login(pds, adminAcct, true), learner = await login(pds, studentAcct);
    const service = new Learning({ institutionDid: admin.did }); await service.connect(admin, true); await service.connect(learner);
    const id = randomToken(), input = { kind: 'createCourse', course: sample() }; const created = await service.execute(admin, id, input); await service.flushOutbox();
    await service.execute(learner, randomToken(), { kind: 'enroll', courseId: created.courseId });
    const before = await service.state(learner, created.courseId);
    await stop('SIGKILL'); await start();
    admin = await login(pds, adminAcct, true); learner = await login(pds, studentAcct);
    const recovered = new Learning({ institutionDid: admin.did }); await recovered.connect(admin, true); await recovered.connect(learner);
    assert.deepEqual(await recovered.execute(admin, id, input), created);
    assert.deepEqual(await recovered.state(learner, created.courseId), before);
    assert.equal(recovered.catalog().length, 1);
  } finally { await stop('SIGTERM'); }
});
