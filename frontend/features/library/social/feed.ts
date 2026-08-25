import type { NewsItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { escapeHtml } from '../../../core/text';
import { EVENT_CLASSES, FEED_CLASSES } from '../../../steam/css';
import { gdlText, loc, steamIntlLocale } from '../../../steam/localization';
import { eventTypeLabel, formatNewsDate, isPatchNoteItem, newsExcerpt } from '../news';
import { socialRuntimeHost } from './host';

export interface LocalActivityPost {
	id: string;
	text: string;
	timestamp: number;
	user_name: string;
	user_avatar: string;
}

function getLocalActivityPostsKey(steamAppId: string, shortcutAppId?: string | null): string {
	return `gdl_posts_${shortcutAppId || steamAppId}`;
}

export function loadLocalActivityPosts(steamAppId: string, shortcutAppId?: string | null): LocalActivityPost[] {
	try {
		const key = getLocalActivityPostsKey(steamAppId, shortcutAppId);
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export function saveLocalActivityPost(steamAppId: string, post: LocalActivityPost, shortcutAppId?: string | null): void {
	try {
		const key = getLocalActivityPostsKey(steamAppId, shortcutAppId);
		const posts = loadLocalActivityPosts(steamAppId, shortcutAppId);
		posts.unshift(post);
		localStorage.setItem(key, JSON.stringify(posts));
	} catch (e) {
		backendLog('Failed to save local activity post: ' + e);
	}
}

export function getCurrentSteamUser(doc: Document): { name: string; avatar: string } {
	let name = '';
	let avatar = '';
	try {
		const anyWin = (doc.defaultView || window) as any;
		if (anyWin?.SteamClient?.User?.GetPersonaName) {
			name = anyWin.SteamClient.User.GetPersonaName();
		}
		if (!name && anyWin?.g_AccountInfo?.m_strPersonaName) {
			name = anyWin.g_AccountInfo.m_strPersonaName;
		}
	} catch {}
	if (!name) {
		const topProfile = doc.querySelector('[class*="AccountName"], [class*="accountName"], [class*="personaName"], .persona') as HTMLElement | null;
		if (topProfile?.textContent) name = topProfile.textContent.trim();
	}
	if (!name) {
		const btn = doc.querySelector('[class*="AccountMenu"], [class*="accountMenu"], [class*="TopBarAccount"]') as HTMLElement | null;
		if (btn?.textContent) name = btn.textContent.trim();
	}
	if (!name) name = gdlText('steam_user', 'Steam User');

	const avatarImg = doc.querySelector('[class*="Avatar"] img, [class*="avatar"] img, .avatarHolder img, [class*="AccountAvatar"] img') as HTMLImageElement | null;
	if (avatarImg?.src) {
		avatar = avatarImg.src;
	}
	if (!avatar) {
		avatar = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
	}
	return { name, avatar };
}

function formatPostTime(ts: number): string {
	try {
		return new Intl.DateTimeFormat(steamIntlLocale(), {
			hour: 'numeric', minute: '2-digit', second: '2-digit',
		}).format(new Date(ts * 1000));
	} catch {
		return new Date(ts * 1000).toLocaleTimeString(steamIntlLocale());
	}
}

function formatPostGroupDate(ts: number): string {
	const d = new Date(ts * 1000);
	const now = new Date();
	if (d.toDateString() === now.toDateString()) {
		return gdlText('today', 'TODAY');
	}
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) {
		return gdlText('yesterday', 'YESTERDAY');
	}
	return formatNewsDate(ts);
}

export const STEAM_EMOTICONS: { char: string; name: string }[] = [
	{ char: '🐸', name: 'frog pepe' },
	{ char: '🤢', name: 'sick green' },
	{ char: '🤠', name: 'cowboy' },
	{ char: '😎', name: 'cool sunglasses' },
	{ char: '👻', name: 'ghost' },
	{ char: '🚀', name: 'rocket' },
	{ char: '⬆️', name: 'up arrow' },
	{ char: '👎', name: 'thumbs down' },
	{ char: '👍', name: 'thumbs up' },
	{ char: '❤️', name: 'heart love' },
	{ char: '🔥', name: 'fire lit' },
	{ char: '🎉', name: 'party celebrate' },
	{ char: '💀', name: 'skull dead' },
	{ char: '🎮', name: 'game controller' },
	{ char: '⭐', name: 'star gold' },
	{ char: '🏆', name: 'trophy win' },
	{ char: '💯', name: '100 perfect' },
	{ char: '🍕', name: 'pizza food' },
	{ char: '☕', name: 'coffee tea' },
	{ char: '⚡', name: 'lightning bolt' },
	{ char: '✨', name: 'sparkles magic' },
	{ char: '💎', name: 'diamond gem' },
	{ char: '⚔️', name: 'swords battle' },
	{ char: '🛡️', name: 'shield defense' },
	{ char: '🕹️', name: 'joystick arcade' },
	{ char: '👾', name: 'alien monster' },
	{ char: '🎲', name: 'dice game' },
	{ char: '🎯', name: 'target bullseye' },
	{ char: '💥', name: 'explosion boom' },
	{ char: '👀', name: 'eyes look' },
	{ char: '🤝', name: 'handshake deal' },
	{ char: '👑', name: 'crown king' },
];

const lastInjectedNews = new Map<string, NewsItem[]>();

const lastInjectedFriendActivity = new Map<string, string>();

const visibleActivityNewsCount = new Map<string, number>();

const ACTIVITY_NEWS_PAGE_SIZE = 8;

export function renderUnifiedActivityFeed(
	steamAppId: string,
	shortcutAppId: string | null | undefined,
	newsItems: NewsItem[],
	fallbackImage: string,
	friendActivityHtml: string = ''
): string {
	if (Array.isArray(newsItems) && newsItems.length > 0) {
		lastInjectedNews.set(steamAppId, newsItems);
	} else if (lastInjectedNews.has(steamAppId)) {
		newsItems = lastInjectedNews.get(steamAppId)!;
	}

	if (friendActivityHtml) {
		lastInjectedFriendActivity.set(steamAppId, friendActivityHtml);
	} else if (lastInjectedFriendActivity.has(steamAppId)) {
		friendActivityHtml = lastInjectedFriendActivity.get(steamAppId)!;
	}

	const localPosts = loadLocalActivityPosts(steamAppId, shortcutAppId);
	const sortedNews = (Array.isArray(newsItems) ? [...newsItems] : [])
		.filter(item => item && item.title && Number(item.date || 0) > 0)
		.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
	const visibleNews = Math.min(
		Math.max(ACTIVITY_NEWS_PAGE_SIZE, visibleActivityNewsCount.get(steamAppId) || ACTIVITY_NEWS_PAGE_SIZE),
		sortedNews.length
	);
	type FeedItem = { type: 'post'; post: LocalActivityPost; date: number } | { type: 'news'; item: NewsItem; date: number };
	const allItems: FeedItem[] = [
		...localPosts.map(p => ({ type: 'post' as const, post: p, date: p.timestamp })),
		...sortedNews.slice(0, visibleNews).map(item => ({ type: 'news' as const, item, date: Number(item.date || 0) })),
	].sort((a, b) => b.date - a.date);

	if (allItems.length === 0 && !friendActivityHtml) {
		return `<div style="color:#4a5562;font-size:13px;padding:20px 0;">${escapeHtml(gdlText('no_recent_activity', loc('AppActivity_NoActivity', "There's no recent activity from the developers of this title or from your friends.")))}</div>`;
	}

	const groups: { date: string; items: FeedItem[] }[] = [];
	const map = new Map<string, FeedItem[]>();
	for (const entry of allItems) {
		const label = formatPostGroupDate(entry.date);
		if (!map.has(label)) {
			map.set(label, []);
			groups.push({ date: label, items: map.get(label)! });
		}
		map.get(label)!.push(entry);
	}

	const n = EVENT_CLASSES();
	let feedHtml = '';
	if (sortedNews.length > 0) {
		feedHtml += `<div id="gdl-view-latest-news" style="text-align:right;margin-bottom:8px;"><span class="gdl-latest-news-link" data-gdl-scroll-target="#gdl-first-news-item" style="font-size:12px;color:#8f98a0;cursor:pointer;transition:color 0.15s;">${escapeHtml(gdlText('latest_news', loc('AppActivity_ViewLatestNews', 'View the latest updates')))}</span></div>`;
	}
	if (friendActivityHtml) feedHtml += friendActivityHtml;

	let firstNewsMarked = false;
	for (const group of groups) {
		feedHtml += `<div class="${n.AppActivityDay} gdl-feed-day"><h4 class="${n.AppActivityDate} gdl-feed-date">${group.date}<div class="${n.Rule} gdl-feed-rule"></div></h4>`;
		for (const entry of group.items) {
			if (entry.type === 'post') {
				const p = entry.post;
				feedHtml += `<div class="gdl-local-post" data-post-id="${escapeHtml(p.id)}" style="margin-bottom:20px;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><img src="${escapeHtml(p.user_avatar)}" style="width:28px;height:28px;border-radius:2px;object-fit:cover;" data-gdl-fallback-src="https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg" /><div style="font-size:13px;line-height:1.3;"><span style="font-weight:700;color:#66c0f4;">${escapeHtml(p.user_name)}</span><span style="color:#8f98a0;margin-left:4px;">${escapeHtml(gdlText('status_posted_at', 'posted a status update at'))} ${formatPostTime(p.timestamp)}</span></div><button type="button" class="gdl-delete-post-btn" data-post-id="${escapeHtml(p.id)}" title="${escapeHtml(gdlText('delete_post', 'Delete post'))}" style="margin-left:auto;background:transparent;border:none;color:#56606c;cursor:pointer;padding:4px 6px;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:color 0.15s, background 0.15s;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div><div style="background:#1f252e;border:1px solid rgba(255,255,255,0.025);border-radius:2px;padding:14px 18px;"><div style="font-size:14px;color:#d6d7d8;line-height:1.45;word-break:break-word;">${escapeHtml(p.text)}</div></div></div>`;
			} else {
				const item = entry.item;
				const eventType = Number(item.event_type || 0);
				const isMajor = eventType === 13 || eventType === 14;
				// Steam's "Game Update" events (type 12) are full activity cards,
				// with artwork and a summary. Reserve the compact wrench layout for
				// legacy/untyped patch-note entries only.
				const isCompactPatch = eventType === 0 && isPatchNoteItem(item);
				const label = eventType > 0
					? eventTypeLabel(eventType)
					: (isPatchNoteItem(item) ? gdlText('feed_patch_notes', 'Minor Update / Patch Notes') : (item.feedlabel || gdlText('feed_news', 'News')));
				const preview = newsExcerpt(item.contents);
				const thumbUrl = item.image || fallbackImage;
				const firstId = !firstNewsMarked ? ' id="gdl-first-news-item"' : '';
				firstNewsMarked = true;
				if (isCompactPatch) {
					feedHtml += `<div${firstId} class="${n.Event} ${n.PartnerEvent} gdl-news-card gdl-patch-note" data-gdl-open-url="${escapeHtml(item.url)}"><div class="gdl-patch-layout"><div class="gdl-patch-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M39.7 7.2a16 16 0 0 0-18.9 20.5L5.9 42.6a5.2 5.2 0 0 0 0 7.4l8.1 8.1a5.2 5.2 0 0 0 7.4 0l14.9-14.9A16 16 0 0 0 56.8 24l-9.4 9.4-8.8-2-2-8.8 9.4-9.4a16 16 0 0 0-6.3-6zM19.2 50.8a4.2 4.2 0 1 1-6-6 4.2 4.2 0 0 1 6 6z"/></svg></div><div class="gdl-patch-copy"><div class="gdl-news-type">${escapeHtml(label.toUpperCase())}</div><div class="gdl-news-title">${escapeHtml(item.title)}</div></div></div></div>`;
				} else if (isMajor) {
					const majorContentsClass = n.PartnerEventLargeUpdate_Contents || '_2Dbxm-Lv_YU2jN88HErlMS';
					const blurClass = n.Blur || '_3cX_vEKsN9S9EmR0O5w1Ol';
					feedHtml += `<div${firstId} class="${n.Event} ${n.PartnerEventLargeUpdate}" style="position:relative;margin:0 0 16px;" data-gdl-open-url="${escapeHtml(item.url)}"><div class="${n.LeftSideMajorUpdateBar}"></div><div class="${n.PartnerEventLargeImage_Container}"><div class="${majorContentsClass}"><div class="${n.ImageContainer}"><img class="${n.PartnerEventLargeImage_Image} ${blurClass}" src="${escapeHtml(thumbUrl)}" aria-hidden="true" /><img class="${n.PartnerEventLargeImage_Image}" src="${escapeHtml(thumbUrl)}" data-gdl-fallback-src="${escapeHtml(fallbackImage || '')}" /></div><div class="${n.PartnerEventLargeImage_TextColumn}"><div class="${n.PartnerEventType}">${escapeHtml(label.toUpperCase())}</div><div class="${n.PartnerEventLargeImage_Title}">${escapeHtml(item.title)}</div>${preview ? `<div class="${n.PartnerEventLargeImage_Summary}">${escapeHtml(preview)}</div>` : ''}</div></div></div></div>`;
				} else {
					feedHtml += `<div${firstId} class="${n.Event} ${n.PartnerEvent} ${n.PartnerEventMediumImage_Container} gdl-news-card" data-gdl-open-url="${escapeHtml(item.url)}"><div class="${n.PartnerEventMediumImage_Contents} gdl-news-layout"><div class="${n.MediumImageContainer} gdl-news-image"><img class="${n.PartnerEventMediumImage_Image}" src="${escapeHtml(thumbUrl)}" data-gdl-fallback-src="${escapeHtml(fallbackImage || '')}" /></div><div class="${n.PartnerEventMediumImage_TextColumn} gdl-news-copy"><div class="${n.PartnerEventType} gdl-news-type">${escapeHtml(label.toUpperCase())}</div><div class="${n.PartnerEventMediumImage_Title} gdl-news-title">${escapeHtml(item.title)}</div>${preview ? `<div class="${n.PartnerEventMediumImage_Summary} gdl-news-summary">${escapeHtml(preview)}</div>` : ''}</div></div></div>`;
				}
			}
		}
		feedHtml += '</div>';
	}
	if (visibleNews < sortedNews.length) {
		feedHtml += `<div class="gdl-load-more-row"><button type="button" class="${FEED_CLASSES().FetchMoreContainer} gdl-load-more-activity">${escapeHtml(gdlText('fetch_more', loc('AppActivity_FetchMore', 'Load more activity')))}</button></div>`;
	}
	return feedHtml;
}

function deleteLocalActivityPost(steamAppId: string, postId: string, shortcutAppId?: string | null): void {
	try {
		const targetKeys = new Set<string>();
		if (steamAppId) targetKeys.add(`gdl_posts_${steamAppId}`);
		if (shortcutAppId) targetKeys.add(`gdl_posts_${shortcutAppId}`);
		if (socialRuntimeHost().getCurrentInjectedAppId()) targetKeys.add(`gdl_posts_${socialRuntimeHost().getCurrentInjectedAppId()}`);
		if (socialRuntimeHost().getCurrentInjectedShortcutAppId()) targetKeys.add(`gdl_posts_${socialRuntimeHost().getCurrentInjectedShortcutAppId()}`);

		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith('gdl_posts_')) targetKeys.add(k);
		}

		for (const key of targetKeys) {
			const raw = localStorage.getItem(key);
			if (!raw) continue;
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					const filtered = parsed.filter((p: LocalActivityPost) => p.id !== postId);
					if (filtered.length !== parsed.length) {
						localStorage.setItem(key, JSON.stringify(filtered));
						backendLog(`Deleted post ${postId} from key ${key}`);
					}
				}
			} catch {}
		}
	} catch (e) {
		backendLog('Failed to delete local activity post: ' + e);
	}
}

