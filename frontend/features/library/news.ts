import type { CommunityContentItem, NewsItem } from '../../domain/types';
import { backendLog, fetchCommunityContentBackend, fetchNewsBackend, fetchPartnerEventsBackend } from '../../api/backend';
import { CACHE_RETENTION, CACHE_TTL, cacheDeleteMatching, cacheGet, cacheRead, cacheSet } from '../../core/cache';
import { RetryingRequestCache } from '../../core/request-cache';
import { gdlText, getSteamLanguage, loc, steamIntlLocale, steamLanguageSync } from '../../steam/localization';

// A partially available legacy feed is still a useful last-known-good snapshot.
// Keep transient failures in memory briefly so revisiting a game does not launch
// the same four requests again, while allowing recovery much sooner than the
// normal persistent-news TTL.
const TRANSIENT_NEWS_RETRY_MS = 2 * 60 * 1000;
const communityRequests = new RetryingRequestCache<CommunityContentItem[]>({
	ttlMs: CACHE_TTL.communityContent,
	retries: 1,
	baseDelayMs: 250,
	maxEntries: 96,
	isCacheable: (value): value is CommunityContentItem[] => Array.isArray(value),
});
const newsRequests = new RetryingRequestCache<NewsItem[]>({
	ttlMs: TRANSIENT_NEWS_RETRY_MS,
	retries: 1,
	baseDelayMs: 300,
	maxEntries: 128,
	isCacheable: (value): value is NewsItem[] => Array.isArray(value),
});

function compactNewsItems(items: NewsItem[]): NewsItem[] {
	return items.slice(0, 48).map(item => ({
		...item,
		// Every renderer uses a short excerpt. Retaining five thousand characters
		// per item made feeds the first cache family evicted in larger libraries.
		contents: String(item.contents || '').slice(0, 1600),
	}));
}

export function newsItemsSignature(items: NewsItem[]): string {
	let hash = 2166136261;
	for (const item of items) {
		const value = `${item.gid}|${item.date}|${item.title}|${item.image || ''}`;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
	}
	return `${items.length}:${(hash >>> 0).toString(16)}`;
}

export function isNewsItemLanguageCompatible(item: Partial<NewsItem>, preferredLanguage = 'spanish'): boolean {
	const normLang = String(preferredLanguage || '').toLowerCase();
	const isRussian = normLang === 'russian' || normLang === 'ru';
	const isCjk = normLang === 'schinese' || normLang === 'tchinese' || normLang === 'zh' || normLang === 'japanese' || normLang === 'ja' || normLang === 'koreana' || normLang === 'korean' || normLang === 'ko';
	const isArabic = normLang === 'arabic' || normLang === 'ar';
	const sample = `${String(item.title || '')} ${String(item.contents || '')}`;
	if (!isRussian && /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/.test(sample)) return false;
	if (!isCjk && /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(sample)) return false;
	if (!isArabic && /[\u0600-\u06FF]/.test(sample)) return false;
	return true;
}

export function getCachedNews(steamAppId: string, language = steamLanguageSync() || 'english'):
	{ data: NewsItem[]; fresh: boolean } | null {
	const key = `events10_${language}-en_${steamAppId}`;
	const entry = cacheRead<NewsItem[]>(key, CACHE_TTL.news, CACHE_RETENTION.news);
	const legacy = entry ? null : cacheRead<NewsItem[]>(`events9_${language}-en_${steamAppId}`, CACHE_TTL.news, CACHE_RETENTION.news)
		|| cacheRead<NewsItem[]>(`events8_${language}-en_${steamAppId}`, CACHE_TTL.news, CACHE_RETENTION.news);
	const memory = newsRequests.peek(key);
	if (!entry && !legacy && memory === null) return null;
	// A transient in-memory refresh may contain only one of Steam's sources.
	// Merge it over the durable snapshot instead of shrinking or blanking the UI.
	const combined = [...(memory || []), ...(entry?.data || legacy?.data || [])]
		.filter(item => isNewsItemLanguageCompatible(item, language));
	return {
		data: compactNewsItems(mergeSupplementalPatchNotes(steamAppId, combined)),
		fresh: Boolean(entry?.fresh || memory !== null),
	};
}

export function getCachedCommunityContent(steamAppId: string, language = steamLanguageSync() || 'english'):
	{ data: CommunityContentItem[]; fresh: boolean } | null {
	const key = `community7_${language}_${steamAppId}`;
	const entry = cacheRead<CommunityContentItem[]>(key, CACHE_TTL.communityContent, CACHE_RETENTION.communityContent);
	if (entry) return { data: entry.data, fresh: entry.fresh };
	const legacy = cacheRead<CommunityContentItem[]>(`community6_${language}_${steamAppId}`,
		CACHE_TTL.communityContent, CACHE_RETENTION.communityContent);
	return legacy ? { data: legacy.data, fresh: false } : null;
}

