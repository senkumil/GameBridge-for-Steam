import type { CommunityContentItem, NewsItem } from '../../domain/types';
import { escapeAttr, escapeHtml } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import { eventTypeLabel, formatNewsDate, isPatchNoteItem } from '../library/news';

function formatNewsModalBody(contents: string): string {
	if (!contents) return '';
	let formatted = contents
		.replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images/')
		.replace(/\[img\](.*?)\[\/img\]/gi, '<img class="gdl-bp-modal-news-img" src="$1" alt="" loading="lazy" />')
		.replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener" class="gdl-bp-modal-news-link">$2</a>')
		.replace(/\[h1\](.*?)\[\/h1\]/gi, '<h2 class="gdl-bp-modal-news-h1">$1</h2>')
		.replace(/\[h2\](.*?)\[\/h2\]/gi, '<h3 class="gdl-bp-modal-news-h2">$1</h3>')
		.replace(/\[h3\](.*?)\[\/h3\]/gi, '<h4 class="gdl-bp-modal-news-h3">$1</h4>')
		.replace(/\[b\](.*?)\[\/b\]/gi, '<strong>$1</strong>')
		.replace(/\[i\](.*?)\[\/i\]/gi, '<em>$1</em>')
		.replace(/\[u\](.*?)\[\/u\]/gi, '<u>$1</u>')
		.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, '<ul class="gdl-bp-modal-news-list">$1</ul>')
		.replace(/\[\*\](.*?)(?=\[\*\]|<\/ul>|$)/gi, '<li>$1</li>')
		.replace(/\[previewyoutube=([^;\]]+)[^\]]*\]\[\/previewyoutube\]/gi, '')
		.replace(/\[\/?(?:strike|spoiler|quote|code|table|tr|td|th)[^\]]*\]/gi, '')
		.replace(/\n\n+/g, '</p><p class="gdl-bp-modal-news-p">')
		.replace(/\n/g, '<br/>');

	return `<p class="gdl-bp-modal-news-p">${formatted}</p>`;
}

export function openBigPictureNewsModal(
	doc: Document,
	item: NewsItem,
	gameName = '',
	gameIcon = '',
): void {
	doc.getElementById('gdl-bp-news-modal')?.remove();
	if (!doc.body) return;

	const eventType = Number(item.event_type || 0);
	const isPatch = eventType === 0 && isPatchNoteItem(item);
	const label = eventType > 0
		? eventTypeLabel(eventType)
		: (isPatch ? loc('AppActivity_MinorUpdate', 'ACTUALIZACIÓN MENOR / NOTAS DE PARCHE') : (item.feedlabel || gdlText('feed_news', 'NOTICIAS')));

	const bannerUrl = item.image || '';
	const dateStr = formatNewsDate(item.date);
	const bodyHtml = formatNewsModalBody(item.contents || '');

	const overlay = doc.createElement('div');
	overlay.id = 'gdl-bp-news-modal';
	overlay.className = 'gdl-bp-news-modal-overlay';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');

	overlay.innerHTML = `
		<div class="gdl-bp-news-modal-window">
			<button class="gdl-bp-news-modal-close" aria-label="${escapeHtml(gdlText('close', 'Cerrar'))}">✕</button>
			${bannerUrl ? `<div class="gdl-bp-news-modal-banner-wrap"><img class="gdl-bp-news-modal-banner" src="${escapeAttr(bannerUrl)}" alt="" /></div>` : ''}
			<div class="gdl-bp-news-modal-content">
				<div class="gdl-bp-news-modal-game-header">
					${gameIcon ? `<img class="gdl-bp-news-modal-game-icon" src="${escapeAttr(gameIcon)}" alt="" />` : ''}
					<span class="gdl-bp-news-modal-game-name">${escapeHtml(gameName)}</span>
				</div>
				<div class="gdl-bp-news-modal-meta">
					<span class="gdl-bp-news-modal-tag">${escapeHtml(label.toUpperCase())}</span>
					<span class="gdl-bp-news-modal-date">PUBLICADO ${escapeHtml(dateStr)}</span>
				</div>
				<h1 class="gdl-bp-news-modal-title">${escapeHtml(item.title)}</h1>
				<div class="gdl-bp-news-modal-body">
					${bodyHtml}
				</div>
			</div>
			<div class="gdl-bp-news-modal-footer">
				${item.url ? `<a class="gdl-bp-news-modal-action-btn Focusable" href="${escapeAttr(item.url)}" target="_blank" rel="noopener" tabindex="0" data-focusable="true">🌐 ${escapeHtml(gdlText('open_in_browser', 'Abrir en navegador'))}</a>` : ''}
				<button class="gdl-bp-news-modal-action-btn gdl-bp-news-modal-close-btn Focusable" type="button" tabindex="0" data-focusable="true">Ⓑ ${escapeHtml(loc('Button_Back', 'VOLVER'))}</button>
			</div>
		</div>
	`;

	doc.body.appendChild(overlay);

	const closeModal = () => {
		overlay.remove();
		doc.removeEventListener('keydown', onKeyDown);
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Backspace') {
			e.preventDefault();
			e.stopPropagation();
			closeModal();
		}
	};

	overlay.addEventListener('click', e => {
		if (e.target === overlay) closeModal();
	});

	overlay.querySelectorAll<HTMLElement>('.gdl-bp-news-modal-close, .gdl-bp-news-modal-close-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.preventDefault();
			closeModal();
		});
	});

	doc.addEventListener('keydown', onKeyDown);
}

