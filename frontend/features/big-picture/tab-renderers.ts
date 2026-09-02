import type { CommunityContentItem, FriendCategories, LocalAchievementData, LocalAchievementItem, NewsItem, SteamCommunityItemsCatalog, SteamGameData } from '../../domain/types';
import { steamStringList } from '../../core/steam-game-data';
import { steamGameMainPageUrl } from '../../core/steam-links';
import { escapeAttr, escapeHtml } from '../../core/text';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import { compareEarnedAchievementsForDisplay, compareLockedAchievementsForDisplay, highlightedAchievementNames } from '../achievements/rarity';
import { eventTypeLabel, isPatchNoteItem, newsExcerpt } from '../library/news';
import { type LocalActivityPost, loadLocalActivityPosts } from '../library/social/feed';
import { renderBigPictureFriends } from './friends';
import { linkedShortcutPortrait } from '../library/artwork';
import { completionMedalSvg, featureSvg, wrenchToolSvg, extractYoutubeId } from './news-modal';

export type MappedShortcut = { id: number; title: string; steamAppId: string };
export type BigPictureTab = 'activity' | 'stuff' | 'community' | 'info';

export interface BigPictureDetailData {
	game: SteamGameData | null;
	achievements: LocalAchievementData | null;
	news: NewsItem[];
	community: CommunityContentItem[];
	cards: SteamCommunityItemsCatalog | null;
	friends: FriendCategories | null;
}

type BigPictureFeedItem =
	| { type: 'post'; post: LocalActivityPost; date: number }
	| { type: 'news'; item: NewsItem; date: number };