export function eventTypeLabel(t: number): string {
	switch (t) {
		case 10: return loc('EventDisplay_EventType_10', gdlText('feed_game_launch', 'Game Launch'));
		case 12: return loc('AppActivity_EventType_GameUpdate', gdlText('feed_game_update', 'Game Update'));
		case 13: case 14: return loc('MajorUpdate_Type14', gdlText('feed_major_update', 'Major Update'));
		case 15: return loc('EventDisplay_EventType_15', gdlText('feed_dlc', 'DLC Release'));
		case 20: case 21: return loc('EventDisplay_EventType_20', gdlText('feed_offer', 'Offer'));
		case 22: case 23: case 24: case 25: case 26: case 35: return loc('EventDisplay_EventType_22', gdlText('feed_event', 'Game Event'));
		case 28: return loc('EventDisplay_EventType_28', gdlText('feed_news', 'News'));
		case 29: return loc('EventDisplay_EventType_29', gdlText('feed_beta', 'Beta Release'));
		case 30: return loc('EventDisplay_EventType_30', gdlText('feed_content', 'Content Release'));
		case 31: return loc('EventDisplay_EventType_31', gdlText('feed_free_trial', 'Free Trial'));
		case 32: return loc('EventDisplay_EventType_32', gdlText('feed_season', 'Season Release'));
		default: return loc('EventDisplay_EventType_Other', gdlText('feed_community', 'Community Announcements'));
	}
}

export async function getCommunityContent(steamAppId: string, requestedLanguage?: string): Promise<CommunityContentItem[]> {
	const language = requestedLanguage || await getSteamLanguage().catch(() => steamLanguageSync() || 'english');
	const cacheKey = `community7_${language}_${steamAppId}`;
	const cached = cacheGet<CommunityContentItem[]>(cacheKey, CACHE_TTL.communityContent);
	if (cached !== null) return cached;
	const stale = getCachedCommunityContent(steamAppId, language)?.data || [];
	const loaded = await communityRequests.get(cacheKey, async () => {
		try {
			const json = await fetchCommunityContentBackend({ steam_app_id: steamAppId, language });
			const parsed = JSON.parse(json);
			if (parsed?.error || parsed?.transient_error === true) return null;
			const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 24) as CommunityContentItem[] : [];
			cacheSet(cacheKey, items);
			return items;
		} catch (e) {
			backendLog('Community content fetch error: ' + e);
			return null;
		}
	});
	return loaded ?? stale;
}

