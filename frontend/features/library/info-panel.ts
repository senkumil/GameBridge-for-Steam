import type { NativeGameFeature, NativeGameInfo } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import {
	GAME_INFO_CLASS_MODULE,
	GAME_INFO_OUTER_CLASS_MODULE,
	PLAYBAR_CLASS_MODULE,
} from '../../steam/css';
import type { CssClasses } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import {
	addCssModuleClass,
	buildNativeInfoButtonBlueprint,
	closestWithCssModuleClass,
	elementsWithCssModuleClass,
	hasCssModuleClass,
	isRenderedElement,
	removeCssModuleClass,
} from '../../steam/native-dom';

const expandedNativeGameInfoKeys = new Set<string>();
const nativeInfoResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

function informationSvg(): string {
	return `<svg class="SVGIcon_Button SVGIcon_Information" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10.4v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.2" r="1.15" fill="currentColor"/></svg>`;
}

function nativeFeatureSvg(feature: NativeGameFeature): string {
	switch (feature.kind) {
		case 'cloud':
			return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.2 19h10.4a5 5 0 0 0 .6-10 6.6 6.6 0 0 0-12.7-1.3A5.7 5.7 0 0 0 7.2 19Z"/></svg>`;
		case 'controller-full':
		case 'controller-partial':
		case 'ps4':
		case 'ps5':
		case 'steam-input':
			return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.1 7.2h9.8c2.1 0 3.5 1.5 4.1 4.1l.8 3.7c.5 2.4-2.3 3.8-3.8 2l-1.5-1.9h-9L6 17c-1.6 1.9-4.3.4-3.8-2l.8-3.7c.6-2.6 2-4.1 4.1-4.1Zm1.8 3H7.2v1.7H5.5v1.7h1.7v1.7h1.7v-1.7h1.7v-1.7H8.9v-1.7Zm6.4 1.1a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm2.6 2.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"/></svg>`;
		case 'achievements':
			return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 2.1 3.1 3.7-.8.3 3.8 3.5 1.5-1.7 3.4 2.5 2.9-3.1 2.2.7 3.7-3.8.2-1.5 3.5-3.4-1.7-2.9 2.5-2.2-3.1-3.7.7-.2-3.8-3.5-1.5 1.7-3.4-2.5-2.9 3.1-2.2-.7-3.7 3.8-.3L8.5 3.7 12 5.4 12 2Z"/></svg>`;
		case 'multiplayer':
		case 'coop':
		case 'family-sharing':
		case 'remote-play':
			return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.2 11a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm7.9.3a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM8.2 12.5c-4 0-6.2 2-6.2 5V20h12.4v-2.5c0-3-2.2-5-6.2-5Zm8 .3c-.8 0-1.5.1-2.1.3 1.2 1.2 1.8 2.7 1.8 4.4V20H22v-2.1c0-3.1-2-5.1-5.8-5.1Z"/></svg>`;
		default:
			return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6ZM4.5 21v-2.2c0-4.1 2.8-6.5 7.5-6.5s7.5 2.4 7.5 6.5V21h-15Z"/></svg>`;
	}
}

function nativeInfoSignature(model: NativeGameInfo): string {
	return JSON.stringify(model);
}

function moduleClass(enabled: boolean, value?: string): string {
	return enabled ? String(value || '') : '';
}

function nativeInfoAssociation(classes: CssClasses, nativeLayout: boolean, label: string, value: string, release = false): string {
	if (!value) return '';
	const cleanLabel = label.trim().replace(/:$/, '') + ':';
	return `<div class="${moduleClass(nativeLayout, classes.Association)} ${release ? moduleClass(nativeLayout, classes.Release) : ''} gdl-info-row"><div class="${moduleClass(nativeLayout, classes.Label)} gdl-info-label">${escapeHtml(cleanLabel)}</div><div class="${release ? moduleClass(nativeLayout, classes.Date) : moduleClass(nativeLayout, classes.Name)} gdl-info-value">${escapeHtml(value)}</div></div>`;
}

