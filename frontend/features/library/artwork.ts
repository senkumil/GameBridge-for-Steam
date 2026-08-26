import { backendLog, fetchCommunityArtworkBackend, fetchLibraryAssetsBackend, saveShortcutIconBackend } from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { steamLanguageSync } from '../../steam/localization';
import { findShortcutAppIdsByName, getShortcutAppById, readShortcutOverviewField, shortcutExecutableIdentity } from '../../steam/shortcuts';

export async function resolveShortcutIdAfterRename(
	officialName: string,
	previousId: number,
	idsBeforeMutation: Set<number> = new Set<number>(),
	expectedExecutable = '',
): Promise<number> {
	const waits = [0, 100, 250, 500, 900, 1500, 2500];
	const expectedIdentity = shortcutExecutableIdentity(expectedExecutable);
	for (const wait of waits) {
		if (wait) await new Promise(resolve => setTimeout(resolve, wait));
		const matches = findShortcutAppIdsByName(officialName);
		if (matches.includes(previousId)) return previousId;
		const freshMatches = matches.filter(id => !idsBeforeMutation.has(id));
		if (expectedIdentity) {
			const executableMatch = freshMatches.find(id => shortcutExecutableIdentity(readShortcutOverviewField(
				getShortcutAppById(id), 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
			)) === expectedIdentity);
			if (executableMatch) return executableMatch;
		}
		if (freshMatches.length > 0) return freshMatches[0];
	}
	return previousId;
}

/** Fetch an image URL and return as base64 data URL string */
async function imageUrlToBase64(url: string): Promise<string | null> {
	const attempt = (u: string): Promise<string | null> => new Promise(async (resolve) => {
		try {
			const resp = await fetch(u);
			if (!resp.ok) { resolve(null); return; }
			const blob = await resp.blob();
			if (!blob || blob.size < 100) { resolve(null); return; }  // truncated/empty
			const reader = new FileReader();
			reader.onloadend = () => resolve((reader.result as string) || null);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		} catch { resolve(null); }
	});
	const direct = await attempt(url);
	if (direct) return direct;
	// Some image CDNs send no CORS headers, so the backend fallback is preferred.
	// headers, so the browser blocks the direct fetch. Retry through a
	// CORS-friendly image proxy that re-serves with Access-Control-Allow-Origin.
	const proxied = 'https://wsrv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')) + '&output=png';
	return await attempt(proxied);
}

function normalizeIconExtension(ext: string): string {
	const value = String(ext || '').toLowerCase().replace(/^\./, '');
	if (value === 'jpeg') return 'jpg';
	if (value === 'x-icon') return 'ico';
	if (value === 'png' || value === 'jpg' || value === 'ico' || value === 'tga') return value;
	return 'png';
}

function iconExtensionFromDataUrl(dataUrl: string, fallback: string): string {
	const mime = String(dataUrl.match(/^data:([^;,]+)/i)?.[1] || '').toLowerCase();
	if (mime.includes('png')) return 'png';
	if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
	if (mime.includes('icon') || mime.includes('ico')) return 'ico';
	if (mime.includes('tga')) return 'tga';
	return normalizeIconExtension(fallback);
}

