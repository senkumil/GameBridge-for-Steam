import { gdlText } from '../../steam/localization';
import type { NativeLibraryLayout } from './layout';

export interface PrimaryLinksOptions {
	steamAppId: string;
	hasWorkshop: boolean;
	hasDlc?: boolean;
}

function linkedGameDestinations({ steamAppId, hasWorkshop, hasDlc }: PrimaryLinksOptions): Array<[string, string]> {
	const links: Array<[string, string]> = [
		[gdlText('store_page', 'Store page'), `https://store.steampowered.com/app/${steamAppId}`],
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
	layout: NativeLibraryLayout,
	options: PrimaryLinksOptions,
): HTMLElement {
	const links = linkedGameDestinations(options);
	const linkBar = doc.createElement('div');
	linkBar.className = 'gdl-link-bar-inner';
	const primaryLinks = links.map(([label, url], index) =>
		`<a class="gdl-primary-link" data-gdl-primary-index="${index}" href="${url}" data-gdl-open-url="${url}">${label}</a>`,
	).join('');
	const overflowLinks = links.map(([label, url], index) =>
		`<a class="gdl-primary-overflow-link" data-gdl-primary-index="${index}" href="${url}" data-gdl-open-url="${url}">${label}</a>`,
	).join('');
	linkBar.innerHTML = `${primaryLinks}<details class="gdl-primary-more"><summary aria-label="${gdlText('more_links', 'More links')}">•••</summary><div class="gdl-primary-more-menu">${overflowLinks}</div></details>`;
	installPrimaryLinksResponsiveLayout(linkBar);

	if (layout.anchorRegion) {
		const linkBarOuter = doc.createElement('div');
		linkBarOuter.className = layout.anchorRegion.className;
		linkBarOuter.style.margin = '0';
		const regionChildren = Array.from(layout.anchorRegion.children);
		const sourceBody = regionChildren.find(c => c.tagName === 'DIV') as HTMLElement | undefined;
		if (sourceBody) {
			const linkBarPanel = doc.createElement('div');
			linkBarPanel.className = sourceBody.className;
			linkBarPanel.appendChild(linkBar);
			linkBarOuter.appendChild(linkBarPanel);
		} else {
			linkBarOuter.appendChild(linkBar);
		}
		linkBar.id = '';
		linkBarOuter.id = 'gdl-link-bar';
		return linkBarOuter;
	} else {
		linkBar.id = 'gdl-link-bar';
		linkBar.style.cssText = 'display:flex;align-items:center;padding:8px 16px;background:#2a3040;border-bottom:1px solid rgba(255,255,255,0.06);';
		return linkBar;
	}
}

export function insertPrimaryLinksBar(
	bar: HTMLElement,
	layout: NativeLibraryLayout,
	activityWrapper: HTMLElement,
): void {
	if (layout.twoColumnRow?.parentElement) {
		layout.twoColumnRow.parentElement.insertBefore(bar, layout.twoColumnRow);
		return;
	}
	if (!bar.isConnected && activityWrapper.parentElement) {
		activityWrapper.parentElement.insertBefore(bar, activityWrapper);
	}
}