function formatBigPictureFeedDate(timestamp: number): string {
	if (!timestamp || timestamp <= 0) return '';
	const d = new Date(timestamp * 1000);
	const now = new Date();
	const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
	if (isToday) return loc('AppActivity_Today', 'HOY').toUpperCase();
	const yesterday = new Date(now.getTime() - 86400000);
	const isYesterday = d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate();
	if (isYesterday) return loc('AppActivity_Yesterday', 'AYER').toUpperCase();
	try {
		return d.toLocaleDateString(steamIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
	} catch {
		return d.toLocaleDateString(steamIntlLocale()).toUpperCase();
	}
}

export function renderActivity(data: BigPictureDetailData, shortcut: MappedShortcut, hydrationStarted = false): string {
	const localPosts = loadLocalActivityPosts(shortcut.steamAppId, String(shortcut.id));
	const sortedNews = (Array.isArray(data.news) ? [...data.news] : [])
		.filter(item => item && item.title && Number(item.date || 0) > 0)
		.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));

	const allItems: BigPictureFeedItem[] = [
		...localPosts.map(p => ({ type: 'post' as const, post: p, date: p.timestamp })),
		...sortedNews.slice(0, 16).map(item => ({ type: 'news' as const, item, date: Number(item.date || 0) })),
	].sort((a, b) => b.date - a.date);

	const friendsHtml = renderBigPictureFriends(data.friends);

	const groups: { dateLabel: string; items: BigPictureFeedItem[] }[] = [];
	const map = new Map<string, BigPictureFeedItem[]>();
	for (const entry of allItems) {
		const label = formatBigPictureFeedDate(entry.date);
		if (!map.has(label)) {
			map.set(label, []);
			groups.push({ dateLabel: label, items: map.get(label)! });
		}
		map.get(label)!.push(entry);
	}

	let feedHtml = '';
	for (const group of groups) {
		feedHtml += `<div class="gdl-bp-feed-group">
			<div class="gdl-bp-date-heading-wrap"><div class="gdl-bp-date-heading">${escapeHtml(group.dateLabel)}</div></div>
			<div class="gdl-bp-feed-list">`;
		for (const entry of group.items) {
			if (entry.type === 'post') {
				const p = entry.post;
				feedHtml += `<div class="gdl-bp-feed-card gdl-bp-feed-user-post Focusable" tabindex="0" role="button" data-focusable="true">
					<div class="gdl-bp-feed-icon-wrap">${p.user_avatar ? `<img class="gdl-bp-feed-avatar" src="${escapeAttr(p.user_avatar)}" alt="" />` : ''}</div>
					<div class="gdl-bp-feed-body">
						<div class="gdl-bp-feed-eyebrow">${escapeHtml(gdlText('user_status', 'Status Post').toUpperCase())}</div>
						<div class="gdl-bp-feed-title">${escapeHtml(p.user_name)}</div>
						<div class="gdl-bp-feed-desc">${escapeHtml(p.text)}</div>
					</div>
				</div>`;
			} else {
				const item = entry.item;
				const eventType = Number(item.event_type || 0);
				const isPatch = eventType === 0 && isPatchNoteItem(item);
				const label = eventType > 0 ? eventTypeLabel(eventType) : (isPatch ? loc('AppActivity_MinorUpdate', 'ACTUALIZACIÓN MENOR / NOTAS DE PARCHE') : (item.feedlabel || gdlText('feed_news', 'NOTICIAS')));
				const preview = newsExcerpt(item.contents || '', 220);
				const thumbUrl = item.image || data.game?.header_image || data.game?.background || data.game?.background_raw || '';
				const comments = Number((item as any).commentcount || (item as any).comments || 0);
				const upvotes = Number((item as any).upvotes || (item as any).votes || 0);
				const statsHtml = (comments > 0 || upvotes > 0) ? `<div class="gdl-bp-feed-meta">${comments > 0 ? `<span>${comments.toLocaleString(steamIntlLocale())} 💬</span>` : ''}${upvotes > 0 ? `<span>${upvotes.toLocaleString(steamIntlLocale())} 👍</span>` : ''}</div>` : '';
				feedHtml += `<a class="gdl-bp-feed-card Focusable" data-gdl-news-gid="${escapeAttr(item.gid || item.url || '')}" href="${escapeAttr(item.url || '#')}" tabindex="0" role="button" data-focusable="true">
					${thumbUrl ? `<div class="gdl-bp-feed-thumb-wrap"><img class="gdl-bp-feed-thumb" src="${escapeAttr(thumbUrl)}" alt="" loading="lazy" /></div>` : `<div class="gdl-bp-feed-icon-wrap">${wrenchToolSvg()}</div>`}
					<div class="gdl-bp-feed-body">
						<div class="gdl-bp-feed-eyebrow">${escapeHtml(label.toUpperCase())}</div>
						<div class="gdl-bp-feed-title">${escapeHtml(item.title)}</div>
						${preview ? `<div class="gdl-bp-feed-desc">${escapeHtml(preview)}</div>` : ''}
						${statsHtml}
					</div>
				</a>`;
			}
		}
		feedHtml += '</div></div>';
	}

	const postBoxHtml = `
		<div class="gdl-bp-feed-post-section">
			<div class="gdl-bp-feed-post-input-wrap">
				<input class="gdl-bp-feed-post-input Focusable" type="text" placeholder="${escapeHtml(loc('AppActivity_PostPlaceholder', 'Diles algo sobre este juego a tus amigos...'))}" tabindex="0" data-focusable="true" />
			</div>
			<div class="gdl-bp-feed-jump-wrap">
				<button class="gdl-bp-feed-jump-news Focusable" type="button" tabindex="0" data-focusable="true">
					${escapeHtml(loc('AppActivity_ViewLatestNews', 'Ver las últimas novedades'))}
				</button>
			</div>
		</div>
	`;

	const loadMoreHtml = `
		<div class="gdl-bp-feed-load-more-wrap">
			<button class="gdl-bp-feed-load-more-btn Focusable" type="button" tabindex="0" data-focusable="true">
				${escapeHtml(loc('AppActivity_LoadMoreActivity', 'Cargar más actividad'))}
			</button>
		</div>
	`;

	const activityHeading = `<section class="gdl-bp-section" id="gdl-bp-activity-section">
		<h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Activity', 'Actividad'))}</h2>
		${postBoxHtml}
		<div class="gdl-bp-activity-feed">${feedHtml}</div>
		${allItems.length > 0 ? loadMoreHtml : (!hydrationStarted ? `<div class="gdl-bp-loading">${escapeHtml(loc('Loading', 'Loading…'))}</div>` : '')}
	</section>`;

	return `${friendsHtml}${activityHeading}`;
}

