import { gdlText } from '../../steam/localization';
import { steamGameMainPageUrl } from '../../core/steam-links';
import { PLAYBAR_CLASSES } from '../../steam/css';
import { closestWithCssModuleClass, elementsWithCssModuleClass, isRenderedElement } from '../../steam/native-dom';
import type { NativeLibraryLayout } from './layout';

export interface PrimaryLinksOptions {
	steamAppId: string;
	isDelisted?: boolean;
	hasWorkshop: boolean;
	hasDlc?: boolean;
}

function linkedGameDestinations({ steamAppId, isDelisted, hasWorkshop, hasDlc }: PrimaryLinksOptions): Array<[string, string]> {
	const links: Array<[string, string]> = [
		[gdlText('store_page', 'Store page'), steamGameMainPageUrl(steamAppId, isDelisted)],
	];
	if (hasDlc) {
		links.push([gdlText('dlc_links', 'DLC'), `https://store.steampowered.com/dlc/${steamAppId}/`]);
	}
	links.push(
		[gdlText('community_hub', 'Community hub'), `https://steamcommunity.com/app/${steamAppId}`],
		[gdlText('points_shop', 'Points shop'), `https://store.steampowered.com/points/shop/app/${steamAppId}`],
		[gdlText('discussions', 'Discussions'), `https://steamcommunity.com/app/${steamAppId}/discussions/`],
		[gdlText('guides', 'Guides'), `https://steamcommunity.com/app/${steamAppId}/guides/`],
	);
	if (hasWorkshop) {
		links.push([gdlText('workshop', 'Workshop'), `https://steamcommunity.com/app/${steamAppId}/workshop/`]);
	}
	links.push([gdlText('support', 'Support'), `https://help.steampowered.com/wizard/HelpWithGame/?appid=${steamAppId}`]);
	return links;
}


function installPrimaryLinksResponsiveLayout(inner: HTMLElement): void {
	const primaryLinks = Array.from(inner.querySelectorAll<HTMLElement>('.gdl-primary-link'));
	const overflowLinks = Array.from(inner.querySelectorAll<HTMLElement>('.gdl-primary-overflow-link'));
	const more = inner.querySelector<HTMLElement>('.gdl-primary-more');
	if (!primaryLinks.length || !more) return;

	let frame = 0;
	const win = inner.ownerDocument.defaultView;
	const update = (): void => {
		frame = 0;
		if (!inner.isConnected || !win) return;

		// Measure every link at its natural width first. The ellipsis button is
		// intentionally excluded unless something actually needs to overflow.
		for (const link of primaryLinks) link.style.removeProperty('display');
		more.style.setProperty('display', 'none', 'important');
		for (const item of overflowLinks) item.style.setProperty('display', 'none', 'important');

		const computed = win.getComputedStyle(inner);
		const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
		const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
		const gap = Number.parseFloat(computed.columnGap || computed.gap) || 0;
		const available = Math.max(0, inner.clientWidth - paddingLeft - paddingRight);
		const widths = primaryLinks.map(link => link.getBoundingClientRect().width);
		const allWidth = widths.reduce((sum, width) => sum + width, 0)
			+ Math.max(0, widths.length - 1) * gap;

		if (allWidth <= available) return;

		const moreWidth = 34;
		let visibleCount = Math.max(1, primaryLinks.length - 1);
		while (visibleCount > 1) {
			const linksWidth = widths.slice(0, visibleCount).reduce((sum, width) => sum + width, 0);
			// Gaps exist between all visible links and once more before the ellipsis.
			const needed = linksWidth + visibleCount * gap + moreWidth;
			if (needed <= available) break;
			visibleCount -= 1;
		}

		primaryLinks.forEach((link, index) => {
			if (index >= visibleCount) link.style.setProperty('display', 'none', 'important');
		});
		overflowLinks.forEach((item, index) => {
			item.style.setProperty('display', index >= visibleCount ? 'block' : 'none', 'important');
		});
		more.style.setProperty('display', 'block', 'important');
	};

	const queueUpdate = (): void => {
		if (frame || !win) return;
		frame = win.requestAnimationFrame(update);
	};

	const ResizeObserverCtor = win?.ResizeObserver;
	if (typeof ResizeObserverCtor === 'function') {
		const observer = new ResizeObserverCtor(queueUpdate);
		observer.observe(inner);
	} else {
		win?.addEventListener('resize', queueUpdate, { passive: true });
	}
	queueUpdate();
	win?.setTimeout(queueUpdate, 0);
}

/**
 * Build the primary-link bar aligned with the playbar controls.
 */
export function createPrimaryLinksBar(
	doc: Document,
	_layout: NativeLibraryLayout,
	options: PrimaryLinksOptions,
): HTMLElement {
	const links = linkedGameDestinations(options);
	const linkBar = doc.createElement('div');
	linkBar.id = 'gdl-link-bar';
	linkBar.className = 'gdl-link-bar-inner';
	const primaryLinks = links.map(([label, url], index) =>
		`<a class="gdl-primary-link" data-gdl-primary-index="${index}" href="${url}" data-gdl-open-url="${url}">${label}</a>`,
	).join('');
	const overflowLinks = links.map(([label, url], index) =>
		`<a class="gdl-primary-overflow-link" data-gdl-primary-index="${index}" href="${url}" data-gdl-open-url="${url}">${label}</a>`,
	).join('');
	linkBar.innerHTML = `${primaryLinks}<details class="gdl-primary-more"><summary aria-label="${gdlText('more_links', 'More links')}">•••</summary><div class="gdl-primary-more-menu">${overflowLinks}</div></details>`;
	installPrimaryLinksResponsiveLayout(linkBar);
	return linkBar;
}

