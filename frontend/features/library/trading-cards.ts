import { backendLog } from '../../api/backend';
import { escapeHtml } from '../../core/text';
import { ACH_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import { getOfficialCommunityItems, normalizeCommunityAssetUrl } from './community-items';
import { GDL_INJECTED } from './constants';
import type { NativeLibraryLayout } from './layout';
import { buildNativeSidebarSection } from './layout';

const tradingCardPreviewCleanup = new WeakMap<Document, () => void>();

export function disposeTradingCardPreview(doc: Document): void {
	tradingCardPreviewCleanup.get(doc)?.();
}

function openTradingCardPreview(doc: Document, imageUrl: string, gameName: string): void {
	if (!doc.body || !imageUrl) return;
	disposeTradingCardPreview(doc);

	const overlay = doc.createElement('div');
	overlay.id = 'gdl-trading-card-preview';
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');
	overlay.setAttribute('aria-label', gameName || gdlText('trading_cards', 'Trading Cards'));
	overlay.innerHTML = `
		<div class="gdl-trading-card-preview-panel">
			<button type="button" class="gdl-trading-card-preview-x" aria-label="${escapeHtml(gdlText('close', 'Close'))}">×</button>
			<img class="gdl-trading-card-preview-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(gameName)}" />
			<button type="button" class="gdl-trading-card-preview-close">${escapeHtml(gdlText('close', 'Close'))}</button>
		</div>`;

	let closed = false;
	const onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') dismiss();
	};
	const dismiss = (): void => {
		if (closed) return;
		closed = true;
		doc.removeEventListener('keydown', onKeyDown, true);
		overlay.remove();
		tradingCardPreviewCleanup.delete(doc);
	};
	tradingCardPreviewCleanup.set(doc, dismiss);
	overlay.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', dismiss));
	overlay.addEventListener('click', event => {
		if (event.target === overlay) dismiss();
	});
	doc.addEventListener('keydown', onKeyDown, true);
	doc.body.appendChild(overlay);
	if (doc.defaultView) doc.defaultView.requestAnimationFrame(() => overlay.classList.add('is-visible'));
	else setTimeout(() => overlay.classList.add('is-visible'), 0);
	setTimeout(() => overlay.querySelector<HTMLButtonElement>('.gdl-trading-card-preview-close')?.focus(), 0);
}

