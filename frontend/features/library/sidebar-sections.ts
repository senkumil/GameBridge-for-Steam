import { backendLog } from '../../api/backend';
import type { FriendCategories, SteamGameData } from '../../domain/types';
import { loc } from '../../steam/localization';
import {
	cacheLocalAchievements,
	getCachedLocalAchievements,
	makeLinkedAchievementsClickable,
	openLocalAchievementsModal,
	renderLocalAchievementSidebarHtml,
} from '../achievements/runtime';
import { renderFriendsSection } from './social';
import type { NativeLibraryLayout } from './layout';
import { buildNativeSidebarSection } from './layout';

export interface LinkedSidebarOptions {
	steamAppId: string;
	shortcutAppId: string | null;
	data: SteamGameData;
	friendResult: FriendCategories | null | undefined;
}

/** Render the stable native-order sidebar core: Friends followed by Achievements. */
export function renderLinkedSidebarCore(
	doc: Document,
	layout: NativeLibraryLayout,
	options: LinkedSidebarOptions,
): void {
	const { anchorRegion, sidebarColumn } = layout;
	if (!anchorRegion || !sidebarColumn) return;
	let lastSidebarInsert: HTMLElement | null = null;

	if (options.friendResult && options.friendResult.totalCount > 0) {
		const node = buildNativeSidebarSection(doc, layout, {
			sectionId: 'gdl-friends-section',
			headerText: loc('AppDetails_SectionTitle_Friends', 'Friends who play'),
			innerId: 'gdl-friends-content',
			innerHtml: renderFriendsSection(options.friendResult, options.steamAppId, options.data.name),
		});
		if (node) {
			sidebarColumn.insertBefore(node, sidebarColumn.firstChild);
			lastSidebarInsert = node;
		}
	}

	const total = options.data.achievements?.total || 0;
	if (total <= 0) return;
	let cachedAchievements = getCachedLocalAchievements(options.steamAppId, options.shortcutAppId);
	if (!cachedAchievements && options.data.achievements && options.data.achievements.total > 0) {
		const highlighted = options.data.achievements.highlighted || [];
		cachedAchievements = {
			found: true,
			appid: options.steamAppId,
			unlocked: 0,
			total: options.data.achievements.total,
			achievements: highlighted.map((h, i) => ({
				name: h.name || `ACH_${i}`,
				display_name: h.name || `ACH_${i}`,
				description: '',
				icon: h.path || '',
				icon_gray: h.path || '',
				hidden: false,
				global_percent: 0,
				earned: false,
				earned_time: 0,
				progress: 0,
				max_progress: 0,
			})),
		};
		cacheLocalAchievements(cachedAchievements, options.steamAppId, options.shortcutAppId);
	}

	const initialBody = cachedAchievements
		? renderLocalAchievementSidebarHtml(cachedAchievements)
		: '';
	const node = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-achievements-section',
		headerText: loc('AppDetails_SectionTitle_Achievements', 'Achievements'),
		innerId: 'gdl-achievements-content',
		innerHtml: initialBody,
		cloneInnerClass: false,
	});
	if (!node) return;

	if (cachedAchievements) {
		const summary = node.querySelector('.gdl-la-summary');
		summary?.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			openLocalAchievementsModal(doc, cachedAchievements!).catch(error => backendLog('Achievements modal error: ' + String(error)));
		});
	} else {
		makeLinkedAchievementsClickable(doc, node, options.steamAppId);
	}
	sidebarColumn.insertBefore(node, lastSidebarInsert ? lastSidebarInsert.nextSibling : sidebarColumn.firstChild);
}