const feedInteractionCleanup = new WeakMap<Document, () => void>();

export function disposeActivityFeedInteractions(doc: Document): void {
	feedInteractionCleanup.get(doc)?.();
}

export function setupPostDeleteHandlers(
	doc: Document,
	steamAppId: string,
	shortcutAppId: string | null | undefined,
	newsItems: NewsItem[],
	fallbackImage: string
): void {
	disposeActivityFeedInteractions(doc);
	const feedContainer = doc.getElementById('gdl-activity-feed');
	if (!feedContainer) return;

	const handleClick = (event: Event): void => {
		const target = event.target as HTMLElement | null;
		if (!target) return;
		const loadMore = target.closest('.gdl-load-more-activity') as HTMLElement | null;
		if (loadMore) {
			event.preventDefault();
			event.stopPropagation();
			const current = visibleActivityNewsCount.get(steamAppId) || ACTIVITY_NEWS_PAGE_SIZE;
			visibleActivityNewsCount.set(steamAppId, current + ACTIVITY_NEWS_PAGE_SIZE);
			feedContainer.innerHTML = renderUnifiedActivityFeed(steamAppId, shortcutAppId, newsItems, fallbackImage);
			return;
		}
		const button = target.closest('.gdl-delete-post-btn') as HTMLElement | null;
		if (!button) return;
		event.preventDefault();
		event.stopPropagation();
		const postId = button.getAttribute('data-post-id');
		if (!postId) return;
		deleteLocalActivityPost(steamAppId, postId, shortcutAppId);
		feedContainer.innerHTML = renderUnifiedActivityFeed(steamAppId, shortcutAppId, newsItems, fallbackImage);
	};
	feedContainer.addEventListener('click', handleClick);
	let active = true;
	const cleanup = (): void => {
		if (!active) return;
		active = false;
		feedContainer.removeEventListener('click', handleClick);
		feedInteractionCleanup.delete(doc);
	};
	feedInteractionCleanup.set(doc, cleanup);
}

export function clearActivityFeedCaches(): void {
	lastInjectedNews.clear();
	lastInjectedFriendActivity.clear();
	visibleActivityNewsCount.clear();
}
