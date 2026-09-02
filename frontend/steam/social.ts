import { findModuleExport } from '@steambrew/client';
import { backendLog } from '../api/backend';
import type { FriendPlayInfo } from '../domain/types';

let protoMessageCache: Map<string, any> | null = null;
let messageWrapper: any = null;
let playerService: any = null;

function findProtoMessageClass(className: string): any {
	if (!protoMessageCache) protoMessageCache = new Map();
	if (protoMessageCache.has(className)) return protoMessageCache.get(className);
	let found: any = null;
	try {
		found = findModuleExport((candidate: any) => {
			try {
				if (typeof candidate !== 'function') return false;
				if (candidate.name === className || candidate.displayName === className) return true;
				if (typeof candidate.deserializeBinary === 'function') {
					if (candidate.prototype?.getClassName?.() === className) return true;
					if (typeof candidate.getClassName === 'function' && candidate.getClassName() === className) return true;
					try {
						if (new candidate().getClassName() === className) return true;
					} catch {}
				}
				return false;
			} catch { return false; }
		});
	} catch {}
	protoMessageCache.set(className, found);
	return found;
}

export interface FriendsGameplayResult {
	recentlyPlayed: FriendPlayInfo[];
	previouslyPlayed: FriendPlayInfo[];
	wishlisted: FriendPlayInfo[];
	owns?: FriendPlayInfo[];
	inGame?: FriendPlayInfo[];
	totalCount: number;
}

export function extractSteamIdFromValue(value: any): string {
	if (!value) return '';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^\d{16,20}$/.test(trimmed)) return trimmed;
		const match = trimmed.match(/\b\d{16,20}\b/);
		if (match) return match[0];
		return '';
	}
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'number' && value > 0) {
		if (value < 2147483648) return (BigInt('76561197960265728') + BigInt(value)).toString();
		return String(value);
	}
	if (typeof value === 'object') {
		if (typeof value.ConvertTo64BitString === 'function') {
			try { return value.ConvertTo64BitString(); } catch {}
		}
		if (typeof value.m_steamid?.ConvertTo64BitString === 'function') {
			try { return value.m_steamid.ConvertTo64BitString(); } catch {}
		}
		if (typeof value.steamID?.ConvertTo64BitString === 'function') {
			try { return value.steamID.ConvertTo64BitString(); } catch {}
		}
		if (typeof value.steamIDActor?.ConvertTo64BitString === 'function') {
			try { return value.steamIDActor.ConvertTo64BitString(); } catch {}
		}
		if (typeof value.m_steamidActor?.ConvertTo64BitString === 'function') {
			try { return value.m_steamidActor.ConvertTo64BitString(); } catch {}
		}
		if (typeof value.GetAccountID === 'function') {
			try { return (BigInt('76561197960265728') + BigInt(value.GetAccountID())).toString(); } catch {}
		}
		if (typeof value.getAccountID === 'function') {
			try { return (BigInt('76561197960265728') + BigInt(value.getAccountID())).toString(); } catch {}
		}
		if (value.accountid !== undefined) return (BigInt('76561197960265728') + BigInt(value.accountid)).toString();
		if (value.account_id !== undefined) return (BigInt('76561197960265728') + BigInt(value.account_id)).toString();
		const sid = String(value.steamid || value.m_steamid || value.m_ulSteamID || value.steamidActor || value.steamIDActor || value.steamId || '');
		if (/^\d{16,20}$/.test(sid)) return sid;
		if (typeof value.toString === 'function') {
			const str = value.toString();
			if (/^\d{16,20}$/.test(str)) return str;
		}
	}
	return '';
}

function getServiceTransport(): any {
	try {
		return (window as any).appAchievementProgressCache?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).CMInterface?.GetServiceTransport?.()
			|| (window as any).SteamClient?.Stats?.GetServiceTransport?.()
			|| (window as any).SteamClient?.WebServices?.GetServiceTransport?.()
			|| (window as any).appActivityStore?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).g_FriendsUIApp?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).g_AccountStore?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).g_AppStore?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).g_AppDetailsStore?.m_CMInterface?.GetServiceTransport?.()
			|| (window as any).g_ConnectionManager?.GetServiceTransport?.()
			|| (window as any).g_SteamClient?.GetServiceTransport?.()
			|| (findModuleExport((candidate: any) => typeof candidate?.GetServiceTransport === 'function') as any)?.GetServiceTransport?.()
			|| (findModuleExport((candidate: any) => typeof candidate?.m_CMInterface?.GetServiceTransport === 'function') as any)?.m_CMInterface?.GetServiceTransport?.();
	} catch {
		return null;
	}
}

