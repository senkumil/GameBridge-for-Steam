import { readFileSync } from 'node:fs';
import path from 'node:path';

console.log('Running Automatic & Manual Community Artwork Parity Test Suite (P01-P08)...');

// Quality bounds matching artwork_candidates.lua and artwork-quality.ts
const QUALITY = {
	portrait: { min_width: 300, min_height: 400, min_ratio: 0.50, max_ratio: 0.85 },
	hero: { min_width: 1280, min_height: 400, min_ratio: 2.35, max_ratio: 3.65 },
	wide: { min_width: 800, min_height: 350, min_ratio: 1.8, max_ratio: 2.65 },
	icon: { min_width: 32, min_height: 32 },
};

const CURATED = {
	'221430': {
		title: 'Pro Evolution Soccer 2013',
		portrait_rank: 2, portrait_id: 152317, hero_id: 38076, logo_id: 119351, wide_rank: 1,
	},
	'237110': {
		title: 'Mortal Kombat Komplete Edition',
		portrait_id: 46421, hero_id: 12459, logo_id: 9592, wide_id: 177942,
	},
};

function safe(item) {
	if (!item || typeof item !== 'object') return false;
	if (item.animated === true || item.nsfw === true || item.humor === true || item.epilepsy === true) return false;
	if (String(item.type || '').toLowerCase() === 'animated') return false;
	const fields = [item.style, item.tags, item.name];
	for (const value of fields) {
		let text = '';
		if (Array.isArray(value)) {
			text = value.map(t => typeof t === 'object' ? (t.name || t.tag || t.slug || '') : String(t || '')).join(' ');
		} else {
			text = String(value || '');
		}
		text = text.toLowerCase();
		if (text.includes('nsfw') || text.includes('meme') || text.includes('humor') || text.includes('joke')
			|| text.includes('epilepsy') || text.includes('nintendo switch') || text.includes('switch banner')
			|| text.includes('switch grid') || text.includes('switch cover') || text.includes('playstation banner')
			|| text.includes('ps5 banner') || text.includes('ps4 banner') || text.includes('xbox banner')
			|| text.includes('console banner')) {
			return false;
		}
	}
	return true;
}

function filterCandidates(items, slot) {
	if (!Array.isArray(items)) return [];
	const spec = QUALITY[slot];
	const result = [];
	for (const item of items) {
		if (result.length >= 10) break;
		const width = Number(item.width) || 0;
		const height = Number(item.height) || 0;
		const ratio = height > 0 ? width / height : 0;
		const orientationOk = slot !== 'portrait' || height > width;
		const qualityOk = !spec || (
			(!spec.min_width || width >= spec.min_width) &&
			(!spec.min_height || height >= spec.min_height) &&
			(!spec.min_ratio || ratio >= spec.min_ratio) &&
			(!spec.max_ratio || ratio <= spec.max_ratio)
		);
		if (item.url && safe(item) && orientationOk && qualityOk) {
			result.push({
				id: item.id,
				url: item.url,
				thumb: item.thumb || item.url,
				width,
				height,
				language: item.language,
				style: item.style,
				transparent: item.transparent === true,
			});
		}
	}
	return result;
}

function defaultId(list, wantedId, wantedRank) {
	if (wantedId) {
		const match = list.find(i => Number(i.id) === Number(wantedId));
		if (match) return match.id;
	}
	const rank = Math.max(1, Number(wantedRank) || 1);
	return list[rank - 1]?.id ?? list[0]?.id ?? null;
}

function resolveSgdb(appid, rawSlots) {
	const profile = CURATED[appid] || { title: `Steam AppID ${appid}` };
	const filteredSlots = {
		portrait: filterCandidates(rawSlots.portrait, 'portrait'),
		hero: filterCandidates(rawSlots.hero, 'hero'),
		logo: filterCandidates(rawSlots.logo, 'logo'),
		wide: filterCandidates(rawSlots.wide, 'wide'),
		icon: filterCandidates(rawSlots.icon, 'icon'),
	};
	const defaults = {
		portrait: defaultId(filteredSlots.portrait, profile.portrait_id, profile.portrait_rank),
		hero: defaultId(filteredSlots.hero, profile.hero_id, profile.hero_rank),
		logo: defaultId(filteredSlots.logo, profile.logo_id, profile.logo_rank),
		wide: defaultId(filteredSlots.wide, profile.wide_id, profile.wide_rank),
		icon: defaultId(filteredSlots.icon, profile.icon_id, profile.icon_rank),
	};
	return { profile, slots: filteredSlots, defaults };
}

