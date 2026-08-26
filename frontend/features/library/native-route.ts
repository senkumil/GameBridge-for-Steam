import { LINKS_BAR_CLASSES } from '../../steam/css';
import { elementsWithCssModuleClass, isRenderedElement } from '../../steam/native-dom';
import { findMappingForShortcut, isShortcutDismissed } from '../shortcuts/runtime';
import { GDL_INJECTED } from './constants';

export function routedSteamAppId(doc: Document): number | null {
	for (const url of [String(doc.defaultView?.location?.href || ''), String(doc.location?.href || '')]) {
		const match = url.match(/(?:games\/details|library\/app|app)\/(\d+)/i);
		if (match) return Number(match[1]);
	}
	return null;
}

/** Detect Steam's own links bar without counting the GameBridge replacement. */
export function hasVisibleNativeLinksBar(doc: Document): boolean {
	try {
		const linksSection = LINKS_BAR_CLASSES().LinksSection;
		const cssModuleBar = elementsWithCssModuleClass(doc, linksSection).some(element =>
			!element.closest('#gdl-library-injected')
			&& !element.id?.startsWith('gdl-')
			&& isRenderedElement(doc, element));
		if (cssModuleBar) return true;
		// Steam occasionally changes the hashed LinksSection class while keeping
		// the native links themselves. Do not leave a linked-game info panel over
		// a real Steam page merely because that private class changed.
		return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]')).some(anchor => {
			if (anchor.closest('[id^="gdl-"]')) return false;
			const href = String(anchor.getAttribute('href') || '');
			if (!/store\.steampowered\.com|steamcommunity\.com|steam:\/\/openurl/i.test(href)
				|| !isRenderedElement(doc, anchor)) return false;
			// Exclude Steam's global top navigation; library links live below the
			// app header and are the evidence needed for route cleanup.
			return anchor.getBoundingClientRect().top > 100;
		});
	} catch { return false; }
}

export interface LibraryNavigationState {
	currentInjectedAppId: string | null;
	currentInjectedShortcutAppId: string | null;
	clearCurrentInjection: (doc: Document) => void;
	cleanupInjection: (doc: Document) => void;
}

/** Remove linked-game chrome as soon as Steam starts a different route. */
export function reconcileLibraryNavigation(doc: Document, state: LibraryNavigationState): void {
	try {
		if (!doc?.body || !doc.documentElement?.isConnected || !doc.defaultView || doc.defaultView.closed) return;
	} catch { return; }
	const hasGdlChrome = Boolean(doc.getElementById(GDL_INJECTED)
		|| doc.getElementById('gdl-playbar-achievements')
		|| doc.getElementById('gdl-link-bar')
		|| doc.getElementById('gdl-game-info-panel'));
	if (!hasGdlChrome) return;
	const routeId = routedSteamAppId(doc);
	// Native links are also a definitive route boundary for client builds that
	// temporarily expose no AppID in location.href while they rebuild a page.
	if ((routeId !== null && routeId > 0 && routeId < 2147483648)
		|| hasVisibleNativeLinksBar(doc)) {
		state.clearCurrentInjection(doc);
		state.cleanupInjection(doc);
		return;
	}
	if (routeId === null) return;
	const routeShortcutDismissed = routeId >= 2147483648 && isShortcutDismissed(routeId);
	const routeMapping = routeId >= 2147483648 && !routeShortcutDismissed
		? findMappingForShortcut(String(routeId), '')
		: null;
	const sameLinkedGame = !routeShortcutDismissed && routeId >= 2147483648
		&& (String(routeId) === state.currentInjectedShortcutAppId || routeMapping === state.currentInjectedAppId);
	if (!sameLinkedGame) {
		state.clearCurrentInjection(doc);
		state.cleanupInjection(doc);
	}
}
