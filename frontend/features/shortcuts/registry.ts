import { mappings, shortcutMappingKey } from '../../core/mappings';
import { readShortcutOverviewField, shortcutExecutableIdentity, shortcutPathBasename } from '../../steam/shortcuts';

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
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return [];
	const records: ShortcutRecord[] = [];
	const seen = new Set<number>();
	const add = (rawId: unknown, app: any) => {
		const id = normalizedShortcutAppId(rawId ?? app?.appid);
		if (!id || seen.has(id)) return;
		const title = String(app?.display_name || app?.m_strDisplayName || app?.strDisplayName || '').trim();
		if (!title) return;
		seen.add(id);
		records.push({ id, title, app });
	};
	try { for (const [id, app] of appStore.m_mapApps) add(id, app); } catch {}
	try { for (const app of Array.from(appStore.allApps || []) as any[]) add(app?.appid, app); } catch {}
	return records;
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
