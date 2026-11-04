import { readFileSync, lstatSync } from 'node:fs';
import { requireThat } from './protocol.mjs';

export function checkedOrigin(value, production = false) {
  const u = new URL(value);
  requireThat(u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password, 'InvalidServiceOrigin');
  const loopback = ['127.0.0.1', 'localhost'].includes(u.hostname);
  if (production) requireThat(u.protocol === 'https:' && !u.port && !loopback && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(u.hostname) && !/\.(test|invalid|localhost|internal)$/.test(u.hostname), 'PublicHttpsOriginRequired');
  else requireThat(u.protocol === 'http:' && loopback, 'PilotRequiresLoopback');
  return u;
}

export function readPrivateJson(path) {
  requireThat(path, 'OAuthClientKeyFileRequired');
  const stat = lstatSync(path);
  requireThat(stat.isFile() && (stat.mode & 0o077) === 0, 'PrivateFilePermissionsRequired');
  return JSON.parse(readFileSync(path, 'utf8'));
}
