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
import {
	applyNativePlaybarTypography,
	buildNativePlaybarStatBlueprint,
	elementsWithCssModuleClass,
	NATIVE_UI_BLUEPRINT_KEYS,
} from '../../steam/native-dom';
import { getMappedShortcuts, getShortcutAppById } from '../../steam/shortcuts';
import { clearPlaytimeStatsCache, fetchPlaytimeStats } from './service';
import { formatLastPlayedDate, formatPlaytimeMinutes } from './format';
import { isDesktopLibraryPlaytimeHydrated } from './library-home';
import { findShortcutIdForMappedSteamAppId } from '../../core/mappings';

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

function readNativeSidebarRunningTitles(): Set<string> {
	const titles = new Set<string>();
	try {
		for (const label of Array.from(document.querySelectorAll<HTMLElement>('[data-gdl-running-alias="1"]'))) {
			label.textContent = label.dataset.gdlRunningOriginalText || '';
			const color = label.dataset.gdlRunningOriginalColor;
			if (color) label.style.setProperty('color', color); else label.style.removeProperty('color');
			delete label.dataset.gdlRunningAlias;
			delete label.dataset.gdlRunningOriginalText;
			delete label.dataset.gdlRunningOriginalColor;
		}
		for (const element of Array.from(document.querySelectorAll<HTMLElement>('span, div'))) {
			if (element.children.length > 0 || element.getBoundingClientRect().left >= 520) continue;
			const match = String(element.textContent || '').trim().match(/^(.+?)\s+-\s+En ejecución$/i);
			if (match?.[1]) titles.add(match[1].trim().toLocaleLowerCase());
		}
	} catch {}
	return titles;
}

function syncMappedRunningSidebarLabels(runningTitles: Set<string>): void {
	try {
		for (const shortcut of getMappedShortcuts()) {
			if (!runningTitles.has(shortcut.title.toLocaleLowerCase())) continue;
			const labels = Array.from(document.querySelectorAll<HTMLElement>('span, div')).filter(element => {
				if (element.children.length > 0 || String(element.textContent || '').trim() !== shortcut.title) return false;
				const rect = element.getBoundingClientRect();
				return rect.width > 0 && rect.left >= 0 && rect.left < 520;
			});
			for (const label of labels) {
				label.dataset.gdlRunningAlias = '1';
				label.dataset.gdlRunningOriginalText = shortcut.title;
				label.dataset.gdlRunningOriginalColor = label.style.getPropertyValue('color');
				label.textContent = `${shortcut.title} - En ejecución`;
				label.style.setProperty('color', '#a1cd44', 'important');
			}
		}
	} catch {}
}

function clearPlaytimeCacheAfter(request: Promise<unknown>): void {
	void request.then(clearPlaytimeStatsCache, clearPlaytimeStatsCache);
}

function playtimeClockSvg(extraClass = ''): string {
	return `<svg class="SVGIcon_Button SVGIcon_PlayTime ${extraClass}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" points="85.5,149.167 128,128 128,55.167"></polyline><path fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" d="M128,17.5c61.027,0,110.5,49.473,110.5,110.5S189.027,238.5,128,238.5S17.5,189.027,17.5,128"></path><circle fill="currentColor" cx="26.448" cy="85.833" r="6"></circle><circle fill="currentColor" cx="50.167" cy="50.5" r="6"></circle><circle fill="currentColor" cx="86" cy="26.667" r="6"></circle></svg>`;
}