export async function fetchFriendsGameplayInfo(appId: number): Promise<FriendsGameplayResult | null> {
	if (!appId || appId <= 0) return null;

	const recentlyPlayed: FriendPlayInfo[] = [];
	const previouslyPlayed: FriendPlayInfo[] = [];
	const wishlisted: FriendPlayInfo[] = [];
	const owns: FriendPlayInfo[] = [];
	const inGame: FriendPlayInfo[] = [];
	const seenSids = new Set<string>();

	const addFriend = (category: FriendPlayInfo[], sid: string, minutes = 0, recentMinutes = 0) => {
		if (!sid || sid === '0' || seenSids.has(sid)) return;
		seenSids.add(sid);
		category.push({
			steamid: sid,
			minutes_played: minutes,
			minutes_played_recently: recentMinutes,
		});
	};

	const addWishlistSid = (sid: string) => {
		if (!sid || sid === '0') return;
		if (!seenSids.has(sid) && !wishlisted.some(w => w.steamid === sid)) {
			seenSids.add(sid);
			wishlisted.push({
				steamid: sid,
				minutes_played: 0,
				minutes_played_recently: 0,
			});
		}
	};

	// 1. Steam Protobuf RPC (Player.GetFriendsGameplayInfo)
	try {
		if (!messageWrapper) {
			messageWrapper = findModuleExport((candidate: any) =>
				typeof candidate?.Init === 'function'
				&& typeof candidate?.InitFromPacket === 'function'
				&& typeof candidate?.InitFromObject === 'function');
		}
		if (!playerService) {
			playerService = findModuleExport((candidate: any) =>
				typeof candidate?.GetFriendsGameplayInfo === 'function'
				|| typeof candidate?.PostStatusToFriends === 'function');
		}

		const MessageClass = findProtoMessageClass('CPlayer_GetFriendsGameplayInfo_Request');
		const transport = getServiceTransport();

		if (messageWrapper && playerService && MessageClass && transport && typeof playerService.GetFriendsGameplayInfo === 'function') {
			const message = messageWrapper.Init(MessageClass);
			if (typeof message.Body().set_appid === 'function') message.Body().set_appid(appId);
			if (typeof message.Body().set_gameid === 'function') message.Body().set_gameid(appId);

			const response = await playerService.GetFriendsGameplayInfo(transport, message);
			if (response) {
				const body = response.Body?.() || response.body || response;
				const bodyObj = typeof body?.toObject === 'function' ? body.toObject() : (body || {});

				// in_game
				const inGameList = body?.in_game?.() || body?.get_in_game?.() || bodyObj?.in_game || bodyObj?.inGame || [];
				if (Array.isArray(inGameList)) {
					for (const item of inGameList) {
						const sid = extractSteamIdFromValue(item);
						if (sid) addFriend(inGame, sid, Number(item?.minutes_played || 0), Number(item?.minutes_played_recently || 0));
					}
				}

				// played_recently
				const recentList = body?.played_recently?.() || body?.get_played_recently?.() || bodyObj?.played_recently || bodyObj?.playedRecently || [];
				if (Array.isArray(recentList)) {
					for (const item of recentList) {
						const sid = extractSteamIdFromValue(item);
						const mTotal = Number(item?.minutes_played || item?.m_nMinutesPlayed || 0);
						const mRecent = Number(item?.minutes_played_recently || item?.m_nMinutesPlayedRecently || mTotal || 0);
						if (sid) addFriend(recentlyPlayed, sid, mTotal, mRecent);
					}
				}

				// played_ever
				const everList = body?.played_ever?.() || body?.get_played_ever?.() || bodyObj?.played_ever || bodyObj?.playedEver || [];
				if (Array.isArray(everList)) {
					for (const item of everList) {
						const sid = extractSteamIdFromValue(item);
						const mTotal = Number(item?.minutes_played || item?.m_nMinutesPlayed || 0);
						if (sid) addFriend(previouslyPlayed, sid, mTotal, 0);
					}
				}

				// owns
				const ownsList = body?.owns?.() || body?.get_owns?.() || bodyObj?.owns || [];
				if (Array.isArray(ownsList)) {
					for (const item of ownsList) {
						const sid = extractSteamIdFromValue(item);
						if (sid) {
							addFriend(owns, sid, 0, 0);
							if (!recentlyPlayed.some(f => f.steamid === sid) && !previouslyPlayed.some(f => f.steamid === sid)) {
								previouslyPlayed.push({ steamid: sid, minutes_played: 0, minutes_played_recently: 0 });
							}
						}
					}
				}

				// in_wishlist
				const wishlistList = body?.in_wishlist?.()
					|| body?.get_in_wishlist?.()
					|| body?.in_wishlist_list?.()
					|| bodyObj?.in_wishlist
					|| bodyObj?.inWishlist
					|| bodyObj?.in_wishlist_list
					|| bodyObj?.wishlist
					|| bodyObj?.rgWishlist
					|| [];
				if (Array.isArray(wishlistList)) {
					for (const item of wishlistList) {
						const sid = extractSteamIdFromValue(item);
						if (sid) addWishlistSid(sid);
					}
				}
			}
		}
	} catch (err) {
		backendLog('Player.GetFriendsGameplayInfo RPC error: ' + err);
	}

	// 2. Steam Store Web API (appuserdetails) with session cookies
	if (wishlisted.length === 0) {
		try {
			const res = await fetch(`https://store.steampowered.com/api/appuserdetails/?appids=${appId}`, {
				credentials: 'include',
				headers: { 'Accept': 'application/json' },
			});
			if (res.ok) {
				const data = await res.json();
				const appData = data?.[String(appId)]?.data || data?.[appId]?.data;
				const fw = appData?.friends_wishlist;
				if (Array.isArray(fw)) {
					for (const item of fw) {
						const sid = extractSteamIdFromValue(item);
						if (sid) addWishlistSid(sid);
					}
				}
				const fo = appData?.friends_own;
				if (Array.isArray(fo)) {
					for (const item of fo) {
						const sid = extractSteamIdFromValue(item);
						if (sid && !recentlyPlayed.some(f => f.steamid === sid) && !previouslyPlayed.some(f => f.steamid === sid)) {
							previouslyPlayed.push({ steamid: sid, minutes_played: 0, minutes_played_recently: 0 });
						}
					}
				}
			}
		} catch {}
	}

	const totalCount = recentlyPlayed.length + previouslyPlayed.length + wishlisted.length;
	return {
		recentlyPlayed,
		previouslyPlayed,
		wishlisted,
		owns,
		inGame,
		totalCount,
	};
}