export interface BigPictureCardModalInfo {
	title: string;
	image: string;
	artwork?: string;
	foil?: boolean;
	badgeTitle?: string;
	gameName?: string;
}

export function openBigPictureCardModal(
	doc: Document,
	card: BigPictureCardModalInfo,
): void {
	doc.getElementById('gdl-bp-card-modal')?.remove();
	if (!doc.body) return;

	const overlay = doc.createElement('div');
	overlay.id = 'gdl-bp-card-modal';
	overlay.className = 'gdl-bp-fullscreen-card-modal';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');

	const cardImg = card.artwork || card.image;

	overlay.innerHTML = `
		<div class="gdl-bp-fullscreen-card-inner">
			<div class="gdl-bp-fullscreen-card-art-container ${card.foil ? 'is-foil' : ''}">
				<img class="gdl-bp-fullscreen-card-img" src="${escapeAttr(cardImg)}" alt="${escapeAttr(card.title)}" />
			</div>
			<div class="gdl-bp-fullscreen-card-details">
				<div class="gdl-bp-fullscreen-card-tag">${escapeHtml(card.foil ? loc('AppDetails_FoilTradingCard', 'CROMO REFLECTANTE').toUpperCase() : loc('AppDetails_TradingCard', 'CROMO').toUpperCase())}</div>
				<h1 class="gdl-bp-fullscreen-card-title">${escapeHtml(card.title)}</h1>
				${card.gameName ? `<div class="gdl-bp-fullscreen-card-game">${escapeHtml(card.gameName)}</div>` : ''}
				${card.badgeTitle ? `<div class="gdl-bp-fullscreen-card-badge">${escapeHtml(card.badgeTitle)}</div>` : ''}
			</div>
			<div class="gdl-bp-fullscreen-card-footer">
				<div class="gdl-bp-footer-prompt gdl-bp-fullscreen-card-close-btn Focusable" tabindex="0" role="button" data-focusable="true">
					<span class="gdl-bp-key-badge">B</span>
					<span>${escapeHtml(loc('Button_Back', 'VOLVER'))}</span>
				</div>
			</div>
		</div>
	`;

	doc.body.appendChild(overlay);

	const imgEl = overlay.querySelector<HTMLImageElement>('.gdl-bp-fullscreen-card-img');
	if (imgEl && card.artwork && card.image && card.artwork !== card.image) {
		imgEl.onerror = () => {
			imgEl.src = card.image;
		};
	}

	const closeModal = () => {
		doc.removeEventListener('keydown', onKeyDown, true);
		overlay.remove();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Backspace' || e.keyCode === 27) {
			e.preventDefault();
			e.stopPropagation();
			closeModal();
		}
	};

	overlay.addEventListener('click', e => {
		if (e.target === overlay || (e.target as HTMLElement).closest('.gdl-bp-fullscreen-card-close-btn')) {
			closeModal();
		}
	});

	doc.addEventListener('keydown', onKeyDown, true);

	const closeBtn = overlay.querySelector<HTMLElement>('.gdl-bp-fullscreen-card-close-btn');
	if (closeBtn) closeBtn.focus();
}

export function extractYoutubeId(urlOrStr: string): string {
	if (!urlOrStr) return '';
	const match = urlOrStr.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|vi\/)([\w-]{11})/i);
	return match ? match[1] : '';
}