function nativeInfoPanelHtml(model: NativeGameInfo, nativeLayout: boolean): string {
	const infoClasses = GAME_INFO_CLASS_MODULE().classes;
	const outerClasses = GAME_INFO_OUTER_CLASS_MODULE().classes;
	const stats = [
		nativeInfoAssociation(infoClasses, nativeLayout, loc('AppDetails_Developer', gdlText('developer', 'Developer')), model.developer),
		nativeInfoAssociation(infoClasses, nativeLayout, loc('AppDetails_Publisher', gdlText('publisher', 'Publisher')), model.publisher),
		nativeInfoAssociation(infoClasses, nativeLayout, loc('AppDetails_Franchise', gdlText('franchise', 'Franchise')), model.franchise),
		nativeInfoAssociation(infoClasses, nativeLayout, loc('AppDetails_ReleaseDate', gdlText('release_date', 'Release date')), model.release, true),
	].join('');
	const features = model.features.map(feature => `<div class="gdl-info-feature" data-gdl-feature="${escapeHtml(feature.kind)}">${nativeFeatureSvg(feature)}<span>${escapeHtml(feature.label)}</span></div>`).join('');
	const statsListClass = moduleClass(nativeLayout, infoClasses.AssociationList);
	return `
		<div class="${moduleClass(nativeLayout, infoClasses.Container)} gdl-game-info-container">
			<div class="${moduleClass(nativeLayout, infoClasses.InnerContainer)} gdl-game-info-grid">
				<div class="${moduleClass(nativeLayout, infoClasses.Portrait)} gdl-info-portrait">${model.portrait ? `<img class="${moduleClass(nativeLayout, infoClasses.BoxArt)}" src="${escapeHtml(model.portrait)}" alt="${escapeHtml(model.title)}">` : ''}</div>
				<div class="${moduleClass(nativeLayout, infoClasses.Description)} ${moduleClass(nativeLayout, infoClasses.SectionContainer)} gdl-info-description"><div class="${moduleClass(nativeLayout, infoClasses.GameDescription)} gdl-info-description-text">${escapeHtml(model.description || model.title)}</div></div>
				<div class="${moduleClass(nativeLayout, infoClasses.Stats)} ${moduleClass(nativeLayout, infoClasses.SectionContainer)} gdl-info-stats"><div class="${statsListClass} gdl-info-associations">${stats}</div></div>
				<div class="${moduleClass(nativeLayout, infoClasses.FeaturesList)} ${moduleClass(nativeLayout, infoClasses.SectionContainer)} gdl-info-features">${features}</div>
			</div>
		</div>
		${nativeLayout ? `<div class="${outerClasses.GameInfoShadow || ''}"></div>` : ''}`;
}

function nativeInfoPanelHeight(panel: HTMLElement): number {
	const content = panel.firstElementChild as HTMLElement | null;
	if (!content) return 1;
	return Math.max(1, content.scrollHeight, content.offsetHeight);
}

function resizeFallbackInfoPanel(panel: HTMLElement): void {
	if (panel.dataset.gdlNativeLayout === '1' || panel.dataset.expanded !== '1') return;
	panel.style.height = `${nativeInfoPanelHeight(panel)}px`;
}

function setNativeInfoExpanded(doc: Document, key: string, expanded: boolean): void {
	if (expanded) expandedNativeGameInfoKeys.add(key);
	else expandedNativeGameInfoKeys.delete(key);
	const panel = doc.getElementById('gdl-game-info-panel') as HTMLElement | null;
	const outerModule = GAME_INFO_OUTER_CLASS_MODULE();
	if (panel && panel.dataset.gameKey === key) {
		const nativeLayout = panel.dataset.gdlNativeLayout === '1' && outerModule.native;
		panel.dataset.expanded = expanded ? '1' : '0';
		panel.classList.toggle('gdl-info-expanded', expanded);
		if (nativeLayout) {
			removeCssModuleClass(panel, expanded ? outerModule.classes.AppDetailsCollapsed : outerModule.classes.AppDetailsExpanded);
			addCssModuleClass(panel, expanded ? outerModule.classes.AppDetailsExpanded : outerModule.classes.AppDetailsCollapsed);
		}
		panel.style.height = expanded ? `${nativeInfoPanelHeight(panel)}px` : '0px';
		panel.setAttribute('aria-hidden', expanded ? 'false' : 'true');
	}
	for (const button of Array.from(doc.querySelectorAll<HTMLElement>('[data-gdl-game-info-button="1"]'))) {
		if (button.dataset.gameKey !== key) continue;
		const playbarModule = PLAYBAR_CLASS_MODULE();
		button.classList.toggle('gdl-info-active', expanded);
		if (playbarModule.native) {
			if (expanded) addCssModuleClass(button, playbarModule.classes.MenuActive);
			else removeCssModuleClass(button, playbarModule.classes.MenuActive);
		}
		button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		const label = expanded
			? loc('GameAction_ViewDetails_Collapse', gdlText('hide_game_details', 'Hide game details'))
			: loc('GameAction_ViewDetails', gdlText('show_game_details', 'Show game details'));
		button.setAttribute('aria-label', label);
		button.title = label;
	}
}

export function removeNativeInfoPanel(doc: Document): void {
	const panel = doc.getElementById('gdl-game-info-panel') as HTMLElement | null;
	if (!panel) return;
	nativeInfoResizeObservers.get(panel)?.disconnect();
	panel.remove();
}