/** Steam-like foil-card motion with bounded, per-card listeners. */
export function setupTradingCardTilt(root: HTMLElement): void {
	for (const card of Array.from(root.querySelectorAll<HTMLElement>('.gdl-trading-card'))) {
		if (card.dataset.gdlTiltReady === '1') continue;
		const surface = card.querySelector<HTMLElement>('.gdl-trading-card-surface');
		if (!surface) continue;
		card.dataset.gdlTiltReady = '1';
		let frame = 0;
		let pointerX = .5;
		let pointerY = .5;
		let baseRect: DOMRect | null = null;
		let hoverRect: { left: number; top: number; width: number; height: number } | null = null;
		const view = card.ownerDocument.defaultView;
		const render = (): void => {
			frame = 0;
			if (!card.classList.contains('gdl-card-tilt-active')) return;
			const rotateY = (pointerX - .5) * 18;
			const rotateX = (.5 - pointerY) * 15;
			const translateX = (pointerX - .5) * 7;
			const translateY = (pointerY - .5) * 5;
			card.style.setProperty('--gdl-card-light-x', `${Math.round(pointerX * 100)}%`);
			card.style.setProperty('--gdl-card-light-y', `${Math.round(pointerY * 100)}%`);
			surface.style.transform = `perspective(700px) translate3d(${translateX.toFixed(2)}px,${translateY.toFixed(2)}px,0) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
		};
		const queueRender = (): void => {
			if (frame) return;
			frame = view?.requestAnimationFrame(render) || 0;
			if (!frame) render();
		};
		card.addEventListener('pointerenter', () => {
			baseRect = card.getBoundingClientRect();
			const width = baseRect.width * 2.15;
			const height = width * 261 / 224;
			const left = -(width - baseRect.width) / 2;
			const top = -(height - baseRect.height) / 2 - 9;
			hoverRect = { left: baseRect.left + left, top: baseRect.top + top, width, height };
			surface.style.left = `${left.toFixed(2)}px`;
			surface.style.top = `${top.toFixed(2)}px`;
			surface.style.width = `${width.toFixed(2)}px`;
			surface.style.height = `${height.toFixed(2)}px`;
			card.classList.add('gdl-card-tilt-active');
			queueRender();
		});
		card.addEventListener('pointermove', (event: PointerEvent) => {
			const rect = hoverRect || baseRect || card.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			pointerX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
			pointerY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
			queueRender();
		});
		const reset = (): void => {
			if (frame && view) view.cancelAnimationFrame(frame);
			frame = 0;
			pointerX = .5;
			pointerY = .5;
			baseRect = null;
			hoverRect = null;
			card.classList.remove('gdl-card-tilt-active');
			for (const property of ['left', 'top', 'width', 'height', 'transform']) surface.style.removeProperty(property);
			card.style.setProperty('--gdl-card-light-x', '50%');
			card.style.setProperty('--gdl-card-light-y', '50%');
		};
		card.addEventListener('pointerleave', reset);
		card.addEventListener('pointercancel', reset);
		const openPreview = (): void => {
			const image = card.querySelector<HTMLImageElement>('img');
			const imageUrl = card.dataset.gdlFullImage || image?.currentSrc || image?.src || '';
			const gameName = root.querySelector<HTMLElement>('.gdl-trading-badge')?.title || '';
			openTradingCardPreview(card.ownerDocument, imageUrl, gameName);
		};
		card.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			openPreview();
		});
		card.addEventListener('keydown', event => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			openPreview();
		});
	}
}

export interface TradingCardRenderOptions {
	steamAppId: string;
	gameName: string;
	isCurrent: () => boolean;
}

export async function renderOfficialTradingCards(
	doc: Document,
	layout: NativeLibraryLayout,
	options: TradingCardRenderOptions,
): Promise<void> {
	const { steamAppId, gameName } = options;
	const { anchorRegion, sidebarColumn } = layout;
	const catalog = await getOfficialCommunityItems(doc, steamAppId);
	if (!catalog || catalog.cards.length === 0 || !options.isCurrent()
		|| !doc.getElementById(GDL_INJECTED) || !anchorRegion || !sidebarColumn
		|| doc.getElementById('gdl-trading-cards-section')) return;

	const cards = catalog.cards.map((card, index) => {
		const image = normalizeCommunityAssetUrl(card.image);
		if (!image) return '';
		const artwork = normalizeCommunityAssetUrl(card.artwork) || image;
		const title = card.title || gameName;
		return `<div class="gdl-trading-card gdl-official-card" data-gdl-card-index="${index}" data-gdl-full-image="${escapeHtml(artwork)}" role="button" tabindex="0" title="${escapeHtml(title)}"><div class="gdl-trading-card-surface"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" /></div></div>`;
	}).filter(Boolean).join('');
	if (!cards) return;

	const officialPortrait = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_600x900.jpg`;
	const badgeAsset = catalog.foil_badge || catalog.badges?.find(badge => badge.foil) || catalog.badges?.[catalog.badges.length - 1];
	const badgeSource = normalizeCommunityAssetUrl(badgeAsset?.image) || officialPortrait;
	const badgeTitle = badgeAsset?.title || gdlText('cards_found', 'Cards found');
	const section = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-trading-cards-section',
		headerText: loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Trading Cards')),
		innerId: 'gdl-trading-cards-content',
		innerHtml: `<div class="${ACH_CLASSES().HighlightDiv} gdl-native-sidebar-panel" style="padding:12px;box-sizing:border-box;"><div style="display:flex;align-items:center;gap:12px;padding:0 0 14px;color:#c7ccd1;"><div class="gdl-trading-badge" title="${escapeHtml(badgeTitle)}"><img class="gdl-trading-badge-image" src="${escapeHtml(badgeSource)}" alt="${escapeHtml(badgeTitle)}" /></div><div><div class="gdl-trading-badge-title" style="font-size:16px;line-height:1.25;">${escapeHtml(badgeTitle)}</div><div style="font-size:13px;color:#8f98a0;margin-top:2px;">${escapeHtml(gdlText('experience_points', '100 XP'))}</div></div></div><div class="gdl-trading-card-remaining" style="font-size:13px;color:#9da4ab;margin-bottom:10px;">${escapeHtml(gdlText('cards_remaining', '{count} cards remaining', { count: 0 }))}</div><div class="gdl-trading-card-grid">${cards}</div><a href="https://steamcommunity.com/my/gamecards/${steamAppId}/" data-gdl-open-url="https://steamcommunity.com/my/gamecards/${steamAppId}/" style="display:block;text-align:right;margin-top:14px;color:#9da4ab;text-decoration:none;font-size:13px;">${escapeHtml(gdlText('view_my_cards', 'View my cards'))}</a></div>`,
		cloneInnerClass: false,
	});
	if (!section) return;

	const dlcNode = doc.getElementById('gdl-dlc-section');
	const workshopNode = doc.getElementById('gdl-workshop-section');
	const achievementsNode = doc.getElementById('gdl-achievements-section');
	const friendsNode = doc.getElementById('gdl-friends-section');
	if (dlcNode?.parentElement === sidebarColumn) sidebarColumn.insertBefore(section, dlcNode);
	else if (workshopNode?.parentElement === sidebarColumn) sidebarColumn.insertBefore(section, workshopNode);
	else {
		const previous = achievementsNode || friendsNode;
		if (previous?.parentElement === sidebarColumn) sidebarColumn.insertBefore(section, previous.nextSibling);
		else sidebarColumn.insertBefore(section, sidebarColumn.firstChild);
	}

	setupTradingCardTilt(section);
	for (const image of Array.from(section.querySelectorAll<HTMLImageElement>('.gdl-trading-card img'))) {
		image.addEventListener('error', () => {
			image.closest('.gdl-trading-card')?.remove();
			if (!section.querySelector('.gdl-trading-card')) section.remove();
		});
	}
	backendLog(`Official Steam cards applied for ${steamAppId}: ${catalog.cards.length} card(s), foil=${String(!!catalog.foil_badge)}`);
}
