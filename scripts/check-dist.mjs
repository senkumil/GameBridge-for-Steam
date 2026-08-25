import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, '.millennium', 'Dist', 'index.js');

let stat;
try {
  stat = await fs.stat(dist);
} catch {
  console.error('Generated frontend bundle is missing: .millennium/Dist/index.js');
  process.exit(1);
}
if (!stat.isFile() || stat.size < 1024) {
  console.error(`Generated frontend bundle looks invalid (${stat.size} bytes).`);
  process.exit(1);
}

const syntax = spawnSync(process.execPath, ['--check', dist], { stdio: 'inherit' });
if (syntax.status !== 0) process.exit(syntax.status ?? 1);

const source = await fs.readFile(dist, 'utf8');
if (!source.includes('game-data-linker')) {
  console.error('Generated frontend bundle does not contain the expected plugin identifier.');
  process.exit(1);
}
console.log(`Generated bundle check passed (${Math.round(stat.size / 1024)} KiB).`);