export function renderAchievements(data: LocalAchievementData | null): string {
	const title = escapeHtml(loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')));
	if (!data) return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(loc('Loading', 'Loading…'))}</div></section>`;
	if (data.total <= 0) return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(gdlText('no_achievements', 'No achievements found.'))}</div></section>`;
	const pct = Math.max(0, Math.min(100, Math.round((data.unlocked * 100) / Math.max(1, data.total))));
	const complete = data.unlocked >= data.total;
	const earned = data.achievements.filter(item => item.earned).sort(compareEarnedAchievementsForDisplay);
	const locked = data.achievements.filter(item => !item.earned).sort(compareLockedAchievementsForDisplay);
	const ordered = [...earned, ...locked];
	const featured = ordered[0] || null;
	const strip = ordered.slice(0, 10);
	const highlightedNames = highlightedAchievementNames(earned);
	const isHighlighted = (item: LocalAchievementItem): boolean => item.earned && highlightedNames.has(String(item.name));
	const progressLabel = complete
		? gdlText('all_achievements_unlocked', 'You have unlocked all achievements! {unlocked}/{total}', { unlocked: data.unlocked, total: data.total })
		: loc('AppDetails_PlayerUnlockedPercent', 'Has desbloqueado %1$s/%2$s logros').replace('%1$s', String(data.unlocked)).replace('%2$s', String(data.total));

	return `<section class="gdl-bp-section">
		<h2 class="gdl-bp-section-title">${title}</h2>
		<div class="gdl-bp-achievements-shell">
			<div class="gdl-bp-ach-progress Focusable" tabindex="0" role="button" data-focusable="true">
				${complete ? `<div class="gdl-bp-medal">${completionMedalSvg()}</div>` : '<div></div>'}
				<div class="gdl-bp-ach-progress-copy">
					<div class="gdl-bp-ach-progress-label"><strong>${escapeHtml(progressLabel)}</strong> <span>(${pct}%)</span></div>
					<div class="gdl-bp-progress-track"><div class="gdl-bp-progress-fill" style="width:${pct}%"></div></div>
				</div>
			</div>
			<div class="gdl-bp-ach-strip">
				${featured ? `
					<div id="gdl-bp-ach-featured-preview" class="gdl-bp-ach-featured Focusable${isHighlighted(featured) ? ' is-rare' : ''}" tabindex="0" role="button" data-focusable="true">
						<div class="gdl-bp-ach-img-frame${isHighlighted(featured) ? ' is-rare' : ''}">
							<div class="gdl-bp-ach-rare-glow"></div>
							<img class="gdl-bp-ach-img" src="${escapeAttr(featured.earned ? featured.icon : (featured.icon_gray || featured.icon))}" alt="" />
						</div>
						<div class="gdl-bp-ach-featured-info">
							<strong class="gdl-bp-ach-featured-title">${escapeHtml(featured.display_name || featured.name)}</strong>
							<p class="gdl-bp-ach-featured-desc">${escapeHtml(featured.description || '')}</p>
							<p class="gdl-bp-ach-featured-pct">${Number(featured.global_percent || 0).toFixed(1)}% ${escapeHtml(gdlText('players_have_achievement', 'de los jugadores tienen este logro'))}</p>
						</div>
					</div>
				` : '<div></div>'}
				<div id="gdl-bp-native-achievement-mount" class="gdl-bp-native-achievement-mount"></div>
				<div class="gdl-bp-ach-icons">
					${strip.map(item => `
						<div class="gdl-bp-ach-icon-frame Focusable${isHighlighted(item) ? ' is-rare' : ''}"
							tabindex="0" role="button" data-focusable="true"
							data-ach-title="${escapeAttr(item.display_name || item.name)}"
							data-ach-desc="${escapeAttr(item.description || '')}"
							data-ach-pct="${Number(item.global_percent || 0).toFixed(1)}"
							data-ach-img="${escapeAttr(item.earned ? item.icon : (item.icon_gray || item.icon))}"
							title="${escapeAttr(item.display_name || item.name)}">
							<div class="gdl-bp-ach-rare-glow"></div>
							<img class="gdl-bp-ach-icon${!item.earned ? ' is-locked' : ''}" src="${escapeAttr(item.earned ? item.icon : (item.icon_gray || item.icon))}" alt="" />
						</div>
					`).join('')}
				</div>
			</div>
			<div class="gdl-bp-ach-footer-prompt-bar">
				<div class="gdl-bp-footer-prompt gdl-bp-open-ach-trigger Focusable" tabindex="0" role="button" data-focusable="true">
					<span class="gdl-bp-key-badge">A</span>
					<span>${escapeHtml(loc('AppDetails_ViewAllAchievements', 'VER TODOS MIS LOGROS').toUpperCase())}</span>
				</div>
			</div>
		</div>
	</section>`;
}

