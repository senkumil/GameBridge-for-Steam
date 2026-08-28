import type { CommunityContentItem, FriendCategories, NewsItem, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { CACHE_TTL, cacheGet } from '../../core/cache';
import { cacheGameDataValue, getGameData, gameDataCache } from '../../core/game-data';
import { mappings, loadMappings, saveMappingChecked, shortcutMappingKey } from '../../core/mappings';
import { steamLanguageSync } from '../../steam/localization';
import { installSteamNavigation } from '../../steam/navigation';
import { findActiveShortcutAppId, findShortcutAppIdByName } from '../../steam/shortcuts';
import { GDL_INJECTED } from './constants';
import { getCommunityContent, getNews } from './news';
import { clearNativeGameChromeState, ensureNativeGameChrome, getCurrentNativeGameInfo, removeNativeGameChrome } from './native-chrome';
import { getFriendData, hydrateFriendPersonas, populateActivityFeed, renderUnifiedActivityFeed } from './social';
import { disposeActivityFeedInteractions } from './social/feed';
import { disposeStatusPostBox } from './social/status';
import { disposeCommunityProgressiveReveal, scheduleCommunityHydration } from './community-view';
import { disposeResponsiveTradingCardGrids, disposeTradingCardPreview } from './trading-cards';
import { renderLinkedGamePage } from './renderer';
import { finalizeLinkedAchievements } from './achievement-chrome';
import { cacheLocalAchievements, hasCachedLocalAchievements } from '../achievements/runtime';
import { fetchLocalAchievementData } from '../achievements/service';
import { findMappingForShortcut, isShortcutDismissed, normalizedShortcutAppId, syncLinkedGameNote } from '../shortcuts/runtime';
import { injectPlaytimeFallbackStats, removePlaytimeFallbackStats } from '../playtime/tracker';
import { findNonSteamNotice, hideNoticeQuick } from './notice';
import { restoreNativeLibraryStyles } from './layout';
import { LibraryNavigationController } from './navigation-controller';
import { isPublicSteamLibraryRoute, reconcileLibraryNavigation } from './native-route';
import { ensureManualLinkNoticeButton, removeManualLinkNoticeButton } from './manual-link-button';
import { beginLibraryRouteExit, finishLibraryRouteExit, hasOwnedLibraryChrome, isLibraryRouteExitPending, removeOwnedLibraryChrome } from './route-exit';
import {
	cancelLinkedShortcutLoading,
	completeLinkedShortcutLoading,
	LINKED_LOADING_SIDEBAR_ID,
	stageLinkedShortcutLoading,
} from './loading-stage';
export { findNonSteamNotice, hideNoticeQuick } from './notice';
export interface LibraryRuntimeHost {
	getMainWindowDoc: () => Document | null;
}
let configuredLibraryRuntimeHost: LibraryRuntimeHost | null = null;
let currentInjectedDocument: Document | null = null;
let currentInjectedAppId: string | null = null;
let currentInjectedShortcutAppId: string | null = null;
let injectionGeneration = 0;
let injectionInFlight: { doc: Document; steamAppId: string; generation: number } | null = null;
const navigationController = new LibraryNavigationController();
function isCurrentNavigation(doc: Document, generation: number): boolean {
	return isUsableLibraryDocument(doc) && navigationController.isCurrent(doc, generation);
}
function isUsableLibraryDocument(doc: Document | null | undefined): doc is Document {
	try {
		return Boolean(doc?.body && doc.documentElement?.isConnected && doc.defaultView && !doc.defaultView.closed);
	} catch { return false; }
}
export function configureLibraryRuntimeHost(host: LibraryRuntimeHost): void {
	configuredLibraryRuntimeHost = host;
}

function libraryRuntimeHost(): LibraryRuntimeHost {
	if (!configuredLibraryRuntimeHost) throw new Error('library_runtime_host_not_configured');
	return configuredLibraryRuntimeHost;
}

function setCurrentInjection(doc: Document, steamAppId: string, shortcutAppId: string | null): number {
	if (currentInjectedDocument !== doc || currentInjectedAppId !== steamAppId || currentInjectedShortcutAppId !== shortcutAppId) injectionGeneration += 1;
	currentInjectedDocument = doc;
	currentInjectedAppId = steamAppId;
	currentInjectedShortcutAppId = shortcutAppId;
	return injectionGeneration;
}

function clearCurrentInjection(doc?: Document | null): void {
	if (doc && currentInjectedDocument !== doc) return;
	injectionGeneration += 1;
	if (!doc || injectionInFlight?.doc === doc) injectionInFlight = null;
	currentInjectedDocument = null;
	currentInjectedAppId = null;
	currentInjectedShortcutAppId = null;
}

function isCurrentRender(doc: Document, appId: string, generation: number): boolean {
	return currentInjectedDocument === doc && currentInjectedAppId === appId && injectionGeneration === generation;
}

export function refreshLibraryArtwork(_appId?: number): void {
	// Never navigate Steam as a side effect of applying artwork. ExecuteSteamURL
	// can focus/maximize the desktop client and can also switch the visible
	// shortcut while Steam is rebuilding its library model.
	const doc = libraryRuntimeHost().getMainWindowDoc();
	if (isUsableLibraryDocument(doc)) void tryInjectLibraryData(doc).catch(() => {});
}

function renderLinkedPage(
	doc: Document,
	notice: Element,
	data: SteamGameData,
	steamAppId: string,
	newsItems: NewsItem[],
	friendResult: FriendCategories | null | undefined,
	communityItems: CommunityContentItem[] | undefined,
	generation: number,
): boolean {
	const rendered = renderLinkedGamePage(doc, notice, data, steamAppId, newsItems, friendResult, communityItems, {
		shortcutAppId: currentInjectedShortcutAppId,
		isCurrent: () => isCurrentRender(doc, steamAppId, generation),
	});
	if (rendered) completeLinkedShortcutLoading(doc, generation);
	return rendered;
}

/** Remove GDL desktop-Library UI and restore Steam's original shortcut notice. */
export function cleanupInjection(doc: Document): void {
	cancelLinkedShortcutLoading(doc);
	navigationController.cancelCleanup(doc);
	finishLibraryRouteExit(doc);
	removeNativeGameChrome(doc, true);
	removePlaytimeFallbackStats(doc);
	disposeStatusPostBox(doc);
	disposeActivityFeedInteractions(doc);
	disposeTradingCardPreview(doc);
	disposeResponsiveTradingCardGrids(doc);
	const community = doc.getElementById('gdl-community-content');
	if (community instanceof HTMLElement) disposeCommunityProgressiveReveal(community);
	for (const id of [
		GDL_INJECTED, 'gdl-skeleton', 'gdl-friends-section', 'gdl-achievements-section',
		'gdl-trading-cards-section', 'gdl-dlc-section', 'gdl-workshop-section',
		'gdl-playbar-achievements', 'gdl-link-bar', 'gdl-community-content', 'gdl-activity-feed',
		'gdl-manual-link-notice-button-row',
		LINKED_LOADING_SIDEBAR_ID,
	]) doc.getElementById(id)?.remove();
	removeManualLinkNoticeButton(doc);
	restoreNativeLibraryStyles(doc);
	// Compatibility with injected UI from an earlier plugin build. New code uses
	// the snapshot registry above and never blindly resets Steam's display value.
	doc.querySelectorAll('[data-gdl-hidden]').forEach(element => element.removeAttribute('data-gdl-hidden'));
}

/** Finish a route change without touching any Steam-owned node. Native style
 * restoration happens synchronously while leaving the linked shortcut; this
 * deferred step only disposes listeners and removes GameBridge-owned chrome. */
function cleanupOwnedLibraryChromeAfterRouteExit(doc: Document): void {
	cancelLinkedShortcutLoading(doc);
	finishLibraryRouteExit(doc);
	disposeStatusPostBox(doc);
	disposeActivityFeedInteractions(doc);
	disposeTradingCardPreview(doc);
	disposeResponsiveTradingCardGrids(doc);
	const community = doc.getElementById('gdl-community-content');
	if (community instanceof HTMLElement) disposeCommunityProgressiveReveal(community);
	clearNativeGameChromeState();
	removeOwnedLibraryChrome(doc);
}

function retireLinkedRouteFromNativePage(doc: Document, generation: number): void {
	if (currentInjectedDocument === doc) clearCurrentInjection(doc);
	if (!hasOwnedLibraryChrome(doc) && !isLibraryRouteExitPending(doc)) return;
	// Restore only snapshots created while the previous linked shortcut owned
	// this document. Nothing on the native page is measured, styled or clicked.
	restoreNativeLibraryStyles(doc);
	if (!isLibraryRouteExitPending(doc, generation)) scheduleNavigationCleanup(doc, generation);
}
export function handleLibraryNavigation(doc: Document): void {
	const generation = navigationController.advance(doc);
	if (isUsableLibraryDocument(doc) && (currentInjectedDocument === doc || hasOwnedLibraryChrome(doc))) {
		clearCurrentInjection(doc);
		// This is departure cleanup for the linked shortcut, before any native
		// route processing. It restores only snapshots GameBridge previously made.
		restoreNativeLibraryStyles(doc);
		scheduleNavigationCleanup(doc, generation);
	}
	reconcileLibraryNavigation(doc, {
		currentInjectedAppId,
		currentInjectedShortcutAppId,
		clearCurrentInjection,
		scheduleCleanup: () => scheduleNavigationCleanup(doc, generation),
	});
}
function scheduleNavigationRetry(doc: Document, generation: number, delayMs: number): void {
	navigationController.scheduleRetry(doc, generation, delayMs, () => {
		if (isUsableLibraryDocument(doc)) void tryInjectLibraryData(doc).catch(() => {});
	});
}

function scheduleNavigationCleanup(doc: Document, generation = navigationController.current(doc)): void {
	if (!hasOwnedLibraryChrome(doc) && !isLibraryRouteExitPending(doc)) return;
	if (isLibraryRouteExitPending(doc, generation)) return;
	beginLibraryRouteExit(doc, generation);
	navigationController.scheduleCleanup(doc, generation, 350, () => {
		if (!isCurrentNavigation(doc, generation) || !isLibraryRouteExitPending(doc, generation)) return;
		cleanupOwnedLibraryChromeAfterRouteExit(doc);
		if (findNonSteamNotice(doc)) {
			void tryInjectLibraryData(doc).catch(error => backendLog('Library recovery failed: ' + String(error)));
		}
	});
}

async function warmLocalAchievements(steamAppId: string, shortcutAppId: string | null): Promise<void> {
	if (hasCachedLocalAchievements(steamAppId)) return;
	const data = await fetchLocalAchievementData(steamAppId, { stateAppId: shortcutAppId });
	if (data?.found && Array.isArray(data.achievements) && data.total > 0) {
		cacheLocalAchievements(data, steamAppId, shortcutAppId);
	}
}

function finalizeAchievements(doc: Document, steamAppId: string, fallbackTotal: number, generation = injectionGeneration): void {
	void finalizeLinkedAchievements(doc, {
		steamAppId,
		fallbackTotal,
		stateAppId: currentInjectedShortcutAppId || undefined,
		isCurrent: () => isCurrentRender(doc, steamAppId, generation),
	}).catch(error => backendLog('Achievements error: ' + String(error)));
}

export async function tryInjectLibraryData(doc: Document): Promise<void> {
	if (!isUsableLibraryDocument(doc)) return;
	const navigationGeneration = navigationController.current(doc);
	const activeLibraryDoc = configuredLibraryRuntimeHost?.getMainWindowDoc() || null;
	if (isUsableLibraryDocument(activeLibraryDoc) && activeLibraryDoc !== doc) return;
	if (currentInjectedDocument && currentInjectedDocument !== doc
		&& (!isUsableLibraryDocument(currentInjectedDocument) || configuredLibraryRuntimeHost?.getMainWindowDoc() === doc)) {
		const previousDoc = currentInjectedDocument;
		clearCurrentInjection();
		if (isUsableLibraryDocument(previousDoc)) cleanupInjection(previousDoc);
	}
	// Strict ownership boundary: on a native game route GameBridge performs no
	// page synchronization or injection. If a linked shortcut was visible just
	// before it, only retire GameBridge-owned remnants from that previous route.
	if (isPublicSteamLibraryRoute(doc)) {
		retireLinkedRouteFromNativePage(doc, navigationGeneration);
		return;
	}
	const noticeInfo = findNonSteamNotice(doc);
	if (!noticeInfo) {
		// Absence of the notice is transient while Steam hydrates a native feed.
		// Only an already-confirmed route exit may renew the quiet-period timer;
		// ordinary native mutations must not become synthetic navigations.
		if (isLibraryRouteExitPending(doc)) scheduleNavigationCleanup(doc, navigationGeneration);
		return;
	}
	if (isLibraryRouteExitPending(doc)) {
		scheduleNavigationCleanup(doc, navigationGeneration);
		return;
	}
	installSteamNavigation(doc);
	navigationController.cancelCleanup(doc);
	const notice = noticeInfo.element;
	const gameTitle = noticeInfo.title;
	stageLinkedShortcutLoading(doc, notice, navigationGeneration);
	if (Object.keys(mappings).length === 0) {
		await loadMappings().catch(() => {});
	}
	if (!isCurrentNavigation(doc, navigationGeneration)) {
		cancelLinkedShortcutLoading(doc, navigationGeneration);
		return;
	}
	const currentNotice = findNonSteamNotice(doc);
	if (!notice.isConnected || !currentNotice || currentNotice.element !== notice || currentNotice.title !== gameTitle) {
		cancelLinkedShortcutLoading(doc, navigationGeneration);
		scheduleNavigationRetry(doc, navigationGeneration, 80);
		return;
	}
	const shortcutByName = findShortcutAppIdByName(gameTitle);
	const routedShortcutAppId = findActiveShortcutAppId(doc, '');
	const titleMatchedShortcutAppId = findActiveShortcutAppId(doc, gameTitle);
	const activeShortcutAppId = titleMatchedShortcutAppId || routedShortcutAppId || (shortcutByName ? String(shortcutByName) : null);
	const normalizedActiveShortcutId = normalizedShortcutAppId(activeShortcutAppId);
	const activeShortcutDismissed = Boolean(normalizedActiveShortcutId && isShortcutDismissed(normalizedActiveShortcutId));
	const activeMapping = activeShortcutDismissed ? null : findMappingForShortcut(activeShortcutAppId, gameTitle);
	const steamAppId = activeMapping;
	const resolvedShortcutAppId = activeShortcutAppId;
	if (!steamAppId || !/^\d+$/.test(steamAppId)) {
		let visibleShortcutId = normalizedShortcutAppId(activeShortcutAppId);
		if (!visibleShortcutId) {
			visibleShortcutId = findShortcutAppIdByName(gameTitle);
		}
		if (!visibleShortcutId) {
			let hash = 0;
			for (let i = 0; i < gameTitle.length; i++) hash = (hash * 31 + gameTitle.charCodeAt(i)) >>> 0;
			visibleShortcutId = 2147483648 + (hash % 1000000000);
		}
		void injectPlaytimeFallbackStats(doc, visibleShortcutId, gameTitle, undefined,
			() => isUsableLibraryDocument(doc) && !doc.getElementById(GDL_INJECTED)
				&& (isShortcutDismissed(visibleShortcutId) || !findMappingForShortcut(String(visibleShortcutId), gameTitle)));
		if (currentInjectedDocument === doc) clearCurrentInjection(doc);
		cleanupInjection(doc);
		ensureManualLinkNoticeButton(doc, notice, String(visibleShortcutId), gameTitle, () => findNonSteamNotice(doc));
		return;
	}

	if (activeShortcutAppId && !mappings[shortcutMappingKey(activeShortcutAppId)]) {
		const activeKey = shortcutMappingKey(activeShortcutAppId);
		mappings[activeKey] = steamAppId;
		void saveMappingChecked(activeKey, steamAppId);
		backendLog(`Recovered mapping for active shortcut ${activeShortcutAppId}`);
	}

	const existing = doc.getElementById(GDL_INJECTED) as HTMLElement | null;
	const mountedShortcutAppId = existing?.dataset.gdlShortcutAppId
		|| (currentInjectedDocument === doc && currentInjectedAppId === steamAppId ? currentInjectedShortcutAppId : null);
	const shortcutIdentityChanged = Boolean(mountedShortcutAppId && resolvedShortcutAppId && mountedShortcutAppId !== resolvedShortcutAppId);
	if (existing && doc.getElementById('gdl-link-bar') && !shortcutIdentityChanged
		&& (!existing.dataset.gdlSteamAppId || existing.dataset.gdlSteamAppId === steamAppId)) {
		const generation = setCurrentInjection(doc, steamAppId, resolvedShortcutAppId);
		existing.dataset.gdlSteamAppId = steamAppId;
		if (resolvedShortcutAppId) existing.dataset.gdlShortcutAppId = resolvedShortcutAppId;
		const nativeInfo = getCurrentNativeGameInfo();
		if (nativeInfo?.key === steamAppId) ensureNativeGameChrome(doc, nativeInfo);
		if (!doc.getElementById('gdl-playbar-achievements')) {
			finalizeAchievements(doc, steamAppId, gameDataCache[steamAppId]?.achievements?.total || 0, generation);
		}
		const numId = Number(resolvedShortcutAppId || 0);
		if (numId >= 2147483648) void injectPlaytimeFallbackStats(doc, numId, gameTitle, steamAppId,
			() => isCurrentRender(doc, steamAppId, generation));
		return;
	}

	if (existing && existing.dataset.gdlSteamAppId !== steamAppId) {
		clearCurrentInjection(doc);
		cleanupInjection(doc);
	}
	if (currentInjectedDocument && currentInjectedDocument !== doc) {
		const previousDoc = currentInjectedDocument;
		clearCurrentInjection(previousDoc);
		if (isUsableLibraryDocument(previousDoc)) cleanupInjection(previousDoc);
	} else if (currentInjectedDocument === doc && currentInjectedAppId && currentInjectedAppId !== steamAppId) {
		clearCurrentInjection(doc);
		cleanupInjection(doc);
	}
	const generation = setCurrentInjection(doc, steamAppId, resolvedShortcutAppId);
	removeManualLinkNoticeButton(doc);
	hideNoticeQuick(notice);
	backendLog(`Library page: "${gameTitle}" -> injecting data for ${steamAppId}`);

	const numShortcutId = Number(resolvedShortcutAppId || 0);
	if (numShortcutId >= 2147483648) {
		void injectPlaytimeFallbackStats(doc, numShortcutId, gameTitle, steamAppId,
			() => isCurrentRender(doc, steamAppId, generation));
	}

	const language = steamLanguageSync() || 'spanish';
	const cachedData = gameDataCache[steamAppId]
		|| (gameDataCache[`${steamAppId}:${language}`] !== undefined
			? gameDataCache[`${steamAppId}:${language}`]
			: cacheGet<SteamGameData>(`gamedata_v2_${steamAppId}_${language}`, CACHE_TTL.gameMetadata))
		|| cacheGet<SteamGameData>(`gamedata_v2_${steamAppId}_spanish`, CACHE_TTL.gameMetadata)
		|| cacheGet<SteamGameData>(`gamedata_v2_${steamAppId}_english`, CACHE_TTL.gameMetadata)
		|| null;
	let renderedFromCache = false;
	if (cachedData) {
		cacheGameDataValue(steamAppId, cachedData);
		const cachedNews = cacheGet<NewsItem[]>(`events8_${language}-en_${steamAppId}`, CACHE_TTL.news) || [];
		const cachedFriends = cacheGet<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends) || null;
		const cachedCommunity = cacheGet<CommunityContentItem[]>(`community6_${language}_${steamAppId}`, CACHE_TTL.communityContent) || [];
		renderedFromCache = renderLinkedPage(doc, notice, cachedData, steamAppId, cachedNews, cachedFriends, cachedCommunity, generation);
		if (renderedFromCache) finalizeAchievements(doc, steamAppId, cachedData.achievements?.total || 0, generation);
	} else if (!cachedData) {
		stageLinkedShortcutLoading(doc, notice, navigationGeneration);
	}

	if (injectionInFlight?.doc === doc && injectionInFlight.steamAppId === steamAppId && injectionInFlight.generation === generation) return;
	const flight = { doc, steamAppId, generation };
	injectionInFlight = flight;

	// Warm local achievements and finalize achievement UI in parallel with game data fetch
	void warmLocalAchievements(steamAppId, resolvedShortcutAppId)
		.then(() => {
			if (isCurrentRender(doc, steamAppId, generation)) {
				const total = gameDataCache[steamAppId]?.achievements?.total || cachedData?.achievements?.total || 0;
				finalizeAchievements(doc, steamAppId, total, generation);
			}
		})
		.catch(() => {});

	let data: SteamGameData | null = null;
	try {
		data = await getGameData(steamAppId);
	} finally {
		if (injectionInFlight === flight) injectionInFlight = null;
	}

	if (!data || !isCurrentNavigation(doc, navigationGeneration) || !isCurrentRender(doc, steamAppId, generation)) {
		if (!data) backendLog('No game data for: ' + steamAppId);
		return;
	}

	void syncLinkedGameNote(gameTitle || data.name, data, steamAppId);

	// Friend ownership is a local Steam IPC and determines whether its native
	// sidebar section exists. Remote news and community content hydrate later.
	const newsPromise = getNews(steamAppId).catch((): NewsItem[] => []);
	const friendPromise = getFriendData(steamAppId).catch(() => ({ html: '', data: null as FriendCategories | null }));

	if (!renderedFromCache) {
		const friendData = await friendPromise;
		if (!isCurrentRender(doc, steamAppId, generation)) return;
		const latestNotice = findNonSteamNotice(doc);
		if (!latestNotice || !renderLinkedPage(doc, latestNotice.element, data, steamAppId, [], friendData.data, [], generation)) {
			// Steam can detach its native notice while a background stream is
			// resolving. The stable legacy runtime kept the already rendered page;
			// invalidating it here causes an endless re-render/removal cycle.
			return;
		}
		void hydrateFriendPersonas(doc, friendData.data, steamAppId, data.name);
		finalizeAchievements(doc, steamAppId, data.achievements?.total || 0, generation);
	} else {
		finalizeAchievements(doc, steamAppId, data.achievements?.total || 0, generation);
	}
	// Keep the mounted layout stable and update optional streams independently.
	void newsPromise.then(newsItems => {
		if (!isCurrentRender(doc, steamAppId, generation)) return;
		const feed = doc.getElementById('gdl-activity-feed');
		if (feed && newsItems.length > 0) feed.innerHTML = renderUnifiedActivityFeed(steamAppId, currentInjectedShortcutAppId, newsItems, data?.header_image || '');
		void populateActivityFeed(doc, steamAppId, data?.name || '', data?.header_image || '')
			.catch(error => backendLog('Activity feed error: ' + String(error)));
	});
	void friendPromise.then(friendData => {
		if (!isCurrentRender(doc, steamAppId, generation) || !friendData.data) return;
		void hydrateFriendPersonas(doc, friendData.data, steamAppId, data?.name || '');
	});
	scheduleCommunityHydration(doc, data, () => getCommunityContent(steamAppId).catch((): CommunityContentItem[] => []),
		() => isCurrentRender(doc, steamAppId, generation));
}

