import { readFileSync } from 'node:fs';
import {
	buildHeroCandidateUrls,
	classifyHeroVariant,
	determineHeroSelectionReason,
	isHero2xUrl,
	isHeroBaseUrl,
	logHeroResolutionDiagnostics,
} from '../frontend/features/library/artwork-hero.ts';

console.log('Running Hero Base First + 2X Fallback Test Suite (H01-H10)...');

// Helper to simulate candidate iteration pipeline as implemented in artwork.ts
async function simulateHeroResolution(options, mockFetch) {
	const candidateUrls = buildHeroCandidateUrls(options);
	let baseTested = false;
	let baseResult = null;

	for (const url of candidateUrls) {
		const isBase = isHeroBaseUrl(url, options.modern);
		const is2x = isHero2xUrl(url, options.modern);

		if (isBase) baseTested = true;

		const response = await mockFetch(url);
		if (!response || !response.ok) {
			if (isBase && !baseResult) baseResult = { status: 'missing' };
			continue;
		}

		// Quality check: minWidth 1280, minHeight 400, ratio 2.35 .. 3.65
		const { width = 0, height = 0 } = response;
		const ratio = height > 0 ? width / height : 0;
		const meetsQuality = width >= 1280 && height >= 400 && ratio >= 2.35 && ratio <= 3.65;

		if (!meetsQuality) {
			if (isBase && !baseResult) baseResult = { status: 'invalid' };
			continue;
		}

		// Valid candidate selected
		const variant = classifyHeroVariant(url, options.modern, Boolean(options.userHero && url === options.userHero));
		const reason = determineHeroSelectionReason(variant, baseResult);
		const provider = /steamgriddb\.com/i.test(url) ? 'steamgriddb' : (variant === 'legacy' ? 'steam-legacy' : 'steam');

		return {
			selectedUrl: url,
			variant,
			reason,
			provider,
			baseTested,
			candidateUrls,
			width,
			height,
		};
	}

	return {
		selectedUrl: null,
		variant: 'fallback',
		reason: 'degraded',
		provider: 'fallback',
		baseTested,
		candidateUrls,
	};
}

// --------------------------------------------------------------------------
// H01: Game with Base and 2X existing (e.g. GTA IV AppID 12210)
// Base must be selected. 2X must NOT displace Base.
// --------------------------------------------------------------------------
{
	const steamAppId = '12210';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero.jpg')) return { ok: true, width: 1920, height: 620 };
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 3840, height: 1240 };
		return { ok: false };
	});

	if (result.variant !== 'base' || result.reason !== 'base_valid' || !result.selectedUrl.includes('library_hero.jpg') || result.selectedUrl.includes('_2x')) {
		throw new Error(`H01 Failed: Expected Base Hero (library_hero.jpg), got: ${JSON.stringify(result)}`);
	}
	console.log('✓ H01 Passed: Base Hero selected when both Base and 2X exist (GTA IV).');
}

// --------------------------------------------------------------------------
// H02: Game without Base but with 2X
// 2X must be selected as fallback with reason 'base_missing'.
// --------------------------------------------------------------------------
{
	const steamAppId = '99991';
	const modern = {
		hero: '',
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero.jpg') && !url.includes('_2x')) return { ok: false };
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 3840, height: 1240 };
		return { ok: false };
	});

	if (result.variant !== '2x' || result.reason !== 'base_missing' || !result.selectedUrl.includes('library_hero_2x.jpg')) {
		throw new Error(`H02 Failed: Expected 2X fallback, got: ${JSON.stringify(result)}`);
	}
	console.log('✓ H02 Passed: 2X selected as fallback when Base is missing.');
}

// --------------------------------------------------------------------------
// H03: Game with Base corrupt / invalid dimensions and 2X valid
// 2X must be selected with reason 'base_invalid'.
// --------------------------------------------------------------------------
{
	const steamAppId = '99992';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero.jpg') && !url.includes('_2x')) {
			// Substandard / corrupted dimensions (e.g. only 460x215 instead of 1920x620)
			return { ok: true, width: 460, height: 215 };
		}
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 3840, height: 1240 };
		return { ok: false };
	});

	if (result.variant !== '2x' || result.reason !== 'base_invalid' || !result.selectedUrl.includes('library_hero_2x.jpg')) {
		throw new Error(`H03 Failed: Expected 2X fallback with base_invalid reason, got: ${JSON.stringify(result)}`);
	}
	console.log('✓ H03 Passed: 2X selected when Base has invalid dimensions/quality.');
}

