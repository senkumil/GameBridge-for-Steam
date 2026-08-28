import type { ShortcutLinkResult, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getCanonicalGameData, getGameData } from '../../core/game-data';
import { shortcutMappingKey, updateMappingsChecked } from '../../core/mappings';
import { gdlText } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName, getShortcutAppById, readShortcutOverviewField, shortcutExecutableIdentity } from '../../steam/shortcuts';
import { applyOfficialShortcutIcon, clearLibraryAssetCaches, resolveShortcutIdAfterRename, spoofArtwork, type ArtworkApplyResult } from '../library/artwork';
import { saveLinkedGameNote } from './linked-notes';
import { shortcutRuntimeHost } from './host';
import { isShortcutDismissed, undismissShortcut } from './dismissed';
import { getAllShortcutRecords } from './registry';
import { rememberShortcutSteamAppId } from './link-history';

let shortcutIdentityMutationDepth = 0;

export function isShortcutIdentityMutationInProgress(): boolean {
	return shortcutIdentityMutationDepth > 0;
}

export type ShortcutLinkStatus = (message: string, color?: string) => void;

/**
 * Steam adds shortcuts picked from its "Add a Non-Steam Game" list
 * asynchronously. The confirmation dialog can be accepted before that entry
 * is visible through appStore, so resolve it over a short bounded window. A
 * stale pre-rename ID must fall through to title/executable recovery.
 */
async function resolveShortcutForLink(
	doc: Document | null | undefined,
	title: string,
	initialId?: number | null,
	executableHint = '',
): Promise<number | null> {
	const waits = [0, 100, 250, 500, 900, 1500, 2500];
	const expectedExecutable = shortcutExecutableIdentity(executableHint);
	for (const wait of waits) {
		if (wait) await new Promise(resolve => setTimeout(resolve, wait));
		if (initialId) {
			const exact = Number(initialId);
			if (Number.isFinite(exact) && exact >= 2147483648 && getShortcutAppById(exact)) return exact;
		}
		const routed = doc ? Number(findActiveShortcutAppId(doc, title) || 0) : 0;
		if (routed >= 2147483648 && getShortcutAppById(routed)) return routed;
		const byName = findShortcutAppIdByName(title);
		if (byName && getShortcutAppById(byName)) return byName;
		if (expectedExecutable) {
			const executableMatches = getAllShortcutRecords().filter(record => shortcutExecutableIdentity(readShortcutOverviewField(
				record.app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
			)) === expectedExecutable);
			if (executableMatches.length === 1) return executableMatches[0].id;
		}
	}
	return null;
}

// Compatibility helpers retained for callers from older builds. Linking may
// update the display name, but it never alters executable, start directory or
// launch options.
export function mergeNoLauncherOption(existing: string): string { return String(existing || '').trim(); }
export function hasNoLauncherOption(value: string): boolean { return /(^|\s)-nolauncher(?=\s|$)/i.test(String(value || '').trim()); }
export function shouldAutoApplyNoLauncher(_steamAppId: string): boolean { return false; }
export function applyNoLauncherOption(_shortcutAppId: number, _fallbackOptions = '', _automatic = false): boolean { return false; }

export interface ShortcutIdentitySyncResult {
	shortcutAppId: number;
	officialName: string;
	nameApplied: boolean;
	nameReady: boolean;
	iconApplied: boolean;
	trackingApplied: boolean;
	noLauncherConfigured: boolean;
	artwork: ArtworkApplyResult;
	complete: boolean;
}

/** Apply the official display name before assets and mapping are committed.
 *
 * Steam may regenerate its local non-Steam AppID after SetShortcutName. The
 * executable/start directory/launch options are deliberately left untouched;
 * the renamed shortcut is re-resolved by exact executable identity before any
 * artwork or mapping is written.
 */
