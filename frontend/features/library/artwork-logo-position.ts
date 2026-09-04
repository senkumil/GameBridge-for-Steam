import { backendLog, readCustomLogoPositionBackend } from '../../api/backend';
import { waitForSteamBridge } from './steam-bridge';

export type SteamLogoPinPosition = 'BottomLeft' | 'UpperLeft' | 'CenterCenter' | 'UpperCenter' | 'BottomCenter';
export interface SteamLogoPosition {
	pinnedPosition: SteamLogoPinPosition;
	nWidthPct: number;
	nHeightPct: number;
}

const STORAGE_PREFIX = 'gdl_logo_position4_';
const PREVIOUS_PREFIXES = ['gdl_logo_position1_', 'gdl_logo_position2_', 'gdl_logo_position3_'];
const PES_2013_POSITION: SteamLogoPosition = { pinnedPosition: 'BottomCenter', nWidthPct: 50, nHeightPct: 50 };
const MKK_POSITION: SteamLogoPosition = { pinnedPosition: 'CenterCenter', nWidthPct: 58, nHeightPct: 58 };

function profileRevision(steamAppId: string): number {
	if (steamAppId === '237110') return 3;
	return 1;
}

function normalize(raw: any, fallbackPin: SteamLogoPinPosition): SteamLogoPosition {
	const rawPin = String(raw?.pinnedPosition ?? raw?.pinned_position ?? '').replace(/[^a-z]/gi, '').toLowerCase();
	const pins: Record<string, SteamLogoPinPosition> = {
		bottomleft: 'BottomLeft', upperleft: 'UpperLeft', centercenter: 'CenterCenter',
		uppercenter: 'UpperCenter', bottomcenter: 'BottomCenter',
	};
	const num = (value: unknown, fallback: number): number => {
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed >= 5 && parsed <= 100 ? parsed : fallback;
	};
	return {
		pinnedPosition: pins[rawPin] || fallbackPin,
		nWidthPct: num(raw?.nWidthPct ?? raw?.width_pct ?? raw?.widthPct, 50),
		nHeightPct: num(raw?.nHeightPct ?? raw?.height_pct ?? raw?.heightPct, 50),
	};
}

function targetPosition(steamAppId: string, raw: unknown, fallbackPin: SteamLogoPinPosition): SteamLogoPosition {
	if (steamAppId === '221430') return PES_2013_POSITION;
	if (steamAppId === '237110') return MKK_POSITION;
	return normalize(raw, fallbackPin);
}

function markSaved(shortcutAppId: number, steamAppId: string, expected: SteamLogoPosition, source: string,
	verifiedPosition?: SteamLogoPosition): void {
	try {
		localStorage.setItem(STORAGE_PREFIX + shortcutAppId, JSON.stringify({
			steamAppId, version: 4, profileRevision: profileRevision(steamAppId), source,
			expectedPosition: expected, verifiedPosition, verified: true, verifiedAt: Date.now(),
		}));
	} catch {}
}

export function isLogoPositionVerified(shortcutAppId: number, steamAppId: string): boolean {
	try {
		const marker = JSON.parse(localStorage.getItem(STORAGE_PREFIX + shortcutAppId) || 'null');
		return marker?.steamAppId === steamAppId && marker?.version === 4 && marker?.verified === true
			&& marker?.profileRevision === profileRevision(steamAppId);
	} catch { return false; }
}

export function clearLogoPositionSaved(shortcutAppId: number): void {
	try {
		localStorage.removeItem(STORAGE_PREFIX + shortcutAppId);
		for (const prefix of PREVIOUS_PREFIXES) localStorage.removeItem(prefix + shortcutAppId);
	} catch {}
}

export function isLogoPositionStorageKey(key: string): boolean {
	return key.startsWith(STORAGE_PREFIX) || PREVIOUS_PREFIXES.some(prefix => key.startsWith(prefix));
}

export async function applyLogoPosition(
	shortcutAppId: number,
	steamAppId: string,
	rawPosition: unknown,
	force: boolean,
	fallbackPin: SteamLogoPinPosition,
	source: string,
	isCurrent: () => boolean,
): Promise<boolean> {
	if (!Number.isInteger(shortcutAppId) || shortcutAppId < 2147483648) return false;
	if (!force && isLogoPositionVerified(shortcutAppId, steamAppId)) return true;
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetCustomLogoPositionForApp !== 'function') return false;
	const position = targetPosition(steamAppId, rawPosition, fallbackPin);
	try {
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			if (!isCurrent()) return false;
			const accepted = await waitForSteamBridge(apps.SetCustomLogoPositionForApp(shortcutAppId, JSON.stringify({
				nVersion: 1, logoPosition: position,
			})), 5000);
			if (!accepted) {
				if (attempt < 3) { await new Promise(resolve => setTimeout(resolve, 200)); continue; }
				return false;
			}
			if (!isCurrent()) return false;
			await new Promise(resolve => setTimeout(resolve, 150));
			if (!isCurrent()) return false;
			try {
				const raw = await readCustomLogoPositionBackend({ shortcut_app_id: String(shortcutAppId) });
				const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
				const actual = parsed?.ok && parsed?.exists ? parsed.logo_position : null;
				if (actual && actual.pinnedPosition === position.pinnedPosition
					&& Math.abs(Number(actual.nWidthPct) - position.nWidthPct) < 1.5
					&& Math.abs(Number(actual.nHeightPct) - position.nHeightPct) < 1.5) {
					markSaved(shortcutAppId, steamAppId, position, source, {
						pinnedPosition: actual.pinnedPosition,
						nWidthPct: Number(actual.nWidthPct), nHeightPct: Number(actual.nHeightPct),
					});
					backendLog(`Applied and verified logo position for ${shortcutAppId} -> ${steamAppId}: ${JSON.stringify(position)}`);
					return true;
				}
			} catch {}
			if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 250));
		}
		// An accepted Steam write is enough to stop navigation from repeatedly
		// restoring the fallback; a later native user adjustment remains untouched.
		markSaved(shortcutAppId, steamAppId, position, source);
		return true;
	} catch (error) {
		backendLog(`Could not apply logo position for ${shortcutAppId}: ${String(error)}`);
		return false;
	}
}