export function ensureNativeInfoPanel(doc: Document, model: NativeGameInfo): HTMLElement | null {
	let panel = doc.getElementById('gdl-game-info-panel') as HTMLElement | null;
	const signature = nativeInfoSignature(model);
	if (panel && (panel.dataset.gameKey !== model.key || panel.dataset.signature !== signature)) {
		removeNativeInfoPanel(doc);
		panel = null;
	}
	if (!panel) {
		const infoModule = GAME_INFO_CLASS_MODULE();
		const outerModule = GAME_INFO_OUTER_CLASS_MODULE();
		const nativeLayout = infoModule.native && outerModule.native;
		panel = doc.createElement('div');
		panel.id = 'gdl-game-info-panel';
		panel.dataset.gdlNativeLayout = nativeLayout ? '1' : '0';
		panel.className = nativeLayout
			? `${outerModule.classes.AppGameInfoContainer || ''} ${outerModule.classes.Glassy || ''}`.trim()
			: 'gdl-game-info-fallback';
		panel.innerHTML = nativeInfoPanelHtml(model, nativeLayout);
		panel.dataset.gameKey = model.key;
		panel.dataset.signature = signature;
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', loc('AppDetails_GameInfo', gdlText('game_information', 'Game information')));

		const linkBar = doc.getElementById('gdl-link-bar');
		if (linkBar?.parentElement) linkBar.parentElement.insertBefore(panel, linkBar);
		else return null;

		if (!nativeLayout) {
			const ResizeObserverCtor = doc.defaultView?.ResizeObserver;
			const content = panel.firstElementChild as HTMLElement | null;
			if (typeof ResizeObserverCtor === 'function' && content) {
				const observer = new ResizeObserverCtor(() => resizeFallbackInfoPanel(panel!));
				observer.observe(content);
				nativeInfoResizeObservers.set(panel, observer);
			}
			panel.querySelector('img')?.addEventListener('load', () => resizeFallbackInfoPanel(panel!));
		}
	}
	const linkBar = doc.getElementById('gdl-link-bar');
	if (linkBar?.parentElement && panel.nextElementSibling !== linkBar) linkBar.parentElement.insertBefore(panel, linkBar);
	setNativeInfoExpanded(doc, model.key, expandedNativeGameInfoKeys.has(model.key));
	return panel;
}

export function ensureNativeInfoButton(doc: Document, model: NativeGameInfo): void {
	const playbarModule = PLAYBAR_CLASS_MODULE();
	const classes = playbarModule.classes;
	const containers = elementsWithCssModuleClass(doc, classes.AppButtonsContainer).filter(container => container.isConnected);
	let inPage = containers.filter(container => hasCssModuleClass(closestWithCssModuleClass(container, classes.Container), classes.InPage));
	if (inPage.length === 0) {
		const visible = containers.find(container => isRenderedElement(doc, container));
		inPage = visible ? [visible] : containers.slice(0, 1);
	}
	for (const container of inPage) {
		let button = container.querySelector<HTMLElement>('[data-gdl-game-info-button="1"]');
		if (!button) {
			button = buildNativeInfoButtonBlueprint(doc) || doc.createElement('button');
			const usesNativeBlueprint = button.dataset.gdlNativeBlueprint === '1';
			button.dataset.gdlGameInfoButton = '1';
			button.dataset.gameKey = model.key;
			if (!button.className) button.className = playbarModule.native ? `${classes.MenuButton || ''}` : 'gdl-info-button-fallback';
			// Preserve Steam's captured button markup and SVG exactly. It carries
			// Steam's own hover lighting/animation. Only builds without a native
			// blueprint use our structurally compatible fallback.
			if (!usesNativeBlueprint) button.innerHTML = `<div class="${playbarModule.native ? (classes.DotDotDot || '') : ''}">${informationSvg()}</div>`;
			button.setAttribute('type', 'button');
			button.setAttribute('aria-label', gdlText('show_game_details', 'Show game details'));
			button.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				const key = button!.dataset.gameKey || '';
				setNativeInfoExpanded(doc, key, !expandedNativeGameInfoKeys.has(key));
			});
			let favorite = elementsWithCssModuleClass(container, classes.FavoriteButton)[0] || null;
			while (favorite && favorite.parentElement !== container) favorite = favorite.parentElement;
			container.insertBefore(button, favorite);
		} else if (button.dataset.gdlNativeBlueprint !== '1' && !button.querySelector('.SVGIcon_Information')) {
			button.innerHTML = `<div class="${playbarModule.native ? (classes.DotDotDot || '') : ''}">${informationSvg()}</div>`;
		}
		button.dataset.gameKey = model.key;
	}
	setNativeInfoExpanded(doc, model.key, expandedNativeGameInfoKeys.has(model.key));
}

export function removeNativeInfoButton(doc: Document): void {
	doc.querySelectorAll('[data-gdl-game-info-button="1"]').forEach(element => element.remove());
}

export function clearNativeInfoSessionState(): void {
	expandedNativeGameInfoKeys.clear();
}