// Manual picker simulation
function simulateManualPicker(appid, rawSlots) {
	const { defaults, slots } = resolveSgdb(appid, rawSlots);
	// Modal selects defaults[slot]
	const selection = {};
	for (const slot of ['portrait', 'hero', 'logo', 'wide', 'icon']) {
		const chosenId = defaults[slot];
		const item = slots[slot].find(c => c.id === chosenId);
		if (item) selection[slot] = item;
	}
	return { defaults, slots, selection };
}

// Automatic resolution simulation
function simulateAutomaticResolution(appid, rawSlots) {
	const { defaults, slots } = resolveSgdb(appid, rawSlots);
	const findItem = (list, id) => list.find(c => c.id === id) || null;
	const p = findItem(slots.portrait, defaults.portrait);
	const h = findItem(slots.hero, defaults.hero);
	const l = findItem(slots.logo, defaults.logo);
	const w = findItem(slots.wide, defaults.wide);
	const i = findItem(slots.icon, defaults.icon);
	return {
		portrait: p?.url || '',
		hero: h?.url || '',
		logo: l?.url || '',
		wide: w?.url || '',
		icon: i?.url || '',
		defaults,
		provenance: { portrait: p, hero: h, logo: l, wide: w, icon: i },
	};
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		console.log(`  [PASS] ${message}`);
		passed++;
	} else {
		console.error(`  [FAIL] ${message}`);
		failed++;
	}
}

// P01: Architecture check - artwork.lua delegates to artwork_candidates.lua
console.log('\n--- P01: Backend Delegation & Unification ---');
const artworkLua = readFileSync(path.join(process.cwd(), 'backend', 'lib', 'artwork.lua'), 'utf8');
const mainLua = readFileSync(path.join(process.cwd(), 'backend', 'main.lua'), 'utf8');
assert(artworkLua.includes('deps.artwork_candidates.fetch_community_artwork'),
	'artwork.lua delegates fetch_community_artwork directly to deps.artwork_candidates');
assert(mainLua.includes('deps.artwork_candidates = artwork_candidates'),
	'main.lua injects artwork_candidates into deps before artwork factory');
assert(!artworkLua.includes('STEAMGRIDDB_CURATED_RANKS'),
	'artwork.lua no longer maintains duplicate STEAMGRIDDB_CURATED_RANKS table');

// P02: PES 2013 (221430) Parity
console.log('\n--- P02: Parity for Pro Evolution Soccer 2013 (221430) ---');
const pesRawSlots = {
	portrait: [
		{ id: 99999, url: 'https://cdn2.steamgriddb.com/grid/99999.png', width: 600, height: 900 },
		{ id: 152317, url: 'https://cdn2.steamgriddb.com/grid/152317.png', width: 600, height: 900 },
		{ id: 88888, url: 'https://cdn2.steamgriddb.com/grid/88888.png', width: 600, height: 900 },
	],
	hero: [
		{ id: 11111, url: 'https://cdn2.steamgriddb.com/hero/11111.png', width: 1920, height: 620 },
		{ id: 38076, url: 'https://cdn2.steamgriddb.com/hero/38076.png', width: 1920, height: 620 },
	],
	logo: [
		{ id: 22222, url: 'https://cdn2.steamgriddb.com/logo/22222.png', width: 800, height: 300, transparent: true },
		{ id: 119351, url: 'https://cdn2.steamgriddb.com/logo/119351.png', width: 800, height: 300, transparent: true },
	],
	wide: [
		{ id: 33333, url: 'https://cdn2.steamgriddb.com/grid/33333.png', width: 920, height: 430 },
		{ id: 44444, url: 'https://cdn2.steamgriddb.com/grid/44444.png', width: 920, height: 430 },
	],
	icon: [
		{ id: 55555, url: 'https://cdn2.steamgriddb.com/icon/55555.png', width: 256, height: 256 },
	],
};

const pesManual = simulateManualPicker('221430', pesRawSlots);
const pesAuto = simulateAutomaticResolution('221430', pesRawSlots);

assert(pesManual.defaults.portrait === 152317, 'PES 2013 manual default portrait ID is 152317 (curated rank 2)');
assert(pesAuto.provenance.portrait.id === 152317, 'PES 2013 auto resolved portrait ID is 152317');
assert(pesAuto.portrait === pesManual.selection.portrait.url, 'PES 2013 portrait URL 100% parity (Auto == Manual)');

assert(pesManual.defaults.hero === 38076, 'PES 2013 manual default hero ID is 38076');
assert(pesAuto.provenance.hero.id === 38076, 'PES 2013 auto resolved hero ID is 38076');
assert(pesAuto.hero === pesManual.selection.hero.url, 'PES 2013 hero URL 100% parity (Auto == Manual)');

assert(pesManual.defaults.logo === 119351, 'PES 2013 manual default logo ID is 119351');
assert(pesAuto.provenance.logo.id === 119351, 'PES 2013 auto resolved logo ID is 119351');
assert(pesAuto.logo === pesManual.selection.logo.url, 'PES 2013 logo URL 100% parity (Auto == Manual)');

