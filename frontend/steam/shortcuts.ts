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

/** Language-independent identity for the concrete launch definition. Steam's
 * non-Steam AppID can change when its display name changes, so persistent
 * decisions must never rely on AppID/title alone. */
export function shortcutStableIdentity(app: any): string {
	if (!app) return '';
	const executable = shortcutExecutableIdentity(readShortcutOverviewField(
		app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
	));
	if (!executable) return '';
	const startDir = shortcutExecutableIdentity(readShortcutOverviewField(
		app, 'strShortcutStartDir', 'm_strShortcutStartDir', 'shortcut_start_dir',
	));
	const launchOptions = readShortcutOverviewField(
		app, 'strShortcutLaunchOptions', 'm_strShortcutLaunchOptions', 'shortcut_launch_options', 'strArguments',
	).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	return `${executable}|${startDir}|${launchOptions}`;
}

export function shortcutStableIdentityById(shortcutAppId: number): string {
	return shortcutStableIdentity(getShortcutAppById(shortcutAppId));
}

export function toSignedShortcutAppId(shortcutAppId: number): number {
	return shortcutAppId >= SHORTCUT_THRESHOLD ? shortcutAppId - 4294967296 : shortcutAppId;
}

function canonicalizeGameTitle(value: string): string {
	let text = normalizeTitle(value)
		.replace(/\.(?:exe|com|bat|cmd|lnk|appimage)$/i, '')
		.replace(/\[[^\]]*\]/g, ' ')
		.replace(/\([^)]*(?:v\d|build|repack|gog|dodi|fitgirl|multi)[^)]*\)/gi, ' ')
		.replace(/\bv\d+(?:\.\d+)*\b/gi, ' ')
		.replace(/\b(?:repack|flt|codex|goldberg|rune|skidrow|dodi|fitgirl|elamigos|gog)\b/gi, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

	// Replace Roman numerals as standalone words
	text = text
		.replace(/\bviii\b/g, '8')
		.replace(/\bvii\b/g, '7')
		.replace(/\bvi\b/g, '6')
		.replace(/\biv\b/g, '4')
		.replace(/\bv\b/g, '5')
		.replace(/\biii\b/g, '3')
		.replace(/\bii\b/g, '2')
		.replace(/\bix\b/g, '9')
		.replace(/\bx\b/g, '10');

	return text.replace(/\s+/g, '');
}

/** Identity-safe display-title comparison.
 *
 * Never use substring matching here. Franchise titles such as "God of War"
 * and "God of War Ragnarök" must remain distinct shortcuts even though one
 * normalized title is a prefix of the other. The canonical fallback only
 * removes packaging/noise tokens and still requires full equality. */
export function looseMatchTitle(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (normalizeTitle(a) === normalizeTitle(b)) return true;
	const cleanA = canonicalizeGameTitle(a);
	const cleanB = canonicalizeGameTitle(b);
	return cleanA !== '' && cleanA === cleanB;
}

export function getSteamAppStore(): any | null {
	if ((window as any).appStore?.m_mapApps) return (window as any).appStore;
	const pm = (window as any).g_PopupManager;
	if (pm) {
		try {
			for (const name of ['SP Desktop_uid0', 'SP Desktop', 'SP BPM_uid0', 'SP BPM']) {
				const p = pm.GetExistingPopup?.(name) || pm.m_mapPopups?.get?.(name);
				const win = p?.m_popup?.window || p?.window || p?.m_popup || p;
				if (win?.appStore?.m_mapApps) return win.appStore;
			}
			if (pm.m_mapPopups) {
				for (const [_, p] of pm.m_mapPopups) {
					const win = p?.m_popup?.window || p?.window;
					if (win?.appStore?.m_mapApps) return win.appStore;
				}
			}
		} catch {}
	}
	return null;
}

/** Find a non-Steam shortcut's internal AppID by its display name.
 * Exact normalized equality wins. Canonical equality is allowed only when it
 * identifies a single shortcut; ambiguous franchise/name matches return null. */
