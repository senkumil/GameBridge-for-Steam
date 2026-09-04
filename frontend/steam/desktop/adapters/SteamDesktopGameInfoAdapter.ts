import type { SteamGameData } from '../../../domain/types';

export interface SteamDesktopGameInfoShape {
	strDeveloper?: string;
	strPublisher?: string;
	strReleaseDate?: string;
	rgCategories?: { id: number; description: string }[];
	rgGenres?: { id: string; description: string }[];
	nSteamDeckCompatibility?: number;
}

export function toSteamDesktopGameInfo(game: SteamGameData): SteamDesktopGameInfoShape {
	const developers = Array.isArray(game.developers) ? game.developers.join(', ') : '';
	const publishers = Array.isArray(game.publishers) ? game.publishers.join(', ') : '';
	const releaseDate = typeof game.release_date === 'string' ? game.release_date : game.release_date?.date || '';

	return {
		strDeveloper: developers,
		strPublisher: publishers,
		strReleaseDate: releaseDate,
		rgCategories: game.categories || [],
		rgGenres: game.genres || [],
		nSteamDeckCompatibility: game.controller_support === 'full' ? 3 : (game.controller_support === 'partial' ? 2 : undefined),
	};
}
