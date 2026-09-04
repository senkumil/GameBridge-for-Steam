import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const mode = process.argv[2] === 'dev' ? 'dev' : 'prod';
const manifestPath = path.join(root, 'plugin.json');
const sourceManifestPath = path.join(root, 'plugin.source.json');
if (existsSync(sourceManifestPath)) {
  // plugin.source.json is the canonical manifest. Always regenerate plugin.json
  // so local builds and GitHub Actions cannot publish a stale version/metadata.
  await copyFile(sourceManifestPath, manifestPath);
}
if (!existsSync(manifestPath)) throw new Error('Missing plugin.json or plugin.source.json.');

const ttcEntry = path.join(root, 'node_modules', '@steambrew', 'ttc', 'dist', 'index.js');
const result = spawnSync(process.execPath, [ttcEntry, '--build', mode], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`millennium-ttc exited with code ${result.status ?? 1}.`);

// The repository folder is also the live Millennium plugin. Keeping the
// generated manifest beside plugin.source.json lets Steam load this checkout
// directly. CI force-syncs plugin.json and the production bundle on main even
// though plugin.json stays ignored for normal local development. Older builds
// copied the bundle to a second sibling folder, which made Steam show duplicate
// plugins and caused edits to be applied to the wrong checkout.
