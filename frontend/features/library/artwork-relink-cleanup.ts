import { clearArtworkBackend, clearArtworkSlotsBackend, backendLog } from '../../api/backend';
import { supersedeArtworkApplications } from './artwork';

function clearRelinkOwnershipStorage(shortcutAppId: number): void {
	try {
		for (let i = localStorage.length - 1; i >= 0; i--) {
			const key = localStorage.key(i);
			if (key && (key.startsWith(`gdl_art_${shortcutAppId}`) || key.startsWith(`gdl_logo_pos_${shortcutAppId}`) || key.startsWith(`gdl_comm_art_${shortcutAppId}`))) {
				localStorage.removeItem(key);
			}
		}
	} catch {}
}

/** Invalidate ownership/generations without blanking artwork that is currently
 * visible. The replacement batch can overwrite those slots in-place. */
export async function prepareShortcutArtworkForAppIdChange(shortcutAppId: number): Promise<void> {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return;
	await supersedeArtworkApplications(shortcutAppId);
	clearRelinkOwnershipStorage(shortcutAppId);
}

/** Remove only slots that the replacement AppID could not supply. Successful
 * Hero/Logo files stay mounted throughout the relink, eliminating blank-frame
 * transitions while still preventing stale artwork from leaking across games. */
export async function clearUnreplacedShortcutArtwork(
	shortcutAppId: number,
	replacementSlots: Iterable<number>,
	iconApplied: boolean,
): Promise<void> {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return;
	const replacements = new Set(Array.from(replacementSlots, Number));
	const staleSlots = [0, 1, 2, 3].filter(slot => !replacements.has(slot));
	if (!iconApplied) staleSlots.push(4);
	if (staleSlots.length === 0) return;
	try {
		await clearArtworkSlotsBackend({ request_json: JSON.stringify({ shortcut_app_id: shortcutAppId, slots: staleSlots }) });
	} catch (error) {
		backendLog(`Backend stale-slot cleanup failed for ${shortcutAppId}: ${String(error)}`);
	}
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.ClearCustomArtworkForApp !== 'function') return;
	await Promise.all(staleSlots.map(slot => Promise.race([
		Promise.resolve(apps.ClearCustomArtworkForApp(shortcutAppId, slot)).catch(() => {}),
		new Promise<void>(resolve => setTimeout(resolve, 4000)),
	])));
}

/** Remove all managed Steam visuals before assigning a different AppID. */
export async function clearShortcutArtworkForAppIdChange(shortcutAppId: number): Promise<void> {
	if (!Number.isFinite(shortcutAppId) || shortcutAppId < 2147483648) return;
	await supersedeArtworkApplications(shortcutAppId);
	clearRelinkOwnershipStorage(shortcutAppId);
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
