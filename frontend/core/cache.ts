export const CACHE_PREFIX = 'gdl_cache_';

export const CACHE_TTL = {
	default: 24 * 60 * 60 * 1000,
	gameMetadata: 24 * 60 * 60 * 1000,
	communityItems: 24 * 60 * 60 * 1000,
	communityContent: 2 * 60 * 60 * 1000,
	news: 30 * 60 * 1000,
	friends: 5 * 60 * 1000,
} as const;

interface CacheEntry<T> {
	version: 1;
	ts: number;
	data: T;
}

export function cacheGet<T>(key: string, ttlMs = CACHE_TTL.default): T | null {
	try {
		const storageKey = CACHE_PREFIX + key;
		const raw = localStorage.getItem(storageKey);
		if (!raw) return null;
		const entry = JSON.parse(raw) as Partial<CacheEntry<T>>;
		if (entry.version !== 1 || !Number.isFinite(Number(entry.ts))) {
			localStorage.removeItem(storageKey);
			return null;
		}
		if (Date.now() - Number(entry.ts) > ttlMs) {
			localStorage.removeItem(storageKey);
			return null;
		}
		return entry.data as T;
	} catch { return null; }
}

export function cacheSet<T>(key: string, data: T): void {
	try {
		const entry: CacheEntry<T> = { version: 1, ts: Date.now(), data };
		localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
	} catch {}
}

export function cacheDelete(key: string): void {
	try { localStorage.removeItem(CACHE_PREFIX + key); } catch {}
}