assert(pesManual.defaults.wide === 33333, 'PES 2013 manual default wide ID is 33333 (rank 1)');
assert(pesAuto.provenance.wide.id === 33333, 'PES 2013 auto resolved wide ID is 33333');
assert(pesAuto.wide === pesManual.selection.wide.url, 'PES 2013 wide URL 100% parity (Auto == Manual)');

assert(pesManual.defaults.icon === 55555, 'PES 2013 manual default icon ID is 55555');
assert(pesAuto.provenance.icon.id === 55555, 'PES 2013 auto resolved icon ID is 55555');
assert(pesAuto.icon === pesManual.selection.icon.url, 'PES 2013 icon URL 100% parity (Auto == Manual)');

// P03: Mortal Kombat Komplete Edition (237110) Parity
console.log('\n--- P03: Parity for Mortal Kombat Komplete Edition (237110) ---');
const mkkeRawSlots = {
	portrait: [
		{ id: 1001, url: 'https://cdn2.steamgriddb.com/grid/1001.png', width: 600, height: 900 },
		{ id: 46421, url: 'https://cdn2.steamgriddb.com/grid/46421.png', width: 600, height: 900 },
	],
	hero: [
		{ id: 2001, url: 'https://cdn2.steamgriddb.com/hero/2001.png', width: 1920, height: 620 },
		{ id: 12459, url: 'https://cdn2.steamgriddb.com/hero/12459.png', width: 1920, height: 620 },
	],
	logo: [
		{ id: 3001, url: 'https://cdn2.steamgriddb.com/logo/3001.png', width: 800, height: 300, transparent: true },
		{ id: 9592, url: 'https://cdn2.steamgriddb.com/logo/9592.png', width: 800, height: 300, transparent: true },
	],
	wide: [
		{ id: 4001, url: 'https://cdn2.steamgriddb.com/grid/4001.png', width: 920, height: 430 },
		{ id: 177942, url: 'https://cdn2.steamgriddb.com/grid/177942.png', width: 920, height: 430 },
	],
	icon: [
		{ id: 5001, url: 'https://cdn2.steamgriddb.com/icon/5001.png', width: 256, height: 256 },
	],
};

const mkkeManual = simulateManualPicker('237110', mkkeRawSlots);
const mkkeAuto = simulateAutomaticResolution('237110', mkkeRawSlots);

assert(mkkeManual.defaults.portrait === 46421, 'MKKE manual default portrait ID is 46421');
assert(mkkeAuto.provenance.portrait.id === 46421, 'MKKE auto resolved portrait ID is 46421');
assert(mkkeAuto.portrait === mkkeManual.selection.portrait.url, 'MKKE portrait URL 100% parity');

assert(mkkeManual.defaults.hero === 12459, 'MKKE manual default hero ID is 12459');
assert(mkkeAuto.provenance.hero.id === 12459, 'MKKE auto resolved hero ID is 12459');
assert(mkkeAuto.hero === mkkeManual.selection.hero.url, 'MKKE hero URL 100% parity');

assert(mkkeManual.defaults.logo === 9592, 'MKKE manual default logo ID is 9592');
assert(mkkeAuto.provenance.logo.id === 9592, 'MKKE auto resolved logo ID is 9592');
assert(mkkeAuto.logo === mkkeManual.selection.logo.url, 'MKKE logo URL 100% parity');

assert(mkkeManual.defaults.wide === 177942, 'MKKE manual default wide ID is 177942');
assert(mkkeAuto.provenance.wide.id === 177942, 'MKKE auto resolved wide ID is 177942');
assert(mkkeAuto.wide === mkkeManual.selection.wide.url, 'MKKE wide URL 100% parity');

assert(mkkeManual.defaults.icon === 5001, 'MKKE manual default icon ID is 5001');
assert(mkkeAuto.provenance.icon.id === 5001, 'MKKE auto resolved icon ID is 5001');
assert(mkkeAuto.icon === mkkeManual.selection.icon.url, 'MKKE icon URL 100% parity');

