import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, '.millennium', 'Dist', 'index.js');
const manifestPath = await fs.access(path.join(root, 'plugin.json')).then(
  () => path.join(root, 'plugin.json'),
  () => path.join(root, 'plugin.source.json'),
);

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const pluginName = String(manifest.name || '');
if (!pluginName || /\s/.test(pluginName)) {
  console.error('plugin.json name must be a non-empty identifier without whitespace. Use common_name for the visible title.');
  process.exit(1);
}

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
if (!source.includes('NativeGameLink for Steam')) {
  console.error('Generated frontend bundle does not contain the expected visible plugin title.');
  process.exit(1);
}
if (!source.includes(`pluginName="${pluginName}"`)) {
  console.error(`Generated frontend bundle does not use the manifest identifier ${pluginName}.`);
  process.exit(1);
}
console.log(`Generated bundle check passed (${Math.round(stat.size / 1024)} KiB).`);
