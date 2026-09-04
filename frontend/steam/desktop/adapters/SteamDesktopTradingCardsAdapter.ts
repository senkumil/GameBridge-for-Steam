import type { SteamCommunityItemsCatalog } from '../../../domain/types';

export interface SteamDesktopTradingCardsShape {
	nAppID?: number;
	rgCards: {
		strTitle: string;
		strImageUrl: string;
		bFoil?: boolean;
	}[];
	rgBadges?: {
		strTitle: string;
		strImageUrl: string;
		nLevel?: number;
	}[];
}

export function toSteamDesktopTradingCards(catalog: SteamCommunityItemsCatalog): SteamDesktopTradingCardsShape {
	return {
		nAppID: catalog.appid,
		rgCards: (catalog.cards || []).map(card => ({
			strTitle: card.title,
			strImageUrl: card.image,
			bFoil: card.foil,
		})),
		rgBadges: (catalog.badges || []).map(badge => ({
			strTitle: badge.title,
			strImageUrl: badge.image,
			nLevel: badge.level,
		})),
	};
}