export async function getNews(steamAppId: string, requestedLanguage?: string): Promise<NewsItem[]> {
	// Ask Steam for the client language first, then use English only for events
	// that have no localized version. Keeping the language in the cache key is
	// important when the user changes Steam's language between sessions.
	const preferredLanguage = requestedLanguage || await getSteamLanguage().catch(() => steamLanguageSync() || 'english');
	const cacheKey = `events10_${preferredLanguage}-en_${steamAppId}`;
	const snapshot = getCachedNews(steamAppId, preferredLanguage);
	if (snapshot?.fresh) return snapshot.data;
	const stale = (snapshot?.data || [])
		.filter(item => isNewsItemLanguageCompatible(item, preferredLanguage));

	// Combine Steam partner events with the official community-announcements
	// feed. Partner events provide native event types/images; announcements
	// fill older pages so the Load More control has a real chronology.
	const loaded = await newsRequests.get(cacheKey, async () => { try {
		const settled = async (request: Promise<string>): Promise<{ raw: string; ok: boolean }> => {
			try { return { raw: await request, ok: true }; }
			catch { return { raw: '{"items":[]}', ok: false }; }
		};
		const [preferredResult, englishResult, announcementsResult, englishAnnouncementsResult] = await Promise.all([
			settled(fetchPartnerEventsBackend({ steam_app_id: steamAppId, language: preferredLanguage })),
			preferredLanguage === 'english'
				? Promise.resolve({ raw: '{"items":[]}', ok: true })
				: settled(fetchPartnerEventsBackend({ steam_app_id: steamAppId, language: 'english' })),
			settled(fetchNewsBackend({ steam_app_id: steamAppId, language: preferredLanguage })),
			preferredLanguage === 'english'
				? Promise.resolve({ raw: '{"items":[]}', ok: true })
				: settled(fetchNewsBackend({ steam_app_id: steamAppId, language: 'english' })),
		]);
		const preferred = JSON.parse(preferredResult.raw);
		const english = JSON.parse(englishResult.raw);
		const announcements = JSON.parse(announcementsResult.raw);
		const englishAnnouncements = JSON.parse(englishAnnouncementsResult.raw);
		const hadTransportFailure = !preferredResult.ok || !englishResult.ok
			|| !announcementsResult.ok || !englishAnnouncementsResult.ok
			|| preferred?.transient_error === true || english?.transient_error === true
			|| Boolean(announcements?.error) || Boolean(englishAnnouncements?.error);
		const partnerItems = [
			...(Array.isArray(preferred.items) ? preferred.items : []),
			...(Array.isArray(english.items) ? english.items : []),
		];
		const officialAnnouncements = [
			...(Array.isArray(announcements.items) ? announcements.items : []),
			...(Array.isArray(englishAnnouncements.items) ? englishAnnouncements.items : []),
		];
		const partnerEventsUnavailable = preferred?.unavailable === true
			&& (preferredLanguage === 'english' || english?.unavailable === true);
		if (partnerItems.length > 0 || officialAnnouncements.length > 0) {
			const items: NewsItem[] = [
				...partnerItems.map((e: any) => ({
				gid: String(e.gid || ''),
				title: e.title || '',
				url: `https://store.steampowered.com/news/app/${steamAppId}/view/${e.gid || ''}`,
				contents: e.contents || '',
				date: e.date || 0,
				event_type: e.event_type || 0,
				image: e.image || '',
				})),
				...officialAnnouncements.map((item: any) => ({
					...item,
					gid: String(item.gid || ''),
					title: item.title || '',
					contents: item.contents || '',
					date: Number(item.date || 0),
					event_type: inferAnnouncementEventType(item.title || '', item.contents || ''),
					image: newsImageFromContents(item.contents || ''),
				})),
			];
			const seenIds = new Set<string>();
			const seenTitles = new Set<string>();
			const deduped = items.filter((item: NewsItem) => {
				const id = String(item.gid || '').toLowerCase();
				const title = stripTags(String(item.title || '')).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
				if (!title) return false;
				if (!isNewsItemLanguageCompatible(item, preferredLanguage)) return false;
				if ((id && seenIds.has(id)) || seenTitles.has(title)) return false;
				if (id) seenIds.add(id);
				seenTitles.add(title);
				return true;
			});
			if (deduped.length === 0 && stale.length > 0) return stale;
			const merged = compactNewsItems(mergeSupplementalPatchNotes(
				steamAppId,
				hadTransportFailure ? [...deduped, ...stale] : deduped,
			));
			// At least one official source produced usable data. Persist that valid
			// feed even if a sibling endpoint failed; legacy AppIDs commonly expose
			// announcements but no Partner Events endpoint.
			cacheSet(cacheKey, merged);
			return merged;
		}
		// A retired AppID may no longer have a Store News Hub. Cache that expected
		// empty state so returning to the game does not call the dead endpoint again.
		if (partnerEventsUnavailable) {
			const merged = compactNewsItems(mergeSupplementalPatchNotes(steamAppId, []));
			cacheSet(cacheKey, merged);
			return merged;
		}
		if (!hadTransportFailure) {
			const merged = compactNewsItems(mergeSupplementalPatchNotes(steamAppId, []));
			cacheSet(cacheKey, merged);
			return merged;
		}
	} catch (e) {
		backendLog('Official Steam activity fetch error: ' + e);
	}
	// Keep the last known feed visible and suppress an immediate retry storm.
	// RetryingRequestCache retains this fallback only for the short transient TTL.
	return stale.length > 0 ? stale : compactNewsItems(mergeSupplementalPatchNotes(steamAppId, []));
	});
	return loaded ?? (stale.length > 0 ? stale : compactNewsItems(mergeSupplementalPatchNotes(steamAppId, [])));
}

export function invalidateLibraryContentCaches(appIds: Iterable<string | number>): void {
	const ids = new Set(Array.from(appIds, value => String(value)).filter(value => /^\d+$/.test(value)));
	if (ids.size === 0) return;
	const matches = (key: string): boolean => ids.has(key.match(/_(\d+)$/)?.[1] || '');
	communityRequests.invalidateMatching(matches);
	newsRequests.invalidateMatching(matches);
	cacheDeleteMatching(key => /^(?:events\d+|community\d+)_/.test(key) && matches(key));
}

