import { backendLog, getAllPlaytimeDataBackend, getPlaytimeDataBackend } from '../../api/backend';

export interface PlaytimeStats {
	minutesForever: number;
	minutesLastTwoWeeks: number;
	lastPlayedAt: number | null;
}

const PLAYTIME_STATS_CACHE_MS = 5000;
const playtimeStatsRequests = new Map<string, { expiresAt: number; request: Promise<PlaytimeStats | null> }>();
const MAX_PLAYTIME_CACHE_ENTRIES = 96;

export interface PlaytimeLookup {
	shortcutAppId: number;
	title: string;
	steamAppId?: string;
}

function requestKey(shortcutAppId: number, title: string, steamAppId?: string): string {
	return `${shortcutAppId}|${steamAppId || ''}|${title || ''}`;
}

function parsePlaytimeStats(parsed: any): PlaytimeStats | null {
	if (!parsed || typeof parsed !== 'object' || !parsed.ok) return null;
	return {
		minutesForever: Math.max(0, Number(parsed.minutes_forever || 0)),
		minutesLastTwoWeeks: Math.max(0, Number(parsed.minutes_last_two_weeks || 0)),
		lastPlayedAt: parsed.last_played_at ? Number(parsed.last_played_at) : null,
	};
}

function trimPlaytimeCache(): void {
	if (playtimeStatsRequests.size <= MAX_PLAYTIME_CACHE_ENTRIES) return;
	const ordered = Array.from(playtimeStatsRequests.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
	for (const [key] of ordered) {
		if (playtimeStatsRequests.size <= MAX_PLAYTIME_CACHE_ENTRIES) break;
		playtimeStatsRequests.delete(key);
	}
}

async function fetchSinglePlaytimeStats(lookup: PlaytimeLookup): Promise<PlaytimeStats | null> {
	try {
		const raw = await getPlaytimeDataBackend({
			request_json: JSON.stringify({
				shortcut_app_id: String(lookup.shortcutAppId),
				steam_app_id: lookup.steamAppId || '',
				title: lookup.title || '',
			}),
		});
		let parsed: any = raw;
		for (let i = 0; i < 2 && typeof parsed === 'string'; i++) parsed = JSON.parse(parsed);
		return parsePlaytimeStats(parsed);
	} catch (error) {
		backendLog(`Failed to fetch playtime stats for ${lookup.title} (${lookup.shortcutAppId}): ${error}`);
		return null;
	}
}

/** Resolve a complete Library shelf through one backend IPC. The single-item
 * endpoint remains as a compatibility fallback for a backend hot-reload that
 * has not picked up the batch callable yet. */
export async function fetchPlaytimeStatsBatch(lookups: PlaytimeLookup[]): Promise<Map<number, PlaytimeStats | null>> {
	const unique = Array.from(new Map(lookups.map(item => [item.shortcutAppId, item])).values());
	const now = Date.now();
	const missing = unique.filter(item => {
		const cached = playtimeStatsRequests.get(requestKey(item.shortcutAppId, item.title, item.steamAppId));
		return !cached || cached.expiresAt <= now;
	});

	if (missing.length > 0) {
		const batch = (async (): Promise<Map<string, PlaytimeStats | null>> => {
			const resolved = new Map<string, PlaytimeStats | null>();
			try {
				const raw = await getAllPlaytimeDataBackend({
					request_json: JSON.stringify({ requests: missing.map(item => ({
						key: requestKey(item.shortcutAppId, item.title, item.steamAppId),
						shortcut_app_id: String(item.shortcutAppId),
						steam_app_id: item.steamAppId || '',
						title: item.title || '',
					})) }),
				});
				let parsed: any = raw;
				for (let i = 0; i < 2 && typeof parsed === 'string'; i++) parsed = JSON.parse(parsed);
				for (const item of Array.isArray(parsed?.items) ? parsed.items : []) {
					resolved.set(String(item.key || ''), parsePlaytimeStats(item));
				}
				return resolved;
			} catch {
				await Promise.all(missing.map(async item => {
					resolved.set(requestKey(item.shortcutAppId, item.title, item.steamAppId), await fetchSinglePlaytimeStats(item));
				}));
				return resolved;
			}
		})();
		for (const item of missing) {
			const key = requestKey(item.shortcutAppId, item.title, item.steamAppId);
			const request = batch.then(values => values.get(key) ?? null);
			playtimeStatsRequests.set(key, { expiresAt: now + PLAYTIME_STATS_CACHE_MS, request });
		}
		trimPlaytimeCache();
	}

	const result = new Map<number, PlaytimeStats | null>();
	await Promise.all(unique.map(async item => {
		const key = requestKey(item.shortcutAppId, item.title, item.steamAppId);
		const cached = playtimeStatsRequests.get(key);
		result.set(item.shortcutAppId, cached ? await cached.request : null);
	}));
	return result;
}

/** Read GameBridge's canonical session store. The short cache prevents Big
 * Picture's mutation-driven refreshes from repeatedly reopening the same file,
 * while remaining below the tracker's ten-second heartbeat interval. */
export function fetchPlaytimeStats(shortcutAppId: number, title: string, steamAppId?: string): Promise<PlaytimeStats | null> {
	const key = requestKey(shortcutAppId, title, steamAppId);
	const cached = playtimeStatsRequests.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.request;
	return fetchPlaytimeStatsBatch([{ shortcutAppId, title, steamAppId }]).then(values => values.get(shortcutAppId) ?? null);
}

export function clearPlaytimeStatsCache(): void {
	playtimeStatsRequests.clear();
}
