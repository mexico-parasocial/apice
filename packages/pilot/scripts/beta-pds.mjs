import { spawn } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireThat } from '../src/protocol.mjs';
import { checkedOrigin } from '../src/config.mjs';

const config = JSON.parse(readFileSync(new URL('../infra/beta-domain.json', import.meta.url), 'utf8'));
checkedOrigin(config.origins.pds, true);
const root = new URL('../.local/beta/secrets/', import.meta.url);
const secret = name => {
  const path = fileURLToPath(new URL(name, root)), stat = lstatSync(path);
  requireThat(stat.isFile() && (stat.mode & 0o077) === 0, 'PrivateFilePermissionsRequired'); return path;
};
const args = [
  '--spaces', '--plc-mode', 'directory', '--invite-required',
  '--crawlers', '', '--asn-lookup', 'off',
  '--ui-dir', fileURLToPath(new URL('../.local/vlpds/ui/dist/', import.meta.url)),
  '--listen', `127.0.0.1:${config.loopbackPorts.pds}`, '--admin-listen', `127.0.0.1:${config.loopbackPorts.pdsAdmin}`,
  '--metrics-listen', `127.0.0.1:${config.loopbackPorts.pdsMetrics}`,
  '--public-url', config.origins.pds, '--handle-domain', new URL(config.origins.pds).hostname,
  '--service-did', `did:web:${new URL(config.origins.pds).hostname}`,
  '--s3-endpoint', `http://127.0.0.1:${config.loopbackPorts.storage}`, '--s3-bucket', 'apice-beta-pds', '--prefix', 'apice-beta-v1',
  '--jwt-secret-file', secret('jwt'), '--admin-token-file', secret('admin'), '--internal-token-file', secret('internal'),
  '--kek-file', secret('kek'), '--plc-rotation-key-file', secret('plc-rotation'),
  '--s3-access-key-file', secret('s3-access'), '--s3-secret-key-file', secret('s3-secret'),
  '--shards', '2', '--workers', '2', '--io-threads', '2', '--memory-budget-mb', '2048',
  '--firehose-ring-mb', '16', '--firehose-merge-queue-mb', '16', '--live-ring-mb', '16',
  '--backfill-cache-mb', '16', '--backfill-readahead-mb', '1', '--firehose-max-backfills', '1',
  '--max-exports', '1', '--lazy-mst-node-cache-mb', '16',
];
// No development env flags from the old pilot or a parent shell are inherited.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VLPDS_') && !key.startsWith('PDS_')));
const child = spawn(process.env.BETA_VLPDS_BIN ?? fileURLToPath(new URL('../.local/vlpds/target/debug/vlpds', import.meta.url)), args, { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start the pinned beta VLPDS binary.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
