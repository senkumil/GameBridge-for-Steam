import { readFileSync } from 'node:fs';

const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/shortcut-detection-cases.json', import.meta.url), 'utf8'));
const names = new Set(cases.map(test => test.executable.toLowerCase()));
for (const required of ['re9.exe', 'tlou-i.exe', 'mkke.exe', 'sparkingzero-win64-shipping.exe', 'launcher.exe', 'gtaiv.exe', 're4.exe']) {
	if (!names.has(required)) throw new Error(`Missing shortcut detection fixture: ${required}`);
}
if (!cases.every(test => test.expect && typeof test.expect === 'object')) throw new Error('Every shortcut fixture needs expected safety behavior.');
const arbitraryTitleAlias = cases.find(test => test.executable.toLowerCase() === 'tlou-i.exe' && test.title === 'q');
if (!arbitraryTitleAlias?.expect?.maintainedAliasCanOpenReviewModal || !arbitraryTitleAlias?.expect?.requiresManualConfirmation) {
	throw new Error('Missing regression coverage for a renamed shortcut whose maintained executable alias still needs a review modal.');
}
console.log(`Shortcut detection fixture check passed (${cases.length} cases).`);
