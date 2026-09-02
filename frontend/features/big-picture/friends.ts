import type { FriendCategories, FriendPlayInfo } from '../../domain/types';
import { escapeAttr, escapeHtml } from '../../core/text';
import { loc } from '../../steam/localization';
import { getCachedPersona } from '../library/social/personas';

const DEFAULT_AVATAR = 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg';

export function renderBigPictureFriends(data: FriendCategories | null | undefined): string {
	if (!data) return '';
	const played = [...(data.recentlyPlayed || []), ...(data.previouslyPlayed || [])];
	const wishlisted = [...(data.wishlisted || [])];

	if (played.length === 0 && wishlisted.length === 0) return '';

	const renderFriendAvatar = (friend: FriendPlayInfo): string => {
		const persona = getCachedPersona(friend.steamid);
		const avatar = persona?.avatar || DEFAULT_AVATAR;
		const name = persona?.name || friend.steamid;
		return `<div class="gdl-bp-friend-card Focusable" tabindex="0" role="button" data-focusable="true" title="${escapeAttr(name)}">
			<img class="gdl-bp-friend-avatar" src="${escapeAttr(avatar)}" alt="${escapeAttr(name)}" loading="lazy" />
		</div>`;
	};

	const playedHeader = escapeHtml(loc('AppDetails_Friends_PlayedPreviously_Header', 'JUGADO(S) ANTERIORMENTE').toUpperCase());
	const wishlistHeader = escapeHtml(loc('AppDetails_Friends_OnWishlist', 'EN SU LISTA DE DESEADOS').toUpperCase());
	const title = escapeHtml(loc('AppDetails_Friends_Title', 'Amigos'));

	return `<section class="gdl-bp-section gdl-bp-friends-section">
		<h2 class="gdl-bp-section-title">${title}</h2>
		<div class="gdl-bp-friends-grid">
			<div class="gdl-bp-friends-col">
				<div class="gdl-bp-friends-col-header">${playedHeader}</div>
				<div class="gdl-bp-friends-avatar-row">
					${played.length > 0 ? played.slice(0, 12).map(renderFriendAvatar).join('') : `<div class="gdl-bp-friends-empty">-</div>`}
				</div>
			</div>
			<div class="gdl-bp-friends-col">
				<div class="gdl-bp-friends-col-header">${wishlistHeader}</div>
				<div class="gdl-bp-friends-avatar-row">
					${wishlisted.length > 0 ? wishlisted.slice(0, 12).map(renderFriendAvatar).join('') : `<div class="gdl-bp-friends-empty">-</div>`}
				</div>
			</div>
		</div>
	</section>`;
}
