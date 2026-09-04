import { normalizeTitle } from '../../core/text';
import { getMappedShortcuts, getShortcutAppById, toSignedShortcutAppId } from '../shortcuts';
import { findMappingForTitle, mappings, shortcutMappingKey } from '../../core/mappings';

export interface LinkedGameIdentity {
	shortcutAppId: number;
	steamAppId: number;
	executable?: string;
	startDir?: string;
	launchOptions?: string;
	canonicalId: string;
	title: string;
}

export interface ActiveGameContext {
	type: 'steam' | 'shortcut-unlinked' | 'shortcut-linked' | 'none';
	identity?: LinkedGameIdentity;
	shortcutAppId?: number;
	steamAppId?: number;
	title?: string;
}

type MappedShortcut = ReturnType<typeof getMappedShortcuts>[number];

function mappedShortcutIds(shortcut: MappedShortcut): number[] {
	const raw = Number(shortcut.id);
	const unsigned = raw >>> 0;
	const signed = toSignedShortcutAppId(unsigned);
	return Array.from(new Set([raw, unsigned, signed])).filter(Number.isFinite);
}

function linkedContext(shortcut: MappedShortcut): ActiveGameContext {
	const unsigned = Number(shortcut.id) >>> 0;
	const steamAppId = Number(shortcut.steamAppId);
	const app = getShortcutAppById(shortcut.id);
	return {
		type: 'shortcut-linked',
		shortcutAppId: unsigned,
		steamAppId,
		title: shortcut.title,
		identity: {
			shortcutAppId: unsigned,
			steamAppId,
			executable: app?.exe,
			startDir: app?.openvr_action_manifest_path,
			launchOptions: app?.LaunchOptions,
			canonicalId: `${unsigned}:${steamAppId}`,
			title: shortcut.title,
		},
	};
}

function contextForRawAppId(rawAppId: unknown, shortcuts: MappedShortcut[]): ActiveGameContext | null {
	const numeric = Number(rawAppId);
	if (!Number.isFinite(numeric) || numeric === 0) return null;
	const shortcut = shortcuts.find(item => mappedShortcutIds(item).includes(numeric));
	if (shortcut) return linkedContext(shortcut);
	const unsigned = numeric < 0 ? (numeric >>> 0) : numeric;
	if (unsigned > 0 && unsigned < 2147483648) return { type: 'steam', steamAppId: unsigned };
	return null;
}

function collectWindows(doc: Document): any[] {
	const result: any[] = [];
	const add = (value: any): void => {
		if (value && !result.includes(value)) result.push(value);
	};
	add(doc.defaultView);
	try { add(doc.defaultView?.parent); } catch {}
	try { add(doc.defaultView?.top); } catch {}
	try { add(doc.defaultView?.opener); } catch {}
	if (typeof window !== 'undefined') add(window);
	try {
		const manager = (window as any)?.g_PopupManager;
		for (const name of ['SP BPM_uid0', 'SP BPM']) {
			const popup = manager?.GetExistingPopup?.(name) || manager?.m_mapPopups?.get?.(name);
			add(popup?.m_popup?.window || popup?.window || popup?.m_popup);
		}
	} catch {}
	for (const frame of Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe'))) {
		try { add(frame.contentWindow); } catch {}
	}
	return result;
}

function addCandidateValue(target: Set<string>, value: unknown): void {
	if (typeof value === 'string' || typeof value === 'number') target.add(String(value));
}

function readPath(root: any, path: string): unknown {
	try { return path.split('.').reduce((value, key) => value?.[key], root); }
	catch { return undefined; }
}

function collectActiveRouteValues(doc: Document): string[] {
	const values = new Set<string>();
	addCandidateValue(values, doc.URL);
	addCandidateValue(values, doc.baseURI);
	const paths = [
		'location.href', 'location.pathname', 'location.hash',
		'g_Router.history.location.pathname', 'g_Router.history.location.search', 'g_Router.history.location.hash',
		'g_Router.location.pathname', 'g_Router.m_history.location.pathname',
		'Router.history.location.pathname', 'router.history.location.pathname',
		'SteamUIStore.m_currentPath', 'SteamUIStore.m_strCurrentRoute',
	];
	for (const win of collectWindows(doc)) {
		for (const path of paths) addCandidateValue(values, readPath(win, path));
		for (const key of ['g_Router', 'Router', 'router']) {
			const router = readPath(win, key);
			if (!router || typeof router !== 'object') continue;
			for (const member of ['pathname', 'path', 'route', 'url', 'href', 'location', 'currentLocation']) {
				const value = readPath(router, member);
				if (value && typeof value === 'object') {
					for (const nested of ['pathname', 'path', 'route', 'url', 'href', 'search', 'hash']) addCandidateValue(values, readPath(value, nested));
				} else addCandidateValue(values, value);
			}
		}
	}
	return Array.from(values).map(value => {
		try { return decodeURIComponent(value); } catch { return value; }
	});
}

