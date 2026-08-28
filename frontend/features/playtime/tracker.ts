import {
	startPlaytimeSessionBackend,
	pingPlaytimeSessionBackend,
	stopPlaytimeSessionBackend,
	backendLog,
} from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { escapeHtml } from '../../core/text';
import { PLAYBAR_CLASSES } from '../../steam/css';
import { loc } from '../../steam/localization';
import { elementsWithCssModuleClass } from '../../steam/native-dom';
import { getShortcutAppById } from '../../steam/shortcuts';
import { clearPlaytimeStatsCache, fetchPlaytimeStats } from './service';
import { formatLastPlayedDate, formatPlaytimeMinutes } from './format';
import { isDesktopLibraryPlaytimeHydrated } from './library-home';

export { fetchPlaytimeStats } from './service';

const SHORTCUT_THRESHOLD = 2147483648;

interface ActiveGameSession {
	instanceId: string;
	shortcutAppId: number;
	title: string;
	steamAppId?: string;
	startedAt: number;
}

const activeSessions = new Map<number, ActiveGameSession>();
let trackerInterval: ReturnType<typeof setInterval> | null = null;

function clearPlaytimeCacheAfter(request: Promise<unknown>): void {
	void request.then(clearPlaytimeStatsCache, clearPlaytimeStatsCache);
}

function playtimeClockSvg(extraClass = ''): string {
	return `<svg class="SVGIcon_Button SVGIcon_PlayTime ${extraClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true" style="opacity:.85;"><polyline fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" points="85.5,149.167 128,128 128,55.167"></polyline><path fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" d="M128,17.5c61.027,0,110.5,49.473,110.5,110.5S189.027,238.5,128,238.5S17.5,189.027,17.5,128"></path><circle fill="currentColor" cx="26.448" cy="85.833" r="6"></circle><circle fill="currentColor" cx="50.167" cy="50.5" r="6"></circle><circle fill="currentColor" cx="86" cy="26.667" r="6"></circle></svg>`;
}

function findNativePlaytimeElements(doc: Document): HTMLElement[] {
	const classes = PLAYBAR_CLASSES();
	const result: HTMLElement[] = [];
	const statsSections = elementsWithCssModuleClass(doc, classes.GameStatsSection);
	for (const stats of statsSections) {
		const playtimeElements = elementsWithCssModuleClass(stats, classes.Playtime);
		for (const el of playtimeElements) {
			if (!el.closest('[data-gdl-playtime="1"]')) result.push(el);
		}
	}
	return result;
}

/** Check if Steam client natively displays playtime for this game without GameBridge. */
export function isNativePlaytimePresent(doc: Document, app: any): boolean {
	const nativeMinutes = Number(app?.minutes_playtime_forever ?? app?.m_nPlaytimeForever ?? 0);
	if (Number.isFinite(nativeMinutes) && nativeMinutes > 0) return true;
	return findNativePlaytimeElements(doc).length > 0;
}

export async function injectPlaytimeFallbackStats(
	doc: Document,
	shortcutAppId: number,
	title: string,
	steamAppId?: string,
	isCurrent: () => boolean = () => true,
): Promise<void> {
	if (!isCurrent()) return;
	if (!getPreferences().trackNonSteamPlaytime) {
		removePlaytimeFallbackStats(doc);
		return;
	}

	const app = getShortcutAppById(shortcutAppId);
	const gameBridgeHydrated = isDesktopLibraryPlaytimeHydrated(app);
	if (!gameBridgeHydrated && isNativePlaytimePresent(doc, app)) {
		// Steam is already natively showing playtime. Clean up any leftover fallback elements.
		removePlaytimeFallbackStats(doc);
		return;
	}

	const statsData = await fetchPlaytimeStats(shortcutAppId, title, steamAppId);
	if (!isCurrent()) return;
	if (!statsData || (statsData.minutesForever <= 0 && !statsData.lastPlayedAt)) {
		return;
	}

	const classes = PLAYBAR_CLASSES();
	const statsSections = elementsWithCssModuleClass(doc, classes.GameStatsSection).filter(s => s.isConnected);
	if (!statsSections.length) return;

	const hydratedMinutes = gameBridgeHydrated
		? Number(app?.minutes_playtime_forever || 0)
		: 0;
	const minutesForever = Math.max(0, statsData.minutesForever, hydratedMinutes);
	const playtimeFormatted = formatPlaytimeMinutes(minutesForever);
	const lastPlayedFormatted = statsData.lastPlayedAt ? formatLastPlayedDate(statsData.lastPlayedAt) : '';
	if (gameBridgeHydrated) {
		let updatedNativeValue = false;
		for (const nativePlaytime of findNativePlaytimeElements(doc)) {
			const detail = elementsWithCssModuleClass(nativePlaytime, classes.PlayBarDetailLabel)[0];
			if (!detail) continue;
			detail.textContent = playtimeFormatted;
			updatedNativeValue = true;
		}
		if (updatedNativeValue) {
			removePlaytimeFallbackStats(doc);
			return;
		}
	}

	for (const stats of statsSections) {
		if (!isCurrent()) return;
		let container = stats.querySelector('[data-gdl-playtime="1"]') as HTMLElement | null;
		if (!container) {
			container = doc.createElement('div');
			container.dataset.gdlPlaytime = '1';
			container.style.display = 'contents';
			stats.appendChild(container);
		}
		container.dataset.gdlPlaytimeShortcutId = String(shortcutAppId);

		let html = '';

		// 1. Playtime widget
		if (minutesForever > 0) {
			html += `
				<div class="${classes.GameStat || ''} ${classes.Playtime || ''} ${classes.Visible || ''}" data-gdl-stat="playtime" style="display:flex;align-items:center;margin-right:16px;">
					<div class="${classes.GameStatIconForced || ''} ${classes.PlaytimeIconForced || ''}" style="margin-right:8px;display:flex;align-items:center;">${playtimeClockSvg()}</div>
					<div class="${classes.GameStatRight || ''}">
						<div class="${classes.PlayBarLabel || ''}" style="font-size:11px;color:#8f98a0;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(loc('AppDetails_SectionTitle_PlayTime', 'TIEMPO DE JUEGO'))}</div>
						<div class="${classes.PlayBarDetailLabel || ''}" data-gdl-playtime-value="1" style="font-size:13px;font-weight:500;color:#fff;">${escapeHtml(playtimeFormatted)}</div>
					</div>
				</div>`;
		}

		// 2. Last played widget
		if (lastPlayedFormatted) {
			html += `
				<div class="${classes.GameStat || ''} ${classes.LastPlayed || ''} ${classes.Visible || ''}" data-gdl-stat="last-played" style="display:flex;align-items:center;margin-right:16px;">
					<div class="${classes.GameStatRight || ''} ${classes.LastPlayedRight || ''}">
						<div class="${classes.PlayBarLabel || ''} ${classes.LastPlayedLabel || ''}" style="font-size:11px;color:#8f98a0;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(loc('AppDetails_SectionTitle_LastPlayed', 'ÚLTIMA VEZ JUGADO'))}</div>
						<div class="${classes.PlayBarDetailLabel || ''} ${classes.LastPlayedInfo || ''}" style="font-size:13px;font-weight:500;color:#fff;">${escapeHtml(lastPlayedFormatted)}</div>
					</div>
				</div>`;
		}

		container.innerHTML = html;
	}
}

