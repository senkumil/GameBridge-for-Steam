const STORAGE_KEY = 'gdl_shortcut_link_history_v1';

type ShortcutLinkHistory = Record<string, string>;

function storage(): Storage | null {
	try { return typeof localStorage !== 'undefined' ? localStorage : null; }
	catch { return null; }
}

function readHistory(): ShortcutLinkHistory {
	try {
		const raw = storage()?.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const clean: ShortcutLinkHistory = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (/^shortcut:\d+$/.test(key) && /^\d+$/.test(String(value))) clean[key] = String(value);
		}
		return clean;
	} catch { return {}; }
}

function writeHistory(history: ShortcutLinkHistory): void {
	try { storage()?.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {}
}

function key(shortcutAppId: string | number): string {
	return `shortcut:${String(shortcutAppId)}`;
}

/** Keep the last user-confirmed Steam AppID as UI history only. It is never
 * consulted to decide whether a shortcut is currently linked. */
export function rememberShortcutSteamAppId(shortcutAppId: string | number, steamAppId: string): void {
	if (!/^\d+$/.test(String(steamAppId)) || !/^\d+$/.test(String(shortcutAppId))) return;
	const history = readHistory();
	history[key(shortcutAppId)] = String(steamAppId);
	writeHistory(history);
}

export function rememberedShortcutSteamAppId(shortcutAppId: string | number | null | undefined): string {
	if (shortcutAppId == null) return '';
	const value = readHistory()[key(shortcutAppId)] || '';
	return /^\d+$/.test(value) ? value : '';
}
