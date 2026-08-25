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
	linkBar.innerHTML = links.map(([label, url]) =>
		`<a class="gdl-primary-link" href="${url}" data-gdl-open-url="${url}">${label}</a>`,
	).join('');

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
