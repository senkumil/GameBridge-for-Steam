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

function mappedShortcutIds(shortcut: { id: number; title: string; steamAppId: string }): string[] {
	const unsigned = String(shortcut.id >>> 0);
	const signed = String(toSignedShortcutAppId(shortcut.id));
	return Array.from(new Set([String(shortcut.id), unsigned, signed]));
}

function isNativeSteamGameActive(doc: Document): boolean {
	const elements = Array.from(doc.querySelectorAll<HTMLElement>('[data-appid],[data-app-id],[data-app-id-value],a[href*="/app/"]'));
	for (const element of elements) {
		const raw = element.getAttribute('data-appid')
			|| element.getAttribute('data-app-id')
			|| element.getAttribute('data-app-id-value')
			|| element.getAttribute('href')?.match(/\/app\/(\d+)/)?.[1];
		const num = Number(raw);
		if (Number.isFinite(num) && num > 0 && num < 2147483648) {
			const activeMapped = doc.querySelector('[data-gdl-active-shortcut-id]');
			if (!activeMapped) return true;
		}
	}
	return false;
}

export function resolveActiveGameContext(doc?: Document): ActiveGameContext {
	const targetDoc = doc || (typeof document !== 'undefined' ? document : null);
	if (!targetDoc) return { type: 'none' };

	const shortcuts = getMappedShortcuts();

	// 1. Check explicitly marked active shortcut
	const activeMarker = targetDoc.querySelector<HTMLElement>('[data-gdl-active-shortcut-id]');
	if (activeMarker) {
		const rawAppId = Number(activeMarker.getAttribute('data-gdl-active-shortcut-id'));
		if (Number.isFinite(rawAppId) && rawAppId !== 0) {
			const unsigned = rawAppId < 0 ? (rawAppId >>> 0) : rawAppId;
			const app = getShortcutAppById(rawAppId);
			const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
			const mappingKey = shortcutMappingKey(rawAppId);
			let mappedAppId = mappings[mappingKey];
			if (!mappedAppId && title) mappedAppId = findMappingForTitle(title);
			if (!mappedAppId) {
				const found = shortcuts.find(s => s.id === rawAppId || (title && normalizeTitle(s.title) === normalizeTitle(title)));
				if (found) mappedAppId = found.steamAppId;
			}
			if (mappedAppId && /^\d+$/.test(mappedAppId)) {
				const numSteamAppId = Number(mappedAppId);
				return {
					type: 'shortcut-linked',
					shortcutAppId: unsigned,
					steamAppId: numSteamAppId,
					title: title || `App ${unsigned}`,
					identity: {
						shortcutAppId: unsigned,
						steamAppId: numSteamAppId,
						executable: app?.exe,
						startDir: app?.openvr_action_manifest_path,
						launchOptions: app?.LaunchOptions,
						canonicalId: `${unsigned}:${numSteamAppId}`,
						title: title || `App ${unsigned}`,
					},
				};
			}
			return {
				type: 'shortcut-unlinked',
				shortcutAppId: unsigned,
				title: title || `App ${unsigned}`,
			};
		}
	}

	const byLongestTitle = [...shortcuts].sort((a, b) => b.title.length - a.title.length);

	// 2. Check route URL
	const href = decodeURIComponent(String(targetDoc.defaultView?.location?.href || targetDoc.location?.href || '')).toLocaleLowerCase();
	for (const shortcut of shortcuts) {
		const ids = mappedShortcutIds(shortcut);
		if (ids.some(id => new RegExp(`(?:^|[^0-9])${id.replace('-', '\\-')}(?:[^0-9]|$)`).test(href))) {
			const app = getShortcutAppById(shortcut.id);
			const unsigned = shortcut.id < 0 ? (shortcut.id >>> 0) : shortcut.id;
			const numSteamAppId = Number(shortcut.steamAppId);
			return {
				type: 'shortcut-linked',
				shortcutAppId: unsigned,
				steamAppId: numSteamAppId,
				title: shortcut.title,
				identity: {
					shortcutAppId: unsigned,
					steamAppId: numSteamAppId,
					executable: app?.exe,
					startDir: app?.openvr_action_manifest_path,
					launchOptions: app?.LaunchOptions,
					canonicalId: `${unsigned}:${numSteamAppId}`,
					title: shortcut.title,
				},
			};
		}
	}

	// 3. Match headings inside top area (< 450px from top)
	const titleHeadings = Array.from(targetDoc.querySelectorAll<HTMLElement>('h1, h2, h3, [class*="title" i], [class*="header" i], [class*="logo" i]'));
	for (const heading of titleHeadings) {
		if (heading.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel, [class*="nav" i], [class*="footer" i], [class*="QuickAccess" i], [class*="MainMenu" i]')) continue;
		const rect = heading.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || rect.top > 450) continue;
		const rawText = (heading.textContent || '').trim();
		const headingText = normalizeTitle(rawText);
		if (!headingText) continue;
		for (const shortcut of byLongestTitle) {
			const sTitle = normalizeTitle(shortcut.title);
			if (sTitle && headingText === sTitle) {
				const app = getShortcutAppById(shortcut.id);
				const unsigned = shortcut.id < 0 ? (shortcut.id >>> 0) : shortcut.id;
				const numSteamAppId = Number(shortcut.steamAppId);
				return {
					type: 'shortcut-linked',
					shortcutAppId: unsigned,
					steamAppId: numSteamAppId,
					title: shortcut.title,
					identity: {
						shortcutAppId: unsigned,
						steamAppId: numSteamAppId,
						executable: app?.exe,
						startDir: app?.openvr_action_manifest_path,
						launchOptions: app?.LaunchOptions,
						canonicalId: `${unsigned}:${numSteamAppId}`,
						title: shortcut.title,
					},
				};
			}
		}
	}

	// 4. Protect real Steam games
	if (isNativeSteamGameActive(targetDoc)) {
		return { type: 'steam' };
	}

	return { type: 'none' };
}
