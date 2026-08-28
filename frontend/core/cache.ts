export const CACHE_PREFIX = 'gdl_cache_';

export const CACHE_TTL = {
	default: 30 * 24 * 60 * 60 * 1000,
	gameMetadata: 30 * 24 * 60 * 60 * 1000,
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

const CACHE_MAX_ENTRIES = 96;
const CACHE_MAX_BYTES = 6 * 1024 * 1024;
let lastPruneAt = 0;

/** Bound persistent data owned by GameBridge so long-running Steam sessions do
 * not accumulate one metadata/news/community object for every visited game. */
export function pruneCacheStorage(maxEntries = CACHE_MAX_ENTRIES, maxBytes = CACHE_MAX_BYTES): void {
	try {
		const candidates: Array<{ key: string; ts: number; bytes: number }> = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (!key?.startsWith(CACHE_PREFIX)) continue;
			const raw = localStorage.getItem(key) || '';
			let ts = 0;
			try { ts = Number((JSON.parse(raw) as Partial<CacheEntry<unknown>>).ts || 0); } catch {}
			if (!Number.isFinite(ts) || ts <= 0 || Date.now() - ts > CACHE_TTL.default) {
				localStorage.removeItem(key);
				index -= 1;
				continue;
			}
			candidates.push({ key, ts, bytes: raw.length * 2 });
		}
		candidates.sort((a, b) => b.ts - a.ts);
		let retainedBytes = 0;
		for (let index = 0; index < candidates.length; index += 1) {
			const candidate = candidates[index];
			retainedBytes += candidate.bytes;
			if (index >= maxEntries || retainedBytes > maxBytes) localStorage.removeItem(candidate.key);
		}
		lastPruneAt = Date.now();
	} catch {}
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
	if (Date.now() - lastPruneAt > 30000) pruneCacheStorage();
	const storageKey = CACHE_PREFIX + key;
	const entry: CacheEntry<T> = { version: 1, ts: Date.now(), data };
	let raw = '';
	try { raw = JSON.stringify(entry); } catch { return; }
	try {
		localStorage.setItem(storageKey, raw);
	} catch {
		// Quota pressure can be recovered without affecting Steam-owned keys.
		pruneCacheStorage(48, 3 * 1024 * 1024);
		try { localStorage.setItem(storageKey, raw); } catch {}
	}
}

export function cacheDelete(key: string): void {
	try { localStorage.removeItem(CACHE_PREFIX + key); } catch {}
}
