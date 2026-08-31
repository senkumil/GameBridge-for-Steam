import type { FriendCategories, FriendPersona } from '../../../domain/types';
import { CACHE_RETENTION, CACHE_TTL, cacheGet, cacheRead } from '../../../core/cache';

const friendRequests = new Map<string, Promise<{ html: string; data: FriendCategories | null }>>();

export function getCachedFriendData(steamAppId: string): { data: FriendCategories; fresh: boolean } | null {
	const entry = cacheRead<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends, CACHE_RETENTION.friends);
	return entry ? { data: entry.data, fresh: entry.fresh } : null;
}

export function friendDataSignature(data: FriendCategories | null | undefined): string {
	if (!data) return '0';
	const values = [...data.recentlyPlayed, ...data.previouslyPlayed];
	return `${data.totalCount}:` + values.map(friend =>
		`${friend.steamid}:${friend.minutes_played_recently}:${friend.minutes_played}`).join('|');
}

export async function getFriendData(steamAppId: string): Promise<{ html: string; data: FriendCategories | null }> {
	const cachedFriends = cacheGet<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends);
	if (cachedFriends) return { html: '', data: cachedFriends };
	const active = friendRequests.get(steamAppId);
	if (active) return active;
	const request = loadFriendData(steamAppId).finally(() => {
		if (friendRequests.get(steamAppId) === request) friendRequests.delete(steamAppId);
	});
	friendRequests.set(steamAppId, request);
	return request;
}

async function loadFriendData(_steamAppId: string): Promise<{ html: string; data: FriendCategories | null }> {
	return { html: '', data: null };
}

export function renderFriendsSection(_friendResult: FriendCategories | null, _steamAppId: string, _gameName: string, _personas?: FriendPersona[]): string {
	return '';
}

export interface FriendHydrationGuard {
	isCurrent: () => boolean;
	shortcutAppId?: string | null;
}

function ownedFriendsTarget(doc: Document, steamAppId: string, guard: FriendHydrationGuard): HTMLElement | null {
	if (!guard.isCurrent()) return null;
	const target = doc.getElementById('gdl-friends-content');
	const section = doc.getElementById('gdl-friends-section');
	const root = doc.getElementById('gdl-library-injected');
	if (!(target instanceof HTMLElement) || !(section instanceof HTMLElement) || !(root instanceof HTMLElement)) return null;
	if (section.dataset.gdlSteamAppId !== steamAppId || root.dataset.gdlSteamAppId !== steamAppId) return null;
	if (guard.shortcutAppId && root.dataset.gdlShortcutAppId !== guard.shortcutAppId) return null;
	return target;
}

export async function hydrateFriendPersonas(doc: Document, _friendData: FriendCategories | null, steamAppId: string,
	_gameName: string, guard: FriendHydrationGuard): Promise<void> {
	const initialTarget = ownedFriendsTarget(doc, steamAppId, guard);
	if (!initialTarget) return;
	const section = initialTarget.closest('#gdl-friends-section') as HTMLElement | null;
	initialTarget.replaceChildren();
	if (section) section.style.display = 'none';
}
