import type { ShortcutLinkResult, SteamGameData } from '../../domain/types';
import { backendLog, neutralizeSteamAppIdFileBackend } from '../../api/backend';
import { getCanonicalGameData, getGameData } from '../../core/game-data';
import { shortcutMappingKey, updateMappingsChecked } from '../../core/mappings';
import { gdlText } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName, getShortcutAppById, readShortcutOverviewField, shortcutExecutableIdentity } from '../../steam/shortcuts';
import {
	applyOfficialShortcutIcon, getModernLibraryAssets, invalidateLibraryAssetCaches,
	refreshModernLibraryAssets, resolveShortcutIdAfterRename, spoofArtwork, type ArtworkApplyResult,
} from '../library/artwork';
import { clearShortcutArtworkForAppIdChange } from '../library/artwork-relink-cleanup';
import { isLegacyGame } from '../library/legacy-games';
import { invalidateLinkedGameResourceCaches } from '../library/resource-cache';
import { clearLinkedGameNote } from './linked-notes';
import { shortcutRuntimeHost } from './host';
import { isShortcutDismissed, undismissShortcut } from './dismissed';
import { findMappingForShortcut, getAllShortcutRecords, refreshShortcutRecordsFromBackend } from './registry';
import { rememberOriginalShortcutTitle, rememberShortcutSteamAppId } from './link-history';
import { getOptimalLauncherSkipArg, hasNoLauncherOption, removeIncompatibleLauncherBypass, shouldAutoApplyNoLauncher } from './launcher-bypass';
import {
	type LinkTransaction, type LinkResourceManifest, type ResourceStatus,
	saveShortcutManifest, clearShortcutManifest, createLinkTransaction,
} from './transaction';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(errorCode)), timeoutMs);
		promise.then(
			value => { clearTimeout(timer); resolve(value); },
			error => { clearTimeout(timer); reject(error); },
		);
	});
}

export interface OrchestratorLinkOptions {
	doc?: Document | null;
	title: string;
	shortcutAppId?: number | null;
	steamAppId: string;
	skipLauncher?: boolean;
	existingLaunchOptions?: string;
	trackingExecutable?: string;
	trackingStartDir?: string;
	shortcutExecutable?: string;
	onStatus?: (message: string, color?: string) => void;
	onPhase?: (phase: 'identity' | 'assets') => void;
	refreshLibrary?: boolean;
	repairResources?: boolean;
	assetTimeoutMs?: number;
	deferAssetSync?: boolean;
	metadataTimeoutMs?: number;
	canonicalNameHint?: string;
	clearStaleArtwork?: boolean;
}

export class LinkOrchestrator {
	/**
	 * Step 1: Resolve the concrete Steam non-Steam Shortcut ID.
	 * Handles newly added shortcuts, post-rename regeneration, and executable identity matching.
	 */
	static async resolveIdentity(
		tx: LinkTransaction,
		options: OrchestratorLinkOptions,
		canonicalName: string,
	): Promise<number> {
		tx.phase = 'resolving_identity';
		const doc = options.doc;
		const title = options.title;
		const initialId = options.shortcutAppId || tx.initialShortcutAppId;
		const executableHint = options.shortcutExecutable || options.trackingExecutable || '';

		const waits = [0, 100, 250, 500, 900, 1500, 2500];
		await refreshShortcutRecordsFromBackend().catch((): void => {});
		const expectedExecutable = shortcutExecutableIdentity(executableHint);

		for (const wait of waits) {
			if (!tx.isCurrent()) throw new Error('transaction_aborted');
			if (wait) await new Promise(resolve => setTimeout(resolve, wait));
			if (wait >= 900) await refreshShortcutRecordsFromBackend().catch((): void => {});
			if (initialId) {
				const exact = Number(initialId);
				if (Number.isFinite(exact) && exact >= 2147483648 && getShortcutAppById(exact)) {
					tx.resolvedShortcutAppId = exact;
					return exact;
				}
			}
			const routed = doc ? Number(findActiveShortcutAppId(doc, title) || 0) : 0;
			if (routed >= 2147483648 && getShortcutAppById(routed)) {
				tx.resolvedShortcutAppId = routed;
				return routed;
			}
			if (expectedExecutable) {
				const executableMatches = getAllShortcutRecords().filter(record => shortcutExecutableIdentity(readShortcutOverviewField(
					record.app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
				)) === expectedExecutable);
				if (executableMatches.length === 1) {
					tx.resolvedShortcutAppId = executableMatches[0].id;
					return executableMatches[0].id;
				}
				const regenerated = executableMatches.find(record => record.id !== Number(initialId || 0)
					&& String(record.title || '').trim() === canonicalName);
				if (regenerated) {
					tx.resolvedShortcutAppId = regenerated.id;
					return regenerated.id;
				}
				if (executableMatches.length > 0) {
					tx.resolvedShortcutAppId = executableMatches[0].id;
					return executableMatches[0].id;
				}
			}
			const byName = findShortcutAppIdByName(title);
			if (byName && getShortcutAppById(byName)) {
				tx.resolvedShortcutAppId = byName;
				return byName;
			}
		}

		if (initialId) {
			const exact = Number(initialId);
			if (Number.isFinite(exact) && exact >= 2147483648) {
				tx.resolvedShortcutAppId = exact;
				return exact;
			}
		}
		const routedFallback = doc ? Number(findActiveShortcutAppId(doc, title) || 0) : 0;
		if (routedFallback >= 2147483648) {
			tx.resolvedShortcutAppId = routedFallback;
			return routedFallback;
		}
		const byNameFallback = findShortcutAppIdByName(title);
		if (byNameFallback && byNameFallback >= 2147483648) {
			tx.resolvedShortcutAppId = byNameFallback;
			return byNameFallback;
		}

		throw new Error('shortcut_not_ready');
	}