export async function synchronizeShortcutOfficialIdentity(options: {
	shortcutAppId: number;
	currentTitle: string;
	steamAppId: string;
	data?: SteamGameData | null;
	canonicalName?: string;
	trackingExecutable?: string;
	trackingStartDir?: string;
	skipLauncher?: boolean;
	existingLaunchOptions?: string;
	onIdentityResolved?: (shortcutAppId: number, officialName: string, relatedShortcutAppIds: number[]) => void;
	refreshLibrary?: boolean;
}): Promise<ShortcutIdentitySyncResult> {
	const originalShortcutId = options.shortcutAppId;
	if (!Number.isFinite(originalShortcutId) || originalShortcutId < 2147483648) {
		throw new Error('refusing_to_modify_native_steam_app');
	}
	let shortcutAppId = originalShortcutId;
	const data = options.data || await getGameData(options.steamAppId);
	const officialName = String(options.canonicalName || data?.name || options.currentTitle).trim();
	shortcutIdentityMutationDepth += 1;
	try {
		const staleIds = new Set<number>([originalShortcutId]);
		const trackingApplied = false;
		const noLauncherConfigured = false;
		let nameApplied = false;
		let nameReady = false;

		const shortcutBeforeRename = getShortcutAppById(shortcutAppId);
		const currentName = String(shortcutBeforeRename?.display_name
			|| shortcutBeforeRename?.m_strDisplayName
			|| shortcutBeforeRename?.strDisplayName
			|| options.currentTitle
			|| '').trim();
		const expectedExecutable = readShortcutOverviewField(
			shortcutBeforeRename, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
		);
		const nameNeedsUpdate = Boolean(officialName && officialName !== currentName);
		if (!nameNeedsUpdate) {
			nameReady = Boolean(officialName);
		} else {
			const apps = (window as any).SteamClient?.Apps;
			if (typeof apps?.SetShortcutName === 'function') {
				const idsBeforeRename = new Set(getAllShortcutRecords().map(record => record.id));
				try {
					await Promise.resolve(apps.SetShortcutName(shortcutAppId, officialName));
					nameApplied = true;
					shortcutAppId = await resolveShortcutIdAfterRename(
						officialName, shortcutAppId, idsBeforeRename, expectedExecutable,
					);
					staleIds.add(shortcutAppId);
					const renamedShortcut = getShortcutAppById(shortcutAppId);
					const renamedTitle = String(renamedShortcut?.display_name
						|| renamedShortcut?.m_strDisplayName
						|| renamedShortcut?.strDisplayName
						|| '').trim();
					nameReady = renamedTitle === officialName;
					backendLog(`Shortcut ${originalShortcutId} rename ${nameReady ? 'confirmed' : 'pending'} as "${officialName}" (resolved ID ${shortcutAppId}).`);
				} catch (error) {
					backendLog('Official shortcut rename failed: ' + error);
				}
			}
		}

		let artwork: ArtworkApplyResult = { complete: false, slots: [], missing: ['not_attempted'], communitySlots: [] };
		let iconApplied = false;
		for (let attempt = 0; attempt < 3; attempt++) {
			if (attempt > 0) {
				clearLibraryAssetCaches();
				await new Promise(resolve => setTimeout(resolve, 250 * attempt));
			}
			artwork = await spoofArtwork(shortcutAppId, options.steamAppId, officialName || options.currentTitle, false);
			iconApplied = await applyOfficialShortcutIcon(shortcutAppId, options.steamAppId, false);
			if (artwork.complete && iconApplied) break;
			backendLog(`Incomplete link resources for ${shortcutAppId}; retry ${attempt + 1}/3 (artwork=${artwork.complete}, icon=${iconApplied})`);
		}

		const complete = Boolean(nameReady && iconApplied && artwork.complete);
		if (complete) {
			// An explicit unlink wins over any link job that was already running.
			// Manual link entry points clear the dismissal before starting; therefore
			// seeing it here means the user cancelled/unlinked during this operation.
			if (isShortcutDismissed(shortcutAppId)) throw new Error('link_cancelled_by_unlink');
			// A concrete shortcut owns exactly one source-of-truth mapping. Title,
			// executable and launch-fingerprint aliases are deliberately not written:
			// two different library entries may share any of those values.
			const mappingSet: Record<string, string> = { [shortcutMappingKey(shortcutAppId)]: options.steamAppId };
			const mappingRemove = Array.from(staleIds)
				.filter(staleId => staleId !== shortcutAppId)
				.map(staleId => shortcutMappingKey(staleId));
			if (!(await updateMappingsChecked({ set: mappingSet, remove: mappingRemove }))) {
				throw new Error('mapping_identity_update_failed');
			}
			rememberShortcutSteamAppId(shortcutAppId, options.steamAppId);
			try { options.onIdentityResolved?.(shortcutAppId, officialName, Array.from(staleIds)); }
			catch (error) { backendLog('Post-link library handoff failed: ' + error); }
		}

		if (options.refreshLibrary !== false) shortcutRuntimeHost().refreshLibraryArtwork?.(shortcutAppId);
		return {
			shortcutAppId, officialName, nameApplied, nameReady, iconApplied,
			trackingApplied, noLauncherConfigured, artwork, complete,
		};
	} finally {
		shortcutIdentityMutationDepth = Math.max(0, shortcutIdentityMutationDepth - 1);
	}
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
	shortcutExecutable?: string;
	onStatus?: ShortcutLinkStatus;
	refreshLibrary?: boolean;
}): Promise<ShortcutLinkResult> {
	const steamAppId = String(options.steamAppId || '').trim();
	const title = String(options.title || '').trim();
	const onStatus = options.onStatus || (() => {});
	if (!/^\d+$/.test(steamAppId)) return { ok: false, error: 'invalid_appid' };
	shortcutIdentityMutationDepth += 1;
	try {
		onStatus(gdlText('verifying_steam', 'Verifying on Steam...'), '#8f98a0');
		const data = await getGameData(steamAppId);
		if (!data) {
			onStatus(gdlText('appid_not_found', 'AppID {id} was not found on Steam.', { id: steamAppId }), '#ff6b6b');
			return { ok: false, error: 'appid_not_found' };
		}

		try {
			let shortcutAppId = await resolveShortcutForLink(
				options.doc, title, options.shortcutAppId, options.shortcutExecutable || options.trackingExecutable || '',
			);
			if (!shortcutAppId) throw new Error('shortcut_not_ready');
			const aliases = new Set<string>();
			const canonicalData = await getCanonicalGameData(steamAppId);
			if (!canonicalData?.name) {
				onStatus(gdlText('link_incomplete_retrying', 'The link is not complete yet. GameBridge will retry until name, icon and artwork are ready.'), '#e5ad37');
				return { ok: false, data, shortcutAppId, aliases: Array.from(aliases), error: 'canonical_data_unavailable' };
			}
			onStatus(gdlText('linked_updating', '✓ Match verified for "{name}". Applying name, icon and artwork...', { name: data.name }), '#5ba32b');

			const synced = await synchronizeShortcutOfficialIdentity({
				shortcutAppId,
				currentTitle: title,
				steamAppId,
				data,
				canonicalName: String(canonicalData.name),
				trackingExecutable: options.trackingExecutable,
				trackingStartDir: options.trackingStartDir,
				skipLauncher: options.skipLauncher,
				existingLaunchOptions: options.existingLaunchOptions,
				refreshLibrary: options.refreshLibrary,
			});
			shortcutAppId = synced.shortcutAppId;
			aliases.add(shortcutMappingKey(shortcutAppId));

			if (!synced.complete) {
				onStatus(gdlText('link_incomplete_retrying', 'The link is not complete yet. GameBridge will retry until name, icon and artwork are ready.'), '#e5ad37');
				return {
					ok: false, data, shortcutAppId, aliases: Array.from(aliases), error: 'setup_incomplete',
					setup: {
						nameReady: synced.nameReady,
						iconApplied: synced.iconApplied,
						artworkComplete: synced.artwork.complete,
						missingArtwork: synced.artwork.missing,
						communityArtwork: synced.artwork.communitySlots,
					},
				};
			}

			undismissShortcut(shortcutAppId);
			let finalMessage = gdlText('linked_official', '✓ Linked to "{name}". Official name, icon and artwork updated.', { name: synced.officialName });
			if (synced.trackingApplied) finalMessage += gdlText('tracking_executable_updated', ' Steam will now launch the long-running game executable so playtime can be tracked.');
			if (shouldAutoApplyNoLauncher(steamAppId) && synced.noLauncherConfigured) finalMessage += ' -nolauncher.';
			if (await saveLinkedGameNote(synced.officialName || title, data, steamAppId)) finalMessage += gdlText('local_note_updated', ' Local note updated.');
			onStatus(finalMessage, '#5ba32b');
			if (options.refreshLibrary !== false) shortcutRuntimeHost().resetLibraryInjection?.(true, options.doc);
			return {
				ok: true, data, shortcutAppId, aliases: Array.from(aliases),
				setup: {
					nameReady: true, iconApplied: true, artworkComplete: true,
					missingArtwork: synced.artwork.missing,
					communityArtwork: synced.artwork.communitySlots,
				},
			};
		} catch (e) {
			backendLog('Save error: ' + e);
			onStatus(gdlText('save_failed', 'Could not complete the link. It remains unlinked and can be retried.'), '#ff6b6b');
			return { ok: false, data, error: String(e) };
		}
	} finally {
		shortcutIdentityMutationDepth = Math.max(0, shortcutIdentityMutationDepth - 1);
	}
}
