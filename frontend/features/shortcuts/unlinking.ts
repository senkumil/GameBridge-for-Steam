import { backendLog, clearArtworkExceptIconBackend } from '../../api/backend';
import { removeShortcutMappingsChecked } from '../../core/mappings';
import { getShortcutAppById, readShortcutOverviewField } from '../../steam/shortcuts';
import { clearArtworkSaved, hasManagedArtworkSaved } from '../library/artwork';
import { dismissShortcut, undismissShortcut } from './dismissed';
import { shortcutRuntimeHost } from './host';
import { cancelAllPendingLinkJobs, cancelPendingLinkJobs } from './link-job-queue';
import { findMappingForShortcut, getAllShortcutRecords, normalizedShortcutAppId } from './registry';

export interface ShortcutUnlinkOptions {
	doc?: Document | null;
	shortcutAppId: string | number;
	title: string;
	steamAppId?: string | null;
	exePath?: string | null;
}

export interface ShortcutUnlinkResult {
	ok: boolean;
	shortcutAppId?: number;
	steamAppId?: string;
	error?: string;
}

/**
 * Fully unlink one non-Steam shortcut. A link writes several recovery aliases
 * (shortcut ID, title, executable and executable stem), so unlinking only the
 * exact shortcut key is insufficient and can cause a later partial relink.
 */
export async function unlinkShortcutFromSteam(options: ShortcutUnlinkOptions): Promise<ShortcutUnlinkResult> {
	const shortcutAppId = normalizedShortcutAppId(options.shortcutAppId);
	if (!shortcutAppId) return { ok: false, error: 'invalid_shortcut_id' };

	const app = getShortcutAppById(shortcutAppId);
	const exePath = String(options.exePath || readShortcutOverviewField(
		app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
	) || '').trim();
	const steamAppId = String(options.steamAppId
		|| findMappingForShortcut(shortcutAppId, options.title, exePath)
		|| '').trim();

	// Cancel durable retries first. Otherwise a queued link could finish after
	// the user explicitly unlinked the shortcut and recreate the mapping.
	cancelPendingLinkJobs(shortcutAppId, options.title);

	// Suppress the automatic modal while the transactional removal is in flight.
	// A later explicit Link/Save clears this state centrally in linking.ts.
	dismissShortcut(shortcutAppId);
	const removed = await removeShortcutMappingsChecked({
		shortcutAppId,
		title: options.title,
		exePath,
		steamAppId,
	});
	if (!removed) {
		undismissShortcut(shortcutAppId);
		return { ok: false, shortcutAppId, steamAppId, error: 'mapping_remove_failed' };
	}

	clearArtworkSaved(shortcutAppId);
	try {
		const apps = (window as any).SteamClient?.Apps;
		if (typeof apps?.ClearCustomArtworkForApp === 'function') {
			for (let slot = 0; slot < 5; slot += 1) {
				try { apps.ClearCustomArtworkForApp(shortcutAppId, slot); } catch {}
			}
		}
		// Preserve the last valid shortcut icon. Earlier builds blanked it here and
		// then deleted the backing _icon file, so a transient icon-download failure
		// during relink left the game permanently iconless.
		await clearArtworkExceptIconBackend({ shortcut_app_id: String(shortcutAppId) }).catch((_error: unknown): void => {});
	} catch (error) {
		backendLog(`Unlink artwork cleanup failed for ${shortcutAppId}: ${error}`);
	}

	try { shortcutRuntimeHost().resetLibraryInjection?.(true, options.doc || undefined); } catch {}
	backendLog(`Shortcut ${shortcutAppId} fully unlinked from Steam AppID ${steamAppId || 'unknown'}.`);
	return { ok: true, shortcutAppId, steamAppId };
}

export interface BulkUnlinkResult {
	ok: boolean;
	total: number;
	unlinked: number;
	failed: number;
}

/** Explicit global reset from Settings. Every current shortcut is dismissed so
 * startup/autodetection cannot resurrect it; only shortcuts that actually have
 * a GameBridge mapping have their managed artwork removed. */
export async function unlinkAllShortcutsFromSteam(doc?: Document | null): Promise<BulkUnlinkResult> {
	cancelAllPendingLinkJobs();
	const records = getAllShortcutRecords();
	for (const record of records) dismissShortcut(record.id);

	let unlinked = 0;
	let failed = 0;
	for (const record of records) {
		const steamAppId = String(findMappingForShortcut(record.id, record.title) || '').trim();
		const hasMapping = /^\d+$/.test(steamAppId);
		const hasManagedArtwork = hasManagedArtworkSaved(record.id);
		// A clean plugin ZIP can remove mappings.json while Steam's custom artwork
		// and GameBridge's ownership marker remain outside the plugin directory.
		// Explicit "Unlink all" is allowed to clean those orphaned managed assets,
		// but never arbitrary user artwork without a GameBridge marker.
		if (!hasMapping && !hasManagedArtwork) continue;
		const result = await unlinkShortcutFromSteam({
			doc,
			shortcutAppId: record.id,
			title: record.title,
			steamAppId: hasMapping ? steamAppId : '',
		});
		if (result.ok) unlinked += 1;
		else {
			failed += 1;
			// A global reset must remain globally suppressed even if one backend
			// mutation fails and the single-item helper restores eligibility.
			dismissShortcut(record.id);
		}
	}
	return { ok: failed === 0, total: records.length, unlinked, failed };
}