async function imageDataUrlToPng(dataUrl: string): Promise<string | null> {
	return await new Promise(resolve => {
		const img = new Image();
		img.onload = () => {
			try {
				const width = Math.max(1, img.naturalWidth || img.width || 32);
				const height = Math.max(1, img.naturalHeight || img.height || 32);
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				if (!ctx) { resolve(null); return; }
				ctx.clearRect(0, 0, width, height);
				ctx.drawImage(img, 0, 0, width, height);
				resolve(canvas.toDataURL('image/png'));
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = dataUrl;
	});
}

function iconCandidatePriority(ext: string): number {
	const normalized = normalizeIconExtension(ext);
	if (normalized === 'ico') return 0;
	if (normalized === 'png') return 1;
	if (normalized === 'jpg') return 2;
	if (normalized === 'tga') return 3;
	return 4;
}

async function fetchOfficialShortcutIconPayload(candidates: { url?: string; extension?: string }[]): Promise<{ base64: string; extension: string; source: string } | null> {
	const ordered = candidates
		.filter(candidate => candidate?.url)
		.sort((a, b) => iconCandidatePriority(a.extension || '') - iconCandidatePriority(b.extension || ''));
	for (const candidate of ordered) {
		const source = String(candidate.url || '');
		const dataUrl = await imageUrlToBase64(source);
		if (!dataUrl) continue;
		const fallbackExt = normalizeIconExtension(candidate.extension || '');
		const detectedExt = iconExtensionFromDataUrl(dataUrl, fallbackExt);
		const pngDataUrl = detectedExt !== 'tga' ? await imageDataUrlToPng(dataUrl) : null;
		const finalDataUrl = pngDataUrl || (detectedExt !== 'tga' ? dataUrl : null);
		if (!finalDataUrl) continue;
		const commaIdx = finalDataUrl.indexOf(',');
		if (commaIdx < 0) continue;
		return {
			base64: finalDataUrl.substring(commaIdx + 1),
			extension: pngDataUrl ? 'png' : detectedExt,
			source,
		};
	}
	return null;
}

export interface SteamLibraryAssets {
	found?: boolean;
	portrait?: string;
	hero?: string;
	logo?: string;
	wide?: string;
	icon?: string;
	shortcut_icon?: string;
	shortcut_icon_extension?: string;
	shortcut_icons?: { url?: string; extension?: string }[];
	logo_position?: unknown;
	/** Installed footprint reported by Steam's public depot manifest (bytes). */
	install_size?: number;
	franchise?: string;
	source?: string;
}

interface CommunityArtworkAssets {
	found?: boolean;
	portrait?: string;
	hero?: string;
	logo?: string;
	wide?: string;
	source?: string;
}

async function getCommunityArtwork(steamAppId: string): Promise<CommunityArtworkAssets | null> {
	const preferences = getPreferences();
	if (!preferences.autoCommunityArtwork || !preferences.steamGridDbApiKey) return null;
	try {
		const raw = await fetchCommunityArtworkBackend({ request_json: JSON.stringify({
			steam_app_id: steamAppId,
			api_key: preferences.steamGridDbApiKey,
		}) });
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return parsed && typeof parsed === 'object' && !parsed.error && parsed.found ? parsed as CommunityArtworkAssets : null;
	} catch (error) {
		// The key is intentionally not part of the error/log message.
		backendLog('Community artwork lookup failed for ' + steamAppId + ': ' + String(error));
		return null;
	}
}

const libraryAssetsRequests = new Map<string, Promise<SteamLibraryAssets | null>>();
const libraryAssetsResolved = new Map<string, SteamLibraryAssets | null>();

function libraryAssetsKey(steamAppId: string): string {
	return steamAppId + '|' + (steamLanguageSync() || 'english');
}

/** Resolve content-hashed library assets used by newer Steam releases. */
export function getModernLibraryAssets(steamAppId: string): Promise<SteamLibraryAssets | null> {
	const language = steamLanguageSync() || 'english';
	const key = steamAppId + '|' + language;
	const existing = libraryAssetsRequests.get(key);
	if (existing) return existing;
	const request = (async () => {
		try {
			const parsed = JSON.parse(await fetchLibraryAssetsBackend({
				request_json: JSON.stringify({ steam_app_id: steamAppId, language }),
			}));
			const result = parsed && !parsed.error ? parsed as SteamLibraryAssets : null;
			libraryAssetsResolved.set(key, result);
			return result;
		} catch (e) {
			backendLog('Modern library artwork lookup failed for ' + steamAppId + ': ' + e);
			libraryAssetsResolved.set(key, null);
			return null;
		}
	})();
	libraryAssetsRequests.set(key, request);
	return request;
}

export function getResolvedLibraryAssets(steamAppId: string): SteamLibraryAssets | null {
	return libraryAssetsResolved.get(libraryAssetsKey(steamAppId)) || null;
}

/** Download Steam's official client TGA to a persistent local path and assign
 * it through the same native API used by the shortcut Properties dialog. */
export async function applyOfficialShortcutIcon(shortcutAppId: number, steamAppId: string): Promise<boolean> {
	try {
		const apps = (window as any).SteamClient?.Apps;
		const applyIconPath = async (path: string): Promise<boolean> => {
			if (typeof apps?.SetShortcutIcon !== 'function') return false;
			try { apps.SetShortcutIcon(shortcutAppId, ''); } catch {}
			await new Promise(resolve => setTimeout(resolve, 80));
			apps.SetShortcutIcon(shortcutAppId, path);
			try { apps.RequestIconDataForApp?.(shortcutAppId); } catch {}
			backendLog('Official shortcut icon applied for ' + shortcutAppId + ': ' + path);
			return true;
		};

		const response = JSON.parse(await saveShortcutIconBackend({
			request_json: JSON.stringify({
				shortcut_app_id: String(shortcutAppId),
				steam_app_id: steamAppId,
				language: steamLanguageSync() || 'english',
			}),
		}));
		if (response?.saved && response?.path) {
			return await applyIconPath(String(response.path));
		}
		backendLog('Official shortcut icon backend download unavailable for ' + steamAppId + ': ' + String(response?.error || 'unknown'));

		const assets = getResolvedLibraryAssets(steamAppId) || await getModernLibraryAssets(steamAppId);
		const candidates = Array.isArray(assets?.shortcut_icons) ? [...assets.shortcut_icons] : [];
		if (assets?.shortcut_icon) {
			candidates.push({ url: assets.shortcut_icon, extension: assets.shortcut_icon_extension || '' });
		}
		const payload = await fetchOfficialShortcutIconPayload(candidates);
		if (!payload) {
			backendLog('Official shortcut icon unavailable for ' + steamAppId + ': no_frontend_candidate');
			return false;
		}
		const saved = JSON.parse(await saveShortcutIconBackend({
			request_json: JSON.stringify({
				shortcut_app_id: String(shortcutAppId),
				steam_app_id: steamAppId,
				language: steamLanguageSync() || 'english',
				icon_base64: payload.base64,
				extension: payload.extension,
				source: payload.source,
			}),
		}));
		if (!saved?.saved || !saved?.path) {
			backendLog('Official shortcut icon unavailable for ' + steamAppId + ': ' + String(saved?.error || 'payload_failed'));
			return false;
		}
		return await applyIconPath(String(saved.path));
	} catch (e) {
		backendLog('Official shortcut icon failed for ' + shortcutAppId + ': ' + e);
		return false;
	}
}

/** Last-resort transparent wordmark. It prevents Steam's oversized SVG title
 *  when neither appinfo nor the legacy CDN publishes a library logo. */
function makeFallbackLogoDataUrl(title: string): string | null {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = 1280;
		canvas.height = 260;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const text = String(title || '').trim().toLocaleUpperCase();
		if (!text) return null;

		let fontSize = 150;
		const font = (size: number) => `600 ${size}px "Motiva Sans", "Arial Narrow", Arial, sans-serif`;
		ctx.font = font(fontSize);
		while (fontSize > 60 && ctx.measureText(text).width > 1140) {
			fontSize -= 4;
			ctx.font = font(fontSize);
		}
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round';
		ctx.shadowColor = 'rgba(0,0,0,0.72)';
		ctx.shadowBlur = 18;
		ctx.shadowOffsetY = 5;
		ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.055));
		ctx.strokeStyle = 'rgba(13,18,24,0.82)';
		ctx.strokeText(text, 640, 130, 1140);
		const fill = ctx.createLinearGradient(0, 55, 0, 205);
		fill.addColorStop(0, '#ffffff');
		fill.addColorStop(1, '#c7d5e0');
		ctx.fillStyle = fill;
		ctx.fillText(text, 640, 130, 1140);
		return canvas.toDataURL('image/png');
	} catch { return null; }
}

