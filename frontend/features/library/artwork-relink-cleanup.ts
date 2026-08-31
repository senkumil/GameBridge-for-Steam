import { clearArtworkBackend, backendLog } from '../../api/backend';
import { supersedeArtworkApplications } from './artwork';

/** Remove all managed Steam visuals before assigning a different AppID. */
export async function clearShortcutArtworkForAppIdChange(shortcutAppId: number): Promise<void> {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return;
	await supersedeArtworkApplications(shortcutAppId);
	try {
		// The backend removes the persisted icon/grid files. Await it so a slow
		// cleanup cannot delete the replacement icon after relinking finishes.
		await clearArtworkBackend({ shortcut_app_id: String(shortcutAppId) });
	} catch (error) {
		backendLog(`Backend artwork cleanup failed for AppID change on ${shortcutAppId}: ${String(error)}`);
	}
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.ClearCustomArtworkForApp !== 'function') return;
	const clearSlot = (slot: number): Promise<void> => new Promise(resolve => {
		const timer = setTimeout(resolve, 4000);
		try {
			Promise.resolve(apps.ClearCustomArtworkForApp(shortcutAppId, slot))
				.catch(() => {})
				.finally(() => { clearTimeout(timer); resolve(); });
		} catch { clearTimeout(timer); resolve(); }
	});
	await Promise.all(Array.from({ length: 5 }, (_, slot) => clearSlot(slot)));
	// Steam can resolve the bridge promise just before its internal artwork cache
	// publishes the clear. Keep the shortcut lock across that tiny commit window.
	await new Promise(resolve => setTimeout(resolve, 100));
}