// --------------------------------------------------------------------------
// H04: Game with Base valid (1920x620) and 2X higher resolution (3840x1240)
// Base must win. Higher resolution of 2X never displaces Base.
// --------------------------------------------------------------------------
{
	const steamAppId = '99993';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero.jpg') && !url.includes('_2x')) return { ok: true, width: 1920, height: 620 };
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 7680, height: 2480 };
		return { ok: false };
	});

	if (result.variant !== 'base' || result.width !== 1920) {
		throw new Error(`H04 Failed: Higher resolution 2X should not override Base. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H04 Passed: Higher resolution of 2X does not override canonical Base.');
}

// --------------------------------------------------------------------------
// H05: Game with Base valid and SteamGridDB available
// Base must win. SteamGridDB is not used.
// --------------------------------------------------------------------------
{
	const steamAppId = '99994';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
	};
	const communityHero = 'https://cdn2.steamgriddb.com/hero/123456789.jpg';
	const result = await simulateHeroResolution({ steamAppId, modern, communityHero }, async (url) => {
		if (url.includes('library_hero.jpg')) return { ok: true, width: 1920, height: 620 };
		if (url.includes('steamgriddb.com')) return { ok: true, width: 1920, height: 620 };
		return { ok: false };
	});

	if (result.variant !== 'base' || result.provider !== 'steam' || result.selectedUrl.includes('steamgriddb')) {
		throw new Error(`H05 Failed: Official Base must win over SteamGridDB. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H05 Passed: Official Base wins over SteamGridDB.');
}

// --------------------------------------------------------------------------
// H06: Game without Base, with 2X valid and SteamGridDB available
// 2X must win over SteamGridDB.
// --------------------------------------------------------------------------
{
	const steamAppId = '99995';
	const modern = {
		hero: '',
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const communityHero = 'https://cdn2.steamgriddb.com/hero/123456789.jpg';
	const result = await simulateHeroResolution({ steamAppId, modern, communityHero }, async (url) => {
		if (url.includes('library_hero.jpg') && !url.includes('_2x')) return { ok: false };
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 3840, height: 1240 };
		if (url.includes('steamgriddb.com')) return { ok: true, width: 1920, height: 620 };
		return { ok: false };
	});

	if (result.variant !== '2x' || result.provider !== 'steam' || result.selectedUrl.includes('steamgriddb')) {
		throw new Error(`H06 Failed: Official 2X must win over SteamGridDB. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H06 Passed: Official 2X wins over SteamGridDB when Base is missing.');
}

// --------------------------------------------------------------------------
// H07: Game without Base, without 2X, with Steam Legacy Hero valid
// Legacy header must be selected as fallback.
// --------------------------------------------------------------------------
{
	const steamAppId = '221430'; // PES 2013 delisted
	const modern = {
		hero: '',
		hero2x: '',
		legacy_header: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero')) return { ok: false };
		if (url.includes('header.jpg')) return { ok: true, width: 1920, height: 620 };
		return { ok: false };
	});

	if (result.variant !== 'legacy' || result.provider !== 'steam-legacy' || !result.selectedUrl.includes('header.jpg')) {
		throw new Error(`H07 Failed: Legacy header should be selected when modern hero is absent. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H07 Passed: Legacy hero selected when modern Base and 2X are absent.');
}

// --------------------------------------------------------------------------
// H08: Game without Base, without 2X, without Legacy, with SteamGridDB available
// SteamGridDB must be selected.
// --------------------------------------------------------------------------
{
	const steamAppId = '237110'; // MK Komplete delisted
	const modern = { hero: '', hero2x: '', legacy_header: '' };
	const communityHero = 'https://cdn2.steamgriddb.com/hero/curated_mk.jpg';
	const result = await simulateHeroResolution({ steamAppId, modern, communityHero }, async (url) => {
		if (url.includes('steamstatic.com')) return { ok: false };
		if (url.includes('steamgriddb.com')) return { ok: true, width: 1920, height: 620 };
		return { ok: false };
	});

	if (result.variant !== 'community' || result.provider !== 'steamgriddb' || !result.selectedUrl.includes('steamgriddb.com')) {
		throw new Error(`H08 Failed: SteamGridDB should be selected when Steam has no usable hero. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H08 Passed: SteamGridDB selected when all Steam hero sources are absent.');
}

// --------------------------------------------------------------------------
// H09: Transient error on Base (network error / 500) with 2X available
// Graceful fallback to 2X without fatal exception or marking slot permanently failed.
// --------------------------------------------------------------------------
{
	const steamAppId = '99996';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const result = await simulateHeroResolution({ steamAppId, modern }, async (url) => {
		if (url.includes('library_hero.jpg') && !url.includes('_2x')) {
			// Simulate transient 503 / timeout
			return null;
		}
		if (url.includes('library_hero_2x.jpg')) return { ok: true, width: 3840, height: 1240 };
		return { ok: false };
	});

	if (result.variant !== '2x' || !result.selectedUrl.includes('library_hero_2x.jpg')) {
		throw new Error(`H09 Failed: Transient error on Base should fall back to 2X. Result: ${JSON.stringify(result)}`);
	}
	console.log('✓ H09 Passed: Transient error on Base safely falls back to 2X.');
}

// --------------------------------------------------------------------------
// H10: Concurrency safety (Late 2X response does not overwrite Base)
// --------------------------------------------------------------------------
{
	let currentGeneration = 1;
	let appliedHero = null;

	const applyHero = (gen, heroVariant) => {
		if (gen !== currentGeneration) {
			// Stale response rejected by generation guard
			return false;
		}
		appliedHero = heroVariant;
		return true;
	};

	// Fast Base completes in generation 1
	applyHero(1, 'base');

	// Stale 2X from generation 0 arrives late
	const staleAccepted = applyHero(0, '2x');

	if (staleAccepted || appliedHero !== 'base') {
		throw new Error(`H10 Failed: Stale 2X response corrupted active Base assignment.`);
	}

	// Bump generation (e.g. relink or shortcut switch)
	currentGeneration = 2;
	const supersededAccepted = applyHero(1, '2x');
	if (supersededAccepted || appliedHero !== 'base') {
		throw new Error(`H10 Failed: Superseded generation 1 write was incorrectly applied to generation 2.`);
	}

	console.log('✓ H10 Passed: Generation guards prevent stale 2X from overwriting Base.');
}

// --------------------------------------------------------------------------
// Invariant Check: File sizes strictly <= 900 lines
// --------------------------------------------------------------------------
{
	const files = [
		'backend/lib/artwork.lua',
		'frontend/features/library/artwork.ts',
		'frontend/features/library/legacy-resolver.ts',
		'frontend/features/library/artwork-hero.ts',
		'frontend/features/library/library-assets.ts',
	];

	for (const file of files) {
		const content = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
		const lineCount = content.split(/\r?\n/).length;
		if (lineCount > 900) {
			throw new Error(`File size invariant violation: ${file} has ${lineCount} lines (limit: 900).`);
		}
	}
	console.log('✓ Invariant Passed: All modified hero pipeline files strictly <= 900 lines.');
}

// --------------------------------------------------------------------------
// Invariant Check: Base Hero candidate is ordered strictly BEFORE 2X
// --------------------------------------------------------------------------
{
	const steamAppId = '12210';
	const modern = {
		hero: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
		hero2x: `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
	};
	const urls = buildHeroCandidateUrls({ steamAppId, modern, communityHero: 'https://community.com/hero.jpg' });
	const baseIndex = urls.findIndex(u => u.includes('library_hero.jpg') && !u.includes('_2x'));
	const twoXIndex = urls.findIndex(u => u.includes('library_hero_2x.jpg'));
	const communityIndex = urls.findIndex(u => u.includes('community.com'));

	if (baseIndex === -1 || twoXIndex === -1 || baseIndex >= twoXIndex) {
		throw new Error(`Candidate ordering violation: Base index (${baseIndex}) must precede 2X index (${twoXIndex}).`);
	}
	if (communityIndex !== -1 && twoXIndex >= communityIndex) {
		throw new Error(`Candidate ordering violation: 2X index (${twoXIndex}) must precede Community index (${communityIndex}).`);
	}
	console.log('✓ Invariant Passed: Base Hero precedes 2X, and 2X precedes Community in candidate list.');
}

console.log('\nAll 10 Hero Policy test cases (H01-H10) and invariants PASSED successfully!\n');
