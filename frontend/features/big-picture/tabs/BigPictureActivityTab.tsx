import React from 'react';
import type { NewsItem, SteamGameData, FriendCategories } from '../../../domain/types';
import { gdlText, loc, steamIntlLocale } from '../../../steam/localization';
import { eventTypeLabel, isPatchNoteItem, newsExcerpt } from '../../library/news';
import { type LocalActivityPost, loadLocalActivityPosts } from '../../library/social/feed';
import { wrenchToolSvg } from '../news-modal';
import { BigPictureFriendsSection } from './BigPictureFriendsSection';

export interface BigPictureActivityTabProps {
	shortcut: { id: number; title: string; steamAppId: string };
	data: {
		game: SteamGameData | null;
		news: NewsItem[];
		friends: FriendCategories | null;
	};
	hydrationStarted?: boolean;
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

export const BigPictureActivityTab: React.FC<BigPictureActivityTabProps> = ({
	shortcut,
	data,
	hydrationStarted = false,
}) => {
	const localPosts = loadLocalActivityPosts(shortcut.steamAppId, String(shortcut.id));
	const sortedNews = (Array.isArray(data.news) ? [...data.news] : [])
		.filter(item => item && item.title && Number(item.date || 0) > 0)
		.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));

	const allItems: BigPictureFeedItem[] = [
		...localPosts.map(p => ({ type: 'post' as const, post: p, date: p.timestamp })),
		...sortedNews.slice(0, 16).map(item => ({ type: 'news' as const, item, date: Number(item.date || 0) })),
	].sort((a, b) => b.date - a.date);

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

	return (
		<>
			<BigPictureFriendsSection data={data.friends} />
			<section className="gdl-bp-section" id="gdl-bp-activity-section">
				<h2 className="gdl-bp-section-title">{loc('AppDetails_SectionTitle_Activity', 'Actividad')}</h2>

				{/* Post section */}
				<div className="gdl-bp-feed-post-section">
					<div className="gdl-bp-feed-post-input-wrap">
						<input
							className="gdl-bp-feed-post-input Focusable"
							type="text"
							placeholder={loc('AppActivity_PostPlaceholder', 'Diles algo sobre este juego a tus amigos...')}
							tabIndex={0}
							data-focusable="true"
						/>
					</div>
					<div className="gdl-bp-feed-jump-wrap">
						<button className="gdl-bp-feed-jump-news Focusable" type="button" tabIndex={0} data-focusable="true">
							{loc('AppActivity_ViewLatestNews', 'Ver las últimas novedades')}
						</button>
					</div>
				</div>

				{/* Activity Feed */}
				<div className="gdl-bp-activity-feed">
					{groups.map(group => (
						<div key={group.dateLabel} className="gdl-bp-feed-group">
							<div className="gdl-bp-date-heading-wrap">
								<div className="gdl-bp-date-heading">{group.dateLabel}</div>
							</div>
							<div className="gdl-bp-feed-list">
								{group.items.map((entry, idx) => {
									if (entry.type === 'post') {
										const p = entry.post;
										return (
											<div
												key={p.id || `post-${idx}`}
												className="gdl-bp-feed-card gdl-bp-feed-user-post Focusable"
												tabIndex={0}
												role="button"
												data-focusable="true"
											>
												<div className="gdl-bp-feed-icon-wrap">
													{p.user_avatar ? <img className="gdl-bp-feed-avatar" src={p.user_avatar} alt="" /> : null}
												</div>
												<div className="gdl-bp-feed-body">
													<div className="gdl-bp-feed-eyebrow">{gdlText('user_status', 'Status Post').toUpperCase()}</div>
													<div className="gdl-bp-feed-title">{p.user_name}</div>
													<div className="gdl-bp-feed-desc">{p.text}</div>
												</div>
											</div>
										);
									}

									const item = entry.item;
									const eventType = Number(item.event_type || 0);
									const isPatch = eventType === 0 && isPatchNoteItem(item);
									const label = eventType > 0 ? eventTypeLabel(eventType) : (isPatch ? loc('AppActivity_MinorUpdate', 'ACTUALIZACIÓN MENOR / NOTAS DE PARCHE') : (item.feedlabel || gdlText('feed_news', 'NOTICIAS')));
									const preview = newsExcerpt(item.contents || '', 220);
									const thumbUrl = item.image || data.game?.header_image || data.game?.background || data.game?.background_raw || '';
									const comments = Number((item as any).commentcount || (item as any).comments || 0);
									const upvotes = Number((item as any).upvotes || (item as any).votes || 0);

									return (
										<a
											key={item.gid || item.url || `news-${idx}`}
											className="gdl-bp-feed-card Focusable"
											data-gdl-news-gid={item.gid || item.url || ''}
											href={item.url || '#'}
											tabIndex={0}
											role="button"
											data-focusable="true"
										>
											{thumbUrl ? (
												<div className="gdl-bp-feed-thumb-wrap">
													<img className="gdl-bp-feed-thumb" src={thumbUrl} alt="" loading="lazy" />
												</div>
											) : (
												<div className="gdl-bp-feed-icon-wrap" dangerouslySetInnerHTML={{ __html: wrenchToolSvg() }} />
											)}
											<div className="gdl-bp-feed-body">
												<div className="gdl-bp-feed-eyebrow">{label.toUpperCase()}</div>
												<div className="gdl-bp-feed-title">{item.title}</div>
												{preview ? <div className="gdl-bp-feed-desc">{preview}</div> : null}
												{comments > 0 || upvotes > 0 ? (
													<div className="gdl-bp-feed-meta">
														{comments > 0 ? <span>{comments.toLocaleString(steamIntlLocale())} 💬</span> : null}
														{upvotes > 0 ? <span>{upvotes.toLocaleString(steamIntlLocale())} 👍</span> : null}
													</div>
												) : null}
											</div>
										</a>
									);
								})}
							</div>
						</div>
					))}
				</div>

				{allItems.length > 0 ? (
					<div className="gdl-bp-feed-load-more-wrap">
						<button className="gdl-bp-feed-load-more-btn Focusable" type="button" tabIndex={0} data-focusable="true">
							{loc('AppActivity_LoadMoreActivity', 'Cargar más actividad')}
						</button>
					</div>
				) : !hydrationStarted ? (
					<div className="gdl-bp-loading">{loc('Loading', 'Loading…')}</div>
				) : null}
			</section>
		</>
	);
};
