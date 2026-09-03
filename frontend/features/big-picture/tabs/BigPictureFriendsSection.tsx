import React from 'react';
import type { FriendCategories, FriendPlayInfo } from '../../../domain/types';
import { loc } from '../../../steam/localization';
import { getCachedPersona } from '../../library/social/personas';

const DEFAULT_AVATAR = 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

export interface BigPictureFriendsSectionProps {
	data?: FriendCategories | null;
}

export const BigPictureFriendsSection: React.FC<BigPictureFriendsSectionProps> = ({ data }) => {
	if (!data) return null;
	const played = [...(data.recentlyPlayed || []), ...(data.previouslyPlayed || [])];
	const wishlisted = [...(data.wishlisted || [])];

	if (played.length === 0 && wishlisted.length === 0) return null;

	const playedHeader = loc('AppDetails_Friends_PlayedPreviously_Header', 'JUGADO(S) ANTERIORMENTE').toUpperCase();
	const wishlistHeader = loc('AppDetails_Friends_OnWishlist', 'EN SU LISTA DE DESEADOS').toUpperCase();
	const title = loc('AppDetails_Friends_Title', 'Amigos');

	return (
		<section className="gdl-bp-section gdl-bp-friends-section">
			<h2 className="gdl-bp-section-title">{title}</h2>
			<div className="gdl-bp-friends-grid">
				<div className="gdl-bp-friends-col">
					<div className="gdl-bp-friends-col-header">{playedHeader}</div>
					<div className="gdl-bp-friends-avatar-row">
						{played.length > 0 ? (
							played.slice(0, 12).map(friend => {
								const persona = getCachedPersona(friend.steamid);
								const avatar = persona?.avatar || DEFAULT_AVATAR;
								const name = persona?.name || friend.steamid;
								return (
									<div
										key={friend.steamid}
										className="gdl-bp-friend-card Focusable"
										tabIndex={0}
										role="button"
										data-focusable="true"
										title={name}
									>
										<img className="gdl-bp-friend-avatar" src={avatar} alt={name} loading="lazy" />
									</div>
								);
							})
						) : (
							<div className="gdl-bp-friends-empty">-</div>
						)}
					</div>
				</div>
				<div className="gdl-bp-friends-col">
					<div className="gdl-bp-friends-col-header">{wishlistHeader}</div>
					<div className="gdl-bp-friends-avatar-row">
						{wishlisted.length > 0 ? (
							wishlisted.slice(0, 12).map(friend => {
								const persona = getCachedPersona(friend.steamid);
								const avatar = persona?.avatar || DEFAULT_AVATAR;
								const name = persona?.name || friend.steamid;
								return (
									<div
										key={friend.steamid}
										className="gdl-bp-friend-card Focusable"
										tabIndex={0}
										role="button"
										data-focusable="true"
										title={name}
									>
										<img className="gdl-bp-friend-avatar" src={avatar} alt={name} loading="lazy" />
									</div>
								);
							})
						) : (
							<div className="gdl-bp-friends-empty">-</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
};
