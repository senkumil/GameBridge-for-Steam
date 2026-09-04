import { readFileSync } from 'node:fs';

const qualitySource = readFileSync(new URL('../frontend/features/library/artwork-quality.ts', import.meta.url), 'utf8');
const artworkSource = readFileSync(new URL('../frontend/features/library/artwork.ts', import.meta.url), 'utf8');
const backendArtworkSource = readFileSync(new URL('../backend/lib/artwork.lua', import.meta.url), 'utf8')
	+ readFileSync(new URL('../backend/lib/artwork_candidates.lua', import.meta.url), 'utf8');
const linkingSource = readFileSync(new URL('../frontend/features/shortcuts/linking.ts', import.meta.url), 'utf8');
const unlinkingSource = readFileSync(new URL('../frontend/features/shortcuts/unlinking.ts', import.meta.url), 'utf8');
const linkQueueSource = readFileSync(new URL('../frontend/features/shortcuts/link-job-queue.ts', import.meta.url), 'utf8');
const bulkLinkSource = readFileSync(new URL('../frontend/features/shortcuts/bulk-link.ts', import.meta.url), 'utf8');

// 1. Slot 3 (Wide Capsule / Portada amplia) must accept standard Steam header.jpg (460x215) and capsule_616x353.jpg (616x353)
if (!qualitySource.includes('minWidth: 400') && !qualitySource.includes('minWidth: 450')) {
	throw new Error('Slot 3 (Wide Capsule) minWidth must not exceed 450 to allow official Steam header.jpg (460x215).');
}
if (!qualitySource.includes('minHeight: 180') && !qualitySource.includes('minHeight: 200')) {
	throw new Error('Slot 3 (Wide Capsule) minHeight must not exceed 200 to allow official Steam header.jpg (460x215).');
}

// 2. Slot 0 (Portrait) must accept standard 600x900 and legacy 300x450 capsules
if (!qualitySource.includes('minWidth: 300') && !qualitySource.includes('minWidth: 500')) {
	throw new Error('Slot 0 (Portrait) minWidth must accommodate vertical capsules.');
}

// 3. Storage prefix must be maintained with history
if (!artworkSource.includes("const ART_STORAGE_PREFIX = 'gdl_artwork18_';")) {
	throw new Error('Artwork storage prefix must be current and versioned.');
}
if (!artworkSource.includes("'gdl_artwork17_'")) {
	throw new Error('Previous artwork storage prefix history must include gdl_artwork17_.');
}

// 4. Official CDN URLs must be listed for each slot in artwork.ts
for (const officialPattern of ['fastlyBase', 'cfBase', 'cdnBase', 'cfCdnBase']) {
	if (!artworkSource.includes(officialPattern)) {
		throw new Error(`Artwork loader must include official Steam CDN endpoints (${officialPattern}).`);
	}
}

// 5. Backend safety check must filter console banner templates from automatic selection
if (!backendArtworkSource.includes('nintendo switch') || !backendArtworkSource.includes('console banner')) {
	throw new Error('Backend SteamGridDB safety check must filter console-specific banner templates.');
}

// 6. Durable repair must converge from partial progress instead of clearing and
// repainting every slot after each foreground timeout.
if (!artworkSource.includes('retrySlots?: number[]')
	|| !artworkSource.includes('const retainedSlots = new Set<number>(existingMarker?.slots || [])')
	|| !artworkSource.includes('filter(slot => !persistedRetrySlots.has(slot)')
	|| !artworkSource.includes('Array.from(successfulSlotSet), needsCommunityUpgrade')) {
	throw new Error('Artwork repair must persist exact retry slots and retain already-applied artwork.');
}
if (!artworkSource.includes('sourceUrls?:')
	|| !artworkSource.includes('isTrustedArtworkSourceUrl(marker.sourceUrls?.portrait')
	|| !artworkSource.includes('const successfulSlots: number[] = Array.from(reusableSlots)')) {
	throw new Error('Artwork repair must retain a validated portrait source for the information panel.');
}
if (!linkingSource.includes('clearStaleArtwork: appIdChanged,')
	|| linkingSource.includes('clearStaleArtwork: appIdChanged || options.repairResources')
	|| !linkingSource.includes('if (appIdChanged) {')
	|| !linkingSource.includes('const assetWarmup = options.deferAssetSync')
	|| !linkingSource.includes('appIdChanged ? refreshModernLibraryAssets(steamAppId) : getModernLibraryAssets(steamAppId)')) {
	throw new Error('A same-AppID resource repair must never destructively clear valid artwork.');
}

// 7. Quick unlink/relink must supersede both artwork and icon bridge writes,
// preserve the valid same-AppID icon, and give Steam a bounded clear barrier.
if (!artworkSource.includes('const shortcutIconInFlight = new Map<string, Promise<boolean>>()')
	|| !artworkSource.includes('const activeIcons = Array.from(shortcutIconInFlight.entries())')
	|| !unlinkingSource.includes('supersedeArtworkApplications(shortcutAppId, !options.clearIcon)')
	|| !unlinkingSource.includes('setTimeout(resolve, 100)')) {
	throw new Error('Quick unlink/relink must serialize icon writes and preserve the reusable icon marker.');
}

// 8. A newer AppID intent owns its shortcut, ready jobs must wake without a
// reload, and bulk mutations must not compete with background resource repair.
if (!linkQueueSource.includes('function sameLogicalShortcut(')
	|| !linkQueueSource.includes('const obsoleteIds = new Set(jobs')
	|| !linkQueueSource.includes('Math.max(now, Number(job.nextAttemptAt) || 0)')
	|| !linkQueueSource.includes('assetTimeoutMs: 30_000')
	|| !linkQueueSource.includes('export async function pausePendingLinkJobs(')
	|| !bulkLinkSource.includes('await pausePendingLinkJobs()')
	|| !bulkLinkSource.includes('assetTimeoutMs: 30_000')
	|| !bulkLinkSource.includes('deferAssetSync: true')
	|| !bulkLinkSource.includes('warmShortcutLinkResources(steamAppId)')
	|| !linkingSource.includes('for (let attempt = 0; !options.deferAssetSync')
	|| !unlinkingSource.includes('preserveLinkHistory: true')
	|| !bulkLinkSource.includes('resumePendingLinkJobs()')) {
	throw new Error('Bulk links must commit identity first, warm resources concurrently, and leave durable serialized artwork repairs.');
}

// 9. Automatic artwork application must continue through the backend grid
// fallback when SteamClient.Apps.SetCustomArtworkForApp is unavailable, and
// it must persist the same normalized bytes used by the native bridge.
if (artworkSource.includes("missing: ['steam_client_api']")
	|| !artworkSource.includes('const canUseSteamArtworkApi =')
	|| !artworkSource.includes('continuing with backend grid-file fallback')
	|| !artworkSource.includes('let preparedDataUrl: string | null = dataUrl')
	|| !artworkSource.includes('if (!slotApplied && preparedDataUrl)')) {
	throw new Error('Automatic artwork must not abort when the Steam bridge is unavailable; it must use prepared grid-file fallback bytes.');
}

// 10. Achievement resolver must include all metadata achievements so total is not truncated to state-only count
const achievementsSource = readFileSync(new URL('../backend/lib/achievements.lua', import.meta.url), 'utf8');
if (!achievementsSource.includes('for name, m in pairs(metadata) do') && !achievementsSource.includes('for name, _ in pairs(metadata) do')) {
	throw new Error('Achievement resolution must seed all official Steam metadata achievements.');
}

console.log('Artwork and achievement quality and safety rule checks passed.');

