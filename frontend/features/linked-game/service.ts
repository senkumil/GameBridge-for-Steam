import type { CommunityContentItem, LocalAchievementData, NewsItem, SteamGameData } from '../../domain/types';
import { getCachedGameData, getGameData } from '../../core/game-data';
import { getCachedLocalAchievementsForGame } from '../achievements/cache';
import { fetchLocalAchievementData } from '../achievements/service';
import { getCachedCommunityContent, getCachedNews, getCommunityContent, getNews } from '../library/news';
import { getShortcutPlaytimeMinutes } from '../../steam/shortcuts';
import { steamLanguageSync } from '../../steam/localization';
import { nglEvents } from '../../core/events';
import { LinkedGameIdentity, resolveLinkedGameIdentity } from './identity';

export interface LinkedGame {
	readonly identity: LinkedGameIdentity;

	readonly execution: {
		launch: () => Promise<void>;
	};

	readonly metadata: {
		get: () => Promise<SteamGameData | null>;
		getCached: () => SteamGameData | null;
	};

	readonly achievements: {
		fetch: (options?: { allowSimulated?: boolean; maxAgeMs?: number }) => Promise<LocalAchievementData | null>;
		getCached: () => LocalAchievementData | null;
	};

	readonly news: {
		get: (language?: string) => Promise<NewsItem[]>;
		getCached: (language?: string) => NewsItem[] | null;
	};

	readonly activity: {
		get: (language?: string) => Promise<CommunityContentItem[]>;
		getCached: (language?: string) => CommunityContentItem[] | null;
	};

	readonly playtime: {
		getMinutes: () => Promise<number | null>;
	};
}

class LinkedGameServiceImpl {
	private instances = new Map<string, LinkedGame>();

	public resolve(target: unknown): LinkedGame | null {
		const identity = resolveLinkedGameIdentity(target);
		if (!identity) return null;

		const key = `${identity.shortcutAppId}:${identity.steamAppId}`;
		const existing = this.instances.get(key);
		if (existing) return existing;

		const game: LinkedGame = {
			identity,

			execution: {
				launch: async (): Promise<void> => {
					// ALWAYS execute the shortcutAppId, NEVER steam://run/<steamAppId>
					const shortcutId = identity.shortcutAppId;
					try {
						const apps = (window as any).SteamClient?.Apps;
						if (typeof apps?.RunGame === 'function') {
							await apps.RunGame(shortcutId, '', -1, 100);
							return;
						}
					} catch {}
					if (typeof window !== 'undefined') {
						window.location.href = `steam://rungameid/${shortcutId}`;
					}
				},
			},

			metadata: {
				get: () => getGameData(identity.steamAppId, steamLanguageSync() || 'english'),
				getCached: () => getCachedGameData(identity.steamAppId, steamLanguageSync() || 'english')?.data || null,
			},

			achievements: {
				fetch: (options) => fetchLocalAchievementData(identity.steamAppId, {
					stateAppId: identity.shortcutAppId,
					allowSimulated: options?.allowSimulated,
					maxAgeMs: options?.maxAgeMs,
				}),
				getCached: () => getCachedLocalAchievementsForGame(identity.steamAppId),
			},

			news: {
				get: (language) => getNews(identity.steamAppId, language || steamLanguageSync() || 'english'),
				getCached: (language) => getCachedNews(identity.steamAppId, language || steamLanguageSync() || 'english')?.data || null,
			},

			activity: {
				get: (language) => getCommunityContent(identity.steamAppId, language || steamLanguageSync() || 'english'),
				getCached: (language) => getCachedCommunityContent(identity.steamAppId, language || steamLanguageSync() || 'english')?.data || null,
			},

			playtime: {
				getMinutes: () => getShortcutPlaytimeMinutes(identity.shortcutAppId),
			},
		};

		this.instances.set(key, game);
		return game;
	}

	public clear(): void {
		this.instances.clear();
	}
}

export const linkedGameService = new LinkedGameServiceImpl();

nglEvents.on('linkedGameRemoved', ({ shortcutAppId }) => {
	for (const key of Array.from(linkedGameService['instances'].keys())) {
		if (key.startsWith(`${shortcutAppId}:`)) {
			linkedGameService['instances'].delete(key);
		}
	}
});

nglEvents.on('linkedGameRelinked', ({ shortcutAppId }) => {
	for (const key of Array.from(linkedGameService['instances'].keys())) {
		if (key.startsWith(`${shortcutAppId}:`)) {
			linkedGameService['instances'].delete(key);
		}
	}
});
