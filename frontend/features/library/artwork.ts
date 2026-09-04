import { backendLog, saveShortcutArtworkBackend, saveShortcutIconBackend } from '../../api/backend';
import { steamLanguageSync } from '../../steam/localization';
import { findShortcutAppIdsByName, getShortcutAppById, readShortcutOverviewField, shortcutExecutableIdentity } from '../../steam/shortcuts';
import { clearSavedCommunityArtworkSelection, getSavedCommunityArtworkSelection, isTrustedSteamGridDbImageUrl, type CommunityArtworkSelection } from './artwork-selection-storage';
import { imageUrlToBase64, normalizeCommunityArtworkDataUrl } from './artwork-image';
import { automaticArtworkMeetsSlotQuality } from './artwork-quality';
import { getCommunityArtwork, retiredCommunityArtworkPreferred, type CommunityArtworkAssets } from './artwork-community';
import {
	clearLibraryAssetDataCaches, getModernLibraryAssets, getResolvedLibraryAssets,
	invalidateLibraryAssetDataCaches, type SteamLibraryAssets,
} from './library-assets';
import { waitForSteamBridge } from './steam-bridge';
export async function resolveShortcutIdAfterRename(officialName: string, previousId: number,
	idsBeforeMutation: Set<number> = new Set<number>(), expectedExecutable = ''): Promise<number> {
	const waits = [0, 50, 100, 180, 300, 500, 800];
	const expectedIdentity = shortcutExecutableIdentity(expectedExecutable);
	const requiresFreshIdentity = idsBeforeMutation.size > 0;
	let stableCandidate = 0, stableSamples = 0;
	for (const wait of waits) {
		if (wait) await new Promise(resolve => setTimeout(resolve, wait));
		const matches = findShortcutAppIdsByName(officialName);
		if (matches.includes(previousId)) {
			if (!expectedIdentity || shortcutExecutableIdentity(readShortcutOverviewField(
				getShortcutAppById(previousId), 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
			)) === expectedIdentity) return previousId;
		}
		const freshMatches = matches.filter(id => !idsBeforeMutation.has(id));
		let candidate = 0;
		if (expectedIdentity) {
			candidate = freshMatches.find(id => shortcutExecutableIdentity(readShortcutOverviewField(
				getShortcutAppById(id), 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
			)) === expectedIdentity) || 0;
		}
		if (!candidate && !expectedIdentity && freshMatches.length === 1) candidate = freshMatches[0];
		if (!candidate && matches.includes(previousId)) {
			if (!expectedIdentity || shortcutExecutableIdentity(readShortcutOverviewField(
				getShortcutAppById(previousId), 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
			)) === expectedIdentity) {
				candidate = previousId;
			}
		}
		if (candidate) {
			if (candidate === stableCandidate) stableSamples += 1;
			else { stableCandidate = candidate; stableSamples = 1; }
			if (stableSamples >= 2) return candidate;
		} else { stableCandidate = 0; stableSamples = 0; }
		if (!requiresFreshIdentity && matches.includes(previousId)) return previousId;
	}
	if (getShortcutAppById(previousId)) return previousId;
	throw new Error('shortcut_rename_pending');
}
function normalizeIconExtension(ext: string): string {
	const value = String(ext || '').toLowerCase().replace(/^\./, '');
	if (value === 'jpeg') return 'jpg';
	if (value === 'x-icon') return 'ico';
	return (value === 'png' || value === 'jpg' || value === 'ico' || value === 'tga') ? value : 'png';
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
	if (normalized === 'png') return 0;
	if (normalized === 'jpg') return 1;
	if (normalized === 'ico') return 2;
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

export { getCachedLibraryAssets, getModernLibraryAssets, getResolvedLibraryAssets, refreshModernLibraryAssets } from './library-assets';
export type { SteamLibraryAssets } from './library-assets';
export { imageUrlToBase64, normalizeCommunityArtworkDataUrl } from './artwork-image';
const SHORTCUT_ICON_STORAGE_PREFIX = 'gdl_shortcut_icon4_';
const artworkGenerations = new Map<number, number>();
const shortcutIconInFlight = new Map<string, Promise<boolean>>();
function artworkGeneration(shortcutAppId: number): number { return artworkGenerations.get(shortcutAppId) ?? 0; }
function artworkGenerationIsCurrent(shortcutAppId: number, generation: number): boolean {
	return artworkGeneration(shortcutAppId) === generation;
}
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
async function applyOfficialShortcutIconOnce(shortcutAppId: number, steamAppId: string, force = false): Promise<boolean> {
	const generation = artworkGeneration(shortcutAppId);
	try {
		if (!force && shortcutIconMarkerMatches(shortcutAppId, steamAppId)) return true;
		const apps = (window as any).SteamClient?.Apps;
		const applyIconPath = async (path: string): Promise<boolean> => {
			if (typeof apps?.SetShortcutIcon !== 'function') return false;
			for (let attempt = 0; attempt < 2; attempt += 1) {
				if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
				try {
					const accepted = await waitForSteamBridge(apps.SetShortcutIcon(shortcutAppId, path), 5000);
					if (accepted) {
						if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
						try { await waitForSteamBridge(apps.RequestIconDataForApp?.(shortcutAppId), 1500); } catch {}
						if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
						markShortcutIconApplied(shortcutAppId, steamAppId, path);
						setTimeout(() => {
							if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return;
							try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId, steamAppId, icon: true, automatic: true } })); } catch {}
						}, 0);
						backendLog('Official shortcut icon applied for ' + shortcutAppId + ': ' + path);
						return true;
					}
				} catch (error) {
					backendLog('Steam rejected shortcut icon for ' + shortcutAppId + ': ' + error);
				}
				if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250));
			}
			return false;
		};

		const assets = getResolvedLibraryAssets(steamAppId) || await getModernLibraryAssets(steamAppId);
		if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
		const candidates = Array.isArray(assets?.shortcut_icons) ? [...assets.shortcut_icons] : [];
		if (assets?.shortcut_icon) {
			candidates.push({ url: assets.shortcut_icon, extension: assets.shortcut_icon_extension || '' });
		}
		const payload = await fetchOfficialShortcutIconPayload(candidates);
		if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
		if (payload) {
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
			if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
			if (saved?.saved && saved?.path) {
				if (await applyIconPath(String(saved.path))) return true;
			}
		}

		const response = JSON.parse(await saveShortcutIconBackend({
			request_json: JSON.stringify({
				shortcut_app_id: String(shortcutAppId),
				steam_app_id: steamAppId,
				language: steamLanguageSync() || 'english',
			}),
		}));
		if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
		if (response?.saved && response?.path) {
			return await applyIconPath(String(response.path));
		}
		return false;
	} catch (e) {
		backendLog('Official shortcut icon failed for ' + shortcutAppId + ': ' + e);
		return false;
	}
}

