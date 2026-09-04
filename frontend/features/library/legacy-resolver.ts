import type { SteamGameData } from '../../domain/types';
import { automaticArtworkMeetsSlotQuality } from './artwork-quality';
import { getCommunityArtwork, retiredCommunityArtworkPreferred, type CommunityArtworkAssets } from './artwork-community';
import { getModernLibraryAssets, type SteamLibraryAssets } from './library-assets';
import { isLegacyGame } from './legacy-games';
import type { ResourceStatus } from '../shortcuts/transaction';

export interface SlotResolution {
	slot: 'portrait' | 'hero' | 'logo' | 'wide';
	imageType: number;
	candidateUrls: string[];
	isDegradedFallback: (url: string) => boolean;
}

export const ARTWORK_SLOT_IMAGE_TYPES: Record<number, 'portrait' | 'hero' | 'logo' | 'wide'> = {
	0: 'portrait',
	1: 'hero',
	2: 'logo',
	3: 'wide',
};

export const IMAGE_TYPE_TO_SLOT: Record<string, number> = {
	portrait: 0,
	hero: 1,
	logo: 2,
	wide: 3,
};

/**
 * Builds candidate sources for all 4 slots.
 * Ensures that portrait (0) and hero (1) NEVER receive horizontal header.jpg as an authoritative source.
 */
export async function buildSlotResolvers(
	steamAppId: string,
	data?: SteamGameData | null,
): Promise<{
	slots: SlotResolution[];
	isLegacy: boolean;
	modern: SteamLibraryAssets | null;
	community: CommunityArtworkAssets | null;
}> {
	const isLegacy = isLegacyGame(steamAppId, data || undefined);
	const [modern, preferredCommunityEligible] = await Promise.all([
		getModernLibraryAssets(steamAppId).catch((): null => null),
		retiredCommunityArtworkPreferred(steamAppId).catch((): boolean => false),
	]);

	const community = (isLegacy || preferredCommunityEligible)
		? await getCommunityArtwork(steamAppId).catch((): null => null)
		: null;

	const sharedBase = `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
	const cdnBase = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}`;
	const cfBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
	const cfCdnBase = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}`;
	const fastlyBase = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;

	// Portrait Grid (0): 600x900 portrait capsules.
	// REJECT header.jpg or capsule_616x353.jpg from candidateUrls!
	const portraitUrls: string[] = [
		community?.portrait || '',
		modern?.portrait || '',
		`${sharedBase}/library_600x900_2x.jpg`,
		`${sharedBase}/library_600x900.jpg`,
		`${fastlyBase}/library_600x900_2x.jpg`,
		`${fastlyBase}/library_600x900.jpg`,
		`${cfBase}/library_600x900.jpg`,
		`${cfCdnBase}/library_600x900.jpg`,
		`${cdnBase}/library_600x900.jpg`,
	].filter(Boolean);

	// Hero (1): 1920x620 wide hero banners.
	// REJECT header.jpg from candidateUrls!
	const heroUrls: string[] = [
		community?.hero || '',
		modern?.hero || '',
		`${sharedBase}/library_hero_2x.jpg`,
		`${sharedBase}/library_hero.jpg`,
		`${fastlyBase}/library_hero_2x.jpg`,
		`${fastlyBase}/library_hero.jpg`,
		`${cfBase}/library_hero.jpg`,
		`${cfCdnBase}/library_hero.jpg`,
		`${cdnBase}/library_hero.jpg`,
	].filter(Boolean);

	// Logo (2): Transparent game logos
	const logoUrls: string[] = [
		community?.logo || '',
		modern?.logo || '',
		modern?.legacy_logo || '',
		`${sharedBase}/logo.png`,
		`${fastlyBase}/logo.png`,
		`${cfBase}/logo.png`,
		`${cfCdnBase}/logo.png`,
		`${cdnBase}/logo.png`,
	].filter(Boolean);

	// Wide Capsule (3): 460x215 or 920x430 horizontal header / capsule
	const wideUrls: string[] = [
		community?.wide || '',
		modern?.wide || '',
		modern?.legacy_header || '',
		`${sharedBase}/header.jpg`,
		`${fastlyBase}/header.jpg`,
		`${cfBase}/header.jpg`,
		`${cfCdnBase}/header.jpg`,
		`${cdnBase}/header.jpg`,
		`${sharedBase}/capsule_616x353.jpg`,
		`${fastlyBase}/capsule_616x353.jpg`,
	].filter(Boolean);

	const slots: SlotResolution[] = [
		{
			slot: 'portrait',
			imageType: 0,
			candidateUrls: portraitUrls,
			isDegradedFallback: (url: string) => !/\/library_600x900(?:_2x)?\.jpg/i.test(url),
		},
		{
			slot: 'hero',
			imageType: 1,
			candidateUrls: heroUrls,
			isDegradedFallback: (url: string) => !/\/library_hero(?:_2x)?\.jpg/i.test(url),
		},
		{
			slot: 'logo',
			imageType: 2,
			candidateUrls: logoUrls,
			isDegradedFallback: () => false,
		},
		{
			slot: 'wide',
			imageType: 3,
			candidateUrls: wideUrls,
			isDegradedFallback: () => false,
		},
	];

	return { slots, isLegacy, modern, community };
}

/**
 * Validates a resolved artwork item to determine if it meets slot quality standards or is degraded.
 */
export async function determineResourceStatus(
	slot: 'portrait' | 'hero' | 'logo' | 'wide',
	dataUrl: string | null,
	_sourceUrl: string,
	isDegraded: boolean,
): Promise<ResourceStatus> {
	if (!dataUrl) return 'UNAVAILABLE';
	const imageType = IMAGE_TYPE_TO_SLOT[slot] ?? 0;
	const meetsQuality = await automaticArtworkMeetsSlotQuality(dataUrl, imageType);
	if (!meetsQuality) {
		return 'READY_DEGRADED';
	}
	if (isDegraded) {
		return 'READY_DEGRADED';
	}
	return 'READY';
}
