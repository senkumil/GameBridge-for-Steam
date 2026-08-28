import { readFileSync } from 'node:fs';

const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/shortcut-detection-cases.json', import.meta.url), 'utf8'));
const names = new Set(cases.map(test => test.executable.toLowerCase()));
for (const required of ['re9.exe', 'tlou-i.exe', 'mkke.exe', 'sparkingzero-win64-shipping.exe', 'launcher.exe', 'gtaiv.exe', 're4.exe', 'b1-win64-shipping.exe', 'rdr2.exe', 'gta-sa.exe']) {
	if (!names.has(required)) throw new Error(`Missing shortcut detection fixture: ${required}`);
}
if (!cases.every(test => test.expect && typeof test.expect === 'object')) throw new Error('Every shortcut fixture needs expected safety behavior.');
const arbitraryTitleAlias = cases.find(test => test.executable.toLowerCase() === 'tlou-i.exe' && test.title === 'q');
if (!arbitraryTitleAlias?.expect?.maintainedAliasCanOpenReviewModal || !arbitraryTitleAlias?.expect?.requiresManualConfirmation) {
	throw new Error('Missing regression coverage for a renamed shortcut whose maintained executable alias still needs a review modal.');
}
const tlouExactTitle = cases.find(test => test.executable.toLowerCase() === 'tlou-i.exe' && test.title.includes('The Last of Us'));
if (tlouExactTitle?.expect?.expectedAppId !== '1888930'
		|| !tlouExactTitle?.expect?.invalidUtf8CannotAbortDetection
		|| !tlouExactTitle?.expect?.bulkCanAcceptUniqueExactTitle) {
	throw new Error('Missing TLOUS regression coverage for UTF-8-safe exact-title bulk linking.');
}

const utilSource = readFileSync(new URL('../backend/lib/util.lua', import.meta.url), 'utf8');
const detectorSource = readFileSync(new URL('../backend/lib/shortcut_detection.lua', import.meta.url), 'utf8');
if (!utilSource.includes('function M.sanitize_utf8(value)')
		|| !utilSource.includes('function M.sanitize_utf8_tree(value, seen)')
		|| !detectorSource.includes('cjson.encode(util.sanitize_utf8_tree(value))')) {
	throw new Error('Shortcut detection IPC responses must sanitize malformed upstream UTF-8 before serialization.');
}

const wukong = cases.find(test => test.executable.toLowerCase() === 'b1-win64-shipping.exe');
if (!wukong?.expect?.exactOfficialTitleOverridesAliasCaution || !wukong?.expect?.deepGameFolderIsEvidence) {
	throw new Error('Missing regression coverage for exact-title alias recovery and deep Unreal game-folder evidence.');
}
const rdr2 = cases.find(test => test.executable.toLowerCase() === 'rdr2.exe');
if (!rdr2?.expect?.bulkCanAcceptUniqueExactTitle) {
	throw new Error('Missing regression coverage for unique exact-title bulk linking through a maintained alias.');
}

console.log(`Shortcut detection fixture check passed (${cases.length} cases).`);
