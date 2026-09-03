import React from 'react';
import type { LocalAchievementData } from '../../domain/types';
import { ensureBigPictureModalStyles } from './modal-styles';
import { BigPictureAchievementsScreen } from './BigPictureAchievementsScreen';

export function openBigPictureAchievementsScreen(
	doc: Document,
	achievements: LocalAchievementData,
	gameName: string,
	portraitUrl: string,
	shortcutAppId?: number,
	backgroundUrl?: string,
): void {
	doc.getElementById('gdl-bp-achievements-screen')?.remove();
	if (!doc.body) return;

	ensureBigPictureModalStyles(doc);

	const prevActiveElement = (doc.activeElement as HTMLElement | null) || null;

	const container = doc.createElement('div');
	container.id = 'gdl-bp-achievements-screen';
	doc.body.appendChild(container);

	const win = doc.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);

	let root: any = null;

	const closeScreen = () => {
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
			prevActiveElement.classList.add('gpfocus');
		}
	};

	const element = (
		<BigPictureAchievementsScreen
			achievements={achievements}
			gameName={gameName}
			portraitUrl={portraitUrl}
			shortcutAppId={shortcutAppId}
			backgroundUrl={backgroundUrl}
			onClose={closeScreen}
		/>
	);

	try {
		if (reactDom && typeof reactDom.createRoot === 'function') {
			root = reactDom.createRoot(container);
			root.render(element);
		} else if (reactDom && typeof reactDom.render === 'function') {
			reactDom.render(element, container);
		}
	} catch (err) {
		console.error('[NGL][BigPicture] Error rendering achievements React screen:', err);
	}
}
