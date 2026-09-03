import { backendLog } from '../../api/backend';
import { getMappedShortcuts } from '../../steam/shortcuts';
import { applyOfficialShortcutIcon, artworkAlreadySaved, spoofArtwork } from './artwork';

let syncArtworkInProgress = false;

/**
 * Automatically checks all currently mapped shortcuts and downloads/applies
 * missing covers and icons to Steam's native grid cache.
 */
export async function syncMissingArtworkForMappedShortcuts(): Promise<void> {
	if (syncArtworkInProgress) return;
	syncArtworkInProgress = true;
	try {
		const shortcuts = getMappedShortcuts();
		for (const shortcut of shortcuts) {
			const steamAppId = String(shortcut.steamAppId || '').trim();
			if (!steamAppId || !/^\d+$/.test(steamAppId)) continue;
			if (!artworkAlreadySaved(shortcut.id, steamAppId)) {
				const title = shortcut.title || '';
				try {
					await spoofArtwork(shortcut.id, steamAppId, title, false);
					await applyOfficialShortcutIcon(shortcut.id, steamAppId, false);
				} catch (error) {
					backendLog(`Sync missing artwork failed for ${shortcut.id} (${title}): ${error}`);
				}
			}
		}
	} finally {
		syncArtworkInProgress = false;
	}
}
