import type { FriendPersona } from '../../../domain/types';
import { backendLog, fetchFriendPersonasBackend, fetchFriendReviewBackend, fetchPublishedPreviewsBackend } from '../../../api/backend';
import { escapeHtml } from '../../../core/text';
import { ACH_CLASSES, EVENT_CLASSES } from '../../../steam/css';
import { gdlText, loc, steamIntlLocale } from '../../../steam/localization';
import { cachePersona, getCachedPersona, hasCachedPersona } from './personas';
import { socialRuntimeHost } from './host';
import { renderUnifiedActivityFeed } from './feed';

const DEFAULT_AVATAR = 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

async function getRealActivity(appid: number): Promise<any | null> {
	try {
		const store = (window as any).appActivityStore;
		if (!store?.GetAppActivity) return null;
		let activity = store.GetAppActivity(appid); // undefined on first call; triggers restore
		for (let i = 0; i < 12 && !activity; i++) {
			await new Promise(r => setTimeout(r, 400));
			activity = store.GetAppActivity(appid);
		}
		if (!activity) {
			backendLog('No activity object for appid ' + appid);
			return null;
		}
		return activity;
	} catch (e) {
		backendLog('Activity store error: ' + e);
		return null;
	}
}

/** Achievement icon URLs in activity events may be bare filenames */
function achievementIconUrl(icon: string, appid: string): string {
	if (!icon) return '';
	if (/^https?:\/\//.test(icon)) return icon;
	return `https://cdn.steamstatic.com/steamcommunity/public/images/apps/${appid}/${icon}`;
}

/** One achievement card, using native classes (icon + optional name/description) */
function renderAchievementCard(a: any, featured: boolean, appid: string): string {
	if (!a) return '';
	const c = ACH_CLASSES();
	const icon = achievementIconUrl(a.strImage || '', appid);
	return `<div class="${c.Achieved}${featured ? ' ' + c.Featured : ''}" style="display:flex;align-items:center;min-width:0;">
		<div class="${c.AchievementHoverContainer}" style="flex-shrink:0;">
			<img class="${c.Icon}" src="${escapeHtml(icon)}" style="display:block;width:64px;height:64px;" data-gdl-hide-on-error="1" />
		</div>
		${featured ? `<div class="${c.TextSection}">
			<div class="${c.Name}">${escapeHtml(a.strName || '')}</div>
			<div class="${c.Desc}">${escapeHtml(a.strDescription || '')}</div>
		</div>` : ''}
	</div>`;
}

// EUserNewsType values (extracted from Steam's own enum)
const NEWS_TYPE = {
	AchievementUnlocked: 2,
	ReceivedNewGame: 3,
	AddedGameToWishlist: 9,
	RecommendedGame: 10,
	Screenshot: 13,
	Video: 14,
	UserStatus: 16,
	ScreenshotTagged: 21,
	Art: 22,
	PlayedGameFirstTime: 30,
};

const RENDERABLE_EVENT_TYPES = new Set(Object.values(NEWS_TYPE));

const SCREENSHOT_TYPES = new Set([NEWS_TYPE.Screenshot, NEWS_TYPE.ScreenshotTagged, NEWS_TYPE.Art]);

const REVIEW_THUMB_UP = 'https://community.akamai.steamstatic.com/public/shared/images/userreviews/icon_thumbsUp_v6.png';

const REVIEW_THUMB_DOWN = 'https://community.akamai.steamstatic.com/public/shared/images/userreviews/icon_thumbsDown_v6.png';

function eventActorId(event: any): string {
	try { return event.steamIDActor?.ConvertTo64BitString?.() || ''; } catch { return ''; }
}

/** Substitute %1$s with the game name wrapped in the native white game-name span */
function verbWithGameName(template: string, gameName: string): string {
	const parts = template.split('%1$s');
	if (parts.length < 2) return escapeHtml(template);
	return escapeHtml(parts[0])
		+ `<span class="${EVENT_CLASSES().HeadlineGameName}">${escapeHtml(gameName)}</span>`
		+ escapeHtml(parts.slice(1).join('%1$s'));
}

/** Common event frame: avatar + "<name> <verb>" headline, then the body */
function renderEventShell(event: any, verbHtml: string, bodyHtml: string): string {
	const ev = EVENT_CLASSES();
	const sid64 = eventActorId(event);
	const p = sid64 ? getCachedPersona(sid64) : undefined;
	const name = p?.name || gdlText('friend_generic_name', 'A friend');
	const avatar = p?.avatar || DEFAULT_AVATAR;
	return `<div class="${ev.Event}">
		<div class="${ev.EventHeadline}">
			<a href="steam://url/SteamIDPage/${sid64}"><img class="${ev.EventActorAvatar}" src="${escapeHtml(avatar)}" data-gdl-fallback-src="${DEFAULT_AVATAR}" /></a>
			<div class="${ev.SpanEvent}"><a class="${ev.ActorName}" href="steam://url/SteamIDPage/${sid64}" style="color:#fff;text-decoration:none;cursor:pointer;">${escapeHtml(name)}</a><span>${verbHtml}</span></div>
		</div>
		${bodyHtml}
	</div>`;
}

/** Achievement unlock event (featured card + extra icon cards) */
function renderAchievementEvent(event: any, appid: string): string {
	const achs: any[] = event.achievements || [];
	if (achs.length === 0) return '';
	const primary = renderAchievementCard(achs[0], true, appid);
	const rest = achs.slice(1, 7).map(a => renderAchievementCard(a, false, appid)).join('');
	const body = `<div class="${EVENT_CLASSES().EventBody}">
		<div style="padding:12px;display:flex;flex-direction:column;gap:8px;">
			${primary}
			${rest ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${rest}</div>` : ''}
		</div>
	</div>`;
	return renderEventShell(event, escapeHtml(loc('AppActivity_Achieved', ' achieved')), body);
}

/** Shared screenshots/videos: large active image + swappable thumbnails */
function renderScreenshotEvent(event: any, previews: Map<string, string>, isVideo: boolean): string {
	const ids: string[] = (event.publishedfileids || []).map(String);
	const imgs = ids.map(id => ({ id, img: previews.get(id) || '' })).filter(x => x.img);
	if (imgs.length === 0) return '';

	const count = ids.length;
	const verb = isVideo
		? (count === 1
			? loc('AppActivity_PostedVideo', ' shared a video')
			: loc('AppActivity_PostedVideo_Plural', ' shared %1$s videos').replace('%1$s', String(count)))
		: (count === 1
			? loc('AppActivity_PostedScreenshot', ' shared a screenshot')
			: loc('AppActivity_PostedScreenshot_Plural', ' shared %1$s screenshots').replace('%1$s', String(count)));

	const uid = 'gdlss' + String(event.unUniqueID || Math.floor(Math.random() * 1e9));
	const fileUrl = (id: string) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;
	const main = imgs[0];
	const thumbs = imgs.slice(1, 5);
	const ts = event.rtEventTime || 0;
	const uploaded = ts
		? 'Uploaded: ' + new Date(ts * 1000).toLocaleDateString(steamIntlLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
			+ ' at ' + new Date(ts * 1000).toLocaleTimeString(steamIntlLocale(), { hour: 'numeric', minute: '2-digit' })
		: '';

	// Thumbnail swapping is handled by the shared delegated Steam navigation layer.


	const body = `<div class="${EVENT_CLASSES().EventBody}">
		<div style="padding:12px;">
			<div style="display:flex;gap:8px;align-items:flex-start;">
				<a id="${uid}-link" href="${fileUrl(main.id)}" data-gdl-open-url="${fileUrl(main.id)}" style="flex:0 1 ${thumbs.length ? '56%' : '80%'};min-width:0;">
					<img id="${uid}-main" src="${escapeHtml(main.img)}" style="width:100%;display:block;" data-gdl-hide-on-error="1" />
				</a>
				${thumbs.length ? `<div style="flex:1;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;align-content:start;">
					${thumbs.map(t => `<img src="${escapeHtml(t.img)}" data-gdl-swap-main="${uid}-main" data-gdl-swap-link="${uid}-link" data-gdl-swap-url="${fileUrl(t.id)}" style="width:100%;display:block;cursor:pointer;" data-gdl-hide-on-error="1" />`).join('')}
				</div>` : ''}
			</div>
			${uploaded ? `<div style="color:hsla(0,0%,100%,0.33);margin-top:8px;font-size:12px;">${escapeHtml(uploaded)}</div>` : ''}
		</div>
	</div>`;
	return renderEventShell(event, escapeHtml(verb), body);
}

/** Game capsule body used by "now owns" / "played first time" / wishlist events.
 *  Native uses a 200x94 header-image carousel item. */
function renderCapsuleBody(appid: string, fallbackHeader: string): string {
	return `<div class="${EVENT_CLASSES().EventBody}"><div style="padding:12px;">
		<a href="https://store.steampowered.com/app/${appid}" data-gdl-open-url="https://store.steampowered.com/app/${appid}">
			<img src="https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg" style="display:block;width:200px;height:94px;object-fit:cover;" data-gdl-fallback-src="${escapeHtml(fallbackHeader)}" />
		</a>
	</div></div>`;
}

interface FriendReview {
	found: boolean;
	voted_up?: boolean;
	rating?: string;
	hours?: string;
	text?: string;
	url: string;
}

/** "reviewed a este juego" event with the scraped review content */
function renderReviewEvent(event: any, review: FriendReview | undefined, appid: string): string {
	const verb = escapeHtml(loc('AppActivity_RecommendedGame', ' reviewed this game'));
	const url = review?.url || `https://steamcommunity.com/profiles/${eventActorId(event)}/recommended/${appid}/`;
	const readMore = `<a href="${escapeHtml(url)}" data-gdl-open-url="${escapeHtml(url)}" style="display:inline-block;margin-top:8px;color:#8c9193;font-size:12px;text-decoration:none;">${escapeHtml(loc('AppActivity_RecommendedGame_ReadMore', 'Read more'))}</a>`;

	let inner: string;
	if (review && review.found) {
		inner = `<div style="padding:12px;display:flex;gap:12px;align-items:flex-start;">
			<img src="${review.voted_up ? REVIEW_THUMB_UP : REVIEW_THUMB_DOWN}" style="width:40px;height:40px;flex-shrink:0;" data-gdl-hide-on-error="1" />
			<div style="min-width:0;">
				<div style="color:#dcdedf;font-size:16px;">${escapeHtml(review.rating || '')}</div>
				${review.hours ? `<div style="color:#8f98a0;font-size:11px;margin-top:2px;">${escapeHtml(review.hours)}</div>` : ''}
				${review.text ? `<div style="color:#acb2b8;font-size:13px;line-height:1.5;margin-top:10px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;white-space:pre-line;">${escapeHtml(review.text)}</div>` : ''}
				${readMore}
			</div>
		</div>`;
	} else {
		inner = `<div style="padding:12px;">${readMore}</div>`;
	}
	return renderEventShell(event, verb, `<div class="${EVENT_CLASSES().EventBody}">${inner}</div>`);
}

