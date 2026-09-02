import { backendLog } from '../../api/backend';
import {
	imageUrlToBase64,
	normalizeCommunityArtworkDataUrl,
	recordUserArtworkApplication,
	type ArtworkApplyResult,
} from './artwork';
import {
	isTrustedSteamGridDbImageUrl,
	saveCommunityArtworkSelection,
	type CommunityArtworkSelection,
	type CommunityArtworkSlot,
} from './artwork-selection-storage';

const SLOT_TYPES: Record<CommunityArtworkSlot, number> = { portrait: 0, hero: 1, logo: 2, wide: 3 };

/** Apply a complete, user-reviewed set chosen explicitly in Properties. */
export async function applyCommunityArtworkSelection(
	targetAppId: number,
	steamAppId: string,
	selection: CommunityArtworkSelection,
): Promise<ArtworkApplyResult> {
	if (!Number.isInteger(targetAppId) || targetAppId <= 0 || !/^\d+$/.test(steamAppId)) {
		return { complete: false, slots: [], missing: ['invalid_shortcut'], communitySlots: [] };
	}
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetCustomArtworkForApp !== 'function') {
		return { complete: false, slots: [], missing: ['steam_client_api'], communitySlots: [] };
	}
	const slotNames = (Object.keys(SLOT_TYPES) as CommunityArtworkSlot[]).filter(slot => Boolean(selection?.[slot]));
	if (!slotNames.length || !slotNames.every(slot => isTrustedSteamGridDbImageUrl(selection[slot]?.url))) {
		return { complete: false, slots: [], missing: ['invalid_selection'], communitySlots: [] };
	}
	const prepared = await Promise.all(slotNames.map(async slot => {
		const imageType = SLOT_TYPES[slot];
		const dataUrl = await imageUrlToBase64(selection[slot]!.url);
		return { slot, imageType, dataUrl: dataUrl ? await normalizeCommunityArtworkDataUrl(dataUrl, imageType) || dataUrl : null };
	}));
	if (prepared.some(item => !item.dataUrl)) {
		return { complete: false, slots: [], missing: prepared.filter(item => !item.dataUrl).map(item => item.slot), communitySlots: [] };
	}
	const successfulSlots: number[] = [];
	for (const item of prepared) {
		try {
			await apps.SetCustomArtworkForApp(targetAppId, item.dataUrl!.slice(item.dataUrl!.indexOf(',') + 1), 'png', item.imageType);
			successfulSlots.push(item.imageType);
		} catch (error) {
			backendLog(`User artwork error (${item.slot}) for ${steamAppId}: ${String(error)}`);
		}
	}
	const complete = successfulSlots.length === slotNames.length;
	const missing = slotNames.filter(slot => !successfulSlots.includes(SLOT_TYPES[slot]));
	if (complete) {
		saveCommunityArtworkSelection(targetAppId, steamAppId, selection);
		recordUserArtworkApplication(targetAppId, steamAppId, successfulSlots, selection);
		try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId: targetAppId, steamAppId, user_action: true } })); } catch {}
	}
	return { complete, slots: successfulSlots, missing, communitySlots: complete ? [...slotNames] : [] };
}