/** Download Steam's official client icon and assign it through Steam's native API.
 * Identical callers share the same bridge operation so a timed-out foreground
 * link and its durable repair cannot write the shortcut icon concurrently. */
export function applyOfficialShortcutIcon(shortcutAppId: number, steamAppId: string, force = false): Promise<boolean> {
	const key = `${shortcutAppId}:${steamAppId}`;
	const active = shortcutIconInFlight.get(key);
	if (active) return active;
	let request!: Promise<boolean>;
	request = applyOfficialShortcutIconOnce(shortcutAppId, steamAppId, force)
		.finally(() => {
			if (shortcutIconInFlight.get(key) === request) shortcutIconInFlight.delete(key);
		});
	shortcutIconInFlight.set(key, request);
	return request;
}

/** Artwork persistence marker.  A shortcut is complete only when all four
 * library slots were written.  Earlier markers accepted a logo by itself,
 * which permanently prevented a later retry for games with partial artwork
 * metadata (notably older Steam catalogue entries). */
// Bump the marker when the slot canvas/normalization policy changes so games
// linked by an older build receive the corrected native-sized assets once.
const ART_STORAGE_PREFIX = 'gdl_artwork16_';
const LEGACY_ART_STORAGE_PREFIX = 'gdl_artwork4_';
const PREVIOUS_ART_STORAGE_PREFIXES = ['gdl_artwork5_', 'gdl_artwork6_', 'gdl_artwork7_', 'gdl_artwork8_', 'gdl_artwork9_', 'gdl_artwork10_', 'gdl_artwork11_', 'gdl_artwork12_', 'gdl_artwork13_', 'gdl_artwork14_', 'gdl_artwork15_'];
const LOGO_POSITION_STORAGE_PREFIX = 'gdl_logo_position2_';
const PREVIOUS_LOGO_POSITION_STORAGE_PREFIX = 'gdl_logo_position1_';

interface ArtworkStorageMarker {
	steamAppId: string;
	slots: number[];
	retrySlots?: number[];
	profileRevision?: number;
	needsCommunityArtwork?: boolean;
	provenance?: Record<string, unknown>;
	sourceUrls?: Partial<Record<'portrait' | 'hero' | 'logo' | 'wide', string>>;
}

