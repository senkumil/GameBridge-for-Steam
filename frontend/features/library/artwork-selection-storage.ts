export type CommunityArtworkSlot = 'portrait' | 'hero' | 'logo' | 'wide' | 'icon';

export interface CommunityArtworkChoice {
	id: number | string;
	url: string;
	thumb?: string;
	width?: number;
	height?: number;
	style?: string;
	language?: string;
	isCustom?: boolean;
}

export type CommunityArtworkSelection = Partial<Record<CommunityArtworkSlot, CommunityArtworkChoice>>;

const USER_ARTWORK_SELECTION_PREFIX = 'gdl_user_artwork_selection1_';
const CUSTOM_ARTWORK_PREFIX = 'gdl_custom_artwork1_';

export function isTrustedSteamGridDbImageUrl(value: unknown): value is string {
	try {
		const url = new URL(String(value || ''));
		return url.protocol === 'https:' && (url.hostname === 'steamgriddb.com' || url.hostname.endsWith('.steamgriddb.com'));
	} catch { return false; }
}

export function isTrustedArtworkChoiceUrl(value: unknown): value is string {
	const str = String(value || '');
	if (str.startsWith('data:image/')) return true;
	return isTrustedSteamGridDbImageUrl(value);
}

export function getCustomUploadedArtwork(steamAppId: string): Partial<Record<CommunityArtworkSlot, CommunityArtworkChoice[]>> {
	try {
		const raw = JSON.parse(localStorage.getItem(CUSTOM_ARTWORK_PREFIX + steamAppId) || '{}');
		return typeof raw === 'object' && raw ? raw : {};
	} catch { return {}; }
}

export function saveCustomUploadedArtwork(steamAppId: string, slot: CommunityArtworkSlot, choice: CommunityArtworkChoice): void {
	try {
		const map = getCustomUploadedArtwork(steamAppId);
		if (!Array.isArray(map[slot])) map[slot] = [];
		map[slot] = [choice, ...(map[slot] || []).filter(c => String(c.id) !== String(choice.id))];
		localStorage.setItem(CUSTOM_ARTWORK_PREFIX + steamAppId, JSON.stringify(map));
	} catch {}
}

export function deleteCustomUploadedArtwork(steamAppId: string, slot: CommunityArtworkSlot, choiceId: string | number): void {
	try {
		const map = getCustomUploadedArtwork(steamAppId);
		if (Array.isArray(map[slot])) {
			map[slot] = map[slot]!.filter(c => String(c.id) !== String(choiceId));
			localStorage.setItem(CUSTOM_ARTWORK_PREFIX + steamAppId, JSON.stringify(map));
		}
	} catch {}
}

export function getSavedCommunityArtworkSelection(shortcutAppId: number, steamAppId: string): CommunityArtworkSelection | null {
	try {
		const raw = JSON.parse(localStorage.getItem(USER_ARTWORK_SELECTION_PREFIX + shortcutAppId) || 'null');
		if (raw?.steamAppId !== steamAppId || !raw?.selection || typeof raw.selection !== 'object') return null;
		const slots: CommunityArtworkSlot[] = ['portrait', 'hero', 'logo', 'wide', 'icon'];
		const selection: CommunityArtworkSelection = {};
		for (const slot of slots) {
			const item = raw.selection[slot];
			if (!item) continue;
			if (!isTrustedArtworkChoiceUrl(item.url)) return null;
			selection[slot] = {
				id: String(item.id || ''), url: item.url,
				thumb: isTrustedArtworkChoiceUrl(item.thumb) ? item.thumb : item.url,
				width: Number(item.width) || undefined, height: Number(item.height) || undefined,
				style: typeof item.style === 'string' ? item.style : undefined,
				language: typeof item.language === 'string' ? item.language : undefined,
				isCustom: item.isCustom === true,
			};
		}
		return Object.keys(selection).length ? selection : null;
	} catch { return null; }
}

export function saveCommunityArtworkSelection(shortcutAppId: number, steamAppId: string, selection: CommunityArtworkSelection): void {
	try {
		localStorage.setItem(USER_ARTWORK_SELECTION_PREFIX + shortcutAppId, JSON.stringify({ steamAppId, version: 1, selection }));
	} catch {}
}

export function clearSavedCommunityArtworkSelection(shortcutAppId: number): void {
	try { localStorage.removeItem(USER_ARTWORK_SELECTION_PREFIX + shortcutAppId); } catch {}
}
