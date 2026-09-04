import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import luaparse from 'luaparse';

const root = process.cwd();
const backendRoot = path.join(root, 'backend');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.lua')) files.push(full);
  }
  return files;
}

const failures = [];
for (const file of await walk(backendRoot)) {
  try {
    luaparse.parse(await fs.readFile(file, 'utf8'), {
      luaVersion: '5.1',
      comments: false,
      locations: true,
      scope: false,
    });
  } catch (error) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    failures.push(`${relative}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Lua syntax check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Lua syntax check passed.');
