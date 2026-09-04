import { invalidateGameDataCaches } from '../../core/game-data';
import { invalidateLocalAchievementRequests } from '../achievements/service';
import { invalidateLocalAchievementAliases } from '../achievements/cache';
import { invalidateLocalAchievementGameInfoCache } from '../achievements/game-info';
import { invalidatePlaytimeStatsCache } from '../playtime/service';
import { invalidateLibraryAssetCaches } from './artwork';
import { invalidateCommunityItemCaches } from './community-items';
import { invalidateLibraryContentCaches } from './news';
import { invalidateActivityFeedCaches } from './social/feed';

/** One resource boundary for AppID changes. Every data family is invalidated
 * before the new route paints, while unrelated games keep their warm caches. */
export function invalidateLinkedGameResourceCaches(
	appIds: Iterable<string | number>,
	shortcutAppIds: Iterable<string | number> = [],
): void {
	const ids = new Set(Array.from(appIds, value => String(value)).filter(value => /^\d+$/.test(value)));
	const shortcuts = new Set(Array.from(shortcutAppIds, value => String(value)).filter(Boolean));
	if (ids.size > 0) {
		invalidateGameDataCaches(ids);
		invalidateLibraryAssetCaches(ids);
		invalidateLibraryContentCaches(ids);
		invalidateCommunityItemCaches(ids);
		invalidateActivityFeedCaches(ids);
		invalidateLocalAchievementGameInfoCache(ids);
	}
	invalidateLocalAchievementAliases(shortcuts);
	invalidateLocalAchievementRequests(ids, shortcuts);
	invalidatePlaytimeStatsCache(ids, shortcuts);
}