export function openBigPictureCommunityModal(
	doc: Document,
	item: CommunityContentItem,
	gameName = '',
): void {
	doc.getElementById('gdl-bp-community-modal')?.remove();
	if (!doc.body) return;

	const ytId = item.youtube_id || extractYoutubeId(item.link || '') || extractYoutubeId(item.image || '');
	const isVideo = item.type === 'video' || Boolean(ytId);

	const overlay = doc.createElement('div');
	overlay.id = 'gdl-bp-community-modal';
	overlay.className = 'gdl-bp-news-modal-overlay gdl-bp-community-modal-overlay';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');

	const title = item.title || item.label || gdlText('community_content', 'Community Content');
	const author = item.author_name || '';
	const authorAvatar = item.author_avatar || '';

	let mediaHtml = '';
	if (isVideo && ytId) {
		mediaHtml = `
			<div class="gdl-bp-community-modal-video-wrap">
				<iframe class="gdl-bp-community-modal-iframe"
					src="https://www.youtube-nocookie.com/embed/${escapeAttr(ytId)}?autoplay=1&rel=0&playsinline=1"
					title="${escapeAttr(title)}"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowfullscreen>
				</iframe>
			</div>
		`;
	} else if (item.image) {
		mediaHtml = `
			<div class="gdl-bp-community-modal-img-wrap">
				<img class="gdl-bp-community-modal-img" src="${escapeAttr(item.image)}" alt="${escapeAttr(title)}" />
			</div>
		`;
	}

	overlay.innerHTML = `
		<div class="gdl-bp-news-modal-window gdl-bp-community-modal-window ${isVideo ? 'is-video-modal' : ''}">
			<button class="gdl-bp-news-modal-close" aria-label="${escapeHtml(gdlText('close', 'Cerrar'))}">✕</button>
			${mediaHtml}
			<div class="gdl-bp-community-modal-content">
				<div class="gdl-bp-news-modal-meta">
					<span class="gdl-bp-news-modal-tag">${escapeHtml((item.type || 'COMMUNITY').toUpperCase())}</span>
					${gameName ? `<span class="gdl-bp-news-modal-date">${escapeHtml(gameName)}</span>` : ''}
				</div>
				<h2 class="gdl-bp-news-modal-title" style="margin-bottom:12px;">${escapeHtml(title)}</h2>
				${(author || authorAvatar) ? `
					<div class="gdl-bp-community-author" style="padding:0;min-height:auto;margin-top:8px;">
						${authorAvatar ? `<img src="${escapeAttr(authorAvatar)}" alt="" style="width:32px;height:32px;border-radius:2px;" />` : ''}
						<span style="font-size:14px;color:#e7e8ea;">${escapeHtml(author)}</span>
					</div>
				` : ''}
			</div>
			<div class="gdl-bp-news-modal-footer">
				${item.link ? `<a class="gdl-bp-news-modal-action-btn Focusable" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">🌐 ${escapeHtml(gdlText('open_in_browser', 'Abrir en navegador'))}</a>` : ''}
				<button class="gdl-bp-news-modal-action-btn gdl-bp-news-modal-close-btn" type="button">
					${escapeHtml(gdlText('close', 'Cerrar'))}
				</button>
			</div>
		</div>
	`;

	doc.body.appendChild(overlay);

	const closeModal = () => {
		overlay.remove();
		doc.removeEventListener('keydown', onKeyDown);
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Backspace') {
			e.preventDefault();
			e.stopPropagation();
			closeModal();
		}
	};

	overlay.addEventListener('click', e => {
		if (e.target === overlay) closeModal();
	});

	overlay.querySelectorAll<HTMLElement>('.gdl-bp-news-modal-close, .gdl-bp-news-modal-close-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.preventDefault();
			closeModal();
		});
	});

	doc.addEventListener('keydown', onKeyDown);
}

export function wrenchToolSvg(): string {
	return `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" style="display:block;color:#8f98a0;flex-shrink:0;"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M14.6 4.2a8.5 8.5 0 0 0-7.2 12.3l-5 5a2.5 2.5 0 0 0 0 3.5l3.5 3.5a2.5 2.5 0 0 0 3.5 0l5-5a8.5 8.5 0 0 0 12.3-7.2c0-1.4-.3-2.7-.9-3.8l-4.5 4.5-3.2-.8-.8-3.2 4.5-4.5a8.4 8.4 0 0 0-7.7-4.3Zm18.8 18.8a8.5 8.5 0 0 0-3.8.9l4.5 4.5-.8 3.2-3.2.8-4.5-4.5a8.5 8.5 0 0 0-7.2 12.3l-5 5a2.5 2.5 0 0 0 0 3.5l3.5 3.5a2.5 2.5 0 0 0 3.5 0l5-5a8.5 8.5 0 0 0 12.3-7.2 8.4 8.4 0 0 0-4.3-7.7Z"/></svg>`;
}

export function completionMedalSvg(): string {
	return `<svg width="40" height="40" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;"><path stroke="url(#gdl-bp-medal-grad)" fill="url(#gdl-bp-medal-grad)" d="M10.18 10.03L10.39 9.81V5.53H14.6l.22-.22L18 2.07l3.18 3.24.22.22h4.21v4.28l.21.22 2.74 2.78-2.74 2.78-.21.22v4.28h-4.21l-.22.22L18 23.54l-3.18-3.23-.22-.23H10.39v-4.28l-.21-.22-2.74-2.78 2.74-2.8zM14.74 28.03L11.56 33.42 9.85 29.95l-.2-.42H6.29l2.39-4.17h3.43l2.63 2.67zm12.08 1.5l-.2-.42-1.71 3.48-3.18-5.39 2.63-2.67h3.43l2.39 4.17h-3.36z" stroke-width="1.5"/><circle stroke="#FFAB2C" fill="#FFC82C" cx="18" cy="13" r="5.5"/><defs><linearGradient id="gdl-bp-medal-grad" x1="7.08" y1="3.72" x2="33.67" y2="25.07" gradientUnits="userSpaceOnUse"><stop stop-color="#0056D6"/><stop offset="1" stop-color="#1A9FFF"/></linearGradient></defs></svg>`;
}

export function featureSvg(kind: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'): string {
	const svgs: Record<string, string> = {
		person: '<path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
		achievement: '<path fill="currentColor" d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>',
		cloud: '<path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>',
		family: '<path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
		controller: '<path fill="currentColor" d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H8v-2H6v-1h2v-2h1v2h2v1zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
	};
	return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${svgs[kind] || svgs.controller}</svg>`;
}
