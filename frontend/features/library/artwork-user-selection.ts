import { backendLog, saveShortcutIconBackend } from '../../api/backend';
import {
	imageUrlToBase64,
	normalizeCommunityArtworkDataUrl,
	recordUserArtworkApplication,
	type ArtworkApplyResult,
} from './artwork';
import {
	isTrustedArtworkChoiceUrl,
	saveCommunityArtworkSelection,
	type CommunityArtworkSelection,
	type CommunityArtworkSlot,
} from './artwork-selection-storage';

const SLOT_TYPES: Record<'portrait' | 'hero' | 'logo' | 'wide', number> = { portrait: 0, hero: 1, logo: 2, wide: 3 };

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
	const slots: CommunityArtworkSlot[] = ['portrait', 'hero', 'logo', 'wide', 'icon'];
	const chosenSlots = slots.filter(slot => Boolean(selection?.[slot]));
	if (!chosenSlots.length || !chosenSlots.every(slot => isTrustedArtworkChoiceUrl(selection[slot]?.url))) {
		return { complete: false, slots: [], missing: ['invalid_selection'], communitySlots: [] };
	}

	const successfulSlots: number[] = [];
	const missingSlots: string[] = [];

	// 1. Apply standard library slots (portrait, hero, logo, wide)
	const standardSlots = (Object.keys(SLOT_TYPES) as Array<'portrait' | 'hero' | 'logo' | 'wide'>).filter(slot => Boolean(selection?.[slot]));
	if (standardSlots.length > 0) {
		const prepared = await Promise.all(standardSlots.map(async slot => {
			const imageType = SLOT_TYPES[slot];
			const dataUrl = await imageUrlToBase64(selection[slot]!.url);
			return { slot, imageType, dataUrl: dataUrl ? await normalizeCommunityArtworkDataUrl(dataUrl, imageType) || dataUrl : null };
		}));
		for (const item of prepared) {
			if (!item.dataUrl) {
				missingSlots.push(item.slot);
				continue;
			}
			try {
				await apps.SetCustomArtworkForApp(targetAppId, item.dataUrl.slice(item.dataUrl.indexOf(',') + 1), 'png', item.imageType);
				successfulSlots.push(item.imageType);
			} catch (error) {
				backendLog(`User artwork error (${item.slot}) for ${steamAppId}: ${String(error)}`);
				missingSlots.push(item.slot);
			}
		}
	}

	// 2. Apply icon slot if chosen
	if (selection.icon) {
		try {
			const dataUrl = await imageUrlToBase64(selection.icon.url);
			if (dataUrl) {
				const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
				await saveShortcutIconBackend({
					request_json: JSON.stringify({
						shortcut_app_id: targetAppId,
						steam_app_id: steamAppId,
						icon_base64: base64,
						extension: 'png',
						source: selection.icon.isCustom ? 'custom_upload' : 'steamgriddb',
					}),
				});
				successfulSlots.push(4);
			} else {
				missingSlots.push('icon');
			}
		} catch (error) {
			backendLog(`User icon error for ${steamAppId}: ${String(error)}`);
			missingSlots.push('icon');
		}
	}

	const complete = missingSlots.length === 0;
	if (complete) {
		saveCommunityArtworkSelection(targetAppId, steamAppId, selection);
		recordUserArtworkApplication(targetAppId, steamAppId, successfulSlots, selection);
		try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId: targetAppId, steamAppId, user_action: true } })); } catch {}
	}
	return { complete, slots: successfulSlots, missing: missingSlots, communitySlots: complete ? [...chosenSlots] : [] };
}