export function findShortcutAppIdByName(title: string): number | null {
	const appStore = getSteamAppStore();
	if (!appStore?.m_mapApps) return null;
	const normalizedTarget = normalizeTitle(title);
	const canonicalTarget = canonicalizeGameTitle(title);
	const exact: number[] = [];
	const canonical: number[] = [];
	for (const [id, app] of appStore.m_mapApps) {
		const rawId = Number(id);
		if (!Number.isFinite(rawId)) continue;
		const numId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (numId < SHORTCUT_THRESHOLD) continue;
		const name = String(app?.display_name || app?.m_strDisplayName || '').trim();
		if (!name) continue;
		if (normalizedTarget && normalizeTitle(name) === normalizedTarget) exact.push(numId);
		else if (canonicalTarget && canonicalizeGameTitle(name) === canonicalTarget) canonical.push(numId);
	}
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) return null;
	return canonical.length === 1 ? canonical[0] : null;
}

/** Resolve the shortcut ID represented by a Steam library document. */
export function findActiveShortcutAppId(doc: Document, title: string): string | null {
	const trimmedTitle = (title || '').trim();
	const urls = [
		String(doc.defaultView?.location?.href || ''),
		String(doc.location?.href || ''),
	];
	if (typeof document !== 'undefined' && doc === document) urls.push(String((window as any).location?.href || ''));
	for (const url of urls) {
		const match = url.match(/(?:games\/details|library\/app|app)\/(\d+)/i);
		if (match && Number(match[1]) >= SHORTCUT_THRESHOLD) {
			const candidateId = Number(match[1]);
			// The route is the strongest identity signal Steam exposes. Do not
			// override a concrete shortcut route with fuzzy/title-based matching.
			if (getShortcutAppById(candidateId)) return String(candidateId);
			if (trimmedTitle) {
				const byName = findShortcutAppIdByName(trimmedTitle);
				if (byName && byName === candidateId) return String(byName);
			}
			return match[1];
		}
	}
	return null;
}

/** Find every shortcut matching a display name; useful while Steam is rebuilding an ID after rename. */
export function findShortcutAppIdsByName(title: string): number[] {
	const appStore = getSteamAppStore();
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
	const appStore = getSteamAppStore();
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

export function getMappedShortcuts(): Array<{ id: number; title: string; steamAppId: string }> {
	const appStore = getSteamAppStore();
	if (!appStore?.m_mapApps) return [];
	const result: Array<{ id: number; title: string; steamAppId: string }> = [];
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
			result.push({ id: shortcutId, title, steamAppId: String(steamAppId) });
			seen.add(shortcutId);
		}
	}
	return result;
}

export function clearShortcutRuntimeCaches(): void {
	shortcutPlaytimeRequests.clear();
}

/** Check if the Steam Library tab or UI view is currently active in the client. */
export function isSteamLibraryActive(doc?: Document | null): boolean {
	const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
	if (!targetDoc || !targetDoc.body) return false;

	const urls = [
		String(targetDoc.defaultView?.location?.href || ''),
		String(targetDoc.location?.href || ''),
		String((window as any).location?.href || ''),
	];
	for (const url of urls) {
		if (/store\.steampowered\.com|steamcommunity\.com|help\.steampowered\.com|steampowered\.com/i.test(url)) {
			return false;
		}
		if (/(?:games\/details|library|libraryroot|steamloopback\.host)/i.test(url)) {
			return true;
		}
	}

	try {
		const activeNav = targetDoc.querySelector(
			'[class*="supernav"] [class*="active"], [class*="supernav"] [class*="selected"], [class*="supernav"] [aria-current="page"], [class*="tab_active"], [class*="activeTab"], [class*="active_tab"]'
		);
		if (activeNav) {
			const text = (activeNav.textContent || '').toLowerCase();
			const href = (activeNav.getAttribute('href') || '').toLowerCase();
			if (/store|tienda|magasin|shop|comunidad|community|chat|amigos/i.test(text) || /store|community/i.test(href)) {
				return false;
			}
			if (/biblioteca|library|games|jeux|spiele|kolekcja/i.test(text) || /games|library/i.test(href)) {
				return true;
			}
		}
	} catch {}

	try {
		const libraryContainer = targetDoc.querySelector(
			'[class*="libraryroot"], [class*="libraryhome"], [class*="appdetails"], [class*="gamepadappoverview"], [class*="gamelistsection"]'
		);
		if (libraryContainer instanceof HTMLElement) {
			const style = targetDoc.defaultView?.getComputedStyle(libraryContainer);
			const rect = libraryContainer.getBoundingClientRect();
			if (rect.width > 200 && rect.height > 200 && style?.display !== 'none' && style?.visibility !== 'hidden') {
				return true;
			}
		}
	} catch {}

	return false;
}