function htmlToElements(doc: Document, html: string): HTMLElement[] {
	const template = doc.createElement('template');
	template.innerHTML = html.trim();
	return Array.from(template.content.children) as HTMLElement[];
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

/** Check if Steam client natively displays playtime for this game without NativeGameLink. */
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
	const nativeBridgeHydrated = isDesktopLibraryPlaytimeHydrated(app);
	if (!nativeBridgeHydrated && isNativePlaytimePresent(doc, app)) {
		// Steam is already rendering this block and therefore owns its complete
		// typography, colors and spacing.
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

	const hydratedMinutes = nativeBridgeHydrated
		? Number(app?.minutes_playtime_forever || 0)
		: 0;
	const minutesForever = Math.max(0, statsData.minutesForever, hydratedMinutes);
	const playtimeFormatted = formatPlaytimeMinutes(minutesForever);
	const lastPlayedFormatted = statsData.lastPlayedAt ? formatLastPlayedDate(statsData.lastPlayedAt) : '';
	if (nativeBridgeHydrated) {
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
		}
		const achievement = stats.querySelector<HTMLElement>('[data-gdl-playbar-achievements="1"], #gdl-playbar-achievements');
		if (achievement?.parentElement === stats) stats.insertBefore(container, achievement);
		else if (container.parentElement !== stats) stats.appendChild(container);
		container.dataset.gdlPlaytimeShortcutId = String(shortcutAppId);

		const nativeStats: HTMLElement[] = [];

		// Steam's native playbar always presents the session first, followed by
		// the clock/playtime block. Keep the fallback DOM in that exact order.
		if (lastPlayedFormatted) {
			const native = buildNativePlaybarStatBlueprint(doc, 'lastPlayed', loc('AppDetails_SectionTitle_LastPlayed', 'ÚLTIMA VEZ JUGADO'), lastPlayedFormatted);
			if (native) { native.dataset.gdlStat = 'last-played'; native.dataset.gdlNativePlaybar = '1'; nativeStats.push(native); }
			else nativeStats.push(...htmlToElements(doc, `
				<div class="${classes.GameStat || ''} ${classes.LastPlayed || ''} ${classes.Visible || ''}" data-gdl-stat="last-played" data-gdl-native-blueprint="0">
					<div class="${classes.GameStatRight || ''} ${classes.LastPlayedRight || ''}">
						<div class="${classes.PlayBarLabel || ''} ${classes.LastPlayedLabel || ''}">${escapeHtml(loc('AppDetails_SectionTitle_LastPlayed', 'ÚLTIMA VEZ JUGADO'))}</div>
						<div class="${classes.PlayBarDetailLabel || ''} ${classes.LastPlayedInfo || ''}">${escapeHtml(lastPlayedFormatted)}</div>
					</div>
				</div>`));
		}
		if (minutesForever > 0) {
			const native = buildNativePlaybarStatBlueprint(doc, 'playtime', loc('AppDetails_SectionTitle_PlayTime', 'TIEMPO DE JUEGO'), playtimeFormatted);
			if (native) {
				native.dataset.gdlStat = 'playtime';
				native.dataset.gdlNativePlaybar = '1';
				elementsWithCssModuleClass(native, classes.PlayBarDetailLabel)[0]?.setAttribute('data-gdl-playtime-value', '1');
				nativeStats.push(native);
			}
			else nativeStats.push(...htmlToElements(doc, `
				<div class="${classes.GameStat || ''} ${classes.Playtime || ''} ${classes.Visible || ''}" data-gdl-stat="playtime" data-gdl-native-blueprint="0">
					<div class="${classes.GameStatIconForced || ''} ${classes.PlaytimeIconForced || ''}">${playtimeClockSvg()}</div>
					<div class="${classes.GameStatRight || ''}">
						<div class="${classes.PlayBarLabel || ''}">${escapeHtml(loc('AppDetails_SectionTitle_PlayTime', 'TIEMPO DE JUEGO'))}</div>
						<div class="${classes.PlayBarDetailLabel || ''}" data-gdl-playtime-value="1">${escapeHtml(playtimeFormatted)}</div>
					</div>
				</div>`));
		}

		for (const stat of nativeStats) {
			const key = stat.dataset.gdlStat === 'last-played'
				? NATIVE_UI_BLUEPRINT_KEYS.playbarLastPlayed
				: NATIVE_UI_BLUEPRINT_KEYS.playbarPlaytime;
			applyNativePlaybarTypography(stat, key);
		}
		container.replaceChildren(...nativeStats);
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
	const observedRunningApps = new Map<number, { title: string; steamAppId?: string }>();
	const nativeSidebarRunningTitles = readNativeSidebarRunningTitles();

	if (runningAppsSet && typeof runningAppsSet[Symbol.iterator] === 'function') {
		for (const app of runningAppsSet) {
			const rawId = Number(app?.appid ?? app?.m_unAppID);
			const numId = rawId < 0 ? (rawId >>> 0) : rawId;
			if (!Number.isFinite(numId) || numId <= 0) continue;
			const mappedShortcutId = numId < SHORTCUT_THRESHOLD
				? findShortcutIdForMappedSteamAppId(numId)
				: null;
			const trackedId = numId >= SHORTCUT_THRESHOLD ? numId : mappedShortcutId;
			if (!trackedId) continue;
			const shortcut = getShortcutAppById(trackedId);
			const title = String(shortcut?.display_name || shortcut?.m_strDisplayName
				|| app?.display_name || app?.m_strDisplayName || '').trim();
			const steamAppId = mappedShortcutId ? String(numId) : undefined;
			observedRunningApps.set(trackedId, { title, steamAppId });
		}
		for (const [trackedId, observed] of observedRunningApps) {
			currentRunningIds.add(trackedId);
			const existing = activeSessions.get(trackedId);

				if (!existing) {
					const instanceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
					const session: ActiveGameSession = {
						instanceId,
						shortcutAppId: trackedId,
						title: observed.title,
						steamAppId: observed.steamAppId,
						startedAt: Date.now(),
					};
					activeSessions.set(trackedId, session);
					backendLog(`Non-Steam app launched: ${observed.title} (${trackedId}), starting playtime session`);
					clearPlaytimeCacheAfter(startPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: instanceId,
							shortcut_app_id: String(trackedId),
							steam_app_id: observed.steamAppId || '',
							title: observed.title,
						}),
					}));
				} else {
					// Heartbeat ping
					clearPlaytimeCacheAfter(pingPlaytimeSessionBackend({
						request_json: JSON.stringify({
							instance_id: existing.instanceId,
							shortcut_app_id: String(trackedId),
							steam_app_id: existing.steamAppId || '',
							title: existing.title,
						}),
					}));
				}
		}
	}
	// Steam emulators can transfer the native running identity away from the
	// shortcut and omit the official AppID from SteamUIStore.RunningApps. The
	// virtualized sidebar remains authoritative in that state. Resolve the live
	// shortcut record instead of an obsolete historical shortcut mapping.
	for (const shortcut of getMappedShortcuts()) {
		if (!nativeSidebarRunningTitles.has(shortcut.title.toLocaleLowerCase())) continue;
		observedRunningApps.set(shortcut.id, { title: shortcut.title, steamAppId: shortcut.steamAppId });
	}
	syncMappedRunningSidebarLabels(nativeSidebarRunningTitles);

	// Check stopped games
	for (const [id, session] of Array.from(activeSessions.entries())) {
		if (!currentRunningIds.has(id)) {
			activeSessions.delete(id);
			backendLog(`Non-Steam app quit: ${session.title} (${id}), stopping playtime session`);
			clearPlaytimeCacheAfter(stopPlaytimeSessionBackend({
				request_json: JSON.stringify({
					instance_id: session.instanceId,
					shortcut_app_id: String(id),
					steam_app_id: session.steamAppId || '',
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
				steam_app_id: session.steamAppId || '',
				title: session.title,
			}),
		}));
	}
	activeSessions.clear();
	readNativeSidebarRunningTitles();
}
