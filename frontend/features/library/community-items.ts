import { findModuleExport } from '@steambrew/client';
import type { SteamCommunityCardAsset, SteamCommunityItemsCatalog } from '../../domain/types';
import { backendLog, fetchCommunityItemsCatalogBackend, parseCommunityItemsCatalogResponse } from '../../api/backend';
import { CACHE_TTL, cacheGet, cacheSet } from '../../core/cache';
import { getSteamLanguage } from '../../steam/localization';

const communityItemsCatalogRequests = new Map<string, Promise<SteamCommunityItemsCatalog | null>>();
export function normalizeCommunityAssetUrl(raw: unknown): string {
	let value = typeof raw === 'string' ? raw.trim() : '';
	if (!value) return '';
	if (value.startsWith('//')) value = 'https:' + value;
	else if (value.startsWith('/')) value = 'https://steamcommunity.com' + value;
	else if (value.startsWith('http://')) value = 'https://' + value.slice(7);
	if (!value.startsWith('https://')) return '';
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase();
		if (!host.endsWith('steamstatic.com')
			&& !host.endsWith('steamusercontent.com')
			&& !host.endsWith('steamcommunity.com')
			&& !host.endsWith('akamaihd.net')) return '';
		// Steam appends paths such as /100x100 in low-bandwidth mode.  Keeping
		// that suffix made the card visibly pixelated when its native hover
		// animation enlarged it.  The unsuffixed CDN URL returns the original.
		url.pathname = url.pathname.replace(/\/(?:\d+fx\d+f|\d+x\d+)\/?$/i, '');
		for (const key of ['w', 'h', 'width', 'height']) url.searchParams.delete(key);
		return url.toString();
	} catch { return ''; }
}

function cleanCommunityItemsCatalog(raw: SteamCommunityItemsCatalog | null): SteamCommunityItemsCatalog | null {
	if (!raw) return null;
	const seenCards = new Set<string>();
	const cards = (Array.isArray(raw.cards) ? raw.cards : []).map(card => ({
		title: String(card?.title || '').trim(),
		image: normalizeCommunityAssetUrl(card?.image),
		artwork: normalizeCommunityAssetUrl(card?.artwork),
	})).filter(card => {
		const key = card.image.toLowerCase();
		if (!key || seenCards.has(key)) return false;
		seenCards.add(key);
		return true;
	});
	const seenBadges = new Set<string>();
	const badges = (Array.isArray(raw.badges) ? raw.badges : []).map(badge => ({
		title: String(badge?.title || '').trim(),
		image: normalizeCommunityAssetUrl(badge?.image),
		foil: badge?.foil === true,
		level: Number.isFinite(Number(badge?.level)) ? Number(badge?.level) : 0,
	})).filter(badge => {
		const key = badge.image.toLowerCase();
		if (!key || seenBadges.has(key)) return false;
		seenBadges.add(key);
		return true;
	});
	const requestedFoil = raw.foil_badge;
	const foilImage = normalizeCommunityAssetUrl(requestedFoil?.image);
	const foilBadge = foilImage ? {
		title: String(requestedFoil?.title || '').trim(),
		image: foilImage,
		foil: true,
		level: Number.isFinite(Number(requestedFoil?.level)) ? Number(requestedFoil?.level) : 0,
	} : badges.find(badge => badge.foil) || null;
	return {
		appid: Number(raw.appid) || undefined,
		cards,
		badges,
		foil_badge: foilBadge,
		source: raw.source,
		error: raw.error,
	};
}

let nativeSteamBadgeStore: any = null;

function getNativeSteamBadgeStore(doc: Document): any | null {
	const view = doc.defaultView as any;
	const candidates = [
		nativeSteamBadgeStore,
		view?.badgeStore,
		(window as any).badgeStore,
	];
	for (const candidate of candidates) {
		if (typeof candidate?.GetBadgeData === 'function'
			&& typeof candidate?.GetCommunityItemDefinitions === 'function') {
			nativeSteamBadgeStore = candidate;
			return candidate;
		}
	}
	try {
		const found = findModuleExport((candidate: any) =>
			typeof candidate?.GetBadgeData === 'function'
			&& typeof candidate?.GetCommunityItemDefinitions === 'function');
		if (found) {
			nativeSteamBadgeStore = found;
			return found;
		}
	} catch (e) {
		backendLog('Steam badge-store discovery failed: ' + e);
	}
	return null;
}

