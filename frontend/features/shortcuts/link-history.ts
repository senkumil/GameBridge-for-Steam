const STORAGE_KEY = 'gdl_shortcut_link_history_v1';
const TITLE_STORAGE_KEY = 'gdl_shortcut_original_titles_v1';

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

function readOriginalTitles(): Record<string, string> {
	try {
		const raw = storage()?.getItem(TITLE_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return parsed as Record<string, string>;
	} catch { return {}; }
}

function writeOriginalTitles(titles: Record<string, string>): void {
	try { storage()?.setItem(TITLE_STORAGE_KEY, JSON.stringify(titles)); } catch {}
}

function key(shortcutAppId: string | number): string {
	return `shortcut:${String(shortcutAppId)}`;
}

/** Keep the last confirmed Steam AppID as a non-authoritative identity hint.
 * Bulk detection may use it only to break a tie among candidates returned for
 * this same concrete shortcut; the committed mapping remains the sole source
 * of truth for whether the row is currently linked. */
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

export function forgetShortcutSteamAppId(shortcutAppId: string | number | null | undefined): void {
	if (shortcutAppId == null) return;
	const history = readHistory();
	delete history[key(shortcutAppId)];
	writeHistory(history);
}

export function rememberOriginalShortcutTitle(shortcutAppId: string | number, originalTitle: string): void {
	const t = String(originalTitle || '').trim();
	if (!t || !/^\d+$/.test(String(shortcutAppId))) return;
	const titles = readOriginalTitles();
	const k = key(shortcutAppId);
	if (!titles[k]) {
		titles[k] = t;
		writeOriginalTitles(titles);
	}
}

export function getOriginalShortcutTitle(shortcutAppId: string | number | null | undefined): string {
	if (shortcutAppId == null) return '';
	return readOriginalTitles()[key(shortcutAppId)] || '';
}

export function forgetOriginalShortcutTitle(shortcutAppId: string | number | null | undefined): void {
	if (shortcutAppId == null) return;
	const titles = readOriginalTitles();
	delete titles[key(shortcutAppId)];
	writeOriginalTitles(titles);
}