/** Post a game-scoped status through the same PlayerService used by Steam's native activity entry. */
export async function postStatusUpdate(appId: number, text: string): Promise<boolean> {
	try {
		if (!messageWrapper) {
			messageWrapper = findModuleExport((candidate: any) =>
				typeof candidate?.Init === 'function'
				&& typeof candidate?.InitFromPacket === 'function'
				&& typeof candidate?.InitFromObject === 'function');
		}
		if (!playerService) playerService = findModuleExport((candidate: any) => typeof candidate?.PostStatusToFriends === 'function');
		const MessageClass = findProtoMessageClass('CPlayer_PostStatusToFriends_Request');
		const transport = getServiceTransport();
		if (!messageWrapper || !playerService || !MessageClass || !transport) {
			backendLog(`Post status: missing Steam internals (wrapper=${!!messageWrapper} service=${!!playerService} msg=${!!MessageClass} transport=${!!transport})`);
			return false;
		}
		const message = messageWrapper.Init(MessageClass);
		message.Body().set_appid(appId);
		message.Body().set_status_text(text);
		const response = await playerService.PostStatusToFriends(transport, message);
		const result = response?.GetEResult?.();
		backendLog('PostStatusToFriends result: ' + result);
		return result === undefined || result === 1;
	} catch (error) {
		backendLog('Post status error: ' + error);
		return false;
	}
}

export async function deleteStatusPostOnSteam(postId: string): Promise<boolean> {
	try {
		const protoDelete = findProtoMessageClass('CPlayer_DeleteStatus_Request')
			|| findProtoMessageClass('CPlayer_DeletePost_Request')
			|| findProtoMessageClass('CCommunity_DeletePost_Request');
		if (protoDelete && playerService && messageWrapper) {
			const transport = getServiceTransport();
			if (transport) {
				const message = messageWrapper.Init(protoDelete);
				if (typeof message.Body().set_post_id === 'function') message.Body().set_post_id(postId);
				if (typeof message.Body().set_postid === 'function') message.Body().set_postid(postId);
				if (typeof playerService.DeleteStatus === 'function') {
					await playerService.DeleteStatus(transport, message);
					return true;
				}
				if (typeof playerService.DeletePost === 'function') {
					await playerService.DeletePost(transport, message);
					return true;
				}
			}
		}
	} catch (e) {
		backendLog('deleteStatusPostOnSteam RPC error: ' + e);
	}
	return false;
}

export interface CommunityActivityEvent {
	eEventType: number;
	steamIDActor: { ConvertTo64BitString: () => string };
	unUniqueID: string;
	rtEventTime: number;
	statusText?: string;
	achievements?: any[];
	publishedfileids?: string[];
	reviewRating?: string;
	reviewText?: string;
	actorName?: string;
	actorAvatar?: string;
}

