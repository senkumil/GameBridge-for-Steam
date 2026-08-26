import type { GameDataCache, SteamGameData } from '../domain/types';
import { fetchGameData, backendLog } from '../api/backend';
import { CACHE_TTL, cacheGet, cacheSet } from './cache';
import { RetryingRequestCache } from './request-cache';
import { getSteamLanguage } from '../steam/localization';

export const gameDataCache: GameDataCache = {};
const gameDataRequests = new RetryingRequestCache<SteamGameData>({
	ttlMs: 5 * 60 * 1000,
	retries: 2,
	baseDelayMs: 150,
});

export function mergeSteamEnglishFallback<T>(preferred: T, english: T): T {
	if (preferred === undefined || preferred === null || preferred === '') return english;
	if (Array.isArray(preferred)) return (preferred.length > 0 ? preferred : english) as T;
	if (typeof preferred === 'object' && preferred && typeof english === 'object' && english && !Array.isArray(english)) {
		const result: Record<string, unknown> = { ...(english as any) };
		for (const key of new Set([...Object.keys(english as any), ...Object.keys(preferred as any)])) {
			result[key] = mergeSteamEnglishFallback((preferred as any)[key], (english as any)[key]);
		}
		return result as T;
	}
	return preferred;
}

export async function getGameData(steamAppId: string): Promise<SteamGameData | null> {
	const language = await getSteamLanguage().catch(() => 'english');
	const languageKey = `${steamAppId}:${language}`;
	if (gameDataCache[languageKey]) return gameDataCache[languageKey];
	const cached = cacheGet<SteamGameData>(`gamedata_v2_${steamAppId}_${language}`, CACHE_TTL.gameMetadata);
	if (cached) {
		gameDataCache[languageKey] = cached;
		gameDataCache[steamAppId] = cached;
		return cached;
	}
	try {
		return await gameDataRequests.get(languageKey, async () => {
		const [preferredRaw, englishRaw] = await Promise.all([
			fetchGameData({ steam_app_id: steamAppId, language }),
			language === 'english' ? Promise.resolve('') : fetchGameData({ steam_app_id: steamAppId, language: 'english' }).catch(() => ''),
		]);
		const preferred = preferredRaw ? JSON.parse(preferredRaw) : null;
		const english = englishRaw ? JSON.parse(englishRaw) : null;
		const preferredData = preferred && !preferred.error ? preferred as SteamGameData : null;
		const englishData = english && !english.error ? english as SteamGameData : null;
		const data = preferredData
			? (englishData ? mergeSteamEnglishFallback(preferredData, englishData) : preferredData)
			: englishData;
		if (!data) return null;
		gameDataCache[languageKey] = data;
		gameDataCache[steamAppId] = data;
		cacheSet(`gamedata_v2_${steamAppId}_${language}`, data);
		return data;
		});
	} catch (e) {
		backendLog('Fetch failed for ' + steamAppId + ': ' + e);
		return null;
	}
}

export function clearGameDataCache(): void {
	for (const key of Object.keys(gameDataCache)) delete gameDataCache[key];
	gameDataRequests.clear();
}