/** Fetch real activity and render all supported friend events into the feed */
export async function populateActivityFeed(doc: Document, steamAppId: string, gameName: string, headerImage: string): Promise<void> {
	const activity = await getRealActivity(parseInt(steamAppId));
	if (!activity || socialRuntimeHost().getCurrentInjectedAppId() !== steamAppId) return;

	// Collect days (native store groups events per day)
	const days: any[] = [];
	try {
		activity.m_mapActivityByDay?.forEach?.((d: any) => days.push(d));
	} catch {}
	if (days.length === 0) {
		backendLog('Activity: no day groups for ' + steamAppId);
		return;
	}
	days.sort((a, b) => (b.GetLatestEventTime?.() || 0) - (a.GetLatestEventTime?.() || 0));

	// Gather renderable events per day + everything we need to prefetch
	const dayEvents: { day: any; events: any[] }[] = [];
	const actorIds = new Set<string>();
	const fileIds = new Set<string>();
	const reviewActors: string[] = [];
	for (const day of days) {
		let events: any[] = [];
		try {
			events = (day.events || []).filter((e: any) => {
				if (!RENDERABLE_EVENT_TYPES.has(e.eEventType)) return false;
				if (e.eEventType === NEWS_TYPE.AchievementUnlocked) return Array.isArray(e.achievements) && e.achievements.length > 0;
				return true;
			}).slice(0, 5);
		} catch {}
		if (events.length === 0) continue;
		for (const e of events) {
			const sid = eventActorId(e);
			if (sid && !hasCachedPersona(sid)) actorIds.add(sid);
			if (SCREENSHOT_TYPES.has(e.eEventType) || e.eEventType === NEWS_TYPE.Video) {
				for (const id of (e.publishedfileids || []).slice(0, 5)) fileIds.add(String(id));
			}
			if (e.eEventType === NEWS_TYPE.RecommendedGame && sid && reviewActors.length < 3) {
				reviewActors.push(sid);
			}
		}
		dayEvents.push({ day, events });
		if (dayEvents.length >= 8) break;
	}
	if (dayEvents.length === 0) {
		backendLog('Activity: no renderable events for ' + steamAppId);
		return;
	}

	// Prefetch personas, screenshot previews, and reviews in parallel
	const previews = new Map<string, string>();
	const reviews = new Map<string, FriendReview>();
	await Promise.all([
		actorIds.size > 0
			? fetchFriendPersonasBackend({ steam_ids_csv: [...actorIds].join(',') })
				.then(json => { for (const persona of JSON.parse(json) as FriendPersona[]) cachePersona(persona); })
				.catch(e => backendLog('Activity persona fetch error: ' + e))
			: Promise.resolve(),
		fileIds.size > 0
			? fetchPublishedPreviewsBackend({ file_ids_csv: [...fileIds].join(',') })
				.then(json => { for (const f of JSON.parse(json) as { id: string; image: string }[]) if (f.image) previews.set(f.id, f.image); })
				.catch(e => backendLog('Preview fetch error: ' + e))
			: Promise.resolve(),
		...reviewActors.map(sid =>
			fetchFriendReviewBackend({ steam_id64: sid, steam_app_id: steamAppId })
				.then(json => { reviews.set(sid, JSON.parse(json) as FriendReview); })
				.catch(e => backendLog('Review fetch error: ' + e))
		),
	]);
	if (socialRuntimeHost().getCurrentInjectedAppId() !== steamAppId) return;

	const renderEvent = (e: any): string => {
		switch (e.eEventType) {
			case NEWS_TYPE.AchievementUnlocked:
				return renderAchievementEvent(e, steamAppId);
			case NEWS_TYPE.Video:
				return renderScreenshotEvent(e, previews, true);
			case NEWS_TYPE.ReceivedNewGame:
				return renderEventShell(e,
					verbWithGameName(loc('AppActivity_ReceivedNewGameList', ' added %1$s to their library'), gameName),
					renderCapsuleBody(steamAppId, headerImage));
			case NEWS_TYPE.AddedGameToWishlist:
				return renderEventShell(e,
					verbWithGameName(loc('AppActivity_AddedGameToWishlist', ' added %1$s to their %2$s.')
						.replace('%2$s', loc('AppActivity_Wishlist', 'wishlist')), gameName),
					renderCapsuleBody(steamAppId, headerImage));
			case NEWS_TYPE.PlayedGameFirstTime:
				return renderEventShell(e,
					verbWithGameName(loc('AppActivity_PlayedGameFirstTime', ' played %1$s for the first time'), gameName),
					renderCapsuleBody(steamAppId, headerImage));
			case NEWS_TYPE.RecommendedGame:
				return renderReviewEvent(e, reviews.get(eventActorId(e)), steamAppId);
			case NEWS_TYPE.UserStatus: {
				const text = e.statusText || e.strStatusText || e.status_text || e.strStatus || '';
				if (!text) {
					backendLog('UserStatus event fields: ' + Object.keys(e).slice(0, 40).join(','));
					return '';
				}
				const ev2 = EVENT_CLASSES();
				return renderEventShell(e,
					escapeHtml(loc('AppActivity_UserStatus', ' posted a status update')),
					`<div class="${ev2.EventBody} ${ev2.UserStatus}"><div style="font-size:14px;color:#dcdedf;line-height:1.5;white-space:pre-line;">${escapeHtml(String(text))}</div></div>`);
			}
			default:
				if (SCREENSHOT_TYPES.has(e.eEventType)) return renderScreenshotEvent(e, previews, false);
				return '';
		}
	};

	const ev = EVENT_CLASSES();
	let html = '';
	for (const { day, events } of dayEvents) {
		const rendered = events.map(renderEvent).join('');
		if (!rendered) continue;
		const ts = day.GetLatestEventTime?.() || 0;
		const dateLabel = ts
			? new Date(ts * 1000).toLocaleDateString(steamIntlLocale(), { month: 'long', day: 'numeric' })
			: '';
		html += `<div class="${ev.AppActivityDay}" role="region">
			<h4 class="${ev.AppActivityDate}" style="margin:0 0 4px;">${escapeHtml(dateLabel)}<div class="${ev.Rule}"></div></h4>
			${rendered}
		</div>`;
	}

	const feedEl = doc.getElementById('gdl-activity-feed');
	if (feedEl) {
		feedEl.innerHTML = renderUnifiedActivityFeed(
			steamAppId,
			socialRuntimeHost().getCurrentInjectedShortcutAppId(),
			[],
			headerImage,
			html
		);
		backendLog('Activity feed rendered with friends & news: ' + dayEvents.length + ' day group(s)');
	}
}
