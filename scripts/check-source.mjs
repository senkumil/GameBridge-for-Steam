import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const frontendRoot = path.join(root, 'frontend');
const failures = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function fail(file, message) {
  failures.push(`${rel(file)}: ${message}`);
}

function parseRelativeImports(source) {
  const result = [];
  const pattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[1].startsWith('.')) result.push(match[1]);
  }
  return result;
}

async function resolveImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [
    `${base}.ts`, `${base}.tsx`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return path.normalize(candidate);
    } catch {}
  }
  return null;
}

function frontendLayer(file) {
  const relative = rel(file);
  if (relative.startsWith('frontend/runtime/')) return 'runtime';
  if (relative.startsWith('frontend/settings/')) return 'settings';
  if (relative.startsWith('frontend/features/')) return 'features';
  if (relative.startsWith('frontend/steam/')) return 'steam';
  if (relative.startsWith('frontend/core/')) return 'core';
  if (relative.startsWith('frontend/api/')) return 'api';
  if (relative.startsWith('frontend/domain/')) return 'domain';
  if (relative === 'frontend/index.tsx' || relative === 'frontend/index.ts') return 'entry';
  return 'other';
}

const sourceFiles = (await walk(frontendRoot)).filter(file => /\.tsx?$/.test(file)).map(path.normalize);
const sourceSet = new Set(sourceFiles);
const importGraph = new Map(sourceFiles.map(file => [file, []]));

for (const file of sourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  const relative = rel(file);

  if (/<[^>\n]*\bon(?:click|error|load|mouseenter|mouseleave|mouseover|mouseout)\s*=/i.test(source)) {
    fail(file, 'inline DOM event handler detected; use delegated listeners or addEventListener');
  }
  if (/\.millennium\/Dist|\.millennium\\Dist/i.test(source)) {
    fail(file, 'source must not import or depend on generated .millennium/Dist output');
  }
  if (/\bcallable\s*(?:<|\()/m.test(source) && relative !== 'frontend/api/backend.ts') {
    fail(file, 'Millennium callable(...) handles belong only in frontend/api/backend.ts');
  }
  if (/\bsenkumil\b/i.test(source)) {
    fail(file, 'developer/test username leaked into production source');
  }

  const lineCount = source.split(/\r?\n/).length;
  if (/frontend\/features\/[^/]+\/runtime\.tsx?$/.test(relative) && lineCount > 500) {
    fail(file, `feature runtime is ${lineCount} lines; keep orchestration runtimes at or below 500 lines`);
  }
  if (relative === 'frontend/runtime/app.tsx' && lineCount > 500) {
    fail(file, `application composition root is ${lineCount} lines; keep it at or below 500 lines`);
  }
  if (lineCount > 900) {
    fail(file, `module is ${lineCount} lines; split modules larger than 900 lines`);
  }

  for (const specifier of parseRelativeImports(source)) {
    const target = await resolveImport(file, specifier);
    if (!target || !sourceSet.has(target)) continue;
    importGraph.get(file).push(target);

    const sourceLayer = frontendLayer(file);
    const targetLayer = frontendLayer(target);
    if (sourceLayer !== 'runtime' && sourceLayer !== 'entry' && targetLayer === 'runtime') {
      fail(file, `dependency inversion: ${sourceLayer} code must not import runtime composition (${rel(target)})`);
    }
    if (sourceLayer === 'domain' && targetLayer !== 'domain') {
      fail(file, `domain contracts must not depend on ${targetLayer} (${rel(target)})`);
    }
    if (sourceLayer === 'steam' && targetLayer === 'features') {
      fail(file, `Steam anti-corruption layer must not depend on feature UI (${rel(target)})`);
    }
    if ((sourceLayer === 'core' || sourceLayer === 'api') && targetLayer === 'features') {
      fail(file, `${sourceLayer} infrastructure must not depend on feature UI (${rel(target)})`);
    }
  }
}

// Cycles make Steam-private adapters and feature surfaces difficult to replace
// independently. Keep the frontend graph acyclic so refactors stay local.
const visitState = new Map();
const stack = [];
const reportedCycles = new Set();
function visit(file) {
  visitState.set(file, 1);
  stack.push(file);
  for (const target of importGraph.get(file) || []) {
    if (visitState.get(target) === 1) {
      const start = stack.indexOf(target);
      const cycle = [...stack.slice(start), target].map(rel);
      const key = cycle.join(' -> ');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        failures.push(`frontend import cycle: ${key}`);
      }
      continue;
    }
    if (!visitState.has(target)) visit(target);
  }
  stack.pop();
  visitState.set(file, 2);
}
for (const file of sourceFiles) if (!visitState.has(file)) visit(file);

const backendMain = path.join(root, 'backend', 'main.lua');
try {
  const lineCount = (await fs.readFile(backendMain, 'utf8')).split(/\r?\n/).length;
  if (lineCount > 250) fail(backendMain, `IPC facade is ${lineCount} lines; backend/main.lua should remain a thin facade`);
} catch (error) {
  failures.push(`backend/main.lua: unable to read (${String(error)})`);
}

if (failures.length) {
  console.error(`Source architecture check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Source architecture check passed (${sourceFiles.length} frontend source files, acyclic dependency graph).`);
