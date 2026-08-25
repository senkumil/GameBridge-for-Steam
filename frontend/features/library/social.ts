/** Stable public facade for social/activity features. */
export type { SocialRuntimeHost } from './social/host';
export { configureSocialRuntimeHost } from './social/host';
export { getFriendData, renderFriendsSection, hydrateFriendPersonas } from './social/friends';
export { populateActivityFeed } from './social/activity';
export { renderUnifiedActivityFeed } from './social/feed';
export { setupStatusPostBox } from './social/status';

import { clearActivityFeedCaches } from './social/feed';
import { clearPersonaCache } from './social/personas';

export function clearSocialRuntimeCaches(): void {
	clearPersonaCache();
	clearActivityFeedCaches();
}
