import type { NativeGameFeatureKind, SteamGameData } from '../../domain/types';
import { gdlText } from '../../steam/localization';

export interface ExternalAchievementSet {
	platform: 'xbox' | 'playstation';
	platformLabel: string;
	total: number;
	summary: () => string;
	detail: () => string;
	url: string;
}

export interface LegacyGameRecord {
	developer: string;
	publisher: string;
	genre: () => string;
	steamRelease: string;
	franchise?: string;
	description?: () => string;
	metacritic?: number;
	controllerSupport?: 'partial' | 'full';
	/** Verified Steam/library capabilities. These enrich the native information
	 * panel without manufacturing achievements or other unsupported services. */
	features?: { key: string; kind: NativeGameFeatureKind; categoryId?: number }[];
	externalAchievements: ExternalAchievementSet[];
}

/** Curated facts are keyed exclusively by the historical Steam AppID. This is
 * deliberately not a title matcher: similarly named editions must never share
 * metadata, artwork or capabilities. */
const LEGACY_GAMES: Record<string, LegacyGameRecord> = {
	'221430': {
		developer: 'Konami Digital Entertainment Co., Ltd.',
		publisher: 'Konami Digital Entertainment Co., Ltd.',
		genre: () => gdlText('genre_sports', 'Sports'),
		steamRelease: '18 MAR 2013',
		franchise: 'Pro Evolution Soccer',
		description: () => gdlText(
			'legacy_pes2013_description',
			'Pro Evolution Soccer 2013 returns to its roots with an emphasis on the individual skills of the world’s best players, giving players total freedom to play in any style.',
		),
		metacritic: 80,
		controllerSupport: 'partial',
		features: [
			{ key: 'legacy:single-player', kind: 'single-player', categoryId: 2 },
			{ key: 'legacy:multiplayer', kind: 'multiplayer', categoryId: 1 },
			{ key: 'legacy:controller-partial', kind: 'controller-partial', categoryId: 18 },
		],
		externalAchievements: [
			{
				platform: 'xbox', platformLabel: 'Xbox 360', total: 28, summary: () => '1,000 G',
				detail: () => gdlText('external_achievements_discontinued', '{count} discontinued achievements', { count: 3 }),
				url: 'https://www.trueachievements.com/game/Pro-Evolution-Soccer-2013/achievements',
			},
			{
				platform: 'playstation', platformLabel: 'PlayStation 3', total: 29,
				summary: () => gdlText('external_trophy_breakdown', '1 Platinum · 3 Gold · 21 Silver · 4 Bronze'),
				detail: () => gdlText('external_trophies_total', '{count} trophies', { count: 29 }),
				url: 'https://www.playstationtrophies.org/game/pro-evolution-soccer-2013/trophies/',
			},
		],
	},
	'42640': {
		developer: 'Bizarre Creations',
		publisher: 'Activision',
		genre: () => gdlText('genre_racing', 'Racing'),
		steamRelease: '25 MAY 2010',
		description: () => gdlText(
			'legacy_blur_description',
			'Blur combines intense racing with vehicle combat: collect and use power-ups while battling through real-world locations in single-player and multiplayer events.',
		),
		metacritic: 81,
		controllerSupport: 'partial',
		features: [
			{ key: 'legacy:single-player', kind: 'single-player', categoryId: 2 },
			{ key: 'legacy:multiplayer', kind: 'multiplayer', categoryId: 1 },
			{ key: 'legacy:controller-partial', kind: 'controller-partial', categoryId: 18 },
		],
		externalAchievements: [
			{
				platform: 'xbox', platformLabel: 'Xbox 360', total: 50, summary: () => '1,000 G',
				detail: () => gdlText('legacy_blur_xbox_status', '1 discontinued · 1 partly discontinued'),
				url: 'https://www.trueachievements.com/game/Blur/achievements',
			},
			{
				platform: 'playstation', platformLabel: 'PlayStation 3', total: 49,
				summary: () => gdlText('legacy_blur_trophy_breakdown', '1 Platinum · 2 Gold · 10 Silver · 36 Bronze'),
				detail: () => gdlText('external_trophies_total', '{count} trophies', { count: 49 }),
				url: 'https://www.playstationtrophies.org/game/blur/trophies/',
			},
		],
	},
	'237110': {
		developer: 'NetherRealm Studios, High Voltage Software',
		publisher: 'Warner Bros. Interactive Entertainment',
		genre: () => gdlText('genre_action', 'Action'),
		steamRelease: '3 JUL 2013',
		franchise: 'Mortal Kombat',
		description: () => gdlText(
			'legacy_mkke_description',
			'Mortal Kombat Komplete Edition delivers the critically acclaimed game, all previously released downloadable content (DLC), and iconic guest characters.',
		),
		metacritic: 81,
		controllerSupport: 'full',
		features: [
			{ key: 'legacy:single-player', kind: 'single-player', categoryId: 2 },
			{ key: 'legacy:multiplayer', kind: 'multiplayer', categoryId: 1 },
			{ key: 'legacy:controller-full', kind: 'controller-full', categoryId: 28 },
		],
		externalAchievements: [],
	},
};

export function legacyGameRecord(steamAppId: string, data?: SteamGameData): LegacyGameRecord | null {
	const record = LEGACY_GAMES[String(steamAppId || '')] || null;
	if (record) return record;
	if (data && data.is_delisted !== true) return null;
	return null;
}

export function isLegacyGame(steamAppId: string, data?: SteamGameData): boolean {
	return data?.is_delisted === true || Boolean(LEGACY_GAMES[String(steamAppId || '')]);
}
