import { readFileSync } from 'node:fs';

const artworkCandidatesLua = readFileSync(new URL('../backend/lib/artwork_candidates.lua', import.meta.url), 'utf8');
const artworkLua = readFileSync(new URL('../backend/lib/artwork.lua', import.meta.url), 'utf8');
const backendMain = readFileSync(new URL('../backend/main.lua', import.meta.url), 'utf8');
const storeLua = readFileSync(new URL('../backend/lib/store.lua', import.meta.url), 'utf8');
const newsLua = readFileSync(new URL('../backend/lib/news.lua', import.meta.url), 'utf8');
const artworkImageTs = readFileSync(new URL('../frontend/features/library/artwork-image.ts', import.meta.url), 'utf8');
const artworkHeroTs = readFileSync(new URL('../frontend/features/library/artwork-hero.ts', import.meta.url), 'utf8');
const artworkTs = readFileSync(new URL('../frontend/features/library/artwork.ts', import.meta.url), 'utf8');
const logoPositionTs = readFileSync(new URL('../frontend/features/library/artwork-logo-position.ts', import.meta.url), 'utf8');
const legacyResolverTs = readFileSync(new URL('../frontend/features/library/legacy-resolver.ts', import.meta.url), 'utf8');
const reconcilerTs = readFileSync(new URL('../frontend/features/shortcuts/reconciler.ts', import.meta.url), 'utf8');
const backendTs = readFileSync(new URL('../frontend/api/backend.ts', import.meta.url), 'utf8');
const shortcutIconTs = readFileSync(new URL('../frontend/features/library/shortcut-icon.ts', import.meta.url), 'utf8');

// 1. Ratio calculation bugfix in candidate filters: width / height
if (!artworkCandidatesLua.includes('local ratio = width and height and height > 0 and (width / height) or nil')) {
	throw new Error('artwork_candidates.lua must calculate ratio as width / height.');
}
if (!artworkLua.includes('local ratio = width and height and height > 0 and width / height or nil')) {
	throw new Error('artwork.lua must calculate ratio as width / height.');
}

// 2. Curated wide_id for Mortal Kombat Komplete Edition (237110) and PES 2013 (221430)
if (!artworkLua.includes('wide_id = 177942') || !artworkCandidatesLua.includes('wide_id = 177942')) {
	throw new Error('Curated wide_id 177942 must be defined for AppID 237110 in artwork.lua and artwork_candidates.lua.');
}
if (!artworkLua.includes('id = curated.wide_id')) {
	throw new Error('artwork.lua must query SteamGridDB wide asset with curated.wide_id.');
}

// 3. Logo position extraction priority: library_logo.logo_position -> full.logo_position -> common.logo_position
if (!artworkLua.includes('assets.library_logo.logo_position')
	|| !artworkLua.includes('assets.logo_position')
	|| !artworkLua.includes('common.library_assets.logo_position')
	|| !artworkLua.includes('logo_position_source =')) {
	throw new Error('artwork.lua must extract logo_position from library_logo first and return logo_position_source.');
}

// 4. Read custom logo position from disk backend
if (!artworkLua.includes('function M.read_custom_logo_position(')
	|| !backendMain.includes('function read_custom_logo_position(')
	|| !backendTs.includes('export const readCustomLogoPositionBackend =')) {
	throw new Error('Backend must expose read_custom_logo_position callable for disk read-back verification.');
}

// 5. Delisted store recovery must not fabricate modern URLs
if (storeLua.includes('library_600x900_2x.jpg') || storeLua.includes('library_hero.jpg')) {
	throw new Error('store.lua recover_delisted_game must not fabricate modern artwork URLs.');
}
if (!storeLua.includes('probe_on_demand')) {
	throw new Error('store.lua must set metadata_sources.artwork = "probe_on_demand" for delisted games.');
}

// 6. News fetch must concatenate appid cleanly and use one unfiltered request.
if (newsLua.includes('.. steam_app_id ..')) {
	throw new Error('news.lua must not concatenate table steam_app_id into fallback URL.');
}
if (!newsLua.includes('local news, transient_error = fetch_news_json(appid, lang)') || newsLua.includes('announcements_only')) {
	throw new Error('news.lua must fetch all official channels once without an announcements-first timeout.');
}