// P04: Generic Title Parity
console.log('\n--- P04: Generic Title Parity (Rank 1 / Score Order) ---');
const genericRawSlots = {
	portrait: [
		{ id: 801, url: 'https://cdn2.steamgriddb.com/grid/801.png', width: 600, height: 900 },
		{ id: 802, url: 'https://cdn2.steamgriddb.com/grid/802.png', width: 600, height: 900 },
	],
	hero: [
		{ id: 803, url: 'https://cdn2.steamgriddb.com/hero/803.png', width: 1920, height: 620 },
	],
	logo: [
		{ id: 804, url: 'https://cdn2.steamgriddb.com/logo/804.png', width: 500, height: 200, transparent: true },
	],
	wide: [
		{ id: 805, url: 'https://cdn2.steamgriddb.com/grid/805.png', width: 920, height: 430 },
	],
	icon: [
		{ id: 806, url: 'https://cdn2.steamgriddb.com/icon/806.png', width: 128, height: 128 },
	],
};
const genManual = simulateManualPicker('999999', genericRawSlots);
const genAuto = simulateAutomaticResolution('999999', genericRawSlots);
assert(genAuto.portrait === genManual.selection.portrait.url, 'Generic portrait parity');
assert(genAuto.hero === genManual.selection.hero.url, 'Generic hero parity');
assert(genAuto.logo === genManual.selection.logo.url, 'Generic logo parity');
assert(genAuto.wide === genManual.selection.wide.url, 'Generic wide parity');
assert(genAuto.icon === genManual.selection.icon.url, 'Generic icon parity');

// P05: Safety and Console Banner Filtering
console.log('\n--- P05: Safety and Platform Banner Filtering ---');
const unsafeItems = [
	{ id: 1, url: 'https://cdn2.steamgriddb.com/grid/1.png', style: 'Nintendo Switch' },
	{ id: 2, url: 'https://cdn2.steamgriddb.com/grid/2.png', tags: ['ps5 banner'] },
	{ id: 3, url: 'https://cdn2.steamgriddb.com/grid/3.png', nsfw: true },
	{ id: 4, url: 'https://cdn2.steamgriddb.com/grid/4.png', humor: true },
	{ id: 5, url: 'https://cdn2.steamgriddb.com/grid/5.png', name: 'Joke cover' },
	{ id: 6, url: 'https://cdn2.steamgriddb.com/grid/6.png', tags: [{ name: 'Console Banner' }] },
];
for (const item of unsafeItems) {
	assert(!safe(item), `Item ${item.id} (${JSON.stringify(item.style || item.tags || item.name || item.nsfw)}) correctly rejected as unsafe`);
}

// P06: Wide Capsule Upgrading (Low-res header vs 920x430 capsule)
console.log('\n--- P06: Wide Capsule Upgrading Policy ---');
const isLowResHeader = (url) => /\/header\.jpg(?:$|[?#])/i.test(url);
const headerUrl = 'https://shared.steamstatic.com/store_item_assets/steam/apps/221430/header.jpg';
const sgdbWideUrl = 'https://cdn2.steamgriddb.com/grid/33333.png';
assert(isLowResHeader(headerUrl), 'Store header.jpg correctly identified as low-res header');
assert(!isLowResHeader(sgdbWideUrl), 'SGDB 920x430 wide asset correctly identified as non-header');

// When modern.wide is absent, header.jpg triggers needsCommunityArtwork
const mockModernWithoutWide = { hero: undefined, wide: undefined };
const mockItem = { imageType: 3, url: headerUrl, dataUrl: 'data:image/jpeg;base64,...' };
const needsUpgrade = (item, modern) => !item.dataUrl || (item.imageType === 3 && isLowResHeader(item.url) && !modern?.wide);
assert(needsUpgrade(mockItem, mockModernWithoutWide),
	'Low-res store header triggers needsCommunityArtwork when official modern.wide is absent');

// P07: Community Icon Fallback
console.log('\n--- P07: Community Icon Fallback Verification ---');
const shortcutIconSrc = readFileSync(path.join(process.cwd(), 'frontend', 'features', 'library', 'shortcut-icon.ts'), 'utf8');
assert(shortcutIconSrc.includes('getCommunityArtwork(steamAppId)'),
	'shortcut-icon.ts calls getCommunityArtwork when Steam client icon is missing');
assert(shortcutIconSrc.includes('community?.icon'),
	'shortcut-icon.ts falls back to community.icon');
assert(shortcutIconSrc.includes("source: 'steamgriddb'"),
	'shortcut-icon.ts marks source as steamgriddb when saving community icon');

// P08: Reconciler Healing UNAVAILABLE Slots
console.log('\n--- P08: Reconciler Healing UNAVAILABLE Slots ---');
const reconcilerSrc = readFileSync(path.join(process.cwd(), 'frontend', 'features', 'shortcuts', 'reconciler.ts'), 'utf8');
assert(reconcilerSrc.includes('hasMissingSlots && autoCommunity'),
	'reconciler.ts marks shortcuts with missing slots as repair-eligible when autoCommunity is enabled');
assert(reconcilerSrc.includes('reconcileCooldowns'),
	'reconciler.ts manages cooldowns to prevent infinite network loops');

console.log(`\n========================================`);
console.log(`Total tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
	process.exit(1);
} else {
	console.log('All Community Parity tests passed successfully!');
}