/** Artwork persistence marker.  A shortcut is complete only when all four
 * library slots were written.  Earlier markers accepted a logo by itself,
 * which permanently prevented a later retry for games with partial artwork
 * metadata (notably older Steam catalogue entries). */
const ART_STORAGE_PREFIX = 'gdl_artwork7_';
const LEGACY_ART_STORAGE_PREFIX = 'gdl_artwork4_';
const PREVIOUS_ART_STORAGE_PREFIXES = ['gdl_artwork5_', 'gdl_artwork6_'];
const LOGO_POSITION_STORAGE_PREFIX = 'gdl_logo_position1_';

function artworkAlreadySaved(shortcutAppId: number, steamAppId: string): boolean {
	try {
		const raw = localStorage.getItem(ART_STORAGE_PREFIX + shortcutAppId);
		if (!raw) return false;
		const marker = JSON.parse(raw);
		const allSlotsSaved = marker?.steamAppId === steamAppId
			&& Array.isArray(marker.slots)
			&& [0, 1, 2, 3].every(slot => marker.slots.includes(slot));
		// A header fallback is usable without a key, but it must be retried after
		// the user later enables SteamGridDB so it can be upgraded in place.
		if (allSlotsSaved && marker?.needsCommunityArtwork) {
			const preferences = getPreferences();
			return !(preferences.autoCommunityArtwork && preferences.steamGridDbApiKey);
		}
		return allSlotsSaved;
	} catch { return false; }
}

