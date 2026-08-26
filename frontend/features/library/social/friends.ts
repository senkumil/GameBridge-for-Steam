import type { FriendCategories, FriendPersona, FriendPlayInfo } from '../../../domain/types';
import { backendLog, fetchFriendPersonasBackend } from '../../../api/backend';
import { CACHE_TTL, cacheGet, cacheSet } from '../../../core/cache';
import { escapeHtml } from '../../../core/text';
import { gdlText } from '../../../steam/localization';
import { cachePersona, getCachedPersona, hasCachedPersona } from './personas';

const DEFAULT_AVATAR = 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

export async function getFriendData(steamAppId: string): Promise<{ html: string; data: FriendCategories | null }> {
	const cachedFriends = cacheGet<FriendCategories>('friends_' + steamAppId, CACHE_TTL.friends);
	if (cachedFriends) return { html: '', data: cachedFriends };
	const steamClient = (window as any).SteamClient;
	if (!steamClient?.Apps?.GetFriendsWhoPlay) return { html: '', data: null };

	try {
		const result = await steamClient.Apps.GetFriendsWhoPlay(parseInt(steamAppId));
		const parseFriends = (values: any[]): FriendPlayInfo[] => values.map((friend: any) => ({
			steamid: String(friend.steamid || friend.m_steamid || friend.accountid || friend),
			minutes_played: friend.minutes_played || friend.m_nMinutesPlayed || friend.minutesPlayed || friend.minutes_played_forever || 0,
			minutes_played_recently: friend.minutes_played_recently || friend.m_nMinutesPlayedRecently || friend.minutesPlayedRecently || 0,
		}));

		let friends: FriendPlayInfo[] = [];
		if (Array.isArray(result)) {
			friends = result.length > 0 && typeof result[0] === 'object' && result[0] !== null
				? parseFriends(result)
				: result.map(value => ({ steamid: String(value), minutes_played: 0, minutes_played_recently: 0 }));
		} else if (result && typeof result === 'object') {
			const candidates = result.friends || result.rgFriends || result.m_rgFriends;
			friends = Array.isArray(candidates)
				? parseFriends(candidates)
				: Object.values(result).filter(Boolean).map((value: any) => ({
					steamid: String(value), minutes_played: 0, minutes_played_recently: 0,
				}));
		}

		const hasRecentPlaytime = friends.some(friend => friend.minutes_played_recently > 0);
		const recentlyPlayed = hasRecentPlaytime
			? friends.filter(friend => friend.minutes_played_recently > 0).sort((a, b) => b.minutes_played_recently - a.minutes_played_recently)
			: [];
		const previouslyPlayed = hasRecentPlaytime
			? friends.filter(friend => friend.minutes_played_recently === 0)
			: friends;
		const data = { recentlyPlayed, previouslyPlayed, totalCount: friends.length };
		if (friends.length > 0) cacheSet('friends_' + steamAppId, data);
		return { html: '', data };
	} catch (error) {
		backendLog('GetFriendsWhoPlay error: ' + error);
		return { html: '', data: null };
	}
}

function formatPlayTime(minutes: number): string {
	if (minutes >= 120) return gdlText('recent_playtime_hours', '{count} hours recently played', { count: (minutes / 60).toFixed(1) });
	if (minutes > 0) return gdlText('recent_playtime_minutes', '{count} minutes recently played', { count: minutes });
	return '';
}

function renderAvatarGrid(friends: FriendPlayInfo[], personas?: FriendPersona[]): string {
	return friends.map(friend => {
		const persona = personas?.find(candidate => candidate.steamid === friend.steamid) || getCachedPersona(friend.steamid);
		const avatar = persona?.avatar || DEFAULT_AVATAR;
		const name = persona?.name || friend.steamid;
		const profileUrl = 'steam://url/SteamIDPage/' + friend.steamid;
		return `<a href="${profileUrl}" style="display:block;width:33px;height:33px;overflow:hidden;flex-shrink:0;" title="${escapeHtml(name)}">`
			+ `<img src="${escapeHtml(avatar)}" style="width:100%;height:100%;display:block;" data-gdl-fallback-src="${DEFAULT_AVATAR}" /></a>`;
	}).join('');
}

function renderFriendEntry(friend: FriendPlayInfo, personas?: FriendPersona[]): string {
	const persona = personas?.find(candidate => candidate.steamid === friend.steamid) || getCachedPersona(friend.steamid);
	const name = persona?.name || friend.steamid;
	const avatar = persona?.avatar || DEFAULT_AVATAR;
	const profileUrl = 'steam://url/SteamIDPage/' + friend.steamid;
	const playTime = formatPlayTime(friend.minutes_played_recently);
	return `<a href="${profileUrl}" style="display:flex;align-items:center;gap:8px;padding:4px 0;text-decoration:none;overflow:hidden;">
		<img src="${escapeHtml(avatar)}" style="width:32px;height:32px;flex-shrink:0;" data-gdl-fallback-src="${DEFAULT_AVATAR}" />
		<div style="min-width:0;overflow:hidden;">
			<div style="font-size:13px;font-weight:500;color:#57cbde;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
			${playTime ? `<div style="font-size:11px;color:#8f98a0;white-space:nowrap;">${escapeHtml(playTime)}</div>` : ''}
		</div>
	</a>`;
}

