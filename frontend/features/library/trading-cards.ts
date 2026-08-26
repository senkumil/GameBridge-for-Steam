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
	let activeReset: (() => void) | null = null;
	let activeIsInside: ((clientX: number, clientY: number) => boolean) | null = null;

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
			const dx = pointerX - 0.5;
			const dy = pointerY - 0.5;
			const dist = Math.hypot(dx, dy) * 2;
			const rotateY = dx * 40;
			const rotateX = -dy * 34;
			const translateX = dx * 10;
			const translateY = dy * 8;
			const lightAngle = Math.round(125 + dx * 40 + dy * 30);
			const sheenAlpha = (0.10 + Math.min(0.24, dist * 0.18)).toFixed(3);
			const sheenBrightness = (1 + dist * 0.08).toFixed(2);

			card.style.setProperty('--gdl-card-angle', `${lightAngle}deg`);
			card.style.setProperty('--gdl-sheen-alpha', sheenAlpha);
			card.style.setProperty('--gdl-sheen-brightness', sheenBrightness);
			surface.style.transform = `perspective(620px) translate3d(${translateX.toFixed(2)}px,${translateY.toFixed(2)}px,0) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
		};

		const queueRender = (): void => {
			if (frame) return;
			frame = view?.requestAnimationFrame(render) || 0;
			if (!frame) render();
		};

		const checkInsideExpandedArea = (clientX: number, clientY: number): boolean => {
			if (!hoverRect) return false;
			return (
				clientX >= hoverRect.left &&
				clientX <= hoverRect.left + hoverRect.width &&
				clientY >= hoverRect.top &&
				clientY <= hoverRect.top + hoverRect.height
			);
		};

		const cardAtBasePoint = (clientX: number, clientY: number): HTMLElement | null =>
			Array.from(root.querySelectorAll<HTMLElement>('.gdl-trading-card')).find(candidate => {
				if (candidate === card) return false;
				const rect = candidate.getBoundingClientRect();
				return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
			}) || null;

		const reset = (): void => {
			if (frame && view) view.cancelAnimationFrame(frame);
			frame = 0;
			pointerX = .5;
			pointerY = .5;
			baseRect = null;
			hoverRect = null;
			card.classList.remove('gdl-card-tilt-active');
			for (const property of ['left', 'top', 'width', 'height', 'transform']) surface.style.removeProperty(property);
			card.style.removeProperty('--gdl-card-angle');
			card.style.removeProperty('--gdl-sheen-alpha');
			card.style.removeProperty('--gdl-sheen-brightness');
			card.ownerDocument.removeEventListener('pointermove', onGlobalPointerMove);
			if (activeReset === reset) {
				activeReset = null;
				activeIsInside = null;
			}
		};

		const onGlobalPointerMove = (event: PointerEvent): void => {
			if (!card.classList.contains('gdl-card-tilt-active')) return;
			const nextCard = cardAtBasePoint(event.clientX, event.clientY);
			if (nextCard) {
				reset();
				nextCard.dispatchEvent(new PointerEvent('pointerenter', { clientX: event.clientX, clientY: event.clientY, bubbles: true }));
				return;
			}
			if (!checkInsideExpandedArea(event.clientX, event.clientY)) {
				reset();
				const target = card.ownerDocument.elementFromPoint(event.clientX, event.clientY);
				const hoveredCard = target?.closest<HTMLElement>('.gdl-trading-card');
				if (hoveredCard && hoveredCard !== card) {
					hoveredCard.dispatchEvent(new PointerEvent('pointerenter', {
						clientX: event.clientX,
						clientY: event.clientY,
						bubbles: true,
					}));
				}
				return;
			}
			const rect = hoverRect || baseRect || card.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			pointerX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
			pointerY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
			queueRender();
		};

		card.addEventListener('pointerenter', (event: PointerEvent) => {
			if (activeIsInside && activeIsInside(event.clientX, event.clientY)) {
				return;
			}
			if (activeReset && activeReset !== reset) {
				activeReset();
			}
			activeReset = reset;
			activeIsInside = checkInsideExpandedArea;

			baseRect = card.getBoundingClientRect();
			const width = baseRect.width * 1.65;
			const height = width * 261 / 224;
			let left = -(width - baseRect.width) / 2;
			let top = -(height - baseRect.height) / 2;

			const container = card.closest<HTMLElement>('.gdl-trading-cards-body') || card.closest<HTMLElement>('#gdl-trading-cards-section');
			if (container) {
				const containerRect = container.getBoundingClientRect();
				const absoluteLeft = baseRect.left + left;
				const absoluteRight = absoluteLeft + width;
				if (absoluteRight > containerRect.right - 8) {
					left -= (absoluteRight - (containerRect.right - 8));
				}
				if (baseRect.left + left < containerRect.left + 8) {
					left += ((containerRect.left + 8) - (baseRect.left + left));
				}
				if (baseRect.top + top < containerRect.top + 4) {
					top += ((containerRect.top + 4) - (baseRect.top + top));
				}
				const absoluteBottom = baseRect.top + top + height;
				if (absoluteBottom > containerRect.bottom - 6) {
					top -= (absoluteBottom - (containerRect.bottom - 6));
				}
			}

			hoverRect = { left: baseRect.left + left, top: baseRect.top + top, width, height };
			surface.style.left = `${left.toFixed(2)}px`;
			surface.style.top = `${top.toFixed(2)}px`;
			surface.style.width = `${width.toFixed(2)}px`;
			surface.style.height = `${height.toFixed(2)}px`;
			card.classList.add('gdl-card-tilt-active');

			if (event.clientX && event.clientY && hoverRect) {
				pointerX = Math.max(0, Math.min(1, (event.clientX - hoverRect.left) / hoverRect.width));
				pointerY = Math.max(0, Math.min(1, (event.clientY - hoverRect.top) / hoverRect.height));
			}

			card.ownerDocument.addEventListener('pointermove', onGlobalPointerMove, { passive: true });
			queueRender();
		});

		card.addEventListener('pointerleave', (event: PointerEvent) => {
			if (!checkInsideExpandedArea(event.clientX, event.clientY)) {
				reset();
			}
		});

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

function setupTradingCardsHelpTooltip(doc: Document, button: HTMLElement): void {
	let popup: HTMLElement | null = null;

	const show = (): void => {
		if (popup || !button.isConnected) return;
		popup = doc.createElement('div');
		popup.className = 'gdl-trading-cards-help-popup';
		popup.innerHTML = `
			<div style="margin-bottom:10px;">${escapeHtml(gdlText('trading_cards_help_p1', 'Encuentra tarjetas mientras juegas. Puedes intercambiarlos con amigos (o en el mercado de la Comunidad de Steam) por tarjetas que no has podido encontrar.'))}</div>
			<div>${escapeHtml(gdlText('trading_cards_help_p2', 'Completa todo el set de tarjetas y conviértelos en una insignia. Las insignias aumentan tu nivel de Steam y desbloquean beneficios en tu cuenta y perfil.'))}</div>
		`;
		doc.body.appendChild(popup);

		const rect = button.getBoundingClientRect();
		const popupWidth = Math.min(310, (doc.defaultView?.innerWidth || doc.documentElement.clientWidth || 400) - 24);

		// Position to the left of the ? button matching native Steam UI
		let left = rect.left - popupWidth - 6;
		if (left < 12) {
			left = Math.max(12, rect.right - popupWidth);
		}
		let top = rect.top - 12;
		if (top < 12) top = 12;

		popup.style.position = 'fixed';
		popup.style.left = `${Math.round(left)}px`;
		popup.style.top = `${Math.round(top)}px`;
		popup.style.width = `${popupWidth}px`;
		popup.style.zIndex = '2147483600';
	};

	const hide = (): void => {
		if (popup) {
			popup.remove();
			popup = null;
		}
	};

	button.addEventListener('mouseenter', show);
	button.addEventListener('mouseleave', hide);
	button.addEventListener('focus', show);
	button.addEventListener('blur', hide);
}

/** Steam reflows cards into fewer columns before it reduces their visual size. */
function installResponsiveTradingCardGrid(section: HTMLElement): void {
	const body = section.querySelector<HTMLElement>('.gdl-trading-cards-body');
	const grid = section.querySelector<HTMLElement>('.gdl-trading-card-grid');
	if (!body || !grid) return;
	const update = (): void => {
		const width = body.clientWidth;
		const columns = width < 340 ? 3 : width < 440 ? 4 : 5;
		grid.style.setProperty('grid-template-columns', `repeat(${columns}, minmax(0, 1fr))`, 'important');
	};
	update();
	const ResizeObserverCtor = section.ownerDocument.defaultView?.ResizeObserver;
	if (typeof ResizeObserverCtor !== 'function') return;
	const observer = new ResizeObserverCtor(update);
	observer.observe(body);
	const MutationObserverCtor = section.ownerDocument.defaultView?.MutationObserver;
	if (typeof MutationObserverCtor !== 'function' || !section.ownerDocument.body) return;
	const lifecycle = new MutationObserverCtor(() => {
		if (section.isConnected) return;
		observer.disconnect();
		lifecycle.disconnect();
	});
	lifecycle.observe(section.ownerDocument.body, { childList: true, subtree: true });
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
		return `<div class="gdl-trading-card gdl-official-card" data-gdl-card-index="${index}" data-gdl-full-image="${escapeHtml(artwork)}" role="button" tabindex="0" aria-label="${escapeHtml(title)}"><div class="gdl-trading-card-surface"><img src="${escapeHtml(image)}" alt="" /></div></div>`;
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
		innerHtml: `<div class="${ACH_CLASSES().HighlightDiv} gdl-native-sidebar-panel" style="padding:0 !important;box-sizing:border-box;overflow:visible;"><div class="gdl-trading-cards-badge-header"><div class="gdl-trading-badge" title="${escapeHtml(badgeTitle)}"><img class="gdl-trading-badge-image" src="${escapeHtml(badgeSource)}" alt="${escapeHtml(badgeTitle)}" /></div><div style="min-width:0;"><div class="gdl-trading-badge-title" style="font-size:16px;line-height:1.25;color:#fff;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(badgeTitle)}</div><div style="font-size:13px;color:#8f98a0;margin-top:2px;">${escapeHtml(gdlText('experience_points', '100 XP'))}</div></div></div><div class="gdl-trading-cards-body" style="padding:12px 10px 14px;"><div class="gdl-trading-card-remaining" style="font-size:13px;color:#9da4ab;margin-bottom:10px;">${escapeHtml(gdlText('cards_remaining', '{count} cards remaining', { count: 0 }))}</div><div class="gdl-trading-card-grid">${cards}</div><a href="https://steamcommunity.com/my/gamecards/${steamAppId}/" data-gdl-open-url="https://steamcommunity.com/my/gamecards/${steamAppId}/" style="display:block;text-align:right;margin-top:14px;color:#9da4ab;text-decoration:none;font-size:13px;">${escapeHtml(gdlText('view_my_cards', 'View my cards'))}</a></div></div>`,
		cloneInnerClass: false,
	});
	if (!section) return;

	const heading = section.querySelector('h2');
	if (heading) {
		const text = (heading.querySelector('div div') || heading.querySelector('div') || heading) as HTMLElement;
		text.textContent = loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Trading Cards'));
		const help = doc.createElement('button');
		help.type = 'button';
		help.className = 'gdl-trading-cards-help-btn';
		help.textContent = '?';
		help.setAttribute('aria-label', gdlText('trading_cards', 'Trading Cards'));
		text.appendChild(help);
		setupTradingCardsHelpTooltip(doc, help);
	}

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
	installResponsiveTradingCardGrid(section);
	for (const image of Array.from(section.querySelectorAll<HTMLImageElement>('.gdl-trading-card img'))) {
		image.addEventListener('error', () => {
			image.closest('.gdl-trading-card')?.remove();
			if (!section.querySelector('.gdl-trading-card')) section.remove();
		});
	}
	backendLog(`Official Steam cards applied for ${steamAppId}: ${catalog.cards.length} card(s), foil=${String(!!catalog.foil_badge)}`);
}
