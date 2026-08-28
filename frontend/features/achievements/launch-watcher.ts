import { backendLog } from '../../api/backend';
import { findMappingForShortcut } from '../shortcuts/registry';
import { fetchLocalAchievementData } from './service';
import {
	cancelQueuedAchievementToastsForShortcut,
	enqueueFirstLaunchAchievementToasts,
	enqueueLocalAchievementToasts,
	latestNativeAchievementToastWindowRegistration,
} from './notifications';
import type { LocalAchievementData } from '../../domain/types';

const SHORTCUT_THRESHOLD = 2147483648;
const POLL_INTERVAL_MS = 2000;
const FALLBACK_GAME_READY_DELAY_MS = 30000;
const OVERLAY_REGISTRATION_GRACE_MS = POLL_INTERVAL_MS + 1000;
const OVERLAY_SETTLE_DELAY_MS = 6000;

interface OverlayReadiness {
	registration: number;
	since: number;
}

const completedSessions = new Map<number, string>();
const requestsInFlight = new Map<number, string>();
const runningSince = new Map<number, number>();
const overlayReadiness = new Map<number, OverlayReadiness>();
let watcherInterval: ReturnType<typeof setInterval> | null = null;

function runningShortcutIds(): Set<number> {
	const result = new Set<number>();
	const runningApps = (window as any).SteamUIStore?.RunningApps as Set<any> | undefined;
	if (!runningApps || typeof runningApps[Symbol.iterator] !== 'function') return result;
	for (const app of runningApps) {
		const rawId = Number(app?.appid ?? app?.m_unAppID);
		const appId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (Number.isFinite(appId) && appId >= SHORTCUT_THRESHOLD) result.add(appId);
	}
	return result;
}

async function fetchAchievementsForRunningShortcut(shortcutAppId: number): Promise<LocalAchievementData | null> {
	const steamAppId = findMappingForShortcut(shortcutAppId);
	if (!steamAppId) return null;
	// This is the sole high-frequency live reader. Other Steam surfaces subscribe
	// to the published result instead of issuing a duplicate backend request.
	const data = await fetchLocalAchievementData(steamAppId, { stateAppId: shortcutAppId, maxAgeMs: 0 });
	if (!data?.found || !Array.isArray(data.achievements) || data.total <= 0) return null;
	return data;
}

function pollFirstLaunchAchievementReplay(): void {
	const running = runningShortcutIds();
	for (const shortcutAppId of Array.from(completedSessions.keys())) {
		if (!running.has(shortcutAppId)) {
			cancelQueuedAchievementToastsForShortcut(shortcutAppId);
			completedSessions.delete(shortcutAppId);
			requestsInFlight.delete(shortcutAppId);
			runningSince.delete(shortcutAppId);
			overlayReadiness.delete(shortcutAppId);
		}
	}
	for (const shortcutAppId of Array.from(runningSince.keys())) {
		if (!running.has(shortcutAppId)) {
			cancelQueuedAchievementToastsForShortcut(shortcutAppId);
			requestsInFlight.delete(shortcutAppId);
			runningSince.delete(shortcutAppId);
			overlayReadiness.delete(shortcutAppId);
		}
	}
	for (const shortcutAppId of running) {
		const firstSeenAt = runningSince.get(shortcutAppId) || Date.now();
		if (!runningSince.has(shortcutAppId)) runningSince.set(shortcutAppId, firstSeenAt);
		// RunningApps flips early while Steam is still starting the launcher. An
		// overlay window is the strongest readiness signal. Games with overlay
		// disabled use a conservative stable-running fallback instead.
		// The overlay may be created just before the next polling tick records
		// RunningApps. Allow one polling interval of registration skew without
		// returning to the old eager launcher-only behavior.
		const now = Date.now();
		const overlayRegistration = latestNativeAchievementToastWindowRegistration(
			'overlay',
			firstSeenAt - OVERLAY_REGISTRATION_GRACE_MS,
		);
		const currentReadiness = overlayReadiness.get(shortcutAppId);
		if (overlayRegistration > 0
			&& (!currentReadiness || currentReadiness.registration !== overlayRegistration)) {
			overlayReadiness.set(shortcutAppId, { registration: overlayRegistration, since: now });
		}
		if (overlayRegistration === 0) overlayReadiness.delete(shortcutAppId);
		// Steam can register NotificationStore before the game's first visible
		// frame. Give the overlay a short settling window so the first toasts are
		// not buffered during startup and released together afterward.
		const readiness = overlayReadiness.get(shortcutAppId);
		const settledOverlay = overlayRegistration > 0
			&& readiness?.registration === overlayRegistration
			&& now - readiness.since >= OVERLAY_SETTLE_DELAY_MS;
		const ready = settledOverlay || now - firstSeenAt >= FALLBACK_GAME_READY_DELAY_MS;
		if (!ready) continue;
		const sessionKey = settledOverlay ? `overlay:${overlayRegistration}` : `fallback:${firstSeenAt}`;
		if (requestsInFlight.has(shortcutAppId)) continue;
		requestsInFlight.set(shortcutAppId, sessionKey);
		void fetchAchievementsForRunningShortcut(shortcutAppId)
			.then(data => {
				// A stopped or superseded launch must not emit results from an older
				// asynchronous JSON read.
				if (!data || requestsInFlight.get(shortcutAppId) !== sessionKey) return;
				if (completedSessions.get(shortcutAppId) !== sessionKey) {
					enqueueFirstLaunchAchievementToasts(data, shortcutAppId);
					completedSessions.set(shortcutAppId, sessionKey);
				}
				// The replay function updates the same persistent baseline first, so
				// this detects only genuine later transitions and cannot duplicate the
				// initial/every-launch batch.
				if (data.simulation_enabled !== true) {
					enqueueLocalAchievementToasts(data, shortcutAppId, Math.floor(firstSeenAt / 1000));
				}
			})
			.catch(error => backendLog(`Live achievement polling failed for ${shortcutAppId}: ${String(error)}`))
			.finally(() => {
				if (requestsInFlight.get(shortcutAppId) === sessionKey) requestsInFlight.delete(shortcutAppId);
			});
	}
}

export function startFirstLaunchAchievementWatcher(): void {
	if (watcherInterval) return;
	watcherInterval = setInterval(pollFirstLaunchAchievementReplay, POLL_INTERVAL_MS);
	pollFirstLaunchAchievementReplay();
}

export function stopFirstLaunchAchievementWatcher(): void {
	if (watcherInterval) clearInterval(watcherInterval);
	watcherInterval = null;
	completedSessions.clear();
	requestsInFlight.clear();
	runningSince.clear();
	overlayReadiness.clear();
}