// 7. Community logo trimming without fixed 1280x720 letterboxing
if (!artworkImageTs.includes('export async function normalizeCommunityLogoDataUrl(')
	|| !artworkImageTs.includes('minX') || !artworkImageTs.includes('minY')
	|| !artworkImageTs.includes('cropW') || !artworkImageTs.includes('cropH')) {
	throw new Error('artwork-image.ts must implement normalizeCommunityLogoDataUrl with bounding-box trimming.');
}
if (!artworkImageTs.includes('scale = Math.min(maxWidth / destW, maxHeight / destH)')) {
	throw new Error('artwork-image.ts must scale logo within bounding limits without letterboxing onto fixed 1280x720 canvas.');
}

// 8. Logo position marker v4 and read-back verification live in the dedicated resolver.
if (!logoPositionTs.includes("STORAGE_PREFIX = 'gdl_logo_position4_'")
	|| !logoPositionTs.includes('readCustomLogoPositionBackend(')
	|| !logoPositionTs.includes('isLogoPositionVerified(')) {
	throw new Error('artwork-logo-position.ts must use gdl_logo_position4_ with read-back verification.');
}

// 9. Hero legacy fallback regex must accept library_hero_2x.jpg and default pin to BottomLeft
if (!artworkTs.includes('/\\/library_hero(?:_2x)?\\.jpg(?:$|[?#])/i')
	&& !artworkTs.includes('/library_hero(?:_2x)?\\.jpg')) {
	throw new Error('artwork.ts heroUsesLegacyFallback regex must accept library_hero_2x.jpg.');
}
if (artworkTs.includes("defaultLogoPin: SteamLogoPinPosition = heroUsesLegacyFallback ? 'CenterCenter' : 'BottomLeft'")) {
	throw new Error('artwork.ts must default defaultLogoPin to BottomLeft, never forcing CenterCenter.');
}

// 10. Candidate URL priorities: official Steam URLs before community, and Base hero before 2x hero
if (!artworkTs.includes('buildHeroCandidateUrls') || !legacyResolverTs.includes('buildHeroCandidateUrls')) {
	throw new Error('artwork.ts and legacy-resolver.ts must both use buildHeroCandidateUrls for standardized Hero resolution.');
}
const baseProbesIdx = artworkHeroTs.indexOf('const baseProbes = [');
const twoXProbesIdx = artworkHeroTs.indexOf('const twoXProbes = [');
if (baseProbesIdx === -1 || twoXProbesIdx === -1 || baseProbesIdx > twoXProbesIdx) {
	throw new Error('artwork-hero.ts must define Base hero probes before 2x hero probes.');
}
if (!artworkHeroTs.includes('userHero, modern?.hero, ...baseProbes, modern?.hero2x, ...twoXProbes')
	|| !artworkHeroTs.includes('modern?.legacy_header, communityHero')) {
	throw new Error('artwork-hero.ts active-game path must preserve Base -> 2x -> legacy -> community priority.');
}
if (!artworkHeroTs.includes('preferCommunityBeforeDirectProbes')) {
	throw new Error('artwork-hero.ts must expose the retired-title fast path without weakening active-game priority.');
}
const logoBlock = legacyResolverTs.match(/logoUrls:\s*string\[\]\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
if (logoBlock.indexOf('modern?.logo') > logoBlock.indexOf('community?.logo')) {
	throw new Error('legacy-resolver.ts must prioritize official modern logo URLs before community?.logo.');
}

// 11. Reconciler heals unverified logo positions
if (!reconcilerTs.includes('isLogoPositionVerified(')
	|| !reconcilerTs.includes('const logoUnverified = !isLogoPositionVerified(')) {
	throw new Error('reconciler.ts must check isLogoPositionVerified to heal missing/unverified logo positions.');
}

// 12. Shortcut icon modularization
if (!shortcutIconTs.includes('export async function applyOfficialShortcutIconOnce(')
	|| !artworkTs.includes('export function applyOfficialShortcutIcon(')) {
	throw new Error('shortcut icon logic must be cleanly modularized with shortcut-icon.ts.');
}

console.log('Edge-cases check passed: All artwork, logo position, delisted and news edge-case invariants verified.');
