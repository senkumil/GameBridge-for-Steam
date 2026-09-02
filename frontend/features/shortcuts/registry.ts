import { findMappingByExe, findMappingForTitle, mappings, shortcutMappingKey } from '../../core/mappings';
import { getSteamAppStore, readShortcutOverviewField, shortcutExecutableIdentity, shortcutPathBasename, toSignedShortcutAppId } from '../../steam/shortcuts';

export interface ShortcutRecord {
	id: number;
	title: string;
	app: any;
}

export function normalizedShortcutAppId(value: unknown): number | null {
	const raw = Number(value);
	if (!Number.isFinite(raw)) return null;
	const appId = raw < 0 ? (raw >>> 0) : raw;
	return appId >= 2147483648 ? appId : null;
}

export function isUnrealShippingExecutable(value: string): boolean {
	return /(?:^|[-_\s])(?:win32|win64|linux)[-_\s]*shipping\.exe$/i.test(shortcutPathBasename(value));
}

export function getAllShortcutRecords(): ShortcutRecord[] {
	const appStore = getSteamAppStore();
	if (!appStore) return [];
	const records: ShortcutRecord[] = [];
	const seen = new Set<number>();
	const add = (rawId: unknown, app: any) => {
		const id = normalizedShortcutAppId(rawId ?? app?.appid);
		if (!id || seen.has(id)) return;
		const title = String(app?.display_name || app?.m_strDisplayName || app?.strDisplayName || app?.strAppName || app?.name || '').trim();
		if (!title) return;
		seen.add(id);
		records.push({ id, title, app });
	};
	try {
		if (appStore.m_mapApps instanceof Map || typeof appStore.m_mapApps?.[Symbol.iterator] === 'function') {
			for (const [id, app] of appStore.m_mapApps) add(id, app);
		} else if (appStore.m_mapApps && typeof appStore.m_mapApps === 'object') {
			for (const [id, app] of Object.entries(appStore.m_mapApps)) add(id, app);
		}
	} catch {}
	try { for (const app of Array.from(appStore.allApps || []) as any[]) add(app?.appid, app); } catch {}
	try { for (const app of Array.from(appStore.m_rgApps || []) as any[]) add(app?.appid, app); } catch {}
	return records;
}

/** Find shortcuts that launch exactly the same executable. This intentionally
 * ignores title and launch options: adding the same .exe twice is still a
 * duplicate library entry even if its display name differs. */
export function findShortcutDuplicatesByExecutable(shortcutAppId: number, executablePath: string): ShortcutRecord[] {
	const target = shortcutExecutableIdentity(executablePath);
	if (!target) return [];
	return getAllShortcutRecords().filter(record => record.id !== shortcutAppId
		&& shortcutExecutableIdentity(readShortcutOverviewField(
			record.app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
		)) === target);
}

function shortcutLaunchFingerprint(app: any): string {
	const executable = shortcutExecutableIdentity(readShortcutOverviewField(app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath'));
	if (!executable) return '';
	const startDir = shortcutExecutableIdentity(readShortcutOverviewField(app, 'strShortcutStartDir', 'm_strShortcutStartDir', 'shortcut_start_dir'));
	const options = readShortcutOverviewField(app, 'strShortcutLaunchOptions', 'm_strShortcutLaunchOptions', 'shortcut_launch_options', 'strArguments')
		.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	return `${executable}|${startDir}|${options}`;
}

/** Reuse a mapping only for an exact duplicate launch definition. */
export function findMappingForDuplicateShortcut(shortcutAppId: number): string | null {
	const records = getAllShortcutRecords();
	const target = records.find(record => record.id === shortcutAppId);
	const fingerprint = shortcutLaunchFingerprint(target?.app);
	if (!fingerprint) return null;
	for (const record of records) {
		if (record.id === shortcutAppId || shortcutLaunchFingerprint(record.app) !== fingerprint) continue;
		const mapped = mappings[shortcutMappingKey(record.id)];
		if (/^\d+$/.test(String(mapped || ''))) return mapped;
	}
	return null;
}

export function shortcutAlreadyLinked(id: number): boolean {
	return /^\d+$/.test(String(mappings[shortcutMappingKey(id)] || ''));
}

export function getCommittedShortcutSteamAppId(id: number): string | null {
	const value = String(mappings[shortcutMappingKey(id)] || '').trim();
	return /^\d+$/.test(value) ? value : null;
}

/** Resolve an existing mapping. Checks exact shortcut AppID first, then signed/unsigned
 * variants, and gracefully falls back to title and executable mappings. */
export function findMappingForShortcut(
	shortcutAppId?: string | number | null,
	title?: string | null,
	exePath?: string | null,
): string | null {
	const numId = normalizedShortcutAppId(shortcutAppId);
	if (numId) {
		const signedId = toSignedShortcutAppId(numId);
		const exact = mappings[shortcutMappingKey(numId)]
			|| mappings[shortcutMappingKey(signedId)]
			|| (title ? findMappingForTitle(title, numId) : null)
			|| (exePath ? findMappingByExe(exePath) : null);
		if (exact && /^\d+$/.test(String(exact))) {
			const strExact = String(exact);
			if (!mappings[shortcutMappingKey(numId)]) {
				mappings[shortcutMappingKey(numId)] = strExact;
			}
			return strExact;
		}
	}

	if (exePath) {
		const byExe = findMappingByExe(exePath);
		if (byExe && /^\d+$/.test(String(byExe))) return String(byExe);
	}
	if (title) {
		const byTitle = findMappingForTitle(title);
		if (byTitle && /^\d+$/.test(String(byTitle))) return String(byTitle);
	}
	return null;
}
