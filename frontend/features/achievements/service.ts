import { fetchLocalAchievementsBackend } from '../../api/backend';
import { getPreferences, simulatedAchievementsEnabled } from '../../core/preferences';
import type { LocalAchievementData } from '../../domain/types';
import { steamLanguageSync } from '../../steam/localization';

export interface LocalAchievementRequestOptions {
	stateAppId?: string | number | null;
	allowSimulated?: boolean;
	/** Reuse a recent backend result. Zero still joins an identical request that
	 * is already in flight, but always checks the progress file again afterward. */
	maxAgeMs?: number;
}

export interface LocalAchievementUpdate {
	steamAppId: string;
	stateAppId: string;
	data: LocalAchievementData | null;
}

interface AchievementRequestCacheEntry {
	updatedAt: number;
	value: LocalAchievementData | null;
	inFlight: Promise<LocalAchievementData | null> | null;
}

const requestCache = new Map<string, AchievementRequestCacheEntry>();
const updateListeners = new Set<(update: LocalAchievementUpdate) => void>();
const DEFAULT_MAX_AGE_MS = 1250;
const MAX_REQUEST_CACHE_ENTRIES = 32;
let requestGeneration = 0;

function trimRequestCache(): void {
	if (requestCache.size <= MAX_REQUEST_CACHE_ENTRIES) return;
	const removable = Array.from(requestCache.entries())
		.filter(([, entry]) => !entry.inFlight)
		.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
	for (const [key] of removable) {
		if (requestCache.size <= MAX_REQUEST_CACHE_ENTRIES) break;
		requestCache.delete(key);
	}
}

function publishAchievementUpdate(update: LocalAchievementUpdate): void {
	for (const listener of Array.from(updateListeners)) {
		try { listener(update); } catch {}
	}
}

export function subscribeLocalAchievementData(listener: (update: LocalAchievementUpdate) => void): () => void {
	updateListeners.add(listener);
	return () => updateListeners.delete(listener);
}

export function clearLocalAchievementRequestCache(): void {
	// Removing Map entries alone is not enough: a request that started before a
	// policy toggle still owns its Promise and could publish stale progress after
	// the new result. Advancing the generation makes those completions inert.
	requestGeneration += 1;
	requestCache.clear();
}

export function localAchievementRequestJson(
	steamAppId: string | number,
	options: LocalAchievementRequestOptions = {},
): string {
	const preferences = getPreferences();
	return JSON.stringify({
		steam_app_id: String(steamAppId),
		language: steamLanguageSync() || 'spanish',
		state_app_id: options.stateAppId == null ? '' : String(options.stateAppId),
		// Never enable the test fallback implicitly. It is enabled only when the
		// user has enabled both developer mode and simulated progress; callers may
		// still explicitly disable it for a particular request.
		allow_simulated: options.allowSimulated !== false && simulatedAchievementsEnabled(),
		// Full completion is intentionally per-game only.
		simulate_unlock_all: false,
		unlock_online: preferences.unlockOnlineAchievements,
	});
}

export async function fetchLocalAchievementData(
	steamAppId: string | number,
	options: LocalAchievementRequestOptions = {},
): Promise<LocalAchievementData | null> {
	const requestJson = localAchievementRequestJson(steamAppId, options);
	const now = Date.now();
	const maxAgeMs = Math.max(0, options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
	let entry = requestCache.get(requestJson);
	if (entry?.inFlight) return entry.inFlight;
	if (entry && now - entry.updatedAt <= maxAgeMs) return entry.value;
	if (!entry) {
		entry = { updatedAt: 0, value: null, inFlight: null };
		requestCache.set(requestJson, entry);
	}
	const generation = requestGeneration;
	const stateAppId = options.stateAppId == null ? '' : String(options.stateAppId);
	entry.inFlight = (async (): Promise<LocalAchievementData | null> => {
		let value: LocalAchievementData | null = null;
		try {
			const raw = await fetchLocalAchievementsBackend({ request_json: requestJson });
			const parsed = JSON.parse(raw) as LocalAchievementData;
			value = parsed && typeof parsed === 'object' ? parsed : null;
		} catch {}
		// A cache clear means a path or achievement policy changed while this IPC
		// was running. Return to the original caller so it can settle, but never
		// repopulate the cache or repaint Steam with that obsolete response.
		if (generation === requestGeneration && requestCache.get(requestJson) === entry) {
			entry!.value = value;
			entry!.updatedAt = Date.now();
			entry!.inFlight = null;
			publishAchievementUpdate({ steamAppId: String(steamAppId), stateAppId, data: value });
			trimRequestCache();
		}
		return value;
	})();
	return entry.inFlight;
}