function newsImageFromContents(contents: string): string {
	const value = String(contents || '');
	const bbcode = value.match(/\[img\](https?:\/\/[^\[]+)\[\/img\]/i);
	if (bbcode?.[1]) return bbcode[1].replace(/&amp;/g, '&');
	const html = value.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
	return html?.[1]?.replace(/&amp;/g, '&') || '';
}

function inferAnnouncementEventType(title: string, contents: string): number {
	const text = `${title} ${contents.slice(0, 240)}`.toLowerCase();
	if (/major update|actualizaci[oó]n importante|free update|gran actualizaci[oó]n/.test(text)) return 13;
	if (/patch notes?|hotfix|notas? (?:del|de) parche|actualizaci[oó]n|\bupdate\b/.test(text)) return 12;
	if (/\bdlc\b|downloadable content|contenido descargable|expansi[oó]n/.test(text)) return 15;
	if (/sale|oferta|descuento|discount/.test(text)) return 20;
	if (/event|evento|livestream|retransmisi[oó]n|tournament|torneo/.test(text)) return 22;
	return 28;
}

export function formatNewsDate(ts: number): string {
	try {
		const date = new Date(ts * 1000);
		const isCurrentYear = date.getFullYear() === new Date().getFullYear();
		return new Intl.DateTimeFormat(steamIntlLocale(), isCurrentYear
			? { day: 'numeric', month: 'long' }
			: { day: 'numeric', month: 'short', year: 'numeric' })
			.format(date).replace(/\./g, '').toUpperCase();
	} catch {
		return new Date(ts * 1000).toLocaleDateString(steamIntlLocale(), { day: 'numeric', month: 'long' }).toUpperCase();
	}
}



export function isPatchNoteItem(item: NewsItem): boolean {
	const et = Number(item.event_type || 0);
	if (et === 12 || et === 13 || et === 14) return true;
	const title = String(item.title || '').toLowerCase();
	const feedlabel = String(item.feedlabel || '').toLowerCase();
	if (feedlabel.includes('parche') || feedlabel.includes('patch') || feedlabel.includes('actualización') || feedlabel.includes('update')) return true;
	if (title.includes('patch') || title.includes('parche') || title.includes('update') || title.includes('actualización') || title.includes('hotfix')) return true;
	if (/\bv?\d+\.\d+(\.\d+)*\b/i.test(title)) return true;
	return false;
}

/**
 * Official patch notes that are not published as Steam partner events.
 * Keep these isolated by AppID so they never affect unrelated linked games.
 * They are merged with Steam's own feed and sorted newest-first.
 */
function supplementalPatchNotes(steamAppId: string): NewsItem[] {
	if (String(steamAppId) !== '1790600') return [];
	return [
		{
			gid: 'gdl-bandai-1790600-20260807',
			title: 'August 7, 2026 Update — Ver. 3021.020.003.012.014',
			url: 'https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-sparking-zero-update-notice-august-7-2026',
			contents: 'Fixed character-model display issues, added Limit Breaker Journey adjustments, and improved overall stability.',
			date: 1786089600,
			event_type: 12,
			image: '',
			feedlabel: 'Official update',
		},
		{
			gid: 'gdl-bandai-1790600-20260729',
			title: 'July 29, 2026 Update — Ver. 3020.019.003.012.013',
			url: 'https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-sparking-zero-update-notice-july-29-2026',
			contents: 'Added stages, BGM, new options and mechanics, game-mode changes, combat adjustments, and general stability and performance improvements.',
			date: 1785312000,
			event_type: 12,
			image: '',
			feedlabel: 'Official update',
		},
	];
}

function mergeSupplementalPatchNotes(steamAppId: string, items: NewsItem[]): NewsItem[] {
	const merged = [...supplementalPatchNotes(steamAppId), ...(Array.isArray(items) ? items : [])];
	const seen = new Set<string>();
	return merged
		.filter(item => {
			const key = String(item.url || item.gid || item.title || '').toLowerCase();
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
}





export function stripTags(str: string): string {
	if (!str) return '';
	let res = str
		.replace(/\[\/?\w+[^\]]*\]/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\{STEAM_CLAN_IMAGE\}[^\s]*/g, '');
	for (let i = 0; i < 3; i++) {
		if (!res.includes('&')) break;
		res = res
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&apos;/g, "'")
			.replace(/&nbsp;/g, ' ');
	}
	return res.trim();
}

export function newsExcerpt(contents: string, maxLength = 250): string {
	const clean = stripTags(contents).replace(/\s+/g, ' ').trim();
	if (clean.length <= maxLength) return clean;
	const candidate = clean.slice(0, maxLength + 1);
	const sentenceEnd = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '));
	if (sentenceEnd >= Math.floor(maxLength * 0.55)) return candidate.slice(0, sentenceEnd + 1);
	const wordEnd = candidate.lastIndexOf(' ');
	return candidate.slice(0, wordEnd > 0 ? wordEnd : maxLength).trimEnd() + '…';
}
