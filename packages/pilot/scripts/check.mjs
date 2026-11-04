import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
// Dependency-free JS runtime: syntax validation is named explicitly here;
// this does not pretend to provide TypeScript's semantic type checking.
for (const dir of ['src', 'web', 'test', 'scripts']) for (const file of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(f => f.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', new URL(`../${dir}/${file}`, import.meta.url).pathname], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
