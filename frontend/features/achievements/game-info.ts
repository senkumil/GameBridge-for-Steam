import { getGameData } from '../../core/game-data';

export interface LocalAchievementGameInfo {
	name: string;
	headerImage: string;
}

const gameInfoCache = new Map<string, LocalAchievementGameInfo>();
const MAX_GAME_INFO_CACHE_ENTRIES = 24;

export async function getLocalAchievementGameInfo(appid: string): Promise<LocalAchievementGameInfo> {
	const cached = gameInfoCache.get(appid);
	if (cached) return cached;
	const data = await getGameData(appid).catch((): null => null);
	const info = {
		name: String(data?.name || `App ${appid}`),
		headerImage: String(data?.header_image || ''),
	};
	gameInfoCache.set(appid, info);
	while (gameInfoCache.size > MAX_GAME_INFO_CACHE_ENTRIES) {
		const oldest = gameInfoCache.keys().next().value as string | undefined;
		if (!oldest) break;
		gameInfoCache.delete(oldest);
	}
	return info;
}

export function clearLocalAchievementGameInfoCache(): void {
	gameInfoCache.clear();
}
