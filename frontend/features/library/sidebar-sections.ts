import { backendLog } from '../../api/backend';
import type { FriendCategories, SteamGameData } from '../../domain/types';
import { loc } from '../../steam/localization';
import {
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
	const cachedAchievements = getCachedLocalAchievements(options.steamAppId, options.shortcutAppId);
	let initialAchievements = cachedAchievements;
	if (!initialAchievements && options.data.achievements && options.data.achievements.total > 0) {
		const highlighted = options.data.achievements.highlighted || [];
		const missingCount = Math.max(0, options.data.achievements.total - highlighted.length);
		// Remote highlights contain no local earned state. Show them immediately as
		// a provisional locked 0/N box, padding the unseen schema entries so the +N
		// tile reflects the real Store total instead of only the highlight count.
		// This object is deliberately never passed to cacheLocalAchievements.
		initialAchievements = {
			found: true,
			appid: options.steamAppId,
			metadata_source: 'store_highlights_pending',
			unlocked: 0,
			total: options.data.achievements.total,
			achievements: [...highlighted.map((h, i) => ({
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
			})), ...Array.from({ length: missingCount }, (_, index) => ({
				name: `GDL_PENDING_${index}`,
				display_name: '',
				description: '',
				icon: '',
				icon_gray: '',
				hidden: true,
				global_percent: 0,
				earned: false,
				earned_time: 0,
				progress: 0,
				max_progress: 0,
			}))],
		};
	}

	const initialBody = initialAchievements
		? renderLocalAchievementSidebarHtml(initialAchievements)
		: '';
	const node = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-achievements-section',
		headerText: loc('AppDetails_SectionTitle_Achievements', 'Achievements'),
		innerId: 'gdl-achievements-content',
		innerHtml: initialBody,
		cloneInnerClass: false,
	});
	if (!node) return;
	if (!cachedAchievements) node.dataset.gdlAchievementsPending = '1';

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
