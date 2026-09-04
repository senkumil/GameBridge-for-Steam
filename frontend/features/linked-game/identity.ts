import { findMappingForTitle, mappings, shortcutMappingKey } from '../../core/mappings';
import { SHORTCUT_THRESHOLD, toSignedShortcutAppId, getShortcutAppById, findShortcutAppIdByName } from '../../steam/shortcuts';

export interface LinkedGameIdentity {
	/** The unique numeric Non-Steam shortcut AppID assigned by Steam (>= 2147483648 or signed 32-bit int) */
	readonly shortcutAppId: number;
	/** The official Steam AppID used solely as a metadata and content source */
	readonly steamAppId: string;
	/** The display title of the game */
	readonly title: string;
	/** Optional executable path for the shortcut */
	readonly exePath?: string;
}

/** Check if a given AppID (numeric or string) or app object belongs to a Non-Steam shortcut linked via NativeGameLink */
export function isLinkedNonSteamGame(appOrId: unknown): boolean {
	if (!appOrId) return false;
	if (typeof appOrId === 'object') {
		const rawId = Number((appOrId as any).appid ?? (appOrId as any).app_id ?? (appOrId as any).m_unAppID);
		const shortcutId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (shortcutId >= SHORTCUT_THRESHOLD) {
			const title = String((appOrId as any).display_name || (appOrId as any).m_strDisplayName || (appOrId as any).name || '').trim();
			return Boolean(findMappingForTitle(title, shortcutId));
		}
		return false;
	}
	const num = Number(appOrId);
	if (!Number.isFinite(num)) return false;
	const unsignedId = num < 0 ? (num >>> 0) : num;
	if (unsignedId < SHORTCUT_THRESHOLD) return false;
	const key = shortcutMappingKey(unsignedId);
	const signedKey = shortcutMappingKey(toSignedShortcutAppId(unsignedId));
	return Boolean((mappings[key] || mappings[signedKey]) && /^\d+$/.test(String(mappings[key] || mappings[signedKey])));
}

export function resolveLinkedGameIdentity(target: unknown): LinkedGameIdentity | null {
	if (!target) return null;
	if (typeof target === 'object') {
		const rawId = Number((target as any).appid ?? (target as any).app_id ?? (target as any).m_unAppID);
		const shortcutId = rawId < 0 ? (rawId >>> 0) : rawId;
		const title = String((target as any).display_name || (target as any).m_strDisplayName || (target as any).name || '').trim();
		const steamAppId = findMappingForTitle(title, shortcutId);
		if (steamAppId && /^\d+$/.test(steamAppId)) {
			return {
				shortcutAppId: shortcutId,
				steamAppId: String(steamAppId),
				title: title || `App ${shortcutId}`,
				exePath: (target as any).executable || (target as any).exe_path,
			};
		}
		return null;
	}

	const rawNum = Number(target);
	if (Number.isFinite(rawNum) && rawNum >= SHORTCUT_THRESHOLD) {
		const unsignedId = rawNum < 0 ? (rawNum >>> 0) : rawNum;
		const steamAppId = findMappingForTitle('', unsignedId);
		if (steamAppId && /^\d+$/.test(steamAppId)) {
			const app = getShortcutAppById(unsignedId);
			const title = String(app?.display_name || app?.m_strDisplayName || `Shortcut ${unsignedId}`).trim();
			return {
				shortcutAppId: unsignedId,
				steamAppId: String(steamAppId),
				title,
				exePath: app?.strShortcutExe || app?.m_strShortcutExe || app?.shortcut_exe || app?.strExePath,
			};
		}
	}

	if (typeof target === 'string' && target.trim()) {
		const title = target.trim();
		const steamAppId = findMappingForTitle(title);
		if (steamAppId && /^\d+$/.test(steamAppId)) {
			const shortcutId = findShortcutAppIdByName(title) || 0;
			return {
				shortcutAppId: shortcutId,
				steamAppId: String(steamAppId),
				title,
			};
		}
	}

	return null;
}