function markArtworkSaved(shortcutAppId: number, steamAppId: string, slots: number[], needsCommunityArtwork = false): void {
	try {
		localStorage.setItem(ART_STORAGE_PREFIX + shortcutAppId, JSON.stringify({ steamAppId, slots, needsCommunityArtwork }));
	} catch {}
}

/** Clear saved artwork marker (when mapping is removed) */
export function clearArtworkSaved(shortcutAppId: number): void {
	try {
		localStorage.removeItem(ART_STORAGE_PREFIX + shortcutAppId);
		localStorage.removeItem(LEGACY_ART_STORAGE_PREFIX + shortcutAppId);
		for (const prefix of PREVIOUS_ART_STORAGE_PREFIXES) localStorage.removeItem(prefix + shortcutAppId);
		localStorage.removeItem(LOGO_POSITION_STORAGE_PREFIX + shortcutAppId);
	} catch {}
}

type SteamLogoPinPosition = 'BottomLeft' | 'UpperLeft' | 'CenterCenter' | 'UpperCenter' | 'BottomCenter';
interface SteamLogoPosition {
	pinnedPosition: SteamLogoPinPosition;
	nWidthPct: number;
	nHeightPct: number;
}

function normalizeOfficialLogoPosition(raw: any): SteamLogoPosition {
	const rawPin = String(raw?.pinnedPosition ?? raw?.pinned_position ?? '').replace(/[^a-z]/gi, '').toLowerCase();
	const pins: Record<string, SteamLogoPinPosition> = {
		bottomleft: 'BottomLeft', upperleft: 'UpperLeft', centercenter: 'CenterCenter',
		uppercenter: 'UpperCenter', bottomcenter: 'BottomCenter',
	};
	const numeric = (value: unknown, fallback: number): number => {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 5 && parsed <= 100 ? parsed : fallback;
	};
	return {
		pinnedPosition: pins[rawPin] || 'BottomLeft',
		nWidthPct: numeric(raw?.nWidthPct ?? raw?.width_pct ?? raw?.widthPct, 50),
		nHeightPct: numeric(raw?.nHeightPct ?? raw?.height_pct ?? raw?.heightPct, 50),
	};
}

function logoPositionAlreadySaved(shortcutAppId: number, steamAppId: string): boolean {
	try {
		const marker = JSON.parse(localStorage.getItem(LOGO_POSITION_STORAGE_PREFIX + shortcutAppId) || 'null');
		return marker?.steamAppId === steamAppId && marker?.version === 1;
	} catch { return false; }
}

function markLogoPositionSaved(shortcutAppId: number, steamAppId: string, position: SteamLogoPosition): void {
	try {
		localStorage.setItem(LOGO_POSITION_STORAGE_PREFIX + shortcutAppId, JSON.stringify({
			steamAppId, version: 1, position,
		}));
	} catch {}
}

/** Apply the same logo bounding box Steam publishes for the native AppID.
 *  SetCustomLogoPositionForApp is the API behind "Adjust logo position". */
async function applyOfficialLogoPosition(
	shortcutAppId: number,
	steamAppId: string,
	rawPosition: unknown,
	force = false,
): Promise<boolean> {
	if (!Number.isInteger(shortcutAppId) || shortcutAppId < 2147483648) return false;
	if (!force && logoPositionAlreadySaved(shortcutAppId, steamAppId)) return false;
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetCustomLogoPositionForApp !== 'function') return false;
	const position = normalizeOfficialLogoPosition(rawPosition);
	try {
		await apps.SetCustomLogoPositionForApp(shortcutAppId, JSON.stringify({
			nVersion: 1,
			logoPosition: position,
		}));
		markLogoPositionSaved(shortcutAppId, steamAppId, position);
		backendLog('Applied official logo position for ' + shortcutAppId + ' -> ' + steamAppId
			+ ': ' + JSON.stringify(position));
		return true;
	} catch (e) {
		backendLog('Could not apply official logo position for ' + shortcutAppId + ': ' + e);
		return false;
	}
}

/** Set ALL artwork for a shortcut using SetCustomArtworkForApp.
 *  Signature: SteamClient.Apps.SetCustomArtworkForApp(appId, base64Data, fileExtension, imageType)
 *  The extension param is a FILE EXTENSION like ".jpg" or ".png" (not a MIME type).
 *  IMPORTANT: Must call directly on the SteamClient.Apps object - extracting the function
 *  breaks Steam's IPC proxy and produces "Unknown method" errors. */