export function renderCards(catalog: SteamCommunityItemsCatalog | null): string {
	if (!catalog?.cards?.length) return '';
	const badge = catalog.foil_badge || catalog.badges?.[0] || null;
	const cards = catalog.cards || [];
	const unlockedCount = Math.min(cards.length, Math.max(1, Math.ceil(cards.length * 0.55)));
	const unlockedCards = cards.slice(0, unlockedCount);
	const lockedCards = cards.slice(unlockedCount);

	return `<section class="gdl-bp-section">
		<h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Tarjetas')))}</h2>
		<div class="gdl-bp-cards-shell">
			<div class="gdl-bp-badge-row">
				${badge?.image ? `<img class="gdl-bp-badge-img" src="${escapeAttr(badge.image)}" alt="">` : '<div class="gdl-bp-badge-img"></div>'}
				<div class="gdl-bp-badge-copy">
					<strong>${escapeHtml(badge?.title || gdlText('trading_cards', 'Trading Cards'))}</strong><br>
					<span>${escapeHtml(String((badge?.level || 1) * 100))} EXP</span>
				</div>
			</div>
			<div class="gdl-bp-card-row">
				${unlockedCards.map((card, idx) => `
					<div class="gdl-bp-card-item Focusable" tabindex="0" role="button" data-focusable="true" data-gdl-card-idx="${idx}" title="${escapeAttr(card.title || '')}">
						<img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.title || '')}">
					</div>
				`).join('')}
			</div>
			${lockedCards.length > 0 ? `
				<div class="gdl-bp-card-count">${lockedCards.length} ${escapeHtml(loc('AppDetails_CardsToCollect', 'TARJETAS POR COLECCIONAR').toUpperCase())}</div>
				<div class="gdl-bp-card-row gdl-bp-card-row-locked">
					${lockedCards.map((card, idx) => `
						<div class="gdl-bp-card-item is-locked Focusable" tabindex="0" role="button" data-focusable="true" data-gdl-card-idx="${unlockedCount + idx}" title="${escapeAttr(card.title || '')}">
							<img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.title || '')}">
						</div>
					`).join('')}
				</div>
			` : ''}
		</div>
	</section>`;
}

export function renderMediaAndNotes(): string {
	return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Media', 'Media'))}</h2><div class="gdl-bp-media-box"><div class="gdl-bp-media-copy">${escapeHtml(loc('AppDetails_ScreenshotHint_Gamepad', 'You can take a screenshot while playing from the Steam overlay.'))}</div><button class="gdl-bp-action-button Focusable" type="button" tabindex="0" data-focusable="true">${escapeHtml(loc('AppDetails_GoToMediaLibrary', 'Go to my media library'))}</button></div></section>
	<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_GameNotes', 'Notes'))}</h2><div class="gdl-bp-notes-box"><button class="gdl-bp-action-button Focusable" type="button" tabindex="0" data-focusable="true">✎ ${escapeHtml(loc('AppDetails_CreateNewNote', 'New note'))}</button></div></section>`;
}

