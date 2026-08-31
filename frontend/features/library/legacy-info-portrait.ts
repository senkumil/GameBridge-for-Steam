import { getCommunityArtwork, retiredCommunityArtworkPreferred } from './artwork-community';
import { isTrustedSteamGridDbImageUrl } from './artwork-selection-storage';
import { linkedShortcutPortrait } from './artwork';

const LEGACY_INFO_PORTRAIT_CACHE_PREFIX = 'gdl_legacy_info_portrait1_';

function readCachedPortrait(shortcutAppId: number | string, steamAppId: string): string {
	try {
		const cached = JSON.parse(localStorage.getItem(LEGACY_INFO_PORTRAIT_CACHE_PREFIX + Number(shortcutAppId)) || 'null');
		return cached?.steamAppId === steamAppId && isTrustedSteamGridDbImageUrl(cached?.url) ? cached.url : '';
	} catch { return ''; }
}

function cachePortrait(shortcutAppId: number | string, steamAppId: string, url: string): void {
	if (!isTrustedSteamGridDbImageUrl(url)) return;
	try {
		localStorage.setItem(LEGACY_INFO_PORTRAIT_CACHE_PREFIX + Number(shortcutAppId), JSON.stringify({ steamAppId, url }));
	} catch {}
}

/** Synchronous legacy paint: explicit/applied artwork first, then only a
 * previously validated SteamGridDB portrait. Never flash an official wide
 * capsule while the reviewed portrait is resolving. */
export function legacyInfoPortraitSync(shortcutAppId: number | string, steamAppId: string): string {
	return linkedShortcutPortrait(shortcutAppId, steamAppId, '') || readCachedPortrait(shortcutAppId, steamAppId);
}

export async function resolveLegacyInfoPortrait(
	shortcutAppId: number | string,
	steamAppId: string,
	officialFallback = '',
): Promise<string> {
	const immediate = legacyInfoPortraitSync(shortcutAppId, steamAppId);
	if (immediate) return immediate;
	if (await retiredCommunityArtworkPreferred(steamAppId)) {
		const community = await getCommunityArtwork(steamAppId).catch((): null => null);
		if (community?.portrait) {
			cachePortrait(shortcutAppId, steamAppId, community.portrait);
			return community.portrait;
		}
	}
	return officialFallback;
}
