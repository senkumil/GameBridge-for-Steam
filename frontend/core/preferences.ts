export interface GdlPreferences {
	developerMode: boolean;
	simulateAchievements: boolean;
	autoDetectShortcuts: boolean;
}

const STORAGE_KEY = 'gdl_preferences_v1';
const EVENT_NAME = 'gdl:preferences-changed';

const DEFAULT_PREFERENCES: GdlPreferences = {
	developerMode: false,
	simulateAchievements: false,
	autoDetectShortcuts: true,
};

function sanitizePreferences(value: unknown): GdlPreferences {
	const record = value && typeof value === 'object' ? value as Partial<GdlPreferences> : {};
	const developerMode = record.developerMode === true;
	return {
		developerMode,
		// Simulation is a developer-only capability. Keep this invariant even if
		// an older build left an inconsistent localStorage value behind.
		simulateAchievements: developerMode && record.simulateAchievements === true,
		autoDetectShortcuts: record.autoDetectShortcuts !== false,
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
	const preferences = getPreferences();
	return preferences.developerMode && preferences.simulateAchievements;
}