function stripCommunityHtml(html: string): string {
	if (!html) return '';
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

export async function fetchAuthenticatedCommunityActivity(
	steamAppId: string,
	currentSid?: string
): Promise<CommunityActivityEvent[]> {
	const appId = String(steamAppId || '').trim();
	if (!appId) return [];

	const events: CommunityActivityEvent[] = [];
	const seenKeys = new Set<string>();
	const urls: string[] = [];

	if (currentSid && currentSid.length >= 15) {
		urls.push(`https://steamcommunity.com/profiles/${currentSid}/home/`);
	}
	urls.push('https://steamcommunity.com/my/home/');
	urls.push(`https://steamcommunity.com/app/${appId}/home/`);

	for (const targetUrl of urls) {
		try {
			const res = await fetch(targetUrl, {
				credentials: 'include',
				headers: { 'Accept': 'text/html,*/*' },
			});
			if (!res.ok) continue;
			const html = await res.text();
			if (!html || !html.includes('blotter_post')) continue;

			const chunks = html.split(/<div class="blotter_post/);
			const now = Math.floor(Date.now() / 1000);

			for (let i = 1; i < chunks.length; i++) {
				const chunk = chunks[i];
				const hasApp = chunk.includes(`/app/${appId}`) || chunk.includes(`app/${appId}`) || chunk.includes(`appid=${appId}`);
				if (!hasApp && targetUrl.includes('/app/')) continue;
				if (!hasApp && !chunk.includes('blotter_userstatus')) continue;

				const sidMatch = chunk.match(/profiles\/(\d{16,20})/);
				const actorSid = sidMatch ? sidMatch[1] : '';

				let actorName = chunk.match(/<a[^>]+class="whiteLink"[^>]*>(.*?)<\/a>/s)?.[1]
					|| chunk.match(/<span[^>]+class="persona[^"]*"[^>]*>(.*?)<\/span>/s)?.[1]
					|| chunk.match(/class="blotter_author_block[^"]*"[^>]*>(.*?)<\/a>/s)?.[1]
					|| '';
				actorName = stripCommunityHtml(actorName);

				let actorAvatar = chunk.match(/<img[^>]+src="([^"]*avatars[^"]*)"/)?.[1]
					|| chunk.match(/<img[^>]+src="([^"]*avatar[^"]*)"/)?.[1]
					|| '';

				const timeMatch = chunk.match(/data-timestamp="(\d+)"/) || chunk.match(/data-time="(\d+)"/);
				const eventTime = timeMatch ? Number(timeMatch[1]) : (now - (i * 60));

				// Check UserStatus
				let statusText = chunk.match(/class="blotter_userstatus_content[^"]*"[^>]*>(.*?)<\/div>/s)?.[1]
					|| chunk.match(/class="blotter_status_text[^"]*"[^>]*>(.*?)<\/div>/s)?.[1]
					|| chunk.match(/<blockquote[^>]*>(.*?)<\/blockquote>/s)?.[1]
					|| '';
				statusText = stripCommunityHtml(statusText);

				// Check Achievements
				const hasAchievement = chunk.includes('blotter_achievement') || chunk.includes('unlocked');
				// Check Screenshots
				const fileIdMatch = chunk.match(/filedetails\/\?id=(\d+)/);
				const publishedFileId = fileIdMatch ? fileIdMatch[1] : '';
				// Check Review
				const isReview = chunk.includes('recommended') || chunk.includes('blotter_review');
				// Check Wishlist
				const isWishlist = chunk.includes('lista de deseados') || chunk.includes('wishlist');

				let eventType = 16; // UserStatus
				if (hasAchievement) eventType = 2;
				else if (publishedFileId) eventType = 13;
				else if (isReview) eventType = 10;
				else if (isWishlist) eventType = 9;

				const dedupeKey = `${actorSid}_${eventType}_${statusText || publishedFileId || eventTime}`;
				if (seenKeys.has(dedupeKey)) continue;
				seenKeys.add(dedupeKey);

				events.push({
					eEventType: eventType,
					steamIDActor: { ConvertTo64BitString: () => actorSid },
					unUniqueID: `blotter_${actorSid}_${eventType}_${i}`,
					rtEventTime: eventTime,
					statusText: statusText || undefined,
					publishedfileids: publishedFileId ? [publishedFileId] : undefined,
					actorName: actorName || undefined,
					actorAvatar: actorAvatar || undefined,
				});
			}

			if (events.length > 0) break;
		} catch (e) {
			backendLog(`fetchAuthenticatedCommunityActivity error for ${targetUrl}: ${e}`);
		}
	}

	return events;
}

export function clearSteamSocialCaches(): void {
	protoMessageCache?.clear();
	protoMessageCache = null;
	messageWrapper = null;
	playerService = null;
}
