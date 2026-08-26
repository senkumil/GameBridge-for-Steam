import { readFileSync } from 'node:fs';

const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/shortcut-detection-cases.json', import.meta.url), 'utf8'));
const names = new Set(cases.map(test => test.executable.toLowerCase()));
for (const required of ['re9.exe', 'tlou-i.exe', 'mkke.exe', 'sparkingzero-win64-shipping.exe', 'launcher.exe', 'gtaiv.exe', 're4.exe']) {
	if (!names.has(required)) throw new Error(`Missing shortcut detection fixture: ${required}`);
}
if (!cases.every(test => test.expect && typeof test.expect === 'object')) throw new Error('Every shortcut fixture needs expected safety behavior.');
console.log(`Shortcut detection fixture check passed (${cases.length} cases).`);