/** Read Steam's own badge store. This is the exact client-side source used by
 * the native game-card page and gives us Steam's composed card plus large art. */
async function readNativeSteamCommunityItems(doc: Document, steamAppId: string): Promise<SteamCommunityItemsCatalog | null> {
	const appid = Number(steamAppId);
	if (!Number.isFinite(appid) || appid <= 0) return null;
	const store = getNativeSteamBadgeStore(doc);
	if (!store?.GetBadgeData) return null;
	try {
		store.GetBadgeData(appid);
		store.GetCommunityItemDefinitions?.(appid);
			for (let attempt = 0; attempt < 12; attempt++) {
			const badgeData = store.GetBadgeData(appid);
			const nativeCards = Array.isArray(badgeData?.rgCards) ? badgeData.rgCards : [];
			if (nativeCards.length > 0) {
				const cards = nativeCards.map((card: any) => ({
					title: String(card?.strTitle || card?.strName || '').trim(),
					image: normalizeCommunityAssetUrl(card?.strImgURL),
					artwork: normalizeCommunityAssetUrl(card?.strArtworkURL),
				})).filter((card: SteamCommunityCardAsset) => !!card.image);
				const icon = normalizeCommunityAssetUrl(badgeData?.strIconURL);
				return cleanCommunityItemsCatalog({
					appid,
					cards,
					badges: icon ? [{ title: String(badgeData?.strName || '').trim(), image: icon, level: Number(badgeData?.nLevel) || 0 }] : [],
					source: 'steam-client-badge-store',
				});
			}
			await new Promise(resolve => setTimeout(resolve, 75));
		}
	} catch (e) {
		backendLog('Native community items unavailable for ' + steamAppId + ': ' + e);
	}
	return null;
}

export async function getOfficialCommunityItems(doc: Document, steamAppId: string): Promise<SteamCommunityItemsCatalog | null> {
	const language = await getSteamLanguage().catch(() => 'english');
	const key = `${steamAppId}:${language}`;
	const existing = communityItemsCatalogRequests.get(key);
	if (existing) return existing;
	const request = (async () => {
		const cached = cleanCommunityItemsCatalog(cacheGet<SteamCommunityItemsCatalog>(`community_items_v5_${language}_${steamAppId}`, CACHE_TTL.communityItems));
		const backendRequest = cached ? Promise.resolve(cached) : fetchCommunityItemsCatalogBackend({ steam_app_id: steamAppId, language })
			.then(parseCommunityItemsCatalogResponse)
			.then(cleanCommunityItemsCatalog)
			.catch((e: unknown): SteamCommunityItemsCatalog | null => {
				backendLog('Community item catalogue failed for ' + steamAppId + ': ' + e);
				return null;
			});
		const [nativeCatalog, indexedCatalog] = await Promise.all([
			readNativeSteamCommunityItems(doc, steamAppId),
			backendRequest,
		]);
		const merged = cleanCommunityItemsCatalog({
			appid: Number(steamAppId),
			cards: nativeCatalog?.cards?.length ? nativeCatalog.cards : indexedCatalog?.cards || [],
			badges: indexedCatalog?.badges?.length ? indexedCatalog.badges : nativeCatalog?.badges || [],
			foil_badge: indexedCatalog?.foil_badge || nativeCatalog?.foil_badge || null,
			source: nativeCatalog?.cards?.length ? 'steam-client+steam-community-assets' : indexedCatalog?.source,
		});
		if (merged && merged.cards.length > 0) {
			cacheSet(`community_items_v5_${language}_${steamAppId}`, merged);
			return merged;
		}
		return null;
	})();
	communityItemsCatalogRequests.set(key, request);
	return request;
}

export function clearCommunityItemCaches(): void {
	communityItemsCatalogRequests.clear();
	nativeSteamBadgeStore = null;
}