	/**
	 * Step 2: Validate the target candidate against Steam metadata.
	 * Legacy/delisted AppIDs fall back gracefully without blocking the pipeline.
	 */
	static async validateCandidate(
		tx: LinkTransaction,
		options: OrchestratorLinkOptions,
	): Promise<{ data: SteamGameData; canonicalName: string; localizedData: SteamGameData | null }> {
		tx.phase = 'validating';
		const steamAppId = tx.targetSteamAppId;
		const title = options.title;

		const metadataTimeoutMs = Math.min(6000, Math.max(1200, Number(options.metadataTimeoutMs) || 6000));
		const [localizedData, canonicalData] = await Promise.all([
			withTimeout(getGameData(steamAppId), metadataTimeoutMs, 'game_data_timeout').catch((): null => null),
			withTimeout(getCanonicalGameData(steamAppId), metadataTimeoutMs, 'canonical_data_timeout').catch((): null => null),
		]);

		let data = localizedData;
		if (!data) {
			data = {
				steam_appid: Number(steamAppId),
				name: canonicalData?.name || options.canonicalNameHint || title,
				header_image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`,
				short_description: '',
				is_delisted: canonicalData?.is_delisted === true,
			};
		}
		const canonicalName = String(canonicalData?.name || data?.name || options.canonicalNameHint || title).trim();
		return { data, canonicalName, localizedData };
	}

	/**
	 * Step 3: Mutate shortcut identity in Steam Client.
	 * Applies tracking executable/start dir, launcher bypass, and renames with regeneration guard.
	 */
	static async mutateShortcutIdentity(
		tx: LinkTransaction,
		options: OrchestratorLinkOptions,
		data: SteamGameData,
		canonicalName: string,
	): Promise<{
		resolvedShortcutId: number;
		officialName: string;
		nameReady: boolean;
		trackingApplied: boolean;
		noLauncherConfigured: boolean;
		staleIds: Set<number>;
	}> {
		tx.phase = 'mutating_identity';
		let shortcutAppId = tx.resolvedShortcutAppId;
		const originalShortcutId = tx.initialShortcutAppId;
		const staleIds = new Set<number>([originalShortcutId, shortcutAppId]);
		const officialName = String(canonicalName || data.name || options.title).trim();

		const apps = (window as any).SteamClient?.Apps;
		let trackingApplied = false;
		let noLauncherConfigured = false;
		let nameApplied = false;
		let nameReady = false;

		if (options.trackingExecutable && typeof apps?.SetShortcutExe === 'function') {
			try {
				await withTimeout(Promise.resolve(apps.SetShortcutExe(shortcutAppId, options.trackingExecutable)), 5000, 'shortcut_exe_timeout');
				trackingApplied = true;
			} catch (error) {
				backendLog(`Tracking executable application failed for ${shortcutAppId}: ${error}`);
			}
		}

		if (options.trackingStartDir && typeof apps?.SetShortcutStartDir === 'function') {
			try {
				await withTimeout(Promise.resolve(apps.SetShortcutStartDir(shortcutAppId, options.trackingStartDir)), 5000, 'shortcut_startdir_timeout');
			} catch {}
		}

		const skipArg = getOptimalLauncherSkipArg(tx.targetSteamAppId);
		if (typeof apps?.SetShortcutLaunchOptions === 'function') {
			try {
				const currentLaunch = (options.existingLaunchOptions || '').trim();
				if (skipArg) {
					if (!currentLaunch.includes(skipArg)) {
						const updatedLaunch = currentLaunch ? `${currentLaunch} ${skipArg}` : skipArg;
						await withTimeout(Promise.resolve(apps.SetShortcutLaunchOptions(shortcutAppId, updatedLaunch)), 5000, 'shortcut_launch_timeout');
						noLauncherConfigured = true;
					}
				} else if (hasNoLauncherOption(currentLaunch)) {
					const cleanedLaunch = removeIncompatibleLauncherBypass(currentLaunch, tx.targetSteamAppId);
					await withTimeout(Promise.resolve(apps.SetShortcutLaunchOptions(shortcutAppId, cleanedLaunch)), 5000, 'shortcut_launch_timeout');
				}
			} catch {}
		}

		const shortcutBeforeRename = getShortcutAppById(shortcutAppId);
		const currentName = String(shortcutBeforeRename?.display_name
			|| shortcutBeforeRename?.m_strDisplayName
			|| shortcutBeforeRename?.strDisplayName
			|| options.title
			|| '').trim();

		if (currentName) {
			rememberOriginalShortcutTitle(originalShortcutId, currentName);
		}

		const expectedExecutable = readShortcutOverviewField(
			shortcutBeforeRename, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
		);
		const nameNeedsUpdate = Boolean(officialName && officialName !== currentName);

		if (!nameNeedsUpdate) {
			nameReady = Boolean(officialName);
		} else if (typeof apps?.SetShortcutName === 'function') {
			const idsBeforeRename = new Set(getAllShortcutRecords().map(record => record.id));
			try {
				await withTimeout(Promise.resolve(apps.SetShortcutName(shortcutAppId, officialName)), 6000, 'shortcut_rename_pending');
				nameApplied = true;
				shortcutAppId = await resolveShortcutIdAfterRename(
					officialName, shortcutAppId, idsBeforeRename, expectedExecutable,
				);
				tx.resolvedShortcutAppId = shortcutAppId;
				staleIds.add(shortcutAppId);
				if (currentName) {
					rememberOriginalShortcutTitle(shortcutAppId, currentName);
				}
				const renamedShortcut = getShortcutAppById(shortcutAppId);
				const renamedTitle = String(renamedShortcut?.display_name
					|| renamedShortcut?.m_strDisplayName
					|| renamedShortcut?.strDisplayName
					|| '').trim();
				nameReady = renamedTitle === officialName
					|| (nameApplied && Boolean(getShortcutAppById(shortcutAppId)));
			} catch (error) {
				backendLog('Official shortcut rename error: ' + error);
				if (getShortcutAppById(shortcutAppId)) {
					nameReady = true;
				} else if (String(error).includes('shortcut_rename_pending')) {
					throw error;
				}
			}
		} else {
			nameReady = true;
		}

		return {
			resolvedShortcutId: shortcutAppId,
			officialName,
			nameReady,
			trackingApplied,
			noLauncherConfigured,
			staleIds,
		};
	}

	/**
	 * Step 4: Commit mapping atomically to mappings.json.
	 * Keyed strictly by shortcutAppId to prevent merging duplicate games.
	 */
	static async commitMapping(
		tx: LinkTransaction,
		shortcutAppId: number,
		staleIds: Set<number>,
		options: OrchestratorLinkOptions,
	): Promise<void> {
		tx.phase = 'committing_mapping';
		if (isShortcutDismissed(shortcutAppId)) throw new Error('link_cancelled_by_unlink');

		const mappingSet: Record<string, string> = { [shortcutMappingKey(shortcutAppId)]: tx.targetSteamAppId };
		const mappingRemove = Array.from(staleIds)
			.filter(staleId => staleId !== shortcutAppId)
			.map(staleId => shortcutMappingKey(staleId));

		const mappingUpdated = await withTimeout(
			updateMappingsChecked({ set: mappingSet, remove: mappingRemove }),
			12000,
			'mapping_update_timeout',
		).catch((): boolean => false);

		if (!mappingUpdated) {
			throw new Error('mapping_identity_update_failed');
		}

		rememberShortcutSteamAppId(shortcutAppId, tx.targetSteamAppId);

		const shortcutObj = getShortcutAppById(shortcutAppId);
		const shortcutExe = readShortcutOverviewField(shortcutObj, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath') || options.trackingExecutable || '';
		const shortcutStartDir = readShortcutOverviewField(shortcutObj, 'strShortcutStartDir', 'm_strShortcutStartDir', 'shortcut_start_dir', 'strStartDir') || options.trackingStartDir || '';

		void neutralizeSteamAppIdFileBackend({
			request_json: JSON.stringify({
				exe_path: shortcutExe,
				start_dir: shortcutStartDir,
			}),
		}).catch((): void => {});
	}

	/**
	 * Step 5: Apply artwork, icon, and logo position, updating the resource manifest.
	 */
	static async applyArtworkAndIcons(
		tx: LinkTransaction,
		shortcutAppId: number,
		officialName: string,
		data: SteamGameData,
		options: OrchestratorLinkOptions,
	): Promise<{ artwork: ArtworkApplyResult; iconApplied: boolean }> {
		tx.phase = 'applying_assets';
		if (options.deferAssetSync) {
			return {
				artwork: { complete: false, slots: [], missing: ['deferred'], communitySlots: [] },
				iconApplied: false,
			};
		}

		options.onPhase?.('assets');
		const assetTimeoutMs = Math.min(45_000, Math.max(8_000, Number(options.assetTimeoutMs) || 12_000));
		const artworkResult = await withTimeout(
			spoofArtwork(shortcutAppId, tx.targetSteamAppId, officialName || options.title, Boolean(options.clearStaleArtwork), isLegacyGame(tx.targetSteamAppId, data)),
			assetTimeoutMs,
			'artwork_timeout',
		).catch((): ArtworkApplyResult => ({ complete: false, slots: [], missing: ['timeout'], communitySlots: [] }));
		const iconResult = await withTimeout(
			applyOfficialShortcutIcon(shortcutAppId, tx.targetSteamAppId, Boolean(options.clearStaleArtwork)),
			Math.min(assetTimeoutMs, 8000),
			'icon_timeout',
		).catch((): boolean => false);

		// Update resource manifest
		const manifest: LinkResourceManifest = tx.manifest;
		manifest.steamAppId = tx.targetSteamAppId;
		manifest.shortcutAppId = shortcutAppId;
		const slotsApplied = new Set(artworkResult.slots || []);
		const missing = new Set(artworkResult.missing || []);
		const isTimeout = missing.has('timeout');

		const resolveSlotStatus = (slot: number): ResourceStatus => {
			if (slotsApplied.has(slot)) return 'READY';
			if (isTimeout) return 'FAILED';
			return 'UNAVAILABLE';
		};

		manifest.portrait.status = resolveSlotStatus(0);
		manifest.hero.status = resolveSlotStatus(1);
		manifest.logo.status = resolveSlotStatus(2);
		manifest.wide.status = resolveSlotStatus(3);
		manifest.icon.status = iconResult ? 'READY' : (isTimeout ? 'FAILED' : 'UNAVAILABLE');
		manifest.logoPosition.status = slotsApplied.has(2) ? 'READY' : 'UNAVAILABLE';
		saveShortcutManifest(shortcutAppId, manifest);

		return { artwork: artworkResult, iconApplied: iconResult };
	}

	/**
	 * Main execution pipeline: runs the 7 deterministic steps within a LinkTransaction.
	 */
	static async execute(
		options: OrchestratorLinkOptions,
	): Promise<ShortcutLinkResult> {
		const steamAppId = String(options.steamAppId || '').trim();
		const title = String(options.title || '').trim();
		if (!/^\d+$/.test(steamAppId)) return { ok: false, error: 'invalid_appid' };

		const initialId = Number(options.shortcutAppId || 0);
		const tx = createLinkTransaction(initialId >= 2147483648 ? initialId : 2147483648, steamAppId);
		const onStatus = options.onStatus || ((): void => {});

		try {
			onStatus(gdlText('verifying_steam', 'Verifying on Steam...'), '#8f98a0');

			const previousSteamAppId = initialId ? findMappingForShortcut(initialId) : null;
			const appIdChanged = Boolean(previousSteamAppId && previousSteamAppId !== steamAppId);
			if (appIdChanged) {
				invalidateLinkedGameResourceCaches(
					[steamAppId, previousSteamAppId || ''],
					initialId ? [initialId] : [],
				);
			}

			const assetWarmup = options.deferAssetSync
				? Promise.resolve(null)
				: (appIdChanged ? refreshModernLibraryAssets(steamAppId) : getModernLibraryAssets(steamAppId));
			void assetWarmup.catch((): void => {});

			// Step 2: Validate candidate
			const { data, canonicalName, localizedData } = await this.validateCandidate(tx, options);
			if (!tx.isCurrent()) throw new Error('transaction_aborted');

			// Step 1: Resolve identity
			const resolvedShortcutId = await this.resolveIdentity(tx, options, canonicalName);
			if (!tx.isCurrent()) throw new Error('transaction_aborted');

			onStatus(gdlText('linked_updating', '✓ Match verified for "{name}". Applying name, icon and artwork...', { name: canonicalName || title }), '#5ba32b');
			options.onPhase?.('identity');

			if (options.clearStaleArtwork || appIdChanged) {
				clearShortcutManifest(initialId);
				await clearShortcutArtworkForAppIdChange(initialId);
				if (resolvedShortcutId !== initialId) {
					clearShortcutManifest(resolvedShortcutId);
					await clearShortcutArtworkForAppIdChange(resolvedShortcutId);
				}
				invalidateLibraryAssetCaches([steamAppId]);
			}

			// Step 3: Mutate identity
			const identityResult = await this.mutateShortcutIdentity(tx, options, data, canonicalName);
			if (!tx.isCurrent()) throw new Error('transaction_aborted');

			const finalShortcutId = identityResult.resolvedShortcutId;
			const complete = Boolean(identityResult.nameReady || data.is_delisted === true);

			if (!complete) {
				onStatus(gdlText('link_incomplete_retrying', 'The link is not complete yet. NativeGameLink will retry until name, icon and artwork are ready.'), '#e5ad37');
				tx.phase = 'failed';
				return {
					ok: false,
					data,
					shortcutAppId: finalShortcutId,
					aliases: [shortcutMappingKey(finalShortcutId)],
					error: 'setup_incomplete',
					setup: {
						nameReady: identityResult.nameReady,
						iconApplied: false,
						artworkComplete: false,
						missingArtwork: ['not_attempted'],
						communityArtwork: [],
					},
				};
			}

			// Step 4: Commit mapping
			await this.commitMapping(tx, finalShortcutId, identityResult.staleIds, options);
			if (!tx.isCurrent()) throw new Error('transaction_aborted');

			// Step 5: Apply artwork and icons
			const assetResult = await this.applyArtworkAndIcons(tx, finalShortcutId, identityResult.officialName, data, {
				...options,
				clearStaleArtwork: appIdChanged,
			});
			if (!tx.isCurrent()) throw new Error('transaction_aborted');

			// Step 6: Verify & undismiss
			undismissShortcut(finalShortcutId);
			void clearLinkedGameNote(identityResult.officialName || title).catch((): void => {});

			// Step 7: Publish state
			let finalMessage = gdlText('linked_official', '✓ Linked to "{name}". Official name, icon and artwork updated.', { name: identityResult.officialName });
			if (identityResult.trackingApplied) finalMessage += gdlText('tracking_executable_updated', ' Steam will now launch the long-running game executable so playtime can be tracked.');
			if (shouldAutoApplyNoLauncher(steamAppId) && identityResult.noLauncherConfigured) finalMessage += ' -nolauncher.';
			onStatus(finalMessage, '#5ba32b');

			if (options.refreshLibrary !== false) {
				shortcutRuntimeHost().refreshLibraryArtwork?.(finalShortcutId);
				shortcutRuntimeHost().resetLibraryInjection?.(true, options.doc);
			}

			if (!localizedData) {
				void getGameData(steamAppId).then(lateData => {
					if (!lateData || findMappingForShortcut(finalShortcutId) !== steamAppId) return;
					shortcutRuntimeHost().resetLibraryInjection?.(true, options.doc);
				}).catch((): void => {});
			}

			tx.phase = 'completed';
			tx.completedAt = Date.now();

			return {
				ok: true,
				data,
				shortcutAppId: finalShortcutId,
				aliases: [shortcutMappingKey(finalShortcutId)],
				setup: {
					nameReady: identityResult.nameReady,
					iconApplied: assetResult.iconApplied,
					artworkComplete: assetResult.artwork.complete,
					missingArtwork: assetResult.artwork.missing,
					communityArtwork: assetResult.artwork.communitySlots,
				},
			};
		} catch (e) {
			tx.phase = 'failed';
			tx.error = String(e);
			backendLog('LinkOrchestrator error: ' + e);
			const error = String(e).includes('shortcut_rename_pending') ? 'shortcut_rename_pending' : String(e);
			onStatus(error === 'shortcut_rename_pending'
				? gdlText('shortcut_rename_pending', 'Steam is updating the shortcut identity. NativeGameLink will finish the link in the background without using the previous entry.')
				: gdlText('save_failed', 'Could not complete the link. It remains unlinked and can be retried.'),
				error === 'shortcut_rename_pending' ? '#e5ad37' : '#ff6b6b');
			return { ok: false, error };
		}
	}
}