export function getCurrentInjectedAppId(): string | null { return currentInjectedAppId; }
export function getCurrentInjectedShortcutAppId(): string | null { return currentInjectedShortcutAppId; }
export function resetLibraryInjection(reinject = false, targetDoc?: Document | null): void {
	const liveDoc = libraryRuntimeHost().getMainWindowDoc();
	const doc = isUsableLibraryDocument(liveDoc) ? liveDoc : targetDoc;
	if (!doc) {
		navigationController.dispose();
		clearCurrentInjection();
		return;
	}
	const generation = navigationController.advance(doc);
	if (isPublicSteamLibraryRoute(doc)) {
		retireLinkedRouteFromNativePage(doc, generation);
		return;
	}
	clearCurrentInjection(doc);
	cleanupInjection(doc);
	if (reinject) void tryInjectLibraryData(doc).catch(error => backendLog('Library reinjection failed: ' + error));
}
export function disposeLibraryRuntime(): void {
	const doc = currentInjectedDocument || configuredLibraryRuntimeHost?.getMainWindowDoc() || null;
	if (doc) {
		if (isPublicSteamLibraryRoute(doc)) {
			if (hasOwnedLibraryChrome(doc) || isLibraryRouteExitPending(doc)) {
				restoreNativeLibraryStyles(doc);
				cleanupOwnedLibraryChromeAfterRouteExit(doc);
			}
		} else cleanupInjection(doc);
	}
	navigationController.dispose();
	clearCurrentInjection();
	configuredLibraryRuntimeHost = null;
}