export function removePlaytimeFallbackStats(doc: Document): void {
	doc.querySelectorAll('[data-gdl-playtime="1"]').forEach(el => el.remove());
}

async function pollRunningApps(): Promise<void> {
	if (!getPreferences().trackNonSteamPlaytime) return;
	// Keep an active external-game session alive while Steam is hidden, but do
	// not wake the Steam store every interval when the client is merely idle.
	if (document.hidden && activeSessions.size === 0) return;

	const uiStore = (window as any).SteamUIStore;
	const runningAppsSet = uiStore?.RunningApps as Set<any> | undefined;
	const currentRunningIds = new Set<number>();

	if (runningAppsSet && typeof runningAppsSet[Symbol.iterator] === 'function') {
		for (const app of runningAppsSet) {
			const rawId = Number(app?.appid ?? app?.m_unAppID);
			const numId = rawId < 0 ? (rawId >>> 0) : rawId;
			if (Number.isFinite(numId) && numId >= SHORTCUT_THRESHOLD) {
				currentRunningIds.add(numId);
				const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
				const existing = activeSessions.get(numId);

				if (!existing) {
					const instanceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
					const session: ActiveGameSession = {
						instanceId,
						shortcutAppId: numId,
						title,
						startedAt: Date.now(),
					};
					activeSessions.set(numId, session);
					backendLog(`Non-Steam app launched: ${title} (${numId}), starting playtime session`);
					clearPlaytimeCacheAfter(startPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: instanceId,
							shortcut_app_id: String(numId),
							title,
						}),
					}));
				} else {
					// Heartbeat ping
					clearPlaytimeCacheAfter(pingPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: existing.instanceId,
							shortcut_app_id: String(numId),
							title: existing.title,
						}),
					}));
				}
			}
		}
	}

	// Check stopped games
	for (const [id, session] of Array.from(activeSessions.entries())) {
		if (!currentRunningIds.has(id)) {
			activeSessions.delete(id);
			backendLog(`Non-Steam app quit: ${session.title} (${id}), stopping playtime session`);
			clearPlaytimeCacheAfter(stopPlaytimeSessionBackend({
				request_json: JSON.stringify({
					instance_id: session.instanceId,
					shortcut_app_id: String(id),
					title: session.title,
				}),
			}));
		}
	}
}

export function startPlaytimeTracker(): void {
	if (trackerInterval) return;
	trackerInterval = setInterval(pollRunningApps, 10000);
	void pollRunningApps();
}

export function stopPlaytimeTracker(): void {
	if (trackerInterval) {
		clearInterval(trackerInterval);
		trackerInterval = null;
	}
	for (const [id, session] of activeSessions.entries()) {
		clearPlaytimeCacheAfter(stopPlaytimeSessionBackend({
			request_json: JSON.stringify({
				instance_id: session.instanceId,
				shortcut_app_id: String(id),
				title: session.title,
			}),
		}));
	}
	activeSessions.clear();
}