export function renderFriendsSection(friendResult: FriendCategories | null, steamAppId: string, _gameName: string, personas?: FriendPersona[]): string {
	if (!friendResult || friendResult.totalCount === 0) return '';
	const { recentlyPlayed, previouslyPlayed } = friendResult;
	let html = '';

	if (recentlyPlayed.length > 0) {
		const visibleRecent = recentlyPlayed.slice(0, 10);
		const hiddenRecent = recentlyPlayed.slice(10);
		html += `<div style="font-size:13px;font-weight:bold;color:#dcdedf;margin-bottom:10px;">${escapeHtml(gdlText('friends_recently_played', '{count} friends recently played', { count: recentlyPlayed.length }))}</div>`;
		html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">${visibleRecent.map(friend => renderFriendEntry(friend, personas)).join('')}</div>`;
		if (hiddenRecent.length > 0) {
			html += `<div id="gdl-recent-extra" style="display:none;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">${hiddenRecent.map(friend => renderFriendEntry(friend, personas)).join('')}</div></div>`;
			html += `<div id="gdl-recent-toggle" data-gdl-toggle-target="#gdl-recent-extra" data-gdl-hide-self="1" style="margin-top:6px;cursor:pointer;font-size:12px;color:#8f98a0;">${escapeHtml(gdlText('show_all_recently_played', 'Show all recently played ({count} more)', { count: hiddenRecent.length }))}</div>`;
		}
	}

	if (previouslyPlayed.length > 0) {
		const hasRecentSection = recentlyPlayed.length > 0;
		const visiblePrevious = previouslyPlayed.slice(0, 18);
		const hiddenPrevious = previouslyPlayed.slice(18);
		const headerText = hasRecentSection
			? gdlText('friends_previously_played', '{count} friends played previously', { count: previouslyPlayed.length })
			: gdlText('friends_who_play', '{count} friends play this game', { count: previouslyPlayed.length });
		html += `<div style="font-size:13px;font-weight:bold;color:#dcdedf;margin:${hasRecentSection ? '16' : '0'}px 0 10px;">${escapeHtml(headerText)}</div>`;
		html += `<div style="display:flex;flex-wrap:wrap;gap:3px;">${renderAvatarGrid(visiblePrevious, personas)}</div>`;
		if (hiddenPrevious.length > 0) {
			html += `<div id="gdl-prev-extra" style="display:none;"><div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;">${renderAvatarGrid(hiddenPrevious, personas)}</div></div>`;
			html += `<div id="gdl-prev-toggle" data-gdl-toggle-target="#gdl-prev-extra" data-gdl-hide-self="1" style="margin-top:6px;cursor:pointer;font-size:12px;color:#8f98a0;">${escapeHtml(gdlText('show_all_previously_played', 'Show all previously played ({count} more)', { count: hiddenPrevious.length }))}</div>`;
		}
	}

	const communityUrl = `https://steamcommunity.com/app/${steamAppId}`;
	html += `<div style="text-align:right;margin-top:12px;"><a href="${communityUrl}" data-gdl-open-url="${communityUrl}" style="font-size:12px;color:#8f98a0;text-decoration:none;">${escapeHtml(gdlText('view_all_friends', 'View all friends who play this game'))}</a></div>`;
	return html;
}

export async function hydrateFriendPersonas(doc: Document, friendData: FriendCategories | null, steamAppId: string, gameName: string): Promise<void> {
	if (!friendData || friendData.totalCount <= 0) return;
	// Hydrate only the personas initially visible above the fold. Expanded
	// friend groups keep their Steam avatar fallback until a later refresh.
	const visibleIds = [
		...friendData.recentlyPlayed.slice(0, 6).map(friend => friend.steamid),
		...friendData.previouslyPlayed.slice(0, 2).map(friend => friend.steamid),
	];
	const idsToFetch = [...new Set(visibleIds)].filter(id => !hasCachedPersona(id)).slice(0, 8);
	if (idsToFetch.length === 0) {
		const target = doc.getElementById('gdl-friends-content');
		if (target) target.innerHTML = renderFriendsSection(friendData, steamAppId, gameName);
		return;
	}
	let personas: FriendPersona[];
	try {
		const raw = await fetchFriendPersonasBackend({ steam_ids_csv: idsToFetch.join(',') });
		personas = JSON.parse(raw) as FriendPersona[];
		for (const persona of personas) cachePersona(persona);
	} catch (error) {
		backendLog('Persona fetch error: ' + error);
		return;
	}
	const target = doc.getElementById('gdl-friends-content');
	if (target) target.innerHTML = renderFriendsSection(friendData, steamAppId, gameName, personas);
}
