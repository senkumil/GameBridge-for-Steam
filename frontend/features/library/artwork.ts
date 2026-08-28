import { backendLog, fetchCommunityArtworkBackend, fetchLibraryAssetsBackend, saveShortcutIconBackend } from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { RetryingRequestCache } from '../../core/request-cache';
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

/**
 * Steam's custom-artwork API assigns a fixed native canvas to each slot:
 * portrait 600x900, hero 1920x620, logo 1280x720 and wide 920x430.  Official
 * assets already use those canvases, but SteamGridDB may return artwork with
 * arbitrary dimensions.  Normalize community images before sending them to
 * Steam so they follow the same crop/contain rules as native library art.
 * Official images are deliberately not passed through this function.
 */
async function normalizeCommunityArtworkDataUrl(dataUrl: string, imageType: number): Promise<string | null> {
	const targetByType: Record<number, { width: number; height: number; fit: 'cover' | 'contain' }> = {
		0: { width: 600, height: 900, fit: 'cover' },
		1: { width: 1920, height: 620, fit: 'cover' },
		2: { width: 1280, height: 720, fit: 'contain' },
		3: { width: 920, height: 430, fit: 'cover' },
	};
	const target = targetByType[imageType];
	if (!target) return dataUrl;
	return await new Promise(resolve => {
		const img = new Image();
		img.onload = () => {
			try {
				const sourceWidth = Math.max(1, img.naturalWidth || img.width || target.width);
				const sourceHeight = Math.max(1, img.naturalHeight || img.height || target.height);
				const scale = target.fit === 'cover'
					? Math.max(target.width / sourceWidth, target.height / sourceHeight)
					: Math.min(target.width / sourceWidth, target.height / sourceHeight);
				const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
				const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
				const canvas = document.createElement('canvas');
				canvas.width = target.width;
				canvas.height = target.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) { resolve(dataUrl); return; }
				// Transparent background is required for logos; the other slots are
				// fully covered by the image and therefore need no fill color.
				ctx.clearRect(0, 0, target.width, target.height);
				ctx.imageSmoothingEnabled = true;
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(img,
					Math.round((target.width - drawWidth) / 2),
					Math.round((target.height - drawHeight) / 2),
					drawWidth, drawHeight);
				resolve(canvas.toDataURL('image/png'));
			} catch {
				// A browser with restricted canvas support can still use the original
				// image; failing normalization must never remove a valid asset.
				resolve(dataUrl);
			}
		};
		img.onerror = () => resolve(dataUrl);
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
	provenance?: Partial<Record<'portrait' | 'hero' | 'logo' | 'wide', {
		id?: number | string;
		provider?: string;
		width?: number;
		height?: number;
		language?: string;
		style?: string;
		transparent?: boolean;
	}>>;
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

const libraryAssetsRequests = new RetryingRequestCache<SteamLibraryAssets>({ ttlMs: 10 * 60 * 1000, retries: 2, baseDelayMs: 150 });

function libraryAssetsKey(steamAppId: string): string {
	return steamAppId + '|' + (steamLanguageSync() || 'english');
}

/** Resolve content-hashed library assets used by newer Steam releases. */
export function getModernLibraryAssets(steamAppId: string): Promise<SteamLibraryAssets | null> {
	const language = steamLanguageSync() || 'english';
	const key = steamAppId + '|' + language;
	return libraryAssetsRequests.get(key, async () => {
		try {
			const parsed = JSON.parse(await fetchLibraryAssetsBackend({
				request_json: JSON.stringify({ steam_app_id: steamAppId, language }),
			}));
			const result = parsed && !parsed.error ? parsed as SteamLibraryAssets : null;
			return result;
		} catch (e) {
			backendLog('Modern library artwork lookup failed for ' + steamAppId + ': ' + e);
			return null;
		}
	}).catch((e: unknown): SteamLibraryAssets | null => {
		backendLog('Modern library artwork lookup exhausted for ' + steamAppId + ': ' + e);
		return null;
	});
}

export function getResolvedLibraryAssets(steamAppId: string): SteamLibraryAssets | null {
	return libraryAssetsRequests.peek(libraryAssetsKey(steamAppId));
}

const SHORTCUT_ICON_STORAGE_PREFIX = 'gdl_shortcut_icon2_';

function shortcutIconMarkerMatches(shortcutAppId: number, steamAppId: string): boolean {
	try {
		const marker = JSON.parse(localStorage.getItem(SHORTCUT_ICON_STORAGE_PREFIX + shortcutAppId) || 'null');
		if (marker?.steamAppId !== steamAppId) return false;
		const app = getShortcutAppById(shortcutAppId);
		const currentPath = readShortcutOverviewField(app,
			'strShortcutIcon', 'm_strShortcutIcon', 'shortcut_icon', 'strIconPath');
		return Boolean(currentPath);
	} catch { return false; }
}

function markShortcutIconApplied(shortcutAppId: number, steamAppId: string, path: string): void {
	try {
		localStorage.setItem(SHORTCUT_ICON_STORAGE_PREFIX + shortcutAppId, JSON.stringify({ steamAppId, path }));
	} catch {}
}

/** Download Steam's official client icon to a persistent local path and assign
 * it through the same native API used by the shortcut Properties dialog. */
export async function applyOfficialShortcutIcon(shortcutAppId: number, steamAppId: string, force = false): Promise<boolean> {
	try {
		if (!force && shortcutIconMarkerMatches(shortcutAppId, steamAppId)) return true;
		const apps = (window as any).SteamClient?.Apps;
		const applyIconPath = async (path: string): Promise<boolean> => {
			if (typeof apps?.SetShortcutIcon !== 'function') return false;
			// Never clear the icon first. Steam immediately repaints the shortcut when
			// SetShortcutIcon(..., '') is called, producing a visible blank-icon flash.
			// Replacing the path atomically is sufficient and keeps the current icon
			// visible until Steam has decoded the new file.
			apps.SetShortcutIcon(shortcutAppId, path);
			try { apps.RequestIconDataForApp?.(shortcutAppId); } catch {}
			markShortcutIconApplied(shortcutAppId, steamAppId, path);
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
// Bump the marker when the slot canvas/normalization policy changes so games
// linked by an older build receive the corrected native-sized assets once.
const ART_STORAGE_PREFIX = 'gdl_artwork12_';
const LEGACY_ART_STORAGE_PREFIX = 'gdl_artwork4_';
const PREVIOUS_ART_STORAGE_PREFIXES = ['gdl_artwork5_', 'gdl_artwork6_', 'gdl_artwork7_', 'gdl_artwork8_', 'gdl_artwork9_', 'gdl_artwork10_', 'gdl_artwork11_'];
const LOGO_POSITION_STORAGE_PREFIX = 'gdl_logo_position2_';
const PREVIOUS_LOGO_POSITION_STORAGE_PREFIX = 'gdl_logo_position1_';

interface ArtworkStorageMarker {
	steamAppId: string;
	slots: number[];
	needsCommunityArtwork?: boolean;
	provenance?: Record<string, unknown>;
}

function readArtworkMarker(shortcutAppId: number, steamAppId: string): ArtworkStorageMarker | null {
	try {
		const marker = JSON.parse(localStorage.getItem(ART_STORAGE_PREFIX + shortcutAppId) || 'null');
		if (marker?.steamAppId !== steamAppId || !Array.isArray(marker?.slots)) return null;
		return {
			steamAppId,
			slots: Array.from(new Set(marker.slots.map(Number).filter((slot: number) => [0, 1, 2, 3].includes(slot)))),
			needsCommunityArtwork: Boolean(marker.needsCommunityArtwork),
			provenance: marker.provenance && typeof marker.provenance === 'object' ? marker.provenance : undefined,
		};
	} catch { return null; }
}

function artworkAlreadySaved(shortcutAppId: number, steamAppId: string): boolean {
	const marker = readArtworkMarker(shortcutAppId, steamAppId);
	return Boolean(marker && [0, 1, 2, 3].every(slot => marker.slots.includes(slot)));
}

function markArtworkSaved(shortcutAppId: number, steamAppId: string, slots: number[], needsCommunityArtwork = false, provenance?: Record<string, unknown>): void {
	try {
		localStorage.setItem(ART_STORAGE_PREFIX + shortcutAppId, JSON.stringify({
			steamAppId,
			slots: Array.from(new Set(slots)).sort((a, b) => a - b),
			needsCommunityArtwork,
			provenance,
		}));
	} catch {}
}

/** True when this Steam shortcut still has artwork ownership state written by
 * GameBridge. These markers live in Steam's web UI storage, so they can survive
 * replacing the plugin folder with a clean ZIP even when mappings.json is gone. */
export function hasManagedArtworkSaved(shortcutAppId: number): boolean {
	try {
		if (localStorage.getItem(ART_STORAGE_PREFIX + shortcutAppId)) return true;
		if (localStorage.getItem(LEGACY_ART_STORAGE_PREFIX + shortcutAppId)) return true;
		if (PREVIOUS_ART_STORAGE_PREFIXES.some(prefix => localStorage.getItem(prefix + shortcutAppId))) return true;
		return false;
	} catch { return false; }
}

/** Clear saved artwork marker (when mapping is removed) */
export function clearArtworkSaved(shortcutAppId: number): void {
	try {
		localStorage.removeItem(ART_STORAGE_PREFIX + shortcutAppId);
		localStorage.removeItem(LEGACY_ART_STORAGE_PREFIX + shortcutAppId);
		for (const prefix of PREVIOUS_ART_STORAGE_PREFIXES) localStorage.removeItem(prefix + shortcutAppId);
		// Keep the current logo-position marker across unlink/relink. Steam stores
		// manual logo positioning independently from the artwork images, so removing
		// this marker would make GameBridge overwrite a user's manual adjustment on
		// the next link. The marker is AppID-scoped and will naturally stop matching
		// when this shortcut is linked to a different Steam game.
		localStorage.removeItem(PREVIOUS_LOGO_POSITION_STORAGE_PREFIX + shortcutAppId);
		localStorage.removeItem(SHORTCUT_ICON_STORAGE_PREFIX + shortcutAppId);
	} catch {}
}

type SteamLogoPinPosition = 'BottomLeft' | 'UpperLeft' | 'CenterCenter' | 'UpperCenter' | 'BottomCenter';
interface SteamLogoPosition {
	pinnedPosition: SteamLogoPinPosition;
	nWidthPct: number;
	nHeightPct: number;
}

function normalizeOfficialLogoPosition(
	raw: any,
	fallbackPin: SteamLogoPinPosition = 'BottomLeft',
): SteamLogoPosition {
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
		pinnedPosition: pins[rawPin] || fallbackPin,
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
	_force = false,
	fallbackPin: SteamLogoPinPosition = 'BottomLeft',
): Promise<boolean> {
	if (!Number.isInteger(shortcutAppId) || shortcutAppId < 2147483648) return false;
	// Once GameBridge has initialized a logo position for this shortcut/AppID,
	// never write it again automatically. The user may have adjusted the logo
	// manually in Steam after that first write and that choice must win.
	if (logoPositionAlreadySaved(shortcutAppId, steamAppId)) return false;
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetCustomLogoPositionForApp !== 'function') return false;
	const position = normalizeOfficialLogoPosition(rawPosition, fallbackPin);
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
	const existingMarker = !force ? readArtworkMarker(shortcutAppId, steamAppId) : null;
	const reusableSlots = new Set<number>(existingMarker?.slots || []);

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
					`${cfBase}/library_hero.jpg`,
					`${cfCdnBase}/library_hero.jpg`,
					`${cdnBase}/library_hero.jpg`,
				],
				imageType: 1,
				label: 'Hero',
			},
			{
				urls: [
					modern?.portrait || '',
					`${cfBase}/library_600x900.jpg`,
					`${cfCdnBase}/library_600x900.jpg`,
					`${cdnBase}/library_600x900.jpg`,
					// Legacy Steam apps can expose their native library capsule as
					// portrait.png even when library_assets_full is absent. Prefer it
					// over any community artwork or Store-header approximation.
					`${cfBase}/portrait.png`,
					`${cfCdnBase}/portrait.png`,
					`${cdnBase}/portrait.png`,
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
		const pendingSources = sources.filter(source => !reusableSlots.has(source.imageType));

		const downloads = await Promise.all(pendingSources.map(async ({ urls, imageType, label }) => {
			for (const url of Array.from(new Set(urls.filter(Boolean)))) {
				try {
					const dataUrl = await imageUrlToBase64(url);
					if (dataUrl) return { url, dataUrl, imageType, label, community: false };
				} catch {}
			}
			return { url: '', dataUrl: null as string | null, imageType, label, community: false };
		}));
		const communitySlots: string[] = [];
		const communityProvenance: Record<string, unknown> = {};
		// Community artwork remains a last resort for normal modern slots. For the
		// hero specifically, however, an older AppID that publishes no library_hero
		// benefits from a proper 1920x620 community hero more than from stretching
		// a tiny legacy header. The Store page background is tried after this block.
		const needsCommunityArtwork = (item: typeof downloads[number]): boolean => !item.dataUrl;
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
					item.community = true;
					const slotName = ARTWORK_SLOT_NAMES[item.imageType];
					communitySlots.push(slotName);
					const sourceName = item.imageType === 0 ? 'portrait' : item.imageType === 1 ? 'hero' : item.imageType === 2 ? 'logo' : 'wide';
					if (community.provenance?.[sourceName]) communityProvenance[slotName] = community.provenance[sourceName];
				}
			}
		}

		// Legacy hero policy: if Steam does not publish a modern library_hero,
		// prefer a high-quality SteamGridDB hero (when explicitly configured)
		// before falling back to Steam's Store page background. This restores the
		// richer composition used by older library pages without stretching a
		// low-resolution header capsule across the hero surface.
		const heroDownload = downloads.find(item => item.imageType === 1);
		if (heroDownload && !heroDownload.dataUrl) {
			for (const url of [
				`${cfBase}/page_bg_raw.jpg`, `${cfCdnBase}/page_bg_raw.jpg`, `${cdnBase}/page_bg_raw.jpg`,
				`${cfBase}/page_bg_generated_v6b.jpg`, `${cfCdnBase}/page_bg_generated_v6b.jpg`, `${cdnBase}/page_bg_generated_v6b.jpg`,
				`${cfBase}/page_bg_generated_v6.jpg`, `${cfCdnBase}/page_bg_generated_v6.jpg`, `${cdnBase}/page_bg_generated_v6.jpg`,
			]) {
				const dataUrl = await imageUrlToBase64(url);
				if (!dataUrl) continue;
				heroDownload.url = url;
				heroDownload.dataUrl = dataUrl;
				break;
			}
		}

		// Last-resort compatibility for legacy games with no modern hero, Store
		// page background or configured SteamGridDB hero.  A legacy header is
		// better than an empty hero, but it is intentionally tried only here so a
		// low-resolution 460x215 image can never outrank a proper hero source.
		if (heroDownload && !heroDownload.dataUrl) {
			for (const url of [`${cfBase}/header.jpg`, `${cfCdnBase}/header.jpg`, `${cdnBase}/header.jpg`]) {
				const dataUrl = await imageUrlToBase64(url);
				if (!dataUrl) continue;
				heroDownload.url = url;
				heroDownload.dataUrl = dataUrl;
				break;
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

		const heroUsesLegacyFallback = Boolean(heroDownload?.dataUrl
			&& !/\/library_hero\.jpg(?:$|[?#])/i.test(String(heroDownload.url || ''))
			&& String(heroDownload.url || '') !== String(modern?.hero || ''));
		const defaultLogoPin: SteamLogoPinPosition = heroUsesLegacyFallback ? 'CenterCenter' : 'BottomLeft';

		const successfulSlots: number[] = Array.from(reusableSlots);
		for (const { dataUrl, imageType, label, community, url } of downloads) {
			if (!dataUrl) {
				backendLog('Artwork not available: ' + label + ' for ' + steamAppId);
				continue;
			}
			try {
				const shouldNormalizeToSlot = community || /\/page_bg_(?:raw|generated_v6b?|generated_v6)\.jpg(?:$|[?#])/i.test(String(url || ''));
				const preparedDataUrl = shouldNormalizeToSlot
					? await normalizeCommunityArtworkDataUrl(dataUrl, imageType) || dataUrl
					: dataUrl;
				const commaIdx = preparedDataUrl.indexOf(',');
				const base64Data = preparedDataUrl.substring(commaIdx + 1);
				const mime = preparedDataUrl.match(/^data:image\/(png|jpe?g)/i)?.[1]?.toLowerCase();
				const ext = mime === 'png' ? 'png' : 'jpg';

				const result = await sc.Apps.SetCustomArtworkForApp(shortcutAppId, base64Data, ext, imageType);
				successfulSlots.push(imageType);
				backendLog('Artwork set: ' + label + ' (type ' + imageType + ') for ' + shortcutAppId + ' result=' + JSON.stringify(result));
				if (imageType === 2) {
					void applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force, defaultLogoPin);
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
		const needsCommunityUpgrade = Boolean(existingMarker?.needsCommunityArtwork || missing.length > 0);
		const complete = allSlotsApplied;
		if (logoApplied) {
			await applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force, defaultLogoPin);
		}
		// Persist partial progress too. If one network asset fails, the next retry
		// writes only the missing slot instead of repainting all four Steam artwork
		// surfaces again. This removes the 2–3 visible flashes during transient
		// link retries while preserving transactional completion semantics.
		if (successfulSlots.length > 0) {
			markArtworkSaved(shortcutAppId, steamAppId, successfulSlots, needsCommunityUpgrade,
				Object.keys(communityProvenance).length ? communityProvenance : existingMarker?.provenance);
		}
		if (allSlotsApplied) artworkSpoofed.add(key);
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
	artworkSpoofed.clear();
}