export function renderStuff(data: BigPictureDetailData): string {
	return `${renderAchievements(data.achievements)}${renderCards(data.cards)}${renderMediaAndNotes()}`;
}

export function fallbackCommunity(data: BigPictureDetailData): CommunityContentItem[] {
	if (data.community.length) return data.community;
	return (data.game?.screenshots || []).slice(0, 8).map((shot, index) => ({
		type: 'screenshot',
		label: loc('AppDetails_Community_Screenshot', 'Screenshot'),
		image: shot.path_full || shot.path_thumbnail,
		title: data.game?.name || `Screenshot ${index + 1}`,
	}));
}

export function renderCommunity(data: BigPictureDetailData): string {
	const items = fallbackCommunity(data).filter(item => item.image);
	if (items.length === 0) return `<div class="gdl-bp-empty">${escapeHtml(loc('AppDetails_Community_NoContent', 'No community content is available.'))}</div>`;

	const videos = items.filter(item => item.type === 'video' || Boolean(item.youtube_id)).slice(0, 2);
	const nonVideos = items.filter(item => item.type !== 'video' && !item.youtube_id);
	const displayedVideos = videos.length > 0 ? videos : items.slice(0, 2);
	const displayedGuides = nonVideos.length > 0 ? nonVideos.slice(0, 8) : items.slice(2, 10);

	return `<section class="gdl-bp-section">
		<h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Contenido de la Comunidad')))}</h2>
		<div class="gdl-bp-community-videos-grid">
			${displayedVideos.map((item, idx) => {
				const ytId = item.youtube_id || extractYoutubeId(item.link || '') || extractYoutubeId(item.image || '');
				return `
					<div class="gdl-bp-community-video-card Focusable" data-gdl-comm-video-idx="${idx}" data-gdl-yt-id="${escapeAttr(ytId)}" tabindex="0" role="button" data-focusable="true">
						<div class="gdl-bp-community-media-wrap" id="gdl-bp-comm-video-wrap-${idx}">
							<img class="gdl-bp-community-media" src="${escapeAttr(item.image)}" alt="" />
							<div class="gdl-bp-community-play-icon">▶</div>
						</div>
						<div class="gdl-bp-community-title">${escapeHtml(item.title || item.label || '')}</div>
						<div class="gdl-bp-community-author">
							${item.author_avatar ? `<img src="${escapeAttr(item.author_avatar)}" alt="" />` : ''}
							<span>${escapeHtml(item.author_name || item.label || '')}</span>
						</div>
					</div>
				`;
			}).join('')}
		</div>
		${displayedGuides.length > 0 ? `
			<div class="gdl-bp-community-guides-grid">
				${displayedGuides.map((item, idx) => `
					<div class="gdl-bp-community-guide-card Focusable" data-gdl-comm-guide-idx="${idx}" tabindex="0" role="button" data-focusable="true">
						<div class="gdl-bp-community-guide-eyebrow">${escapeHtml(loc('AppDetails_CommunityGuide', 'GUÍA DE LA COMUNIDAD').toUpperCase())}</div>
						<div class="gdl-bp-community-guide-content">
							<img class="gdl-bp-community-guide-thumb" src="${escapeAttr(item.image)}" alt="" />
							<div class="gdl-bp-community-guide-title">${escapeHtml(item.title || item.label || '')}</div>
						</div>
						<div class="gdl-bp-community-guide-desc">${escapeHtml(item.description || item.title || '')}</div>
					</div>
				`).join('')}
			</div>
		` : ''}
	</section>`;
}

