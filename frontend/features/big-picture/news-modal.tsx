import React from 'react';
import type { CommunityContentItem, NewsItem } from '../../domain/types';
import { ensureBigPictureModalStyles } from './modal-styles';
import { BigPictureNewsModal } from './BigPictureNewsModal';
import { BigPictureCardModal, type BigPictureCardModalInfo } from './BigPictureCardModal';
import { BigPictureCommunityModal, extractYoutubeId } from './BigPictureCommunityModal';

export { type BigPictureCardModalInfo, extractYoutubeId };

export function openBigPictureNewsModal(
	doc: Document,
	item: NewsItem,
	gameName = '',
	gameIcon = '',
): void {
	doc.getElementById('gdl-bp-news-modal')?.remove();
	if (!doc.body) return;

	ensureBigPictureModalStyles(doc);

	const prevActiveElement = (doc.activeElement as HTMLElement | null) || null;
	const container = doc.createElement('div');
	container.id = 'gdl-bp-news-modal';
	doc.body.appendChild(container);

	const win = doc.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);

	let root: any = null;

	const closeModal = () => {
		try {
			if (root && typeof root.unmount === 'function') {
				root.unmount();
			} else if (reactDom && typeof reactDom.unmountComponentAtNode === 'function') {
				reactDom.unmountComponentAtNode(container);
			}
		} catch {}
		container.remove();
		if (prevActiveElement && prevActiveElement.isConnected) {
			prevActiveElement.focus();
		}
	};

	try {
		if (reactDom && typeof reactDom.createRoot === 'function') {
			root = reactDom.createRoot(container);
			root.render(
				<BigPictureNewsModal
					item={item}
					gameName={gameName}
					gameIcon={gameIcon}
					onClose={closeModal}
				/>
			);
		} else if (reactDom && typeof reactDom.render === 'function') {
			reactDom.render(
				<BigPictureNewsModal
					item={item}
					gameName={gameName}
					gameIcon={gameIcon}
					onClose={closeModal}
				/>,
				container
			);
		}
	} catch (err) {
		console.error('[NGL][BigPicture] Error mounting NewsModal:', err);
	}
}

export function openBigPictureCardModal(
	doc: Document,
	card: BigPictureCardModalInfo,
): void {
	doc.getElementById('gdl-bp-card-modal')?.remove();
	if (!doc.body) return;

	ensureBigPictureModalStyles(doc);

	const prevActiveElement = (doc.activeElement as HTMLElement | null) || null;
	const container = doc.createElement('div');
	container.id = 'gdl-bp-card-modal';
	doc.body.appendChild(container);

	const win = doc.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);

	let root: any = null;

	const closeModal = () => {
		try {
			if (root && typeof root.unmount === 'function') {
				root.unmount();
			} else if (reactDom && typeof reactDom.unmountComponentAtNode === 'function') {
				reactDom.unmountComponentAtNode(container);
			}
		} catch {}
		container.remove();
		if (prevActiveElement && prevActiveElement.isConnected) {
			prevActiveElement.focus();
		}
	};

	try {
		if (reactDom && typeof reactDom.createRoot === 'function') {
			root = reactDom.createRoot(container);
			root.render(
				<BigPictureCardModal
					card={card}
					onClose={closeModal}
				/>
			);
		} else if (reactDom && typeof reactDom.render === 'function') {
			reactDom.render(
				<BigPictureCardModal
					card={card}
					onClose={closeModal}
				/>,
				container
			);
		}
	} catch (err) {
		console.error('[NGL][BigPicture] Error mounting CardModal:', err);
	}
}

export function openBigPictureCommunityModal(
	doc: Document,
	item: CommunityContentItem,
	gameName = '',
): void {
	doc.getElementById('gdl-bp-community-modal')?.remove();
	if (!doc.body) return;

	ensureBigPictureModalStyles(doc);

	const prevActiveElement = (doc.activeElement as HTMLElement | null) || null;
	const container = doc.createElement('div');
	container.id = 'gdl-bp-community-modal';
	doc.body.appendChild(container);

	const win = doc.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);

	let root: any = null;

	const closeModal = () => {
		try {
			if (root && typeof root.unmount === 'function') {
				root.unmount();
			} else if (reactDom && typeof reactDom.unmountComponentAtNode === 'function') {
				reactDom.unmountComponentAtNode(container);
			}
		} catch {}
		container.remove();
		if (prevActiveElement && prevActiveElement.isConnected) {
			prevActiveElement.focus();
		}
	};

	try {
		if (reactDom && typeof reactDom.createRoot === 'function') {
			root = reactDom.createRoot(container);
			root.render(
				<BigPictureCommunityModal
					item={item}
					gameName={gameName}
					onClose={closeModal}
				/>
			);
		} else if (reactDom && typeof reactDom.render === 'function') {
			reactDom.render(
				<BigPictureCommunityModal
					item={item}
					gameName={gameName}
					onClose={closeModal}
				/>,
				container
			);
		}
	} catch (err) {
		console.error('[NGL][BigPicture] Error mounting CommunityModal:', err);
	}
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
