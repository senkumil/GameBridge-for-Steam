import { findShortcutIdForMappedSteamAppId } from '../../core/mappings';
import { navigateToLibraryShortcut } from '../../steam/navigation';
import { routedSteamAppId } from './native-route';

function extractAppIdFromElement(element: HTMLElement): number | null {
	const dataId = element.getAttribute('data-appid') || element.dataset?.appid;
	if (dataId && /^\d+$/.test(dataId)) return Number(dataId);
	const link = element.tagName === 'A' ? (element as HTMLAnchorElement) : element.querySelector<HTMLAnchorElement>('a[href]');
	const href = String(link?.getAttribute('href') || '');
	const match = href.match(/(?:app|details)\/(\d+)/i);
	if (match) return Number(match[1]);
	for (const key of Object.keys(element)) {
		if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
			let fiber = (element as any)[key];
			for (let depth = 0; fiber && depth < 10; depth += 1, fiber = fiber.return) {
				const props = fiber.memoizedProps || fiber.pendingProps;
				const item = props?.item || props?.overview || props?.app;
				const id = Number(item?.appid ?? item?.m_unAppID ?? props?.appid);
				if (Number.isFinite(id) && id > 0) return id;
			}
		}
	}
	return null;
}

/**
 * Filter ghost / duplicate unowned Steam app entries spawned in the sidebar
 * during non-Steam shortcut execution.
 */
export function cleanupGhostSidebarEntries(doc: Document): void {
	try {
		if (!doc?.body) return;
		const rows = doc.querySelectorAll<HTMLElement>(
			'[class*="gamelistentry_"], [class*="gamelistsection_"], [class*="gameListRow"], [class*="GameListRow"], [class*="gameListEntry"], [class*="GameListEntry"], [class*="sidebar"] a, [class*="Sidebar"] a, [role="treeitem"], [role="listitem"]'
		);
		for (const row of Array.from(rows)) {
			const id = extractAppIdFromElement(row);
			if (!id || id <= 0 || id >= 2147483648) continue;
			const mappedShortcutId = findShortcutIdForMappedSteamAppId(id);
			if (!mappedShortcutId) continue;
			const view = doc.defaultView as any;
			const overview = view?.appStore?.GetAppOverviewByAppID?.(id);
			// Non-Steam overviews can temporarily report installed/running even
			// though the account does not own the app. Subscription is the ownership
			// boundary; treating an absent subscription flag as owned allowed the ghost
			// row to survive until Steam rebuilt its library on restart.
			const isSubscribed = overview?.m_bIsSubscribed
				?? overview?.is_subscribed
				?? overview?.bIsSubscribed;
			const isUnowned = !overview || isSubscribed !== true || overview.app_type === 0;
			if (isUnowned) {
				const container = row.closest<HTMLElement>(
					'[class*="gamelistentry_"], [class*="gameListRow"], [class*="GameListRow"], [class*="gameListEntry"], [class*="GameListEntry"], [role="treeitem"], [role="listitem"]'
				) || row;
				if (container.style.display !== 'none') container.style.setProperty('display', 'none', 'important');
			}
		}
	} catch {}
}

export function tryRedirectUnownedMappedGame(doc: Document): boolean {
	try {
		const appId = routedSteamAppId(doc);
		if (appId !== null && appId > 0 && appId < 2147483648) {
			const mappedShortcutId = findShortcutIdForMappedSteamAppId(appId);
			if (mappedShortcutId) {
				const overview = (window as any).appStore?.GetAppOverviewByAppID?.(appId);
				if (!overview || overview.m_bIsSubscribed === false || overview.is_installed === false || overview.app_type === 0) {
					return navigateToLibraryShortcut(doc, mappedShortcutId);
				}
			}
		}
	} catch {}
	return false;
}

const NON_STEAM_COLLECTION_REGEX = /(?:^|\b)(?:no\s+de\s+steam|non-?steam|nicht-?steam|jeux\s+non-?steam|giochi\s+non-?steam|não\s+(?:são\s+do\s+)?steam|не\s+из\s+steam|非\s*steam|비\s*steam)(?:\b|$)/i;

/**
 * Permanently hide "Non-Steam" collection headers, filter pills, and category tabs
 * across all views so shortcuts seamlessly integrate into standard game collections.
 */
export function cleanupNonSteamPillsAndHeaders(doc: Document): void {
	try {
		if (!doc?.body) return;
		const candidates = doc.querySelectorAll<HTMLElement>(
			'[class*="FilterOption"], [class*="filterOption"], [class*="SavedFilter"], [class*="savedFilter"], [class*="CollectionHeader"], [class*="collectionHeader"], [class*="SectionHeader"], [class*="sectionHeader"], [class*="Collections"], [class*="collections"], [class*="allcollections_"], [class*="libraryhome_"], [class*="Filter"], [class*="filter"], [class*="Pill"], [class*="pill"], [role="tab"], [role="button"]'
		);
		for (const el of Array.from(candidates)) {
			const text = el.textContent?.trim() || '';
			if (!text || text.length > 45) continue;
			if (NON_STEAM_COLLECTION_REGEX.test(text)) {
				const target = (el.closest('[class*="FilterOption"], [class*="SavedFilter"], [class*="CollectionHeader"], [class*="SectionHeader"], [class*="Pill"], [class*="pill"], [role="tab"]') as HTMLElement) || el;
				if (target.style.display !== 'none') {
					target.style.setProperty('display', 'none', 'important');
					target.style.setProperty('visibility', 'hidden', 'important');
					target.style.setProperty('pointer-events', 'none', 'important');
					target.dataset.gdlNonsteam = '1';
				}
			}
		}
	} catch {}
}

export function installGhostSidebarCleanup(doc: Document): () => void {
	cleanupGhostSidebarEntries(doc);
	cleanupNonSteamPillsAndHeaders(doc);
	const Observer = doc.defaultView?.MutationObserver;
	if (!Observer) return () => {};
	const observer = new Observer(() => {
		cleanupGhostSidebarEntries(doc);
		cleanupNonSteamPillsAndHeaders(doc);
	});
	try {
		if (doc.body) {
			observer.observe(doc.body, { childList: true, subtree: true });
		}
	} catch {}
	return () => observer.disconnect();
}