function activeAppIdsFromStores(doc: Document): number[] {
	const ids = new Set<number>();
	const activeKey = /(?:selected|current|active|focused|last).*(?:app|game)|(?:app|game).*(?:selected|current|active|focused|last)/i;
	const addValue = (value: any): void => {
		if (value == null) return;
		for (const raw of [value, value?.appid, value?.appId, value?.app_id, value?.m_unAppID, value?.m_nAppID, value?.overview?.appid, value?.appOverview?.appid]) {
			const num = Number(raw);
			if (Number.isFinite(num) && num !== 0) ids.add(num);
		}
	};
	for (const win of collectWindows(doc)) {
		for (const storeName of ['appStore', 'AppStore', 'libraryStore', 'LibraryStore', 'SteamUIStore']) {
			const store = readPath(win, storeName) as Record<string, any> | null;
			if (!store || typeof store !== 'object') continue;
			for (const key of Object.keys(store)) {
				if (!activeKey.test(key)) continue;
				try { addValue(store[key]); } catch {}
			}
			for (const method of ['GetSelectedApp', 'GetCurrentApp', 'GetActiveApp', 'GetFocusedApp']) {
				try { if (typeof store[method] === 'function') addValue(store[method]()); } catch {}
			}
		}
	}
	return Array.from(ids);
}

function appIdsFromReactOwners(doc: Document): number[] {
	const ids = new Set<number>();
	const selector = '[role="tablist"], [class*="AppDetails"], [class*="GameDetails"], [class*="PlayBar"], [class*="Hero"]';
	for (const element of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
		let current: HTMLElement | null = element;
		for (let domDepth = 0; current && domDepth < 5; domDepth += 1, current = current.parentElement) {
			const ownerKey = Object.keys(current).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$') || key.startsWith('__reactProps$'));
			if (!ownerKey) continue;
			let fiber: any = (current as any)[ownerKey];
			for (let fiberDepth = 0; fiber && fiberDepth < 30; fiberDepth += 1, fiber = fiber.return) {
				const props = fiber.memoizedProps || fiber.pendingProps || fiber.props || fiber;
				for (const raw of [props?.appid, props?.appId, props?.nAppID, props?.overview?.appid, props?.appOverview?.appid, props?.game?.appid]) {
					const num = Number(raw);
					if (Number.isFinite(num) && num !== 0) ids.add(num);
				}
			}
		}
	}
	return Array.from(ids);
}

function activeContextFromIdentity(doc: Document, shortcuts: MappedShortcut[]): ActiveGameContext | null {
	const routeValues = collectActiveRouteValues(doc);
	const routePatterns = [
		/(?:\/routes\/library\/app\/|\/library\/app\/|\/appdetails\/|\/details\/|\/game\/|[?&#]appid=)(-?\d+)/ig,
		/(?:^|[^0-9])(-?\d{6,10})(?:[^0-9]|$)/g,
	];
	for (const value of routeValues) {
		for (let index = 0; index < routePatterns.length; index += 1) {
			const pattern = routePatterns[index];
			pattern.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(value))) {
				const context = contextForRawAppId(match[1], shortcuts);
				if (context?.type === 'shortcut-linked') return context;
				if (context?.type === 'steam' && index === 0) return context;
			}
		}
	}
	const stateIds = [...activeAppIdsFromStores(doc), ...appIdsFromReactOwners(doc)];
	for (const id of stateIds) {
		const context = contextForRawAppId(id, shortcuts);
		if (context?.type === 'shortcut-linked') return context;
	}
	const official = stateIds.find(id => id > 0 && id < 2147483648);
	return official ? { type: 'steam', steamAppId: official } : null;
}

function headingContext(doc: Document, shortcuts: MappedShortcut[]): ActiveGameContext | null {
	const byLongestTitle = [...shortcuts].sort((a, b) => b.title.length - a.title.length);
	const headings = Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3, img[alt], svg[aria-label], [class*="title" i], [class*="logo" i]'));
	for (const heading of headings) {
		if (heading.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel, [class*="nav" i], [class*="footer" i], [class*="QuickAccess" i], [class*="MainMenu" i]')) continue;
		const rect = heading.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || rect.top > 500) continue;
		const text = normalizeTitle(heading.getAttribute('alt') || heading.getAttribute('aria-label') || heading.textContent || '');
		if (!text) continue;
		const shortcut = byLongestTitle.find(item => normalizeTitle(item.title) === text);
		if (shortcut) return linkedContext(shortcut);
	}
	return null;
}

export function resolveActiveGameContext(doc?: Document): ActiveGameContext {
	const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
	if (!targetDoc) return { type: 'none' };
	const shortcuts = getMappedShortcuts();
	const activeMarker = targetDoc.querySelector<HTMLElement>('[data-gdl-active-shortcut-id]');
	if (activeMarker) {
		const marked = contextForRawAppId(activeMarker.getAttribute('data-gdl-active-shortcut-id'), shortcuts);
		if (marked) return marked;
		const rawAppId = Number(activeMarker.getAttribute('data-gdl-active-shortcut-id'));
		const app = getShortcutAppById(rawAppId);
		const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
		const mappingKey = shortcutMappingKey(rawAppId);
		const mappedAppId = mappings[mappingKey] || (title ? findMappingForTitle(title) : null);
		if (mappedAppId && /^\d+$/.test(mappedAppId)) {
			return linkedContext({ id: rawAppId, title: title || `App ${rawAppId >>> 0}`, steamAppId: mappedAppId });
		}
		return { type: 'shortcut-unlinked', shortcutAppId: rawAppId >>> 0, title: title || `App ${rawAppId >>> 0}` };
	}
	const identity = activeContextFromIdentity(targetDoc, shortcuts);
	if (identity?.type === 'shortcut-linked') return identity;
	const byHeading = headingContext(targetDoc, shortcuts);
	if (byHeading) return byHeading;
	return identity || { type: 'none' };
}
