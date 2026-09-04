import type { SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import { escapeHtml } from '../../core/text';
import { ACH_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import type { NativeLibraryLayout } from './layout';
import { GDL_INJECTED } from './constants';
import { buildNativeSidebarSection } from './layout';
import { renderOfficialTradingCards } from './trading-cards';

export interface LinkedStoreCapabilities {
	hasWorkshop: boolean;
	dlcIds: number[];
}

/** Steam Store category IDs are language-independent; never infer features from localized labels. */
export function linkedStoreCapabilities(data: SteamGameData): LinkedStoreCapabilities {
	const categoryIds = new Set((data.categories || []).map(category => Number(category.id)).filter(Number.isFinite));
	return {
		hasWorkshop: categoryIds.has(30),
		dlcIds: (data.dlc || []).map(Number).filter(Number.isFinite).slice(0, 6),
	};
}

function insertAfterKnownSidebarSections(sidebarColumn: HTMLElement, node: HTMLElement, preferredBeforeId?: string): void {
	const before = preferredBeforeId ? sidebarColumn.ownerDocument.getElementById(preferredBeforeId) : null;
	if (before?.parentElement === sidebarColumn) {
		sidebarColumn.insertBefore(node, before);
		return;
	}
	const previous = sidebarColumn.ownerDocument.getElementById('gdl-trading-cards-section')
		|| sidebarColumn.ownerDocument.getElementById('gdl-achievements-section')
		|| sidebarColumn.ownerDocument.getElementById('gdl-friends-section');
	if (previous?.parentElement === sidebarColumn) sidebarColumn.insertBefore(node, previous.nextSibling);
	else sidebarColumn.appendChild(node);
}

async function renderDlcSection(
	doc: Document,
	layout: NativeLibraryLayout,
	steamAppId: string,
	dlcIds: number[],
	isCurrent: () => boolean,
): Promise<void> {
	if (dlcIds.length === 0) return;
	const dlcData = await Promise.all(dlcIds.map(id => getGameData(String(id)).catch((): null => null)));
	if (!isCurrent() || !doc.getElementById(GDL_INJECTED) || !layout.sidebarColumn) return;
	const entries = dlcData.filter((entry): entry is SteamGameData => !!entry
		&& (!entry.type || entry.type === 'dlc')
		&& !!entry.header_image);
	if (entries.length === 0 || doc.getElementById('gdl-dlc-section')) return;

	const dlcTiles = entries.map(entry => {
		const appId = Number(entry.steam_appid);
		const url = `https://store.steampowered.com/app/${appId}/`;
		return `<a data-gdl-dlc-tile="1" title="${escapeHtml(entry.name || 'DLC')}" href="${url}" data-gdl-open-url="${url}" style="position:relative;display:block;overflow:hidden;background:#151b22;"><img src="${escapeHtml(entry.header_image)}" style="display:block;width:100%;aspect-ratio:2.14/1;object-fit:cover;" /><span style="position:absolute;top:0;left:0;padding:4px 7px;background:#bc6bd1;color:#1d1123;font-size:10px;font-weight:700;">DLC</span></a>`;
	}).join('');
	const node = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-dlc-section',
		headerText: loc('AppDetails_SectionTitle_DLC', 'DLC'),
		innerId: 'gdl-dlc-content',
		innerHtml: `<div class="${ACH_CLASSES().HighlightDiv} gdl-native-sidebar-panel" style="padding:12px;box-sizing:border-box;"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">${dlcTiles}</div><a href="https://store.steampowered.com/dlc/${steamAppId}/" data-gdl-open-url="https://store.steampowered.com/dlc/${steamAppId}/" style="display:block;text-align:right;margin-top:14px;color:#9da4ab;text-decoration:none;font-size:13px;">${escapeHtml(gdlText('view_dlc_store', 'View DLC in Store'))}</a></div>`,
		cloneInnerClass: false,
	});
	if (!node || !layout.sidebarColumn) return;
	insertAfterKnownSidebarSections(layout.sidebarColumn, node, 'gdl-workshop-section');
	for (const image of Array.from(node.querySelectorAll<HTMLImageElement>('[data-gdl-dlc-tile="1"] img'))) {
		image.addEventListener('error', () => {
			image.closest('[data-gdl-dlc-tile="1"]')?.remove();
			if (!node.querySelector('[data-gdl-dlc-tile="1"]')) node.remove();
		});
	}
}

function renderWorkshopSection(
	doc: Document,
	layout: NativeLibraryLayout,
	data: SteamGameData,
	steamAppId: string,
): void {
	if (!layout.sidebarColumn || doc.getElementById('gdl-workshop-section')) return;
	const workshopImage = data.screenshots?.[0]?.path_thumbnail || data.header_image || '';
	const url = `https://steamcommunity.com/app/${steamAppId}/workshop/`;
	const node = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-workshop-section',
		headerText: loc('AppDetails_Feature_SteamWorkshop', 'Steam Workshop'),
		innerId: 'gdl-workshop-content',
		innerHtml: `<div class="${ACH_CLASSES().HighlightDiv} gdl-native-sidebar-panel" style="padding:12px;box-sizing:border-box;"><div style="display:flex;gap:14px;"><img src="${escapeHtml(workshopImage)}" style="width:112px;height:78px;object-fit:cover;flex:0 0 auto;" data-gdl-hide-on-error="1" /><div style="min-width:0;"><a href="${url}" data-gdl-open-url="${url}" style="display:block;color:#66c0f4;text-decoration:none;font-size:15px;margin-bottom:5px;">${escapeHtml(gdlText('trending_item', 'Trending item'))}</a><div style="font-size:16px;color:#d6d7d8;margin-bottom:7px;">Steam Workshop</div><div style="font-size:13px;line-height:1.4;color:#9da4ab;">${escapeHtml(gdlText('explore_workshop', 'Explore community-created content for this game.'))}</div></div></div><div style="margin:12px -12px -12px;padding:10px 12px;text-align:right;border-top:1px solid rgba(255,255,255,.045);"><a href="${url}" data-gdl-open-url="${url}" style="color:#9da4ab;text-decoration:none;font-size:13px;">${escapeHtml(gdlText('visit_workshop', 'Visit this Workshop'))}</a></div></div>`,
		cloneInnerClass: false,
	});
	if (!node) return;
	layout.sidebarColumn.appendChild(node);
}

export interface OptionalSectionsOptions {
	steamAppId: string;
	gameName: string;
	data: SteamGameData;
	isCurrent: () => boolean;
}

/** Render Store-capability sections without coupling the main library renderer to their async lifecycle. */
export function renderOptionalStoreSections(
	doc: Document,
	layout: NativeLibraryLayout,
	options: OptionalSectionsOptions,
): LinkedStoreCapabilities {
	const capabilities = linkedStoreCapabilities(options.data);
	void renderOfficialTradingCards(doc, layout, {
		steamAppId: options.steamAppId,
		gameName: options.gameName,
		isCurrent: options.isCurrent,
	}).catch(error => backendLog(`Community item rendering failed for ${options.steamAppId}: ${String(error)}`));
	void renderDlcSection(doc, layout, options.steamAppId, capabilities.dlcIds, options.isCurrent)
		.catch(error => backendLog('DLC validation failed: ' + String(error)));
	if (capabilities.hasWorkshop) renderWorkshopSection(doc, layout, options.data, options.steamAppId);
	return capabilities;
}
