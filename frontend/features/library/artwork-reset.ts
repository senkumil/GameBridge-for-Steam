import { backendLog, clearArtworkExceptIconBackend } from '../../api/backend';
import { spoofArtwork, supersedeArtworkApplications, type ArtworkApplyResult } from './artwork';

/** Remove a per-shortcut override and restore NativeGameLink's default artwork. */
export async function resetShortcutArtworkToDefault(
	shortcutAppId: number,
	steamAppId: string,
	gameTitle: string,
): Promise<ArtworkApplyResult> {
	if (!Number.isInteger(shortcutAppId) || shortcutAppId <= 0 || !/^\d+$/.test(steamAppId)) {
		return { complete: false, slots: [], missing: ['invalid_selection'], communitySlots: [] };
	}
	await supersedeArtworkApplications(shortcutAppId, true);
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.ClearCustomArtworkForApp === 'function') {
		for (let slot = 0; slot < 5; slot += 1) {
			try { await apps.ClearCustomArtworkForApp(shortcutAppId, slot); } catch (error) {
				backendLog(`Could not clear artwork slot ${slot} for ${shortcutAppId}: ${error}`);
			}
		}
	}
	// For native Steam games, clearing custom artwork allows Steam to display its native artwork
	if (shortcutAppId < 2147483648) {
		try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId, steamAppId, user_action: true } })); } catch {}
		return { complete: true, slots: [0, 1, 2, 3], missing: [], communitySlots: [] };
	}
	// The backend endpoint preserves the shortcut icon, so resetting artwork
	// never causes an icon to disappear.
	await clearArtworkExceptIconBackend({ shortcut_app_id: String(shortcutAppId) }).catch(error => {
		backendLog(`Could not clear persisted artwork for ${shortcutAppId}: ${error}`);
	});
	const result = await spoofArtwork(shortcutAppId, steamAppId, gameTitle, true);
	if (result.slots.length) {
		try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId, steamAppId, user_action: true } })); } catch {}
	}
	return result;
}
