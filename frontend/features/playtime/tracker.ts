import {
	startPlaytimeSessionBackend,
	pingPlaytimeSessionBackend,
	stopPlaytimeSessionBackend,
	getPlaytimeDataBackend,
	backendLog,
} from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { escapeHtml } from '../../core/text';
import { PLAYBAR_CLASSES } from '../../steam/css';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import { elementsWithCssModuleClass } from '../../steam/native-dom';
import { getShortcutAppById } from '../../steam/shortcuts';

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

function playtimeClockSvg(extraClass = ''): string {
	return `<svg class="SVGIcon_Button SVGIcon_PlayTime ${extraClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true" style="opacity:.85;"><polyline fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" points="85.5,149.167 128,128 128,55.167"></polyline><path fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" d="M128,17.5c61.027,0,110.5,49.473,110.5,110.5S189.027,238.5,128,238.5S17.5,189.027,17.5,128"></path><circle fill="currentColor" cx="26.448" cy="85.833" r="6"></circle><circle fill="currentColor" cx="50.167" cy="50.5" r="6"></circle><circle fill="currentColor" cx="86" cy="26.667" r="6"></circle></svg>`;
}

export function formatPlaytimeMinutes(minutes: number): string {
	if (!Number.isFinite(minutes) || minutes <= 0) return gdlText('playtime_less_than_minute', '< 1 min');
	if (minutes < 60) return gdlText('playtime_minutes', '{count} min', { count: Math.max(1, Math.round(minutes)) });
	const hours = (minutes / 60).toFixed(1).replace(/\.0$/, '');
	return gdlText('playtime_hours', '{count} h', { count: hours });
}

export function formatLastPlayedDate(timestampSeconds: number): string {
	if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return '';
	const date = new Date(timestampSeconds * 1000);
	const now = new Date();

	const isToday = date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();

	if (isToday) return gdlText('last_played_today', 'Today');

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const isYesterday = date.getFullYear() === yesterday.getFullYear()
		&& date.getMonth() === yesterday.getMonth()
		&& date.getDate() === yesterday.getDate();

	if (isYesterday) return gdlText('last_played_yesterday', 'Yesterday');

	const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
	if (diffDays >= 2 && diffDays <= 6) {
		return gdlText('last_played_days_ago', '{count} days ago', { count: diffDays });
	}

	try {
		const formatter = new Intl.DateTimeFormat(steamIntlLocale(), {
			day: 'numeric',
			month: 'short',
			year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
		});
		return formatter.format(date);
	} catch {
		return date.toLocaleDateString();
	}
}

/** Check if Steam client natively displays playtime for this game without GameBridge */
export function isNativePlaytimePresent(doc: Document, app: any): boolean {
	// 1. Check if Steam data model already has native lifetime playtime
	const nativeMinutes = Number(app?.minutes_playtime_forever ?? app?.m_nPlaytimeForever ?? 0);
	if (Number.isFinite(nativeMinutes) && nativeMinutes > 0) return true;

	// 2. Check if Steam's native DOM already rendered a playtime stat that wasn't injected by GameBridge
	const classes = PLAYBAR_CLASSES();
	const statsSections = elementsWithCssModuleClass(doc, classes.GameStatsSection);
	for (const stats of statsSections) {
		const playtimeElements = elementsWithCssModuleClass(stats, classes.Playtime);
		for (const el of playtimeElements) {
			if (!el.closest('[data-gdl-playtime="1"]')) return true;
		}
	}
	return false;
}

export async function fetchPlaytimeStats(shortcutAppId: number, title: string, steamAppId?: string): Promise<{
	minutesForever: number;
	minutesLastTwoWeeks: number;
	lastPlayedAt: number | null;
} | null> {
	try {
		const raw = await getPlaytimeDataBackend({
			request_json: JSON.stringify({
				shortcut_app_id: String(shortcutAppId),
				steam_app_id: steamAppId || '',
				title: title || '',
			}),
		});
		let parsed: any = raw;
		for (let i = 0; i < 2 && typeof parsed === 'string'; i++) parsed = JSON.parse(parsed);
		if (parsed && typeof parsed === 'object' && parsed.ok) {
			return {
				minutesForever: Number(parsed.minutes_forever || 0),
				minutesLastTwoWeeks: Number(parsed.minutes_last_two_weeks || 0),
				lastPlayedAt: parsed.last_played_at ? Number(parsed.last_played_at) : null,
			};
		}
	} catch (error) {
		backendLog(`Failed to fetch playtime stats for ${title} (${shortcutAppId}): ${error}`);
	}
	return null;
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
	if (isNativePlaytimePresent(doc, app)) {
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

	const playtimeFormatted = formatPlaytimeMinutes(statsData.minutesForever);
	const lastPlayedFormatted = statsData.lastPlayedAt ? formatLastPlayedDate(statsData.lastPlayedAt) : '';

	for (const stats of statsSections) {
		if (!isCurrent()) return;
		let container = stats.querySelector('[data-gdl-playtime="1"]') as HTMLElement | null;
		if (!container) {
			container = doc.createElement('div');
			container.dataset.gdlPlaytime = '1';
			container.style.display = 'contents';
			stats.appendChild(container);
		}

		let html = '';

		// 1. Playtime widget
		if (statsData.minutesForever > 0) {
			html += `
				<div class="${classes.GameStat || ''} ${classes.Playtime || ''} ${classes.Visible || ''}" data-gdl-stat="playtime" style="display:flex;align-items:center;margin-right:16px;">
					<div class="${classes.GameStatIconForced || ''} ${classes.PlaytimeIconForced || ''}" style="margin-right:8px;display:flex;align-items:center;">${playtimeClockSvg()}</div>
					<div class="${classes.GameStatRight || ''}">
						<div class="${classes.PlayBarLabel || ''}" style="font-size:11px;color:#8f98a0;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(loc('AppDetails_SectionTitle_PlayTime', 'TIEMPO DE JUEGO'))}</div>
						<div class="${classes.PlayBarDetailLabel || ''}" style="font-size:13px;font-weight:500;color:#fff;">${escapeHtml(playtimeFormatted)}</div>
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
					void startPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: instanceId,
							shortcut_app_id: String(numId),
							title,
						}),
					});
				} else {
					// Heartbeat ping
					void pingPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: existing.instanceId,
							shortcut_app_id: String(numId),
							title: existing.title,
						}),
					});
				}
			}
		}
	}

	// Check stopped games
	for (const [id, session] of Array.from(activeSessions.entries())) {
		if (!currentRunningIds.has(id)) {
			activeSessions.delete(id);
			backendLog(`Non-Steam app quit: ${session.title} (${id}), stopping playtime session`);
			void stopPlaytimeSessionBackend({
				request_json: JSON.stringify({
					instance_id: session.instanceId,
					shortcut_app_id: String(id),
					title: session.title,
				}),
			});
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
		void stopPlaytimeSessionBackend({
			request_json: JSON.stringify({
				instance_id: session.instanceId,
				shortcut_app_id: String(id),
				title: session.title,
			}),
		});
	}
	activeSessions.clear();
}