const artworkSpoofed = new Set<string>();
const artworkInFlight = new Set<string>();
export interface ArtworkApplyResult {
	complete: boolean;
	slots: number[];
	missing: string[];
	communitySlots: string[];
}

const ARTWORK_SLOT_NAMES: Record<number, string> = {
	0: 'portrait', 1: 'hero', 2: 'logo', 3: 'header',
};

export async function spoofArtwork(shortcutAppId: number, steamAppId: string, gameTitle: string, force = false): Promise<ArtworkApplyResult> {
	const key = shortcutAppId + ':' + steamAppId;
	if (artworkInFlight.has(key)) return { complete: false, slots: [], missing: ['in_progress'], communitySlots: [] };
	if (!force && artworkSpoofed.has(key)) return { complete: true, slots: [0, 1, 2, 3], missing: [], communitySlots: [] };

	// Skip if artwork was already downloaded and saved for this exact pairing
	if (!force && artworkAlreadySaved(shortcutAppId, steamAppId)) {
		artworkSpoofed.add(key);
		backendLog('Artwork already saved for ' + shortcutAppId + ' -> ' + steamAppId);
		const modern = await getModernLibraryAssets(steamAppId);
		await applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position);
		return { complete: true, slots: [0, 1, 2, 3], missing: [], communitySlots: [] };
	}
	artworkInFlight.add(key);

	const sc = (window as any).SteamClient;
	if (typeof sc?.Apps?.SetCustomArtworkForApp !== 'function') {
		backendLog('SetCustomArtworkForApp not available');
		artworkInFlight.delete(key);
		return { complete: false, slots: [], missing: ['steam_client_api'], communitySlots: [] };
	}

	try {
		const modernPromise = getModernLibraryAssets(steamAppId);
		// The appinfo mirror is useful for content-hashed modern artwork but can
		// be slow or temporarily unavailable. Do not keep the library header
		// blank while it responds: legacy official CDN assets are immediately
		// usable for many older games.
		const modern = await Promise.race<SteamLibraryAssets | null>([
			modernPromise,
			new Promise<null>(resolve => setTimeout(() => resolve(null), 850)),
		]);
		const cdnBase = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}`;
		const cfBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
		const cfCdnBase = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}`;

		// Logo (2) and Hero (1) first for immediate library header rendering
		const sources: { urls: string[]; imageType: number; label: string }[] = [
			{
				urls: [
					modern?.logo || '',
					`${cfBase}/logo.png`,
					`${cfCdnBase}/logo.png`,
					`${cdnBase}/logo.png`,
				],
				imageType: 2,
				label: 'Logo',
			},
			{
				urls: [
					modern?.hero || '',
					modern?.wide || '',
					`${cfBase}/library_hero.jpg`,
					`${cfCdnBase}/library_hero.jpg`,
					`${cdnBase}/library_hero.jpg`,
					// Legacy titles can publish only their Store header. It is still
					// official artwork and preferable to Steam's blank gradient.
					`${cfBase}/header.jpg`,
					`${cfCdnBase}/header.jpg`,
					`${cdnBase}/header.jpg`,
				],
				imageType: 1,
				label: 'Hero',
			},
			{
				urls: [
					modern?.portrait || '',
					modern?.wide || '',
					`${cfBase}/library_600x900.jpg`,
					`${cfCdnBase}/library_600x900.jpg`,
					`${cdnBase}/library_600x900.jpg`,
					`${cfBase}/header.jpg`,
					`${cfCdnBase}/header.jpg`,
					`${cdnBase}/header.jpg`,
				],
				imageType: 0,
				label: 'Portrait Grid',
			},
			{
				urls: [
					modern?.wide || '',
					`${cfBase}/header.jpg`,
					`${cfCdnBase}/header.jpg`,
					`${cdnBase}/header.jpg`,
				],
				imageType: 3,
				label: 'Wide Capsule',
			},
		];

		const downloads = await Promise.all(sources.map(async ({ urls, imageType, label }) => {
			for (const url of Array.from(new Set(urls.filter(Boolean)))) {
				try {
					const dataUrl = await imageUrlToBase64(url);
					if (dataUrl) return { url, dataUrl, imageType, label };
				} catch {}
			}
			return { url: '', dataUrl: null as string | null, imageType, label };
		}));
		const communitySlots: string[] = [];
		const needsCommunityArtwork = (item: typeof downloads[number]): boolean => !item.dataUrl
			|| ((item.imageType === 0 || item.imageType === 1) && /\/header\.jpg(?:$|[?#])/i.test(item.url));
		if (downloads.some(needsCommunityArtwork)) {
			const community = await getCommunityArtwork(steamAppId);
			if (community) {
				const communityUrlByType: Record<number, string> = {
					0: community.portrait || '', 1: community.hero || '',
					2: community.logo || '', 3: community.wide || '',
				};
				for (const item of downloads) {
					if (!needsCommunityArtwork(item)) continue;
					const url = communityUrlByType[item.imageType];
					if (!url) continue;
					const dataUrl = await imageUrlToBase64(url);
					if (!dataUrl) continue;
					item.url = url;
					item.dataUrl = dataUrl;
					communitySlots.push(ARTWORK_SLOT_NAMES[item.imageType]);
				}
			}
		}

		// Some games genuinely publish no library logo. Give Steam a transparent
		// wordmark image so it uses the same compact logo layout instead of its
		// oversized SVG title fallback.
		const logoDownload = downloads.find(item => item.imageType === 2);
		if (logoDownload && !logoDownload.dataUrl) {
			logoDownload.dataUrl = makeFallbackLogoDataUrl(gameTitle);
			if (logoDownload.dataUrl) {
				logoDownload.url = 'generated-title-logo.png';
				backendLog('Generated transparent title logo for ' + gameTitle);
			}
		}

		const successfulSlots: number[] = [];
		for (const { dataUrl, imageType, label } of downloads) {
			if (!dataUrl) {
				backendLog('Artwork not available: ' + label + ' for ' + steamAppId);
				continue;
			}
			try {
				const commaIdx = dataUrl.indexOf(',');
				const base64Data = dataUrl.substring(commaIdx + 1);
				const mime = dataUrl.match(/^data:image\/(png|jpe?g)/i)?.[1]?.toLowerCase();
				const ext = mime === 'png' ? 'png' : 'jpg';

				const result = await sc.Apps.SetCustomArtworkForApp(shortcutAppId, base64Data, ext, imageType);
				successfulSlots.push(imageType);
				backendLog('Artwork set: ' + label + ' (type ' + imageType + ') for ' + shortcutAppId + ' result=' + JSON.stringify(result));
				if (imageType === 2) {
					void applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force);
				}
			} catch (e) {
				backendLog('Artwork error (' + label + '): ' + e);
			}
		}

		const logoApplied = successfulSlots.includes(2);
		const allSlotsApplied = [0, 1, 2, 3].every(slot => successfulSlots.includes(slot));
		const missing = [0, 1, 2, 3]
			.filter(slot => !successfulSlots.includes(slot))
			.map(slot => ARTWORK_SLOT_NAMES[slot]);
		// Applying a Store header to a portrait/hero slot prevents an empty
		// Steam tile, but it must not be reported as a full original library
		// asset. Steam never published those assets for some older AppIDs.
		for (const item of downloads) {
			if ((item.imageType === 0 || item.imageType === 1) && /\/header\.jpg(?:$|[?#])/i.test(item.url)) {
				const label = ARTWORK_SLOT_NAMES[item.imageType];
				if (!missing.includes(label)) missing.push(label);
			}
			if (item.imageType === 2 && item.url === 'generated-title-logo.png' && !missing.includes('logo')) missing.push('logo');
		}
		const complete = missing.length === 0;
		if (logoApplied) {
			await applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force);
			// Do not suppress future repair attempts unless Steam received every
			// slot. Older titles can have a valid logo but no legacy hero/capsule
			// URL on the first pass; the next navigation can then fill it from the
			// modern asset endpoint or the header fallback.
			if (allSlotsApplied) {
				markArtworkSaved(shortcutAppId, steamAppId, successfulSlots, !complete);
				artworkSpoofed.add(key);
			}
		}
		backendLog('Applied ' + successfulSlots.length + '/4 artwork images for ' + steamAppId
			+ ' (logo=' + (logoApplied ? 'yes' : 'no') + ')');
		return { complete, slots: successfulSlots, missing, communitySlots };
	} finally {
		artworkInFlight.delete(key);
	}
}


/** Invalidate only in-memory library asset requests; persisted image/artwork state is kept. */
export function clearLibraryAssetCaches(): void {
	libraryAssetsRequests.clear();
	libraryAssetsResolved.clear();
	artworkSpoofed.clear();
}