export function findNativePlaybar(doc: Document): HTMLElement | null {
	const pb = PLAYBAR_CLASSES();
	// 1. Check from AppButtonsContainer (holds the green Play button, gear, controller)
	if (pb.AppButtonsContainer) {
		const buttons = elementsWithCssModuleClass(doc, pb.AppButtonsContainer).find(c => isRenderedElement(doc, c))
			|| elementsWithCssModuleClass(doc, pb.AppButtonsContainer)[0];
		if (buttons) {
			const container = (pb.Container ? closestWithCssModuleClass(buttons, pb.Container) : null)
				|| buttons.closest<HTMLElement>('[class*="PlayBar"], [class*="playbar"]')
				|| buttons.parentElement;
			if (container) return container;
		}
	}
	// 2. Check Container CSS module
	if (pb.Container) {
		const container = elementsWithCssModuleClass(doc, pb.Container).find(c => isRenderedElement(doc, c))
			|| elementsWithCssModuleClass(doc, pb.Container)[0];
		if (container) return container;
	}
	// 3. Check InPage CSS module
	if (pb.InPage) {
		const inPage = elementsWithCssModuleClass(doc, pb.InPage).find(c => isRenderedElement(doc, c))
			|| elementsWithCssModuleClass(doc, pb.InPage)[0];
		if (inPage) return inPage;
	}
	// 4. Check GameStatsSection
	if (pb.GameStatsSection) {
		const stats = elementsWithCssModuleClass(doc, pb.GameStatsSection).find(c => isRenderedElement(doc, c))
			|| elementsWithCssModuleClass(doc, pb.GameStatsSection)[0];
		if (stats) {
			const container = (pb.Container ? closestWithCssModuleClass(stats, pb.Container) : null)
				|| stats.closest<HTMLElement>('[class*="PlayBar"], [class*="playbar"]')
				|| stats.parentElement;
			if (container) return container;
		}
	}
	// 5. Fallback: querySelector by Play button
	const playBtn = doc.querySelector<HTMLElement>('button[class*="Play"], [class*="PlayButton"], [class*="playButton"]');
	if (playBtn) {
		const container = playBtn.closest<HTMLElement>('[class*="PlayBar"], [class*="playbar"], [class*="Container"]')
			|| playBtn.parentElement?.parentElement
			|| playBtn.parentElement;
		if (container) return container;
	}
	return doc.querySelector<HTMLElement>('[class*="PlayBar"], [class*="playbar"]');
}

function anchorLinksBarAfterPlaybar(bar: HTMLElement, playbar: HTMLElement): boolean {
	if (!playbar.parentElement) return false;
	const doc = bar.ownerDocument;
	const infoPanel = doc.getElementById('gdl-game-info-panel');
	if (infoPanel && infoPanel.parentElement === playbar.parentElement
		&& (playbar.compareDocumentPosition(infoPanel) & Node.DOCUMENT_POSITION_FOLLOWING)) {
		if (infoPanel.nextElementSibling) {
			infoPanel.parentElement.insertBefore(bar, infoPanel.nextElementSibling);
		} else {
			infoPanel.parentElement.appendChild(bar);
		}
	} else if (playbar.nextElementSibling) {
		playbar.parentElement.insertBefore(bar, playbar.nextElementSibling);
	} else {
		playbar.parentElement.appendChild(bar);
	}
	bar.style.removeProperty('visibility');
	bar.style.removeProperty('display');
	return true;
}

export function insertPrimaryLinksBar(
	bar: HTMLElement,
	_layout: NativeLibraryLayout,
	activityWrapper: HTMLElement,
): void {
	const doc = bar.ownerDocument;
	const playbar = findNativePlaybar(doc);

	if (playbar && anchorLinksBarAfterPlaybar(bar, playbar)) {
		return;
	}

	// Playbar is still mounting during route change / game switch.
	// CRITICAL: Keep bar hidden so it NEVER flashes above the PlayBar for even 1 millisecond!
	bar.style.setProperty('visibility', 'hidden', 'important');
	if (!bar.isConnected && activityWrapper.parentElement) {
		activityWrapper.parentElement.insertBefore(bar, activityWrapper);
	}

	const win = doc.defaultView || window;
	let attempts = 0;
	const retryAnchor = () => {
		attempts += 1;
		if (!bar.isConnected) return;
		const pb = findNativePlaybar(doc);
		if (pb && anchorLinksBarAfterPlaybar(bar, pb)) {
			return;
		}
		if (attempts < 25) {
			win.requestAnimationFrame(retryAnchor);
		} else {
			// Safety fallback after ~400ms if playbar never mounted
			bar.style.removeProperty('visibility');
			bar.style.removeProperty('display');
		}
	};
	win.requestAnimationFrame(retryAnchor);
}
