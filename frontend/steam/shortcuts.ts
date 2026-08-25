import { backendLog } from '../api/backend';
import { findMappingForTitle } from '../core/mappings';
import { normalizeTitle } from '../core/text';

const SHORTCUT_THRESHOLD = 2147483648;
const shortcutPlaytimeRequests = new Map<number, Promise<number | null>>();


export function cleanShortcutPath(value: unknown): string {
	const text = String(value ?? '').trim();
	const quoted = text.match(/^"(.*)"$/);
	return (quoted?.[1] || text).trim();
}

export function shortcutPathBasename(value: string): string {
	return cleanShortcutPath(value).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

export function shortcutPathDirectory(value: string): string {
	const clean = cleanShortcutPath(value);
	const index = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'));
	return index > 0 ? clean.slice(0, index) : '';
}

export function readShortcutOverviewField(app: any, ...keys: string[]): string {
	const containers = [app, app?.app_overview, app?.m_appOverview, app?.overview];
	for (const container of containers) {
		if (!container) continue;
		for (const key of keys) {
			const value = container[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
	}
	return '';
}

export function shortcutExecutableIdentity(value: string): string {
	return cleanShortcutPath(value).replace(/\//g, '\\').replace(/\\+/g, '\\').toLocaleLowerCase();
}

export function toSignedShortcutAppId(shortcutAppId: number): number {
	return shortcutAppId >= SHORTCUT_THRESHOLD ? shortcutAppId - 4294967296 : shortcutAppId;
}

/** Find a non-Steam shortcut's internal AppID by its exact display name. */
export function findShortcutAppIdByName(title: string): number | null {
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return null;
	const normalized = normalizeTitle(title);
	for (const [id, app] of appStore.m_mapApps) {
		const rawId = Number(id);
		if (!Number.isFinite(rawId)) continue;
		const numId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (numId < SHORTCUT_THRESHOLD) continue;
		const name = app?.display_name || app?.m_strDisplayName || '';
		if (name && normalizeTitle(name) === normalized) return numId;
	}
	return null;
}

/** Resolve the shortcut ID represented by a Steam library document. */
export function findActiveShortcutAppId(doc: Document, title: string): string | null {
	const urls = [
		String(doc.defaultView?.location?.href || ''),
		String(doc.location?.href || ''),
		String((window as any).location?.href || ''),
	];
	for (const url of urls) {
		const match = url.match(/(?:games\/details|library\/app|app)\/(\d+)/i);
		if (match && Number(match[1]) >= SHORTCUT_THRESHOLD) return match[1];
	}
	const byName = findShortcutAppIdByName(title);
	return byName ? String(byName) : null;
}

/** Find every shortcut matching a display name; useful while Steam is rebuilding an ID after rename. */
export function findShortcutAppIdsByName(title: string): number[] {
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return [];
	const normalized = normalizeTitle(title);
	const result: number[] = [];
	for (const [id, app] of appStore.m_mapApps) {
		const rawId = Number(id);
		const numId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (!Number.isFinite(numId) || numId < SHORTCUT_THRESHOLD) continue;
		const name = app?.display_name || app?.m_strDisplayName || '';
		if (name && normalizeTitle(name) === normalized && !result.includes(numId)) result.push(numId);
	}
	return result;
}

export function getShortcutAppById(shortcutAppId: number): any | null {
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return null;
	const ids = new Set([shortcutAppId, toSignedShortcutAppId(shortcutAppId)]);
	try {
		for (const [id, app] of appStore.m_mapApps) {
			const rawId = Number(id);
			const normalizedId = rawId < 0 ? (rawId >>> 0) : rawId;
			if (ids.has(rawId) || ids.has(normalizedId) || ids.has(Number(app?.appid))) return app;
		}
	} catch {}
	try {
		for (const app of Array.from(appStore.allApps || []) as any[]) {
			const rawId = Number(app?.appid);
			const normalizedId = rawId < 0 ? (rawId >>> 0) : rawId;
			if (ids.has(rawId) || ids.has(normalizedId)) return app;
		}
	} catch {}
	return null;
}

/** Get shortcut lifetime playtime from Steam without permanently caching transient empty startup values. */
export async function getShortcutPlaytimeMinutes(shortcutAppId: number): Promise<number | null> {
	const existing = shortcutPlaytimeRequests.get(shortcutAppId);
	if (existing) return existing;
	const request = (async () => {
		try {
			const appsApi = (window as any).SteamClient?.Apps;
			if (typeof appsApi?.GetPlaytime !== 'function') return null;
			const ids = [shortcutAppId, toSignedShortcutAppId(shortcutAppId)];
			let best = 0;
			for (const id of ids) {
				try {
					const playtime = await appsApi.GetPlaytime(id);
					const minutes = Number(playtime?.nPlaytimeForever ?? playtime?.minutes_playtime_forever ?? 0);
					if (Number.isFinite(minutes) && minutes > best) best = minutes;
				} catch {}
			}
			return best > 0 ? best : null;
		} catch (error) {
			backendLog(`Shortcut playtime lookup failed for ${shortcutAppId}: ${error}`);
			return null;
		}
	})();
	const retryable = request.then((minutes) => {
		if (minutes === null) shortcutPlaytimeRequests.delete(shortcutAppId);
		else setTimeout(() => {
			if (shortcutPlaytimeRequests.get(shortcutAppId) === retryable) shortcutPlaytimeRequests.delete(shortcutAppId);
		}, 15000);
		return minutes;
	});
	shortcutPlaytimeRequests.set(shortcutAppId, retryable);
	return retryable;
}

export function getMappedShortcuts(): Array<{ id: number; title: string }> {
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return [];
	const result: Array<{ id: number; title: string }> = [];
	const entries: Array<[unknown, any]> = [];
	try { for (const [id, app] of appStore.m_mapApps) entries.push([id, app]); } catch {}
	try { for (const app of Array.from(appStore.allApps || []) as any[]) entries.push([app?.appid, app]); } catch {}
	const seen = new Set<number>();
	for (const [id, app] of entries) {
		const rawId = Number(id);
		const shortcutId = rawId < 0 ? (rawId >>> 0) : rawId;
		const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
		if (!Number.isFinite(shortcutId) || shortcutId < SHORTCUT_THRESHOLD || !title) continue;
		const steamAppId = findMappingForTitle(title, shortcutId);
		if (/^\d+$/.test(String(steamAppId || '')) && !seen.has(shortcutId)) {
			result.push({ id: shortcutId, title });
			seen.add(shortcutId);
		}
	}
	return result;
}

export function clearShortcutRuntimeCaches(): void {
	shortcutPlaytimeRequests.clear();
}