function isTrustedArtworkSourceUrl(value: unknown): value is string {
	const raw = String(value || '').trim();
	if (!/^https:\/\//i.test(raw)) return false;
	if (isTrustedSteamGridDbImageUrl(raw)) return true;
	try {
		const host = new URL(raw).hostname.toLowerCase();
		return host === 'steamstatic.com' || host.endsWith('.steamstatic.com')
			|| host === 'steampowered.com' || host.endsWith('.steampowered.com');
	} catch { return false; }
}

/** Increment only the reviewed title whose curated artwork changed. This
 * refreshes that shortcut without repainting artwork for every linked game. */
function curatedArtworkProfileRevision(steamAppId: string): number {
	if (steamAppId === '221430') return 3;
	if (steamAppId === '237110') return 2;
	return 0;
}

function readArtworkMarker(shortcutAppId: number, steamAppId: string): ArtworkStorageMarker | null {
	try {
		const marker = JSON.parse(localStorage.getItem(ART_STORAGE_PREFIX + shortcutAppId) || 'null');
		if (marker?.steamAppId !== steamAppId || !Array.isArray(marker?.slots)) return null;
		const profileRevision = curatedArtworkProfileRevision(steamAppId);
		if (profileRevision > 0 && marker?.profileRevision !== profileRevision) return null;
		return {
			steamAppId,
			slots: Array.from(new Set(marker.slots.map(Number).filter((slot: number) => [0, 1, 2, 3].includes(slot)))),
			retrySlots: Array.isArray(marker.retrySlots)
				? Array.from(new Set(marker.retrySlots.map(Number).filter((slot: number) => [0, 1, 2, 3].includes(slot))))
				: undefined,
			profileRevision: Number(marker.profileRevision) || undefined,
			needsCommunityArtwork: Boolean(marker.needsCommunityArtwork),
			provenance: marker.provenance && typeof marker.provenance === 'object' ? marker.provenance : undefined,
			sourceUrls: marker.sourceUrls && typeof marker.sourceUrls === 'object'
				? Object.fromEntries(Object.entries(marker.sourceUrls).filter(([slot, url]) =>
					['portrait', 'hero', 'logo', 'wide'].includes(slot) && isTrustedArtworkSourceUrl(url))) as ArtworkStorageMarker['sourceUrls']
				: undefined,
		};
	} catch { return null; }
}

export function linkedShortcutPortrait(shortcutAppId: number | string, steamAppId: string, officialFallback = ''): string {
	const shortcutId = Number(shortcutAppId);
	if (!Number.isFinite(shortcutId)) return officialFallback;
	const explicit = getSavedCommunityArtworkSelection(shortcutId, steamAppId)?.portrait?.url || '';
	if (explicit) return explicit;
	const marker = readArtworkMarker(shortcutId, steamAppId);
	const applied = (marker?.provenance?.portrait as { url?: unknown } | undefined)?.url;
	if (isTrustedSteamGridDbImageUrl(applied)) return applied;
	const source = marker?.sourceUrls?.portrait;
	if (isTrustedArtworkSourceUrl(source)) return source;
	if (officialFallback) return officialFallback;
	if (/^\d+$/.test(steamAppId)) {
		return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900_2x.jpg`;
	}
	return '';
}

export function artworkAlreadySaved(shortcutAppId: number, steamAppId: string): boolean {
	const marker = readArtworkMarker(shortcutAppId, steamAppId);
	if (!marker) return false;
	const hasPendingRetries = Array.isArray(marker.retrySlots) && marker.retrySlots.length > 0;
	if (hasPendingRetries) return false;
	const hasValidPortrait = isTrustedArtworkSourceUrl(marker.sourceUrls?.portrait
		|| (marker.provenance?.portrait as { url?: unknown } | undefined)?.url);
	const slots = new Set(marker.slots || []);
	return slots.has(0) && slots.has(1) && slots.has(2) && hasValidPortrait;
}

function markArtworkSaved(shortcutAppId: number, steamAppId: string, slots: number[], needsCommunityArtwork = false,
	provenance?: Record<string, unknown>, retrySlots: number[] = [],
	sourceUrls: Partial<Record<'portrait' | 'hero' | 'logo' | 'wide', string>> = {}): void {
	try {
		const normalizedRetrySlots = Array.from(new Set(retrySlots)).filter(slot => [0, 1, 2, 3].includes(slot));
		localStorage.setItem(ART_STORAGE_PREFIX + shortcutAppId, JSON.stringify({
			steamAppId,
			slots: Array.from(new Set(slots)).sort((a, b) => a - b),
			retrySlots: normalizedRetrySlots.length ? normalizedRetrySlots.sort((a, b) => a - b) : undefined,
			profileRevision: curatedArtworkProfileRevision(steamAppId) || undefined,
			needsCommunityArtwork,
			provenance,
			sourceUrls: Object.fromEntries(Object.entries(sourceUrls).filter(([, url]) => isTrustedArtworkSourceUrl(url))),
		}));
	} catch {}
}

/** True when this Steam shortcut still has artwork ownership state written by
 * NativeGameLink. These markers live in Steam's web UI storage, so they can survive
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
export function clearArtworkSaved(shortcutAppId: number | string, preserveIcon = false): void {
	try {
		const id = Number(shortcutAppId);
		if (!Number.isFinite(id)) return;
		artworkGenerations.set(id, artworkGeneration(id) + 1);
		localStorage.removeItem(ART_STORAGE_PREFIX + id);
		localStorage.removeItem(LEGACY_ART_STORAGE_PREFIX + id);
		for (const prefix of PREVIOUS_ART_STORAGE_PREFIXES) localStorage.removeItem(prefix + id);
		localStorage.removeItem(LOGO_POSITION_STORAGE_PREFIX + id);
		localStorage.removeItem(PREVIOUS_LOGO_POSITION_STORAGE_PREFIX + id);
		localStorage.removeItem('gdl_legacy_info_portrait1_' + id);
		clearSavedCommunityArtworkSelection(id);
		if (!preserveIcon) localStorage.removeItem(SHORTCUT_ICON_STORAGE_PREFIX + id);
		for (const key of Array.from(artworkSpoofed)) {
			if (key.startsWith(`${id}:`)) artworkSpoofed.delete(key);
		}
		for (const key of Array.from(artworkInFlight.keys())) {
			if (key.startsWith(`${id}:`)) artworkInFlight.delete(key);
		}
		for (const key of Array.from(shortcutIconInFlight.keys())) {
			if (key.startsWith(`${id}:`)) shortcutIconInFlight.delete(key);
		}
	} catch {}
}

/** Cancel obsolete downloads, wait for the bounded active bridge call, then let
 * unlink/relink clear Steam's slots without a late operation restoring them. */
export async function supersedeArtworkApplications(shortcutAppId: number, preserveIcon = false): Promise<void> {
	const activeArtwork = Array.from(artworkInFlight.entries())
		.filter(([key]) => key.startsWith(`${shortcutAppId}:`))
		.map(([, request]) => request);
	const activeIcons = Array.from(shortcutIconInFlight.entries())
		.filter(([key]) => key.startsWith(`${shortcutAppId}:`))
		.map(([, request]) => request);
	const active = Array.from(new Set<Promise<unknown>>([...activeArtwork, ...activeIcons]));
	clearArtworkSaved(shortcutAppId, preserveIcon);
	if (active.length === 0) return;
	await Promise.race([
		Promise.allSettled(active).then((): void => {}),
		new Promise<void>(resolve => setTimeout(resolve, 7000)),
	]);
}

type SteamLogoPinPosition = 'BottomLeft' | 'UpperLeft' | 'CenterCenter' | 'UpperCenter' | 'BottomCenter';
interface SteamLogoPosition {
	pinnedPosition: SteamLogoPinPosition;
	nWidthPct: number;
	nHeightPct: number;
}

function normalizeOfficialLogoPosition(raw: any, fallbackPin: SteamLogoPinPosition = 'BottomLeft'): SteamLogoPosition {
	const rawPin = String(raw?.pinnedPosition ?? raw?.pinned_position ?? '').replace(/[^a-z]/gi, '').toLowerCase();
	const pins: Record<string, SteamLogoPinPosition> = {
		bottomleft: 'BottomLeft', upperleft: 'UpperLeft', centercenter: 'CenterCenter',
		uppercenter: 'UpperCenter', bottomcenter: 'BottomCenter',
	};
	const num = (val: unknown, fb: number): number => {
		const p = Number(val);
		return Number.isFinite(p) && p >= 5 && p <= 100 ? p : fb;
	};
	return {
		pinnedPosition: pins[rawPin] || fallbackPin,
		nWidthPct: num(raw?.nWidthPct ?? raw?.width_pct ?? raw?.widthPct, 50),
		nHeightPct: num(raw?.nHeightPct ?? raw?.height_pct ?? raw?.heightPct, 50),
	};
}
const PES_2013_LOGO_POSITION: SteamLogoPosition = { pinnedPosition: 'BottomCenter', nWidthPct: 50, nHeightPct: 50 };

function logoPositionProfileRevision(steamAppId: string): number {
	return steamAppId === '221430' ? 1 : (steamAppId === '1888930' ? 2 : 1);
}

function logoPositionAlreadySaved(shortcutAppId: number, steamAppId: string): boolean {
	try {
		const marker = JSON.parse(localStorage.getItem(LOGO_POSITION_STORAGE_PREFIX + shortcutAppId) || 'null');
		if (marker?.steamAppId !== steamAppId || marker?.version !== 1) return false;
		const profileRevision = logoPositionProfileRevision(steamAppId);
		return marker?.profileRevision === profileRevision;
	} catch { return false; }
}

function markLogoPositionSaved(shortcutAppId: number, steamAppId: string, position: SteamLogoPosition): void {
	try {
		localStorage.setItem(LOGO_POSITION_STORAGE_PREFIX + shortcutAppId, JSON.stringify({
			steamAppId, version: 1,
			profileRevision: logoPositionProfileRevision(steamAppId) || undefined,
			position,
		}));
	} catch {}
}

async function applyOfficialLogoPosition(
	shortcutAppId: number,
	steamAppId: string,
	rawPosition: unknown,
	force = false,
	fallbackPin: SteamLogoPinPosition = 'BottomLeft',
): Promise<boolean> {
	const generation = artworkGeneration(shortcutAppId);
	if (!Number.isInteger(shortcutAppId) || shortcutAppId < 2147483648) return false;
	// Once NativeGameLink has initialized a logo position for this shortcut/AppID,
	// never write it again automatically unless forced.
	if (!force && logoPositionAlreadySaved(shortcutAppId, steamAppId)) return false;
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetCustomLogoPositionForApp !== 'function') return false;
	const position = steamAppId === '221430'
		? PES_2013_LOGO_POSITION
		: normalizeOfficialLogoPosition(rawPosition, fallbackPin);
	try {
		if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
		const accepted = await waitForSteamBridge(apps.SetCustomLogoPositionForApp(shortcutAppId, JSON.stringify({
			nVersion: 1,
			logoPosition: position,
		})), 5000);
		if (!accepted) return false;
		if (!artworkGenerationIsCurrent(shortcutAppId, generation)) return false;
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
const artworkInFlight = new Map<string, Promise<ArtworkApplyResult>>();
export interface ArtworkApplyResult {
	complete: boolean;
	slots: number[];
	missing: string[];
	communitySlots: string[];
}

const ARTWORK_SLOT_NAMES: Record<number, string> = {
	0: 'portrait', 1: 'hero', 2: 'logo', 3: 'header',
};

export function recordUserArtworkApplication(shortcutAppId: number, steamAppId: string, slots: number[], selection: CommunityArtworkSelection): void {
	const existingMarker = readArtworkMarker(shortcutAppId, steamAppId);
	const existingSlots = existingMarker?.slots || [];
	markArtworkSaved(shortcutAppId, steamAppId, [...existingSlots, ...slots], false, Object.fromEntries(
		Object.entries(selection).map(([slot, item]) => [slot, { ...item, provider: 'steamgriddb', selection: 'user_choice' }]),
	), [], {
		...(existingMarker?.sourceUrls || {}),
		...Object.fromEntries(Object.entries(selection).map(([slot, item]) => [slot, item.url])),
	});
	artworkSpoofed.add(shortcutAppId + ':' + steamAppId);
}

async function spoofArtworkOnce(shortcutAppId: number, steamAppId: string, _gameTitle: string, force = false, legacyPortraitOnly = false): Promise<ArtworkApplyResult> {
	const key = shortcutAppId + ':' + steamAppId;
	const generation = artworkGeneration(shortcutAppId);
	const isCurrent = (): boolean => artworkGenerationIsCurrent(shortcutAppId, generation);
	const existingMarker = !force ? readArtworkMarker(shortcutAppId, steamAppId) : null;
	// Old markers only recorded a global "needs community" bit. Revalidate all
	// of those once; new markers remember the exact provisional/missing slots so
	// every later repair can retain valid artwork and fetch only what is absent.
	const persistedRetrySlots = new Set<number>(existingMarker?.needsCommunityArtwork
		? (existingMarker.retrySlots?.length ? existingMarker.retrySlots : [0, 1, 2, 3])
		: []);
	const retainedSlots = new Set<number>(existingMarker?.slots || []);
	const sourceUrls = { ...(existingMarker?.sourceUrls || {}) } as Partial<Record<'portrait' | 'hero' | 'logo' | 'wide', string>>;
	const hasReusableSource = (slot: number): boolean => {
		const slotName = ARTWORK_SLOT_NAMES[slot] as keyof typeof sourceUrls;
		const provenanceUrl = (existingMarker?.provenance?.[slotName] as { url?: unknown } | undefined)?.url;
		return isTrustedArtworkSourceUrl(sourceUrls[slotName] || provenanceUrl);
	};
	const reusableSlots = new Set<number>(Array.from(retainedSlots)
		.filter(slot => !persistedRetrySlots.has(slot) && hasReusableSource(slot)));

	// Skip if artwork was already downloaded and saved for this exact pairing
	if (!force && artworkAlreadySaved(shortcutAppId, steamAppId)) {
		artworkSpoofed.add(key);
		backendLog('Artwork already saved for ' + shortcutAppId + ' -> ' + steamAppId);
		const modern = await getModernLibraryAssets(steamAppId);
		if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
		await applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position);
		return { complete: true, slots: [0, 1, 2, 3], missing: [], communitySlots: [] };
	}

	const sc = (window as any).SteamClient;
	if (typeof sc?.Apps?.SetCustomArtworkForApp !== 'function') {
		backendLog('SetCustomArtworkForApp not available');
		return { complete: false, slots: [], missing: ['steam_client_api'], communitySlots: [] };
	}

	{
		const userCommunity = getSavedCommunityArtworkSelection(shortcutAppId, steamAppId);
		const modernPromise = getModernLibraryAssets(steamAppId);
		const preferredCommunityPromise = retiredCommunityArtworkPreferred(steamAppId)
			.then(preferred => preferred ? getCommunityArtwork(steamAppId) : null);
		const modern = await Promise.race<SteamLibraryAssets | null>([
			modernPromise,
			new Promise<null>(resolve => setTimeout(() => resolve(null), 12000)),
		]);
		const preferredCommunity = await Promise.race<CommunityArtworkAssets | null>([
			preferredCommunityPromise,
			new Promise<null>(resolve => setTimeout(() => resolve(null), 12000)),
		]);
		if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
		const communityUrlSet = new Set([
			userCommunity?.portrait?.url, userCommunity?.hero?.url,
			userCommunity?.logo?.url, userCommunity?.wide?.url,
			preferredCommunity?.portrait, preferredCommunity?.hero,
			preferredCommunity?.logo, preferredCommunity?.wide,
		].filter((value): value is string => Boolean(value)));
		const explicitUserUrlSet = new Set([
			userCommunity?.portrait?.url, userCommunity?.hero?.url,
			userCommunity?.logo?.url, userCommunity?.wide?.url,
		].filter((value): value is string => Boolean(value)));
		const sharedBase = `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
		const cdnBase = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}`;
		const cfBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
		const cfCdnBase = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}`;
		const fastlyBase = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;

		// Portrait Grid (0) first so library capsules appear immediately
		const sources: { urls: string[]; imageType: number; label: string }[] = [
			{
				urls: [
					userCommunity?.portrait?.url || '',
					preferredCommunity?.portrait || '',
					modern?.portrait || '',
					`${sharedBase}/library_600x900_2x.jpg`,
					`${sharedBase}/library_600x900.jpg`,
					`${fastlyBase}/library_600x900_2x.jpg`,
					`${fastlyBase}/library_600x900.jpg`,
					`${cfBase}/library_600x900.jpg`,
					`${cfCdnBase}/library_600x900.jpg`,
					`${cdnBase}/library_600x900.jpg`,
				],
				imageType: 0,
				label: 'Portrait Grid',
			},
			{
				urls: [
					userCommunity?.hero?.url || '',
					preferredCommunity?.hero || '',
					modern?.hero || '',
					`${sharedBase}/library_hero_2x.jpg`,
					`${sharedBase}/library_hero.jpg`,
					`${fastlyBase}/library_hero_2x.jpg`,
					`${fastlyBase}/library_hero.jpg`,
					`${cfBase}/library_hero.jpg`,
					`${cfCdnBase}/library_hero.jpg`,
					`${cdnBase}/library_hero.jpg`,
				],
				imageType: 1,
				label: 'Hero',
			},
			{
				urls: [
					userCommunity?.logo?.url || '',
					preferredCommunity?.logo || '',
					modern?.logo || '',
					modern?.legacy_logo || '',
					`${sharedBase}/logo.png`,
					`${fastlyBase}/logo.png`,
					`${cfBase}/logo.png`,
					`${cfCdnBase}/logo.png`,
					`${cdnBase}/logo.png`,
				],
				imageType: 2,
				label: 'Logo',
			},
			{
				urls: [
					userCommunity?.wide?.url || '',
					preferredCommunity?.wide || '',
					modern?.wide || '',
					modern?.legacy_header || '',
					`${sharedBase}/header.jpg`,
					`${fastlyBase}/header.jpg`,
					`${cfBase}/header.jpg`,
					`${cfCdnBase}/header.jpg`,
					`${cdnBase}/header.jpg`,
					`${sharedBase}/capsule_616x353.jpg`,
					`${fastlyBase}/capsule_616x353.jpg`,
				],
				imageType: 3,
				label: 'Wide Capsule',
			},
		];
		const portraitSource = sources.find(s => s.imageType === 0);
		if (legacyPortraitOnly && portraitSource) portraitSource.urls = portraitSource.urls.filter(url => !url.includes('library_600x900'));
		const pendingSources = sources.filter(source => !reusableSlots.has(source.imageType));

		const downloads = await Promise.all(pendingSources.map(async ({ urls, imageType, label }) => {
			for (const url of Array.from(new Set(urls.filter(Boolean)))) {
				if (!isCurrent()) break;
				try {
					const dataUrl = await imageUrlToBase64(url);
					if (dataUrl && (explicitUserUrlSet.has(url) || await automaticArtworkMeetsSlotQuality(dataUrl, imageType))) {
						return { url, dataUrl, imageType, label, community: communityUrlSet.has(url) };
					}
				} catch {}
			}
			return { url: '', dataUrl: null as string | null, imageType, label, community: false };
		}));
		if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
		const communitySlots: string[] = [];
		const communityProvenance: Record<string, unknown> = {};
		const needsCommunityArtwork = (item: typeof downloads[number]): boolean => !item.dataUrl;
		if (downloads.some(needsCommunityArtwork)) {
			const community = preferredCommunity || await getCommunityArtwork(steamAppId);
			if (community) {
				const communityUrlByType: Record<number, string> = {
					0: community.portrait || '', 1: community.hero || '',
					2: community.logo || '', 3: community.wide || '',
				};
				for (const item of downloads) {
					if (!isCurrent()) break;
					if (!needsCommunityArtwork(item)) continue;
					const url = communityUrlByType[item.imageType];
					if (!url) continue;
					const dataUrl = await imageUrlToBase64(url);
					if (!isCurrent()) break;
					if (!dataUrl || !await automaticArtworkMeetsSlotQuality(dataUrl, item.imageType)) continue;
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
		// Preserve primary-pass provenance so injected box art matches Steam's slot.
		for (const item of downloads) {
			if (!item.community || !item.url) continue;
			const slotName = ARTWORK_SLOT_NAMES[item.imageType];
			if (communityProvenance[slotName]) continue;
			const sourceName = item.imageType === 0 ? 'portrait' : item.imageType === 1 ? 'hero' : item.imageType === 2 ? 'logo' : 'wide';
			const explicit = userCommunity?.[sourceName];
			communityProvenance[slotName] = explicit
				? { ...explicit, provider: 'steamgriddb', selection: 'user_choice' }
				: preferredCommunity?.provenance?.[sourceName] || { url: item.url, provider: 'steamgriddb' };
		}

		const heroDownload = downloads.find(item => item.imageType === 1);

		const heroUsesLegacyFallback = Boolean(heroDownload?.dataUrl
			&& !/\/library_hero\.jpg(?:$|[?#])/i.test(String(heroDownload.url || ''))
			&& String(heroDownload.url || '') !== String(modern?.hero || ''));
		const defaultLogoPin: SteamLogoPinPosition = heroUsesLegacyFallback ? 'CenterCenter' : 'BottomLeft';

		// Provisional artwork remains visible while its replacement is fetched.
		// It is not considered complete, but a transient 404 must never blank a
		// slot that already has a usable fallback.
		const successfulSlots: number[] = Array.from(reusableSlots);
		const appliedSlots: number[] = [];
		for (const { dataUrl, imageType, label, community, url } of downloads) {
			if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
			let slotApplied = false;
			if (dataUrl) {
				try {
					const shouldNormalizeToSlot = community;
					const preparedDataUrl = shouldNormalizeToSlot
						? await normalizeCommunityArtworkDataUrl(dataUrl, imageType) || dataUrl
						: dataUrl;
					const commaIdx = preparedDataUrl.indexOf(',');
					const base64Data = preparedDataUrl.substring(commaIdx + 1);
					const mime = preparedDataUrl.match(/^data:image\/(png|jpe?g)/i)?.[1]?.toLowerCase();
					const ext = mime === 'png' ? 'png' : 'jpg';

					const result = await waitForSteamBridge(
						sc.Apps.SetCustomArtworkForApp(shortcutAppId, base64Data, ext, imageType), 5000,
					);
					if (result) {
						slotApplied = true;
						backendLog('Artwork set: ' + label + ' (type ' + imageType + ') for ' + shortcutAppId + ' result=' + JSON.stringify(result));
					}
				} catch (e) {
					backendLog('Artwork error (' + label + '): ' + e);
				}
			}

			// Fallback: If CEF SetCustomArtworkForApp failed, timed out, or dataUrl was blocked by CORS,
			// let backend download the asset and write it directly to the Steam grid folder.
			if (!slotApplied && url) {
				try {
					const raw = await saveShortcutArtworkBackend({ request_json: JSON.stringify({
						shortcut_app_id: shortcutAppId,
						steam_app_id: steamAppId,
						image_type: imageType,
						url,
					}) });
					let response: any = raw;
					for (let attempt = 0; attempt < 3 && typeof response === 'string'; attempt += 1) response = JSON.parse(response);
					if (response?.ok === true || response?.saved === true) {
						slotApplied = true;
						backendLog('Artwork saved directly to grid by backend: ' + label + ' for ' + shortcutAppId);
					}
				} catch (e) {
					backendLog('Backend grid save error (' + label + '): ' + e);
				}
			}

			if (slotApplied) {
				successfulSlots.push(imageType);
				appliedSlots.push(imageType);
				if (imageType === 2) {
					void applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force, defaultLogoPin);
				}
			} else if (!dataUrl && !url) {
				backendLog('Artwork not available: ' + label + ' for ' + steamAppId);
			}
		}

		const successfulSlotSet = new Set(successfulSlots);
		for (const item of downloads) {
			if ((item.dataUrl || appliedSlots.includes(item.imageType)) && item.url && isTrustedArtworkSourceUrl(item.url)) {
				sourceUrls[ARTWORK_SLOT_NAMES[item.imageType] as keyof typeof sourceUrls] = item.url;
			}
		}
		const retrySlots = new Set(persistedRetrySlots);
		for (const item of downloads) {
			const applied = appliedSlots.includes(item.imageType);
			if (applied) retrySlots.delete(item.imageType);
			else if (!successfulSlotSet.has(item.imageType)) retrySlots.add(item.imageType);
		}
		for (const slot of [0, 1, 2, 3]) {
			if (!successfulSlotSet.has(slot)) retrySlots.add(slot);
		}
		// Applying a Store header to a portrait/hero slot prevents an empty
		// Steam tile, but it must not be reported as a full original library
		// asset. Steam never published those assets for some older AppIDs.
		for (const item of downloads) {
			if ((item.imageType === 0 || item.imageType === 1) && /\/header\.jpg(?:$|[?#])/i.test(item.url)) {
				retrySlots.add(item.imageType);
			}
		}
		const missing = Array.from(retrySlots).sort((a, b) => a - b).map(slot => ARTWORK_SLOT_NAMES[slot]);
		const logoApplied = successfulSlotSet.has(2);
		const allSlotsApplied = [0, 1, 2, 3].every(slot => successfulSlotSet.has(slot));
		const needsCommunityUpgrade = retrySlots.size > 0;
		const complete = allSlotsApplied && missing.length === 0;
		if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
		if (logoApplied) {
			await applyOfficialLogoPosition(shortcutAppId, steamAppId, modern?.logo_position, force, defaultLogoPin);
		}
		if (!isCurrent()) return { complete: false, slots: [], missing: ['superseded'], communitySlots: [] };
		// Persist partial progress too. If one network asset fails, the next retry
		// writes only the missing slot instead of repainting all four Steam artwork
		// surfaces again. This removes the 2–3 visible flashes during transient
		// link retries while preserving transactional completion semantics.
		if (successfulSlots.length > 0) {
			markArtworkSaved(shortcutAppId, steamAppId, Array.from(successfulSlotSet), needsCommunityUpgrade,
				{ ...(existingMarker?.provenance || {}), ...communityProvenance }, Array.from(retrySlots), sourceUrls);
		}
		if (complete) artworkSpoofed.add(key);
		if (appliedSlots.length) {
			setTimeout(() => {
				if (!isCurrent()) return;
				try { window.dispatchEvent(new CustomEvent('gdl:artwork-changed', { detail: { shortcutAppId, steamAppId, automatic: true } })); } catch {}
			}, 0);
		}
		backendLog('Applied ' + successfulSlotSet.size + '/4 artwork images for ' + steamAppId
			+ ' (logo=' + (logoApplied ? 'yes' : 'no') + ')');
		return { complete, slots: Array.from(successfulSlotSet), missing, communitySlots };
	}
}

export function spoofArtwork(shortcutAppId: number, steamAppId: string, gameTitle: string, force = false,
	legacyPortraitOnly = false): Promise<ArtworkApplyResult> {
	const key = shortcutAppId + ':' + steamAppId;
	const active = artworkInFlight.get(key);
	if (active) return active;
	const request = spoofArtworkOnce(shortcutAppId, steamAppId, gameTitle, force, legacyPortraitOnly)
		.finally(() => {
			if (artworkInFlight.get(key) === request) artworkInFlight.delete(key);
		});
	artworkInFlight.set(key, request);
	return request;
}
/** Drop resource snapshots so changes are visible in the current Steam session. */
export function clearLibraryAssetCaches(): void {
	clearLibraryAssetDataCaches();
	artworkSpoofed.clear();
}

/** Refresh selected identities while retaining hot data for every other game. */
export function invalidateLibraryAssetCaches(appIds: Iterable<string | number>): void {
	const ids = invalidateLibraryAssetDataCaches(appIds);
	if (ids.size === 0) return;
	for (const key of Array.from(artworkSpoofed)) {
		if (ids.has(key.split(':').pop() || '')) artworkSpoofed.delete(key);
	}
}
