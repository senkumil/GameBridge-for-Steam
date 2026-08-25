import type { CommunityContentItem, FriendCategories, NewsItem, SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { GDL_INJECTED } from './constants';
import { getModernLibraryAssets, getResolvedLibraryAssets } from './artwork';
import { ensureNativeGameChrome, removeNativeGameChrome, steamNativeGameInfo } from './native-chrome';
import {
	discoverNativeLibraryLayout,
	hideLinkedShortcutNotice,
	insertMainContent,
	prepareNativeLibraryLayout,
} from './layout';
import { renderLinkedSidebarCore } from './sidebar-sections';
import { renderOptionalStoreSections } from './optional-sections';
import { createActivityView, wireActivityView } from './activity-view';
import { createPrimaryLinksBar, insertPrimaryLinksBar } from './primary-links';
import {
	disposeCommunityProgressiveReveal,
	insertCommunitySection,
	renderCommunityContentHtml,
} from './community-view';
import { disposeTradingCardPreview } from './trading-cards';

export interface LinkedGameRenderContext {
	shortcutAppId: string | null;
	isCurrent: () => boolean;
}

const INJECTED_SECTION_IDS = [
	GDL_INJECTED,
	'gdl-skeleton',
	'gdl-friends-section',
	'gdl-achievements-section',
	'gdl-trading-cards-section',
	'gdl-dlc-section',
	'gdl-workshop-section',
	'gdl-playbar-achievements',
	'gdl-link-bar',
	'gdl-community-content',
] as const;

function cleanupPreviousRender(doc: Document): void {
	removeNativeGameChrome(doc);
	disposeTradingCardPreview(doc);
	const community = doc.getElementById('gdl-community-content');
	if (community instanceof HTMLElement) disposeCommunityProgressiveReveal(community);
	for (const id of INJECTED_SECTION_IDS) doc.getElementById(id)?.remove();
}

/**
 * Orchestrate one linked-game desktop Library render.
 *
 * Visual responsibilities intentionally live in small feature modules so Steam
 * parity work can evolve playbar/navigation/sidebar/community independently.
 * This function owns no Steam CSS discovery and no feature-specific markup.
 */
export function renderLinkedGamePage(
	doc: Document,
	noticeElement: Element,
	data: SteamGameData,
	steamAppId: string,
	newsItems: NewsItem[],
	friendResult: FriendCategories | null | undefined,
	communityItems: CommunityContentItem[] | undefined,
	context: LinkedGameRenderContext,
): void {
	cleanupPreviousRender(doc);

	const layout = discoverNativeLibraryLayout(doc, noticeElement);
	prepareNativeLibraryLayout(layout);
	hideLinkedShortcutNotice(noticeElement, layout);

	renderLinkedSidebarCore(doc, layout, {
		steamAppId,
		shortcutAppId: context.shortcutAppId,
		data,
		friendResult,
	});

	const capabilities = renderOptionalStoreSections(doc, layout, {
		steamAppId,
		gameName: data.name,
		data,
		isCurrent: context.isCurrent,
	});

	const activityOptions = {
		steamAppId,
		shortcutAppId: context.shortcutAppId,
		newsItems,
		headerImage: data.header_image || '',
	};
	const activity = createActivityView(doc, layout, activityOptions);
	const primaryLinks = createPrimaryLinksBar(doc, layout, {
		steamAppId,
		hasWorkshop: capabilities.hasWorkshop,
		hasDlc: capabilities.dlcIds.length > 0,
	});

	insertMainContent(activity, layout, new Set([GDL_INJECTED, 'gdl-community-content']));
	insertPrimaryLinksBar(primaryLinks, layout, activity);
	wireActivityView(doc, activity, activityOptions);

	const communityHtml = renderCommunityContentHtml(data, communityItems);
	insertCommunitySection(doc, layout, activity, communityHtml);

	const initialInfo = steamNativeGameInfo(data, steamAppId, getResolvedLibraryAssets(steamAppId));
	ensureNativeGameChrome(doc, initialInfo);
	void getModernLibraryAssets(steamAppId).then(modernAssets => {
		if (!context.isCurrent()) return;
		ensureNativeGameChrome(doc, steamNativeGameInfo(data, steamAppId, modernAssets));
	}).catch(() => {});

	backendLog(`Injected layout for: ${data.name} (${newsItems.length} news items)`);
}
