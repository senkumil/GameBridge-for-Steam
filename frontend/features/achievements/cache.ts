import type { LocalAchievementData } from '../../domain/types';

const localAchievementMemoryCache = new Map<string, LocalAchievementData>();

export function getCachedLocalAchievements(...keys: Array<string | null | undefined>): LocalAchievementData | null {
	for (const key of keys) {
		if (!key) continue;
		const value = localAchievementMemoryCache.get(key);
		if (value) return value;
	}
	return null;
}

export function hasCachedLocalAchievements(key: string): boolean {
	return localAchievementMemoryCache.has(key);
}

export function cacheLocalAchievements(data: LocalAchievementData, ...aliases: Array<string | null | undefined>): void {
	if (data.appid) localAchievementMemoryCache.set(data.appid, data);
	if (data.state_appid) localAchievementMemoryCache.set(data.state_appid, data);
	for (const alias of aliases) if (alias) localAchievementMemoryCache.set(alias, data);
}

export function clearLocalAchievementCache(): void {
	localAchievementMemoryCache.clear();
}