function hasCategory(game: SteamGameData | null, id: number): boolean {
	return Boolean(Array.isArray(game?.categories) && game.categories.some(category => Number(category.id) === id));
}

export function renderInfo(data: BigPictureDetailData, shortcut: MappedShortcut): string {
	const game = data.game;
	if (!game) return `<div class="gdl-bp-empty">${escapeHtml(loc('AppDetails_GameInfo', 'Game information'))}</div>`;
	const developer = steamStringList(game.developers).join(', ');
	const publisher = steamStringList(game.publishers).join(', ');
	const franchise = steamStringList(game.franchises).join(', ');
	const release = game.release_date?.date || '';
	const portrait = linkedShortcutPortrait(shortcut.id, shortcut.steamAppId)
		|| (shortcut.steamAppId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${shortcut.steamAppId}/library_600x900_2x.jpg` : '')
		|| game.capsule_image || game.header_image || '';
	const metaLabel = (key: string, fb: string) => escapeHtml(loc(key, fb).replace(/[:\s]+$/g, '').trim()) + ':';
	const features: Array<{ icon: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'; label: string }> = [];
	if (hasCategory(game, 2) || !hasCategory(game, 1)) features.push({ icon: 'person', label: loc('AppDetails_Feature_SinglePlayer', gdlText('single_player', 'Single-player')) });
	if ((data.achievements?.total || game.achievements?.total || 0) > 0) features.push({ icon: 'achievement', label: loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')) });
	features.push({ icon: 'cloud', label: loc('AppDetails_Feature_SteamCloud', gdlText('cloud_saves', 'Cloud saves')) }, { icon: 'family', label: loc('AppDetails_Feature_FamilySharing', gdlText('family_sharing', 'Family Sharing')) }, { icon: 'controller', label: loc('AppDetails_Feature_FullController', gdlText('full_controller', 'Full controller support')) });
	const links = [[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), steamGameMainPageUrl(shortcut.steamAppId, game.is_delisted === true)], [loc('AppDetails_Links_DLC', gdlText('dlc_links', 'DLC')), `https://store.steampowered.com/dlc/${shortcut.steamAppId}`], [loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${shortcut.steamAppId}`], [loc('AppDetails_Links_PointsShop', gdlText('points_shop', 'Points Shop')), `https://store.steampowered.com/points/shop/app/${shortcut.steamAppId}`], [loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${shortcut.steamAppId}/discussions/`], [loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${shortcut.steamAppId}/guides/`], [loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${shortcut.steamAppId}`]];
	return `<section class="gdl-bp-section"><div class="gdl-bp-info-grid"><img class="gdl-bp-info-portrait" src="${escapeAttr(portrait)}" alt=""><div><div class="gdl-bp-info-description">${escapeHtml(game.short_description || '')}</div><div class="gdl-bp-info-meta">${developer ? `${metaLabel('AppDetails_Developer', gdlText('developer', 'Developer'))} <strong>${escapeHtml(developer)}</strong><br>` : ''}${publisher ? `${metaLabel('AppDetails_Publisher', gdlText('publisher', 'Publisher'))} <strong>${escapeHtml(publisher)}</strong><br>` : ''}${franchise ? `${metaLabel('AppDetails_Franchise', gdlText('franchise', 'Franchise'))} <strong>${escapeHtml(franchise)}</strong><br>` : ''}${release ? `<br>${metaLabel('AppDetails_ReleaseDate', gdlText('release_date', 'Release date'))} <strong>${escapeHtml(release)}</strong>` : ''}</div></div><div>${features.map(feature => `<div class="gdl-bp-feature">${featureSvg(feature.icon)}<span>${escapeHtml(feature.label)}</span></div>`).join('')}</div></div><div class="gdl-bp-info-links">${links.map(([label, url]) => `<a class="gdl-bp-info-link Focusable" href="${escapeAttr(url)}" data-gdl-bp-external="1" tabindex="0" role="button" data-focusable="true">${escapeHtml(label)}</a>`).join('')}</div></section>`;
}
