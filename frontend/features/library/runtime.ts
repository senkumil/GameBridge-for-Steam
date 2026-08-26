import type { CommunityContentItem, FriendCategories, NewsItem, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { CACHE_TTL, cacheGet } from '../../core/cache';
import { getGameData, gameDataCache } from '../../core/game-data';
import { mappings, loadMappings, saveMappingChecked, shortcutMappingKey } from '../../core/mappings';
import { escapeHtml, stripSurroundingQuotes, templateToRegex } from '../../core/text';
import { findElementByText } from '../../core/dom';
import { FEED_CLASSES, POST_CLASSES } from '../../steam/css';
import { gdlText, loc, steamLanguageSync } from '../../steam/localization';
import { installSteamNavigation } from '../../steam/navigation';
import { findActiveShortcutAppId, findShortcutAppIdByName } from '../../steam/shortcuts';
import { GDL_INJECTED } from './constants';
import { spoofArtwork } from './artwork';
import { getCommunityContent, getNews } from './news';
import { ensureNativeGameChrome, getCurrentNativeGameInfo, removeNativeGameChrome } from './native-chrome';
import { getFriendData, hydrateFriendPersonas, populateActivityFeed, renderUnifiedActivityFeed } from './social';
import { disposeActivityFeedInteractions } from './social/feed';
import { disposeStatusPostBox } from './social/status';
import { disposeCommunityProgressiveReveal } from './community-view';
import { disposeTradingCardPreview } from './trading-cards';
import { renderLinkedGamePage } from './renderer';
import { finalizeLinkedAchievements } from './achievement-chrome';
import { cacheLocalAchievements, hasCachedLocalAchievements } from '../achievements/runtime';
import { fetchLocalAchievementData } from '../achievements/service';
import { findMappingForShortcut, isShortcutDismissed, normalizedShortcutAppId, scheduleShortcutInspection, syncLinkedGameNote } from '../shortcuts/runtime';
import { getPreferences } from '../../core/preferences';
import { injectPlaytimeFallbackStats, removePlaytimeFallbackStats } from '../playtime/tracker';
import { hideNoticeQuick } from './notice';
import { restoreNativeLibraryStyles } from './layout';
import { LibraryNavigationController } from './navigation-controller';
import { hasVisibleNativeLinksBar, reconcileLibraryNavigation, routedSteamAppId } from './native-route';
export { hideNoticeQuick } from './notice';
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

export function refreshLibraryArtwork(appId?: number): void {
	if (Number(appId) >= 2147483648) {
		try {
			const urlApi = (window as any).SteamClient?.URL;
			if (typeof urlApi?.ExecuteSteamURL === 'function') {
				urlApi.ExecuteSteamURL(`steam://nav/games/details/${appId}`);
				return;
			}
		} catch {}
	}
	const doc = libraryRuntimeHost().getMainWindowDoc();
	if (isUsableLibraryDocument(doc)) void tryInjectLibraryData(doc).catch(() => {});
}

const NON_STEAM_NOTICE_FALLBACK =
	'Some detailed information on %1$s is unavailable because it is a non-Steam game or mod. ' +
	'Steam will still manage launching the game for you and in most cases the in-game overlay will be available.';

const KNOWN_NOTICE_PATTERNS = [
	/(?:sobre|on|sur|über|para|delle|da)\s+([^\n\r]+?)\s+(?:no está disponible|is unavailable|n'est pas disponible|ist nicht verfügbar|não está disponível|non sono disponibili)/i,
	/(?:información sobre|information on|information sur|informationen über)\s+([^\n\r]+?)\s+(?:no está disponible|is unavailable|n'est pas disponible|ist nicht verfügbar)/i,
];

/** Find Steam's localized non-Steam shortcut notice and extract its title. */
export function findNonSteamNotice(doc: Document): { element: Element; title: string } | null {
	if (!doc) return null;
	const template = loc('AppDetails_Shortcut_Explanation', NON_STEAM_NOTICE_FALLBACK);
	const anchorText = template
		.split('%1$s')
		.reduce((left, right) => (right.trim().length > left.trim().length ? right : left), '')
		.trim()
		.slice(0, 60);

	let element: Element | null = null;
	if (anchorText) {
		element = findElementByText(doc, anchorText);
	}

	// Multi-language anchor fallbacks if localized token did not resolve
	if (!element) {
		const anchors = [
			'no es un juego de Steam',
			'no es un juego o mod',
			'non-Steam game',
			'is unavailable because it is a non-Steam game',
			'nicht von Steam',
			"n'est pas un jeu Steam",
			'não é um jogo Steam',
			'non è un gioco di Steam',
			'не из Steam',
		];
		for (const anchor of anchors) {
			element = findElementByText(doc, anchor);
			if (element) break;
		}
	}
	if (!element) return null;
	const content = element.textContent || '';
	// 1. Try template regex
	const regex = templateToRegex(template);
	const match = regex ? content.match(regex) : null;
	if (match?.[1]?.trim()) {
		return { element, title: stripSurroundingQuotes(match[1].trim()) };
	}

	// 2. Try known multi-language notice patterns
	for (const pattern of KNOWN_NOTICE_PATTERNS) {
		const m = content.match(pattern);
		if (m?.[1]?.trim()) {
			return { element, title: stripSurroundingQuotes(m[1].trim()) };
		}
	}

	// 3. Fallback: extract title from library title heading in page
	const heading = doc.querySelector('[class*="header_Title"], [class*="appheader_Title"], [class*="game_title"], [class*="Title_"]') as HTMLElement | null;
	const headingTitle = heading?.textContent?.trim() || '';
	if (headingTitle) {
		return { element, title: stripSurroundingQuotes(headingTitle) };
	}

	return null;
}

function insertSkeleton(doc: Document, noticeElement: Element): void {
	if (doc.getElementById(GDL_INJECTED) || doc.getElementById('gdl-skeleton')) return;
	const host = noticeElement.closest('div')?.parentElement;
	if (!host) return;
	const skeleton = doc.createElement('div');
	skeleton.id = 'gdl-skeleton';
	skeleton.className = FEED_CLASSES().ActivityFeedContainer;
	skeleton.style.cssText = 'font-family:inherit;padding:0 12px 24px;overflow:hidden;';
	skeleton.innerHTML = `
		<div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#8f98a0;margin-bottom:16px;">${escapeHtml(gdlText('activity', loc('AppDetails_SectionTitle_Activity', 'Activity')).toUpperCase())}</div>
		<div class="${FEED_CLASSES().AddToFeed} ${FEED_CLASSES().PostTextEntry} ${POST_CLASSES().PostTextEntry}">
			<textarea class="${POST_CLASSES().PostTextEntryArea}" rows="1" placeholder="${escapeHtml(gdlText('post_placeholder', loc('AppActivity_StatusUpdate_Post', 'Say something about this game to your friends...')))}"></textarea>
		</div>`;
	host.appendChild(skeleton);
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
	return renderLinkedGamePage(doc, notice, data, steamAppId, newsItems, friendResult, communityItems, {
		shortcutAppId: currentInjectedShortcutAppId,
		isCurrent: () => isCurrentRender(doc, steamAppId, generation),
	});
}

/** Remove GDL desktop-Library UI and restore Steam's original shortcut notice. */
export function cleanupInjection(doc: Document): void {
	navigationController.cancelCleanup(doc);
	removeNativeGameChrome(doc, true);
	removePlaytimeFallbackStats(doc);
	disposeStatusPostBox(doc);
	disposeActivityFeedInteractions(doc);
	disposeTradingCardPreview(doc);
	const community = doc.getElementById('gdl-community-content');
	if (community instanceof HTMLElement) disposeCommunityProgressiveReveal(community);
	for (const id of [
		GDL_INJECTED, 'gdl-skeleton', 'gdl-friends-section', 'gdl-achievements-section',
		'gdl-trading-cards-section', 'gdl-dlc-section', 'gdl-workshop-section',
		'gdl-playbar-achievements', 'gdl-link-bar', 'gdl-community-content', 'gdl-activity-feed',
	]) doc.getElementById(id)?.remove();
	restoreNativeLibraryStyles(doc);
	// Compatibility with injected UI from an earlier plugin build. New code uses
	// the snapshot registry above and never blindly resets Steam's display value.
	doc.querySelectorAll('[data-gdl-hidden]').forEach(element => element.removeAttribute('data-gdl-hidden'));
}
export function handleLibraryNavigation(doc: Document): void {
	navigationController.advance(doc);
	if (isUsableLibraryDocument(doc) && (currentInjectedDocument === doc || doc.getElementById(GDL_INJECTED))) {
		clearCurrentInjection(doc);
		cleanupInjection(doc);
	}
	reconcileLibraryNavigation(doc, { currentInjectedAppId, currentInjectedShortcutAppId, clearCurrentInjection, cleanupInjection });
}
function scheduleNavigationRetry(doc: Document, generation: number, delayMs: number): void {
	navigationController.scheduleRetry(doc, generation, delayMs, () => {
		if (isUsableLibraryDocument(doc)) void tryInjectLibraryData(doc).catch(() => {});
	});
}

function scheduleNavigationCleanup(doc: Document): void {
	const generation = navigationController.current(doc);
	navigationController.scheduleCleanup(doc, generation, 350, () => {
		if (!isCurrentNavigation(doc, generation)) return;
		if (findNonSteamNotice(doc)) {
			void tryInjectLibraryData(doc).catch(error => backendLog('Library recovery failed: ' + String(error)));
			return;
		}
		clearCurrentInjection(doc);
		cleanupInjection(doc);
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
	// Public Steam AppIDs and Steam's own links row are authoritative proof that
	// this is a native game. This guard must run before the notice heuristic:
	// native pages must never inherit GDL's cached feed, play-bar, or info panel.
	const routedAppId = routedSteamAppId(doc);
	if ((routedAppId !== null && routedAppId > 0 && routedAppId < 2147483648)
		|| hasVisibleNativeLinksBar(doc)) {
		clearCurrentInjection(doc);
		cleanupInjection(doc);
		return;
	}
	const noticeInfo = findNonSteamNotice(doc);
	if (!noticeInfo) {
		handleLibraryNavigation(doc);
		scheduleNavigationCleanup(doc);
		return;
	}
	installSteamNavigation(doc);
	navigationController.cancelCleanup(doc);
	const notice = noticeInfo.element;
	const gameTitle = noticeInfo.title;
	if (Object.keys(mappings).length === 0) {
		await loadMappings().catch(() => {});
	}
	if (!isCurrentNavigation(doc, navigationGeneration)) return;
	const currentNotice = findNonSteamNotice(doc);
	if (!notice.isConnected || !currentNotice || currentNotice.element !== notice || currentNotice.title !== gameTitle) {
		scheduleNavigationRetry(doc, navigationGeneration, 80);
		return;
	}
	const shortcutByName = findShortcutAppIdByName(gameTitle);
	const routedShortcutAppId = findActiveShortcutAppId(doc, '');
	const titleMatchedShortcutAppId = findActiveShortcutAppId(doc, gameTitle);
	const activeShortcutAppId = titleMatchedShortcutAppId || routedShortcutAppId || (shortcutByName ? String(shortcutByName) : null);
	const activeMapping = findMappingForShortcut(activeShortcutAppId, gameTitle);
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
				&& !findMappingForShortcut(String(visibleShortcutId), gameTitle));
		if (currentInjectedDocument === doc) clearCurrentInjection(doc);
		cleanupInjection(doc);
		if (getPreferences().autoDetectShortcuts && visibleShortcutId && !isShortcutDismissed(visibleShortcutId)) {
			scheduleShortcutInspection({ id: visibleShortcutId, title: gameTitle }, 120, true, false, true);
		}
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
	hideNoticeQuick(notice);
	backendLog(`Library page: "${gameTitle}" -> injecting data for ${steamAppId}`);

	const numShortcutId = Number(resolvedShortcutAppId || 0);
	if (numShortcutId >= 2147483648) {
		void injectPlaytimeFallbackStats(doc, numShortcutId, gameTitle, steamAppId,
			() => isCurrentRender(doc, steamAppId, generation));
		void spoofArtwork(numShortcutId, steamAppId, gameTitle)
			.catch(error => backendLog('Early artwork auto-repair failed: ' + String(error)));
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
		gameDataCache[steamAppId] = cachedData;
		const cachedNews = cacheGet<NewsItem[]>(`events8_${language}-en_${steamAppId}`, CACHE_TTL.news) || [];
		const cachedFriends = cacheGet<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends) || null;
		const cachedCommunity = cacheGet<CommunityContentItem[]>(`community6_${language}_${steamAppId}`, CACHE_TTL.communityContent) || [];
		renderedFromCache = renderLinkedPage(doc, notice, cachedData, steamAppId, cachedNews, cachedFriends, cachedCommunity, generation);
		if (renderedFromCache) finalizeAchievements(doc, steamAppId, cachedData.achievements?.total || 0, generation);
	} else if (!cachedData) {
		insertSkeleton(doc, notice);
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
	const artworkShortcutId = Number(currentInjectedShortcutAppId || resolvedShortcutAppId || '');
	if (Number.isInteger(artworkShortcutId) && artworkShortcutId >= 2147483648) {
		void spoofArtwork(artworkShortcutId, steamAppId, data.name || gameTitle)
			.catch(error => backendLog('Artwork auto-repair failed: ' + String(error)));
	}

	// Fetch dynamic content streams in parallel so slow endpoints don't block each other
	const newsPromise = getNews(steamAppId).catch((): NewsItem[] => []);
	const friendPromise = getFriendData(steamAppId).catch(() => ({ html: '', data: null as FriendCategories | null }));
	const communityPromise = getCommunityContent(steamAppId).catch((): CommunityContentItem[] => []);

	if (!renderedFromCache) {
		const [newsItems, friendData, communityItems] = await Promise.all([
			newsPromise,
			friendPromise,
			communityPromise,
		]);
		if (!isCurrentRender(doc, steamAppId, generation)) return;
		const latestNotice = findNonSteamNotice(doc);
		if (!latestNotice || !renderLinkedPage(doc, latestNotice.element, data, steamAppId, newsItems, friendData.data, communityItems, generation)) {
			// Steam can detach its native notice while a background stream is
			// resolving. The stable legacy runtime kept the already rendered page;
			// invalidating it here causes an endless re-render/removal cycle.
			return;
		}
		void hydrateFriendPersonas(doc, friendData.data, steamAppId, data.name);
		void populateActivityFeed(doc, steamAppId, data.name, data.header_image || '')
			.catch(error => backendLog('Activity feed error: ' + String(error)));
		finalizeAchievements(doc, steamAppId, data.achievements?.total || 0, generation);
	} else {
		// Keep the cached layout mounted. Rebuilding it when one slow optional
		// stream arrives tears down Steam's columns and causes the visible flash
		// seen during startup; individual sections can hydrate in place instead.
		finalizeAchievements(doc, steamAppId, data.achievements?.total || 0, generation);
		void newsPromise.then(newsItems => {
			if (!isCurrentRender(doc, steamAppId, generation) || newsItems.length === 0) return;
			const feed = doc.getElementById('gdl-activity-feed');
			if (feed) {
				feed.innerHTML = renderUnifiedActivityFeed(steamAppId, currentInjectedShortcutAppId, newsItems, data?.header_image || '');
			}
			void populateActivityFeed(doc, steamAppId, data?.name || '', data?.header_image || '')
				.catch(error => backendLog('Activity feed error: ' + String(error)));
		});
		void friendPromise.then(friendData => {
			if (!isCurrentRender(doc, steamAppId, generation) || !friendData.data) return;
			void hydrateFriendPersonas(doc, friendData.data, steamAppId, data?.name || '');
		});
	}
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
	navigationController.advance(doc);
	clearCurrentInjection(doc);
	cleanupInjection(doc);
	if (reinject) void tryInjectLibraryData(doc).catch(error => backendLog('Library reinjection failed: ' + error));
}
export function disposeLibraryRuntime(): void {
	const doc = currentInjectedDocument || configuredLibraryRuntimeHost?.getMainWindowDoc() || null;
	if (doc) cleanupInjection(doc);
	navigationController.dispose();
	clearCurrentInjection();
	configuredLibraryRuntimeHost = null;
}
