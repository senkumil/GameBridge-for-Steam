import type { ShortcutLinkResult, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import { normalizeTitle } from '../../core/text';
import { shortcutMappingKey, updateMappingsChecked } from '../../core/mappings';
import { gdlText } from '../../steam/localization';
import { cleanShortcutPath, findActiveShortcutAppId, findShortcutAppIdByName, getShortcutAppById, readShortcutOverviewField, shortcutPathDirectory } from '../../steam/shortcuts';
import { applyOfficialShortcutIcon, resolveShortcutIdAfterRename, spoofArtwork } from '../library/artwork';
import { saveLinkedGameNote } from './linked-notes';
import { shortcutRuntimeHost } from './host';
import { getAllShortcutRecords } from './registry';

const VERIFIED_AUTO_NO_LAUNCHER_APP_IDS = new Set<string>(['1817070']);

export type ShortcutLinkStatus = (message: string, color?: string) => void;

export function mergeNoLauncherOption(existing: string): string {
	const current = String(existing || '').trim();
	if (/(^|\s)-nolauncher(?=\s|$)/i.test(current)) return current;
	return current ? `${current} -nolauncher` : '-nolauncher';
}

export function hasNoLauncherOption(value: string): boolean {
	return /(^|\s)-nolauncher(?=\s|$)/i.test(String(value || '').trim());
}

export function shouldAutoApplyNoLauncher(steamAppId: string): boolean {
	return VERIFIED_AUTO_NO_LAUNCHER_APP_IDS.has(String(steamAppId || '').trim());
}

export function applyNoLauncherOption(shortcutAppId: number, fallbackOptions = '', automatic = false): boolean {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return false;
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetShortcutLaunchOptions !== 'function') return false;
	const app = getShortcutAppById(shortcutAppId);
	const existing = readShortcutOverviewField(app, 'strShortcutLaunchOptions', 'm_strShortcutLaunchOptions', 'shortcut_launch_options') || fallbackOptions;
	const merged = mergeNoLauncherOption(existing);
	if (merged === String(existing || '').trim()) return true;
	try {
		apps.SetShortcutLaunchOptions(shortcutAppId, merged);
		backendLog(`${automatic ? 'Automatically added verified' : 'Added user-selected'} -nolauncher option to shortcut ${shortcutAppId}`);
		return true;
	} catch (e) {
		backendLog(`Could not update launch options for shortcut ${shortcutAppId}: ${e}`);
		return false;
	}
}

function applyTrackingExecutable(shortcutAppId: number, executablePath: string, startDir = ''): boolean {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return false;
	const apps = (window as any).SteamClient?.Apps;
	const executable = cleanShortcutPath(executablePath);
	const directory = cleanShortcutPath(startDir) || shortcutPathDirectory(executable);
	if (!executable || typeof apps?.SetShortcutExe !== 'function') return false;
	try {
		// Steam's own file picker passes the plain path to this API. It handles
		// quoting paths with spaces when persisting shortcuts.vdf.
		apps.SetShortcutExe(shortcutAppId, executable);
		if (directory && typeof apps?.SetShortcutStartDir === 'function') {
			apps.SetShortcutStartDir(shortcutAppId, directory);
		}
		backendLog(`Shortcut ${shortcutAppId} tracking executable changed to ${executable}`);
		return true;
	} catch (e) {
		backendLog(`Could not update tracking executable for shortcut ${shortcutAppId}: ${e}`);
		return false;
	}
}

export interface ShortcutIdentitySyncResult {
	shortcutAppId: number;
	officialName: string;
	nameApplied: boolean;
	iconApplied: boolean;
	trackingApplied: boolean;
	noLauncherConfigured: boolean;
}

/** Keep one concrete non-Steam shortcut associated with its official Steam
 * identity. Both SetShortcutExe and SetShortcutName can regenerate Steam's
 * local shortcut AppID, so each mutation is resolved before the next one. */
