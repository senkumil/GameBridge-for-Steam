import { backendLog } from '../../api/backend';
import { findMappingForShortcut, getAllShortcutRecords } from './registry';
import { readShortcutManifest, saveShortcutManifest, createInitialManifest } from './transaction';
import { spoofArtwork, applyOfficialShortcutIcon } from '../library/artwork';
import { shortcutRuntimeHost } from './host';
import { isLegacyGame } from '../library/legacy-games';
import { getGameData } from '../../core/game-data';

let isReconciling = false;
let reconciliationTimer: ReturnType<typeof setTimeout> | null = null;

export interface ReconciliationStatus {
	totalChecked: number;
	repaired: number;
	healthy: number;
}

/**
 * Reconciles a single mapped shortcut. Checks if any slots are missing or degraded,
 * and repairs only those specific slots without disturbing the existing valid artwork or identity.
 */
export async function reconcileShortcut(
	shortcutAppId: number,
	steamAppId: string,
): Promise<boolean> {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648 || !/^\d+$/.test(steamAppId)) {
		return false;
	}

	const manifest = readShortcutManifest(shortcutAppId) || createInitialManifest();
	const needsRepair =
		manifest.portrait.status !== 'READY' ||
		manifest.hero.status !== 'READY' ||
		manifest.logo.status !== 'READY' ||
		manifest.wide.status !== 'READY' ||
		manifest.icon.status !== 'READY';

	if (!needsRepair) {
		return true;
	}

	backendLog(`[Reconciler] Healing shortcut ${shortcutAppId} -> ${steamAppId}`);

	try {
		const data = await getGameData(steamAppId).catch((): null => null);
		const legacy = isLegacyGame(steamAppId, data || undefined);

		const [artResult, iconResult] = await Promise.all([
			spoofArtwork(shortcutAppId, steamAppId, data?.name || '', false, legacy).catch((): null => null),
			applyOfficialShortcutIcon(shortcutAppId, steamAppId, false).catch((): boolean => false),
		]);

		if (artResult) {
			const slots = new Set(artResult.slots || []);
			manifest.portrait.status = slots.has(0) ? 'READY' : manifest.portrait.status;
			manifest.hero.status = slots.has(1) ? 'READY' : manifest.hero.status;
			manifest.logo.status = slots.has(2) ? 'READY' : manifest.logo.status;
			manifest.wide.status = slots.has(3) ? 'READY' : manifest.wide.status;
		}
		if (iconResult) {
			manifest.icon.status = 'READY';
		}

		saveShortcutManifest(shortcutAppId, manifest);
		return Boolean(artResult?.complete && iconResult);
	} catch (error) {
		backendLog(`[Reconciler] Failed healing ${shortcutAppId}: ${error}`);
		return false;
	}
}

/**
 * Performs a self-healing pass over all currently mapped shortcuts in the background.
 * Runs non-blockingly and throttles requests to avoid overloading Steam or network APIs.
 */
export async function runDurableReconciliation(): Promise<ReconciliationStatus> {
	if (isReconciling) {
		return { totalChecked: 0, repaired: 0, healthy: 0 };
	}

	isReconciling = true;
	const status: ReconciliationStatus = { totalChecked: 0, repaired: 0, healthy: 0 };

	try {
		const records = getAllShortcutRecords();
		const mappedShortcuts: { id: number; steamAppId: string }[] = [];

		for (const record of records) {
			const steamAppId = findMappingForShortcut(record.id);
			if (steamAppId) {
				mappedShortcuts.push({ id: record.id, steamAppId });
			}
		}

		status.totalChecked = mappedShortcuts.length;

		for (const item of mappedShortcuts) {
			const success = await reconcileShortcut(item.id, item.steamAppId);
			if (success) status.healthy += 1;
			else status.repaired += 1;

			// Throttle between shortcuts to keep CEF thread responsive
			await new Promise(resolve => setTimeout(resolve, 300));
		}

		if (status.repaired > 0) {
			shortcutRuntimeHost().refreshLibraryArtwork?.(0);
		}
	} catch (error) {
		backendLog('[Reconciler] Background reconciliation encountered error: ' + error);
	} finally {
		isReconciling = false;
	}

	return status;
}

/**
 * Schedules a self-healing run with a delay (e.g. 5 seconds after startup/navigation).
 */
export function scheduleReconciliation(delayMs = 5000): void {
	if (reconciliationTimer) {
		clearTimeout(reconciliationTimer);
	}
	reconciliationTimer = setTimeout(() => {
		reconciliationTimer = null;
		void runDurableReconciliation();
	}, delayMs);
}
