export interface GdlPreferences {
	simulateAchievements: boolean;
	autoDetectShortcuts: boolean;
	trackNonSteamPlaytime: boolean;
	autoCommunityArtwork: boolean;
	steamGridDbApiKey: string;
}

const STORAGE_KEY = 'gdl_preferences_v1';
const EVENT_NAME = 'gdl:preferences-changed';

const DEFAULT_PREFERENCES: GdlPreferences = {
	simulateAchievements: false,
	autoDetectShortcuts: true,
	trackNonSteamPlaytime: true,
	autoCommunityArtwork: true,
	steamGridDbApiKey: '',
};

function sanitizePreferences(value: unknown): GdlPreferences {
	const record = value && typeof value === 'object' ? value as Partial<GdlPreferences> : {};
	return {
		// This remains disabled by default, but no longer depends on a separate
		// developer-mode switch that did not provide any independent behavior.
		simulateAchievements: record.simulateAchievements === true,
		autoDetectShortcuts: record.autoDetectShortcuts !== false,
		trackNonSteamPlaytime: record.trackNonSteamPlaytime !== false,
		autoCommunityArtwork: record.autoCommunityArtwork !== false,
		// Stored locally only. It is never logged or included in diagnostics.
		steamGridDbApiKey: typeof record.steamGridDbApiKey === 'string'
			? record.steamGridDbApiKey.trim().slice(0, 160) : '',
	};
}

export function getPreferences(): GdlPreferences {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? sanitizePreferences(JSON.parse(raw)) : { ...DEFAULT_PREFERENCES };
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

export function setPreferences(patch: Partial<GdlPreferences>): GdlPreferences {
	const current = getPreferences();
	const next = sanitizePreferences({ ...current, ...patch });
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
	try { window.dispatchEvent(new CustomEvent<GdlPreferences>(EVENT_NAME, { detail: next })); } catch {}
	return next;
}

export function subscribePreferences(listener: (preferences: GdlPreferences) => void): () => void {
	const handler = (event: Event): void => {
		const detail = (event as CustomEvent<GdlPreferences>).detail;
		listener(detail ? sanitizePreferences(detail) : getPreferences());
	};
	window.addEventListener(EVENT_NAME, handler);
	return () => window.removeEventListener(EVENT_NAME, handler);
}

export function simulatedAchievementsEnabled(): boolean {
	return getPreferences().simulateAchievements;
}