export async function synchronizeShortcutOfficialIdentity(options: {
	shortcutAppId: number;
	currentTitle: string;
	steamAppId: string;
	data?: SteamGameData | null;
	trackingExecutable?: string;
	trackingStartDir?: string;
	skipLauncher?: boolean;
	existingLaunchOptions?: string;
}): Promise<ShortcutIdentitySyncResult> {
	const originalShortcutId = options.shortcutAppId;
	if (!Number.isFinite(originalShortcutId) || originalShortcutId < 2147483648) {
		throw new Error('refusing_to_modify_native_steam_app');
	}
	let shortcutAppId = originalShortcutId;
	const data = options.data || await getGameData(options.steamAppId);
	const officialName = String(data?.name || options.currentTitle).trim();
	const staleIds = new Set<number>([originalShortcutId]);
	let trackingApplied = false;
	let nameApplied = false;

	if (options.trackingExecutable) {
		const beforeTracking = new Set(getAllShortcutRecords().map(record => record.id));
		trackingApplied = applyTrackingExecutable(shortcutAppId, options.trackingExecutable, options.trackingStartDir || '');
		if (trackingApplied) {
			shortcutAppId = await resolveShortcutIdAfterRename(
				options.currentTitle,
				shortcutAppId,
				beforeTracking,
				options.trackingExecutable,
			);
			staleIds.add(shortcutAppId);
		}
	}

	if (officialName && normalizeTitle(officialName) !== normalizeTitle(options.currentTitle)) {
		const beforeRename = new Set(getAllShortcutRecords().map(record => record.id));
		const apps = (window as any).SteamClient?.Apps;
		if (typeof apps?.SetShortcutName === 'function') {
			try {
				apps.SetShortcutName(shortcutAppId, officialName);
				nameApplied = true;
				const expectedExe = options.trackingExecutable
					|| readShortcutOverviewField(getShortcutAppById(shortcutAppId), 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath');
				shortcutAppId = await resolveShortcutIdAfterRename(officialName, shortcutAppId, beforeRename, expectedExe);
				staleIds.add(shortcutAppId);
				backendLog(`Shortcut ${originalShortcutId} renamed to official Steam title: ${officialName}`);
			} catch (e) {
				backendLog('Official shortcut rename failed: ' + e);
			}
		}
	}

	const exactKey = shortcutMappingKey(shortcutAppId);
	const mappingSet: Record<string, string> = { [exactKey]: options.steamAppId };
	for (const alias of [options.currentTitle, officialName]) {
		const aliasKey = normalizeTitle(alias);
		if (aliasKey) mappingSet[aliasKey] = options.steamAppId;
	}
	const mappingRemove = Array.from(staleIds)
		.filter(staleId => staleId !== shortcutAppId)
		.map(staleId => shortcutMappingKey(staleId));
	if (!(await updateMappingsChecked({ set: mappingSet, remove: mappingRemove }))) {
		throw new Error('mapping_identity_update_failed');
	}

	const automaticNoLauncher = shouldAutoApplyNoLauncher(options.steamAppId);
	const noLauncherConfigured = automaticNoLauncher || options.skipLauncher
		? applyNoLauncherOption(shortcutAppId, options.existingLaunchOptions || '', automaticNoLauncher)
		: false;
	await spoofArtwork(shortcutAppId, options.steamAppId, officialName || options.currentTitle, true);
	const iconApplied = await applyOfficialShortcutIcon(shortcutAppId, options.steamAppId);
	shortcutRuntimeHost().refreshLibraryArtwork(shortcutAppId);

	return { shortcutAppId, officialName, nameApplied, iconApplied, trackingApplied, noLauncherConfigured };
}

export async function linkShortcutToSteam(options: {
	doc?: Document | null;
	title: string;
	shortcutAppId?: number | null;
	steamAppId: string;
	skipLauncher?: boolean;
	existingLaunchOptions?: string;
	trackingExecutable?: string;
	trackingStartDir?: string;
	onStatus?: ShortcutLinkStatus;
}): Promise<ShortcutLinkResult> {
	const steamAppId = String(options.steamAppId || '').trim();
	const title = String(options.title || '').trim();
	const onStatus = options.onStatus || (() => {});
	if (!/^\d+$/.test(steamAppId)) return { ok: false, error: 'invalid_appid' };

	onStatus(gdlText('verifying_steam', 'Verifying on Steam...'), '#8f98a0');
	const data = await getGameData(steamAppId);
	if (!data) {
		onStatus(gdlText('appid_not_found', 'AppID {id} was not found on Steam.', { id: steamAppId }), '#ff6b6b');
		return { ok: false, error: 'appid_not_found' };
	}

	try {
		let shortcutAppId = options.shortcutAppId || null;
		if (!shortcutAppId && options.doc) {
			const active = findActiveShortcutAppId(options.doc, title);
			shortcutAppId = active ? Number(active) : null;
		}
		if (!shortcutAppId) shortcutAppId = findShortcutAppIdByName(title);
		if (shortcutAppId && shortcutAppId < 2147483648) shortcutAppId = null;

		let titleKey = normalizeTitle(title);
		const aliases = new Set<string>([titleKey]);
		const mappingKey = shortcutAppId ? shortcutMappingKey(shortcutAppId) : titleKey;
		const initialSet: Record<string, string> = { [mappingKey]: steamAppId };
		if (shortcutAppId && mappingKey !== titleKey && titleKey) initialSet[titleKey] = steamAppId;
		if (!(await updateMappingsChecked({ set: initialSet }))) throw new Error('mapping_write_failed');
		aliases.add(mappingKey);

		onStatus(gdlText('linked_updating', '✓ Linked to "{name}". Updating name, icon and artwork...', { name: data.name }), '#5ba32b');
		if (shortcutAppId) {
			const synced = await synchronizeShortcutOfficialIdentity({
				shortcutAppId,
				currentTitle: title,
				steamAppId,
				data,
				trackingExecutable: options.trackingExecutable,
				trackingStartDir: options.trackingStartDir,
				skipLauncher: options.skipLauncher,
				existingLaunchOptions: options.existingLaunchOptions,
			});
			shortcutAppId = synced.shortcutAppId;
			titleKey = normalizeTitle(synced.officialName);
			aliases.add(titleKey);
			aliases.add(shortcutMappingKey(shortcutAppId));
			let finalMessage = synced.nameApplied && synced.iconApplied
				? gdlText('linked_official', '✓ Linked to "{name}". Official name and icon updated.', { name: synced.officialName })
				: synced.nameApplied
					? gdlText('linked_name', '✓ Linked to "{name}". Official name updated; the official icon was unavailable.', { name: synced.officialName })
					: gdlText('linked_reopen', '✓ Linked to "{name}". You may need to reopen Steam to update the name or icon.', { name: synced.officialName });
			if (synced.trackingApplied) finalMessage += gdlText('tracking_executable_updated', ' Steam will now launch the long-running game executable so playtime can be tracked.');
			if (shouldAutoApplyNoLauncher(steamAppId) && synced.noLauncherConfigured) finalMessage += ' -nolauncher.';
			if (await saveLinkedGameNote(synced.officialName || title, data, steamAppId)) finalMessage += gdlText('local_note_updated', ' Local note updated.');
			onStatus(finalMessage, '#5ba32b');
		} else {
			onStatus(gdlText('linked_open_save', '✓ Linked to "{name}". Open the game page and click Save again to update its name and icon.', { name: data.name }), '#5ba32b');
		}

		shortcutRuntimeHost().resetLibraryInjection(true);
		return { ok: true, data, shortcutAppId, aliases: Array.from(aliases) };
	} catch (e) {
		backendLog('Save error: ' + e);
		onStatus(gdlText('save_failed', 'Could not save.'), '#ff6b6b');
		return { ok: false, data, error: String(e) };
	}
}

