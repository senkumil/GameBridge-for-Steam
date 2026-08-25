import type { CommunityContentItem, FriendCategories, NewsItem, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { CACHE_TTL, cacheGet } from '../../core/cache';
import { getGameData, gameDataCache } from '../../core/game-data';
import { findMappingForTitle, mappings, saveMappingChecked, shortcutMappingKey } from '../../core/mappings';
import { escapeHtml, normalizeTitle, templateToRegex } from '../../core/text';
import { findElementByText } from '../../core/dom';
import { FEED_CLASSES, POST_CLASSES } from '../../steam/css';
import { gdlText, getSteamLanguage, loc, steamLanguageSync } from '../../steam/localization';
import { installSteamNavigation } from '../../steam/navigation';
import { findActiveShortcutAppId } from '../../steam/shortcuts';
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
import { normalizedShortcutAppId, scheduleShortcutInspection, syncLinkedGameNote } from '../shortcuts/runtime';

export interface LibraryRuntimeHost {
	getMainWindowDoc: () => Document | null;
}

let configuredLibraryRuntimeHost: LibraryRuntimeHost | null = null;
let currentInjectedAppId: string | null = null;
let currentInjectedShortcutAppId: string | null = null;
let injectionInFlight: string | null = null;

export function configureLibraryRuntimeHost(host: LibraryRuntimeHost): void {
	configuredLibraryRuntimeHost = host;
}

function libraryRuntimeHost(): LibraryRuntimeHost {
	if (!configuredLibraryRuntimeHost) throw new Error('library_runtime_host_not_configured');
	return configuredLibraryRuntimeHost;
}

export function refreshLibraryArtwork(appId: number): void {
	try {
		const steamClient = (window as any).SteamClient;
		if (steamClient?.URL?.ExecuteSteamURL) {
			steamClient.URL.ExecuteSteamURL('steam://nav/games/details/' + appId);
			return;
		}
	} catch {}
	const doc = libraryRuntimeHost().getMainWindowDoc();
	if (!doc) return;
	try {
		currentInjectedAppId = null;
		currentInjectedShortcutAppId = null;
		cleanupInjection(doc);
		void tryInjectLibraryData(doc);
	} catch {}
}



const NON_STEAM_NOTICE_FALLBACK =
	'Some detailed information on %1$s is unavailable because it is a non-Steam game or mod. ' +
	'Steam will still manage launching the game for you and in most cases the in-game overlay will be available.';

/** Find Steam's localized non-Steam shortcut notice and extract its title. */
export function findNonSteamNotice(doc: Document): { element: Element; title: string } | null {
	const template = loc('AppDetails_Shortcut_Explanation', NON_STEAM_NOTICE_FALLBACK);
	const anchorText = template
		.split('%1$s')
		.reduce((left, right) => (right.trim().length > left.trim().length ? right : left), '')
		.trim()
		.slice(0, 60);
	if (!anchorText) return null;
	const element = findElementByText(doc, anchorText);
	if (!element) return null;
	const regex = templateToRegex(template);
	const match = regex ? (element.textContent || '').match(regex) : null;
	if (!match?.[1]) return null;
	return { element, title: match[1].trim() };
}

/** Hide the default non-Steam notice immediately to prevent a flash before cached rendering. */
export function hideNoticeQuick(noticeElement: Element): void {
	let element: HTMLElement | null = noticeElement as HTMLElement;
	for (let depth = 0; depth < 4 && element; depth += 1) {
		if (depth > 0 && element.querySelector('[data-nsp]')) break;
		element.style.display = 'none';
		element.setAttribute('data-gdl-hidden', '1');
		const parent = element.parentElement;
		if (!parent || parent.childElementCount > 1) break;
		element = parent;
	}
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

function isCurrentRender(appId: string): boolean {
	return currentInjectedAppId === appId;
}

function renderLinkedPage(
	doc: Document,
	notice: Element,
	data: SteamGameData,
	steamAppId: string,
	newsItems: NewsItem[],
	friendResult: FriendCategories | null | undefined,
	communityItems: CommunityContentItem[] | undefined,
): void {
	renderLinkedGamePage(doc, notice, data, steamAppId, newsItems, friendResult, communityItems, {
		shortcutAppId: currentInjectedShortcutAppId,
		isCurrent: () => isCurrentRender(steamAppId),
	});
}

/** Remove GDL desktop-Library UI and restore Steam's original shortcut notice. */
export function cleanupInjection(doc: Document): void {
	removeNativeGameChrome(doc, true);
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
	doc.querySelectorAll('[data-gdl-hidden]').forEach(element => {
		(element as HTMLElement).style.display = '';
		element.removeAttribute('data-gdl-hidden');
	});
}

async function warmLocalAchievements(steamAppId: string, shortcutAppId: string | null): Promise<void> {
	if (hasCachedLocalAchievements(steamAppId)) return;
	const data = await fetchLocalAchievementData(steamAppId, { stateAppId: shortcutAppId });
	if (data?.found && Array.isArray(data.achievements) && data.total > 0) {
		cacheLocalAchievements(data, steamAppId, shortcutAppId);
	}
}

function finalizeAchievements(doc: Document, steamAppId: string, fallbackTotal: number): void {
	void finalizeLinkedAchievements(doc, {
		steamAppId,
		fallbackTotal,
		stateAppId: currentInjectedShortcutAppId || undefined,
		isCurrent: () => isCurrentRender(steamAppId),
	}).catch(error => backendLog('Achievements error: ' + String(error)));
}

export async function tryInjectLibraryData(doc: Document): Promise<void> {
	installSteamNavigation(doc);
	const noticeInfo = findNonSteamNotice(doc);
	if (!noticeInfo) {
		cleanupInjection(doc);
		currentInjectedAppId = null;
		currentInjectedShortcutAppId = null;
		return;
	}

	const notice = noticeInfo.element;
	const gameTitle = noticeInfo.title;
	const activeShortcutAppId = findActiveShortcutAppId(doc, gameTitle);
	const steamAppId = findMappingForTitle(gameTitle, activeShortcutAppId);
	if (!steamAppId || !/^\d+$/.test(steamAppId)) {
		const visibleShortcutId = normalizedShortcutAppId(activeShortcutAppId);
		if (visibleShortcutId) {
			backendLog(`Visible unlinked shortcut queued for automatic detection: ${gameTitle} (${visibleShortcutId})`);
			scheduleShortcutInspection({ id: visibleShortcutId, title: gameTitle });
		}
		if (currentInjectedAppId) cleanupInjection(doc);
		currentInjectedAppId = null;
		currentInjectedShortcutAppId = null;
		return;
	}

	const linkedShortcutId = normalizedShortcutAppId(activeShortcutAppId);
	if (linkedShortcutId) scheduleShortcutInspection({ id: linkedShortcutId, title: gameTitle }, 700, true);

	if (activeShortcutAppId && mappings[normalizeTitle(gameTitle)] && !mappings[shortcutMappingKey(activeShortcutAppId)]) {
		const activeKey = shortcutMappingKey(activeShortcutAppId);
		mappings[activeKey] = steamAppId;
		void saveMappingChecked(activeKey, steamAppId);
		backendLog(`Recovered mapping for active shortcut ${activeShortcutAppId} from title alias`);
	}

	if (currentInjectedAppId === steamAppId && doc.getElementById(GDL_INJECTED) && doc.getElementById('gdl-link-bar')) {
		if (activeShortcutAppId) currentInjectedShortcutAppId = activeShortcutAppId;
		const nativeInfo = getCurrentNativeGameInfo();
		if (nativeInfo?.key === steamAppId) ensureNativeGameChrome(doc, nativeInfo);
		if (!doc.getElementById('gdl-playbar-achievements')) {
			finalizeAchievements(doc, steamAppId, gameDataCache[steamAppId]?.achievements?.total || 0);
		}
		return;
	}

	if (currentInjectedAppId && currentInjectedAppId !== steamAppId) cleanupInjection(doc);
	currentInjectedAppId = steamAppId;
	currentInjectedShortcutAppId = activeShortcutAppId;
	hideNoticeQuick(notice);
	backendLog(`Library page: "${gameTitle}" -> injecting data for ${steamAppId}`);

	const language = await getSteamLanguage(true).catch(() => steamLanguageSync() || 'english');
	const cachedData = (gameDataCache[`${steamAppId}:${language}`] !== undefined
		? gameDataCache[`${steamAppId}:${language}`]
		: cacheGet<SteamGameData>(`gamedata_v2_${steamAppId}_${language}`, CACHE_TTL.gameMetadata)) || null;
	let renderedFromCache = false;
	let cacheMissedSections = false;
	if (cachedData && !doc.getElementById(GDL_INJECTED)) {
		gameDataCache[steamAppId] = cachedData;
		const cachedNews = cacheGet<NewsItem[]>(`events8_${language}-en_${steamAppId}`, CACHE_TTL.news) || [];
		const cachedFriends = cacheGet<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends) || null;
		const cachedCommunity = cacheGet<CommunityContentItem[]>(`community6_${language}_${steamAppId}`, CACHE_TTL.communityContent) || [];
		renderLinkedPage(doc, notice, cachedData, steamAppId, cachedNews, cachedFriends, cachedCommunity);
		renderedFromCache = true;
		cacheMissedSections = cachedNews.length === 0 || !cachedFriends || cachedCommunity.length === 0;
	} else if (!cachedData) {
		insertSkeleton(doc, notice);
	}

	if (injectionInFlight === steamAppId) return;
	injectionInFlight = steamAppId;
	let data: SteamGameData | null = null;
	let newsItems: NewsItem[] = [];
	let friendData: { html: string; data: FriendCategories | null } = { html: '', data: null };
	let communityItems: CommunityContentItem[] = [];
	try {
		[data, newsItems, friendData, communityItems] = await Promise.all([
			getGameData(steamAppId),
			getNews(steamAppId),
			getFriendData(steamAppId),
			getCommunityContent(steamAppId),
		]);
		await warmLocalAchievements(steamAppId, activeShortcutAppId).catch(() => {});
	} finally {
		injectionInFlight = null;
	}

	if (!data || currentInjectedAppId !== steamAppId) {
		if (!data) backendLog('No game data for: ' + steamAppId);
		return;
	}

	void syncLinkedGameNote(gameTitle || data.name, data, steamAppId);
	const artworkShortcutId = Number(currentInjectedShortcutAppId || activeShortcutAppId || '');
	if (Number.isInteger(artworkShortcutId) && artworkShortcutId >= 2147483648) {
		void spoofArtwork(artworkShortcutId, steamAppId, data.name || gameTitle)
			.then(logoApplied => {
				if (logoApplied && currentInjectedAppId === steamAppId && currentInjectedShortcutAppId === String(artworkShortcutId)) {
					refreshLibraryArtwork(artworkShortcutId);
				}
			})
			.catch(error => backendLog('Artwork auto-repair failed: ' + String(error)));
	}

	if (!renderedFromCache || (cacheMissedSections && (newsItems.length > 0 || friendData.data?.totalCount || communityItems.length > 0))) {
		renderLinkedPage(doc, notice, data, steamAppId, newsItems, friendData.data, communityItems);
	} else {
		const feed = doc.getElementById('gdl-activity-feed');
		if (feed && newsItems.length > 0) {
			feed.innerHTML = renderUnifiedActivityFeed(steamAppId, currentInjectedShortcutAppId, newsItems, data.header_image || '');
		}
	}

	void hydrateFriendPersonas(doc, friendData.data, steamAppId, data.name);
	void populateActivityFeed(doc, steamAppId, data.name, data.header_image || '')
		.catch(error => backendLog('Activity feed error: ' + String(error)));
	finalizeAchievements(doc, steamAppId, data.achievements?.total || 0);
}

export function getCurrentInjectedAppId(): string | null { return currentInjectedAppId; }
export function getCurrentInjectedShortcutAppId(): string | null { return currentInjectedShortcutAppId; }

export function resetLibraryInjection(reinject = false): void {
	const doc = libraryRuntimeHost().getMainWindowDoc();
	currentInjectedAppId = null;
	currentInjectedShortcutAppId = null;
	if (!doc) return;
	cleanupInjection(doc);
	if (reinject) void tryInjectLibraryData(doc).catch(error => backendLog('Library reinjection failed: ' + error));
}

export function disposeLibraryRuntime(): void {
	const doc = configuredLibraryRuntimeHost?.getMainWindowDoc() || null;
	if (doc) cleanupInjection(doc);
	currentInjectedAppId = null;
	currentInjectedShortcutAppId = null;
	injectionInFlight = null;
	configuredLibraryRuntimeHost = null;
}
