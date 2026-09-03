import React from 'react';
import type { CommunityContentItem, SteamGameData } from '../../../domain/types';
import { gdlText, loc } from '../../../steam/localization';
import { extractYoutubeId } from '../news-modal';

export interface BigPictureCommunityTabProps {
	data: {
		game: SteamGameData | null;
		community: CommunityContentItem[];
	};
}

export function fallbackCommunity(data: { game: SteamGameData | null; community: CommunityContentItem[] }): CommunityContentItem[] {
	if (data.community.length) return data.community;
	return (data.game?.screenshots || []).slice(0, 8).map((shot, index) => ({
		type: 'screenshot',
		label: loc('AppDetails_Community_Screenshot', 'Screenshot'),
		image: shot.path_full || shot.path_thumbnail,
		title: data.game?.name || `Screenshot ${index + 1}`,
	}));
}

export const BigPictureCommunityTab: React.FC<BigPictureCommunityTabProps> = ({ data }) => {
	const items = fallbackCommunity(data).filter(item => item.image);

	if (items.length === 0) {
		return <div className="gdl-bp-empty">{loc('AppDetails_Community_NoContent', 'No community content is available.')}</div>;
	}

	const videos = items.filter(item => item.type === 'video' || Boolean(item.youtube_id)).slice(0, 2);
	const nonVideos = items.filter(item => item.type !== 'video' && !item.youtube_id);
	const displayedVideos = videos.length > 0 ? videos : items.slice(0, 2);
	const displayedGuides = nonVideos.length > 0 ? nonVideos.slice(0, 8) : items.slice(2, 10);

	return (
		<section className="gdl-bp-section">
			<h2 className="gdl-bp-section-title">{loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Contenido de la Comunidad'))}</h2>

			{/* Videos Grid */}
			<div className="gdl-bp-community-videos-grid">
				{displayedVideos.map((item, idx) => {
					const ytId = item.youtube_id || extractYoutubeId(item.link || '') || extractYoutubeId(item.image || '');
					return (
						<div
							key={item.title || item.image || `video-${idx}`}
							className="gdl-bp-community-video-card Focusable"
							data-gdl-comm-video-idx={idx}
							data-gdl-yt-id={ytId}
							tabIndex={0}
							role="button"
							data-focusable="true"
						>
							<div className="gdl-bp-community-media-wrap" id={`gdl-bp-comm-video-wrap-${idx}`}>
								<img className="gdl-bp-community-media" src={item.image} alt="" />
								<div className="gdl-bp-community-play-icon">▶</div>
							</div>
							<div className="gdl-bp-community-title">{item.title || item.label || ''}</div>
							<div className="gdl-bp-community-author">
								{item.author_avatar ? <img src={item.author_avatar} alt="" /> : null}
								<span>{item.author_name || item.label || ''}</span>
							</div>
						</div>
					);
				})}
			</div>

			{/* Guides Grid */}
			{displayedGuides.length > 0 ? (
				<div className="gdl-bp-community-guides-grid">
					{displayedGuides.map((item, idx) => (
						<div
							key={item.title || item.image || `guide-${idx}`}
							className="gdl-bp-community-guide-card Focusable"
							data-gdl-comm-guide-idx={idx}
							tabIndex={0}
							role="button"
							data-focusable="true"
						>
							<div className="gdl-bp-community-guide-eyebrow">{loc('AppDetails_CommunityGuide', 'GUÍA DE LA COMUNIDAD').toUpperCase()}</div>
							<div className="gdl-bp-community-guide-content">
								<img className="gdl-bp-community-guide-thumb" src={item.image} alt="" />
								<div className="gdl-bp-community-guide-title">{item.title || item.label || ''}</div>
							</div>
							<div className="gdl-bp-community-guide-desc">{item.description || item.title || ''}</div>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
};
