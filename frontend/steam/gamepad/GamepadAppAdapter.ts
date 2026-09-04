import type { LocalAchievementData, NewsItem, SteamCommunityItemsCatalog, SteamGameData } from '../../domain/types';
import type { LinkedGameIdentity } from './GamepadContext';

export interface GamepadAdaptedOverview {
	appid: number;
	display_name: string;
	header_filename?: string;
	icon_data?: string;
	icon_data_format?: string;
	installed: boolean;
	controller_support: number;
	steam_deck_compat_category: number;
	minutes_playtime_forever: number;
	rt_last_time_played: number;
}

export interface GamepadAdaptedApp {
	identity: LinkedGameIdentity;
	overview: GamepadAdaptedOverview;
	gameData: SteamGameData | null;
	achievements: LocalAchievementData | null;
	news: NewsItem[];
	cards: SteamCommunityItemsCatalog | null;
}

export function createGamepadAppAdapter(
	identity: LinkedGameIdentity,
	data: {
		game: SteamGameData | null;
		achievements: LocalAchievementData | null;
		news?: NewsItem[];
		cards?: SteamCommunityItemsCatalog | null;
		playtimeMinutes?: number;
		lastPlayedTimestamp?: number;
	},
): GamepadAdaptedApp {
	const overview: GamepadAdaptedOverview = {
		appid: identity.shortcutAppId,
		display_name: data.game?.name || identity.title,
		header_filename: data.game?.header_image || undefined,
		installed: true,
		controller_support: 2, // Full controller support
		steam_deck_compat_category: 3, // Verified
		minutes_playtime_forever: data.playtimeMinutes || 0,
		rt_last_time_played: data.lastPlayedTimestamp || 0,
	};

	return {
		identity,
		overview,
		gameData: data.game,
		achievements: data.achievements,
		news: data.news || [],
		cards: data.cards || null,
	};
}
