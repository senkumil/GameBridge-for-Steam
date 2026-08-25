import { backendLog } from '../../api/backend';
import { normalizeTitle } from '../../core/text';
import { loc, officialSteamText, steamIntlLocale } from '../../steam/localization';
import { getMappedShortcuts, getShortcutAppById, getShortcutPlaytimeMinutes } from '../../steam/shortcuts';


function normalizedDomText(value: unknown): string {
	return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

let gdlBigPictureActive = false;
let gdlBigPictureDoc: Document | null = null;
const gdlBigPictureMappedShortcutIds = new Set<number>();
const bigPictureShortcutState = new Map<object, {
	canonicalAppType: unknown;
	installed: unknown[];
	controllerSupport: unknown;
	xboxControllerSupport: unknown;
	gamepadPreferred: unknown;
	compatPacked: unknown;
	playtimeForever: unknown;
	playtimeLastTwoWeeks: unknown;
	shortcutMethod?: Function;
	deckVerifiedMethod?: Function;
}>();

// Big Picture renders the "recently played" cards in a separate window from
// the desktop library. Steam already knows the playtime for shortcut AppIDs,
// but this view can still render its empty-state label while the shortcut's
// detail page shows the real value. Keep the bridge small and DOM-based so it
// survives Steam's React updates without replacing any native components.
const BIG_PICTURE_NO_PLAYTIME_ENGLISH = 'no playtime';

function isBigPictureNoPlaytime(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	return normalized === BIG_PICTURE_NO_PLAYTIME_ENGLISH
		|| normalized === normalizedDomText(officialSteamText('No playtime'));
}

function formatBigPicturePlaytime(minutes: number): string {
	const wholeMinutes = Math.max(0, Math.floor(minutes));
	const label = loc('AppDetails_SectionTitle_PlayTime', 'Playtime').toLocaleUpperCase(steamIntlLocale());
	if (wholeMinutes >= 60) {
		const hours = Math.floor(wholeMinutes / 60);
		const unit = officialSteamText(hours === 1 ? 'hour' : 'hours');
		return `${label}: ${hours} ${unit}`;
	}
	const unit = officialSteamText(wholeMinutes === 1 ? 'minute' : 'minutes');
	return `${label}: ${wholeMinutes} ${unit}`;
}

function applyShortcutPlaytimeToOverview(shortcutAppId: number, minutes: number): void {
	const app = getShortcutAppById(shortcutAppId);
	if (!app) return;
	const currentForever = Number(app.minutes_playtime_forever || 0);
	if (minutes !== currentForever) setBigPictureField(app, 'minutes_playtime_forever', minutes);
	// The API call above is the lifetime value. Preserve Steam's own recent
	// value when it already has one; otherwise the lifetime value is still
	// enough for Big Picture's total-playtime label.
	if (Number(app.minutes_playtime_last_two_weeks || 0) < 0) setBigPictureField(app, 'minutes_playtime_last_two_weeks', 0);
}

function findMappedTitleInScope(scope: Element, shortcuts: Array<{ id: number; title: string }>): { id: number; title: string } | null {
	const candidates = Array.from(scope.querySelectorAll('*')) as HTMLElement[];
	for (const element of candidates) {
		const text = element.childElementCount === 0 ? (element.textContent || '').replace(/\s+/g, ' ').trim() : '';
		if (!text) continue;
		const match = shortcuts.find(shortcut => normalizeTitle(shortcut.title) === normalizeTitle(text));
		if (match) return match;
	}
	return null;
}

export async function patchBigPictureHomePlaytime(doc: Document): Promise<void> {
	if (!doc.body) return;
	const shortcuts = getMappedShortcuts();
	if (shortcuts.length === 0) return;

	// Update Steam's own overview objects as well as the visible fallback text.
	// This makes the value survive React re-renders and lets native BP cards use
	// the same playtime field as the desktop library.
	await Promise.all(shortcuts.map(async (shortcut) => {
		const minutes = await getShortcutPlaytimeMinutes(shortcut.id);
		if (minutes) applyShortcutPlaytimeToOverview(shortcut.id, minutes);
	}));

	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
	const placeholders: HTMLElement[] = [];
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const element = node.parentElement as HTMLElement | null;
		if (element && isBigPictureNoPlaytime(node.textContent || '')) placeholders.push(element);
	}

	for (const placeholder of placeholders) {
		if (!placeholder.isConnected || placeholder.dataset.gdlBpPlaytime === '1') continue;
		let scope: Element | null = placeholder.parentElement;
		let match: { id: number; title: string } | null = null;
		for (let depth = 0; scope && depth < 9 && scope !== doc.body; depth++, scope = scope.parentElement) {
			match = findMappedTitleInScope(scope, shortcuts);
			if (match) break;
		}
		if (!match) continue;
		const minutes = await getShortcutPlaytimeMinutes(match.id);
		if (!minutes) continue;
		applyShortcutPlaytimeToOverview(match.id, minutes);
		placeholder.textContent = formatBigPicturePlaytime(minutes);
		placeholder.dataset.gdlBpPlaytime = '1';
		backendLog(`Big Picture playtime shown for "${match.title}": ${minutes} minutes`);
	}
}

// Big Picture normally keeps shortcuts in a separate "Non-Steam" tab and
// excludes them from All Games, Installed and controller-focused lists. Steam
// rebuilds these overview objects while navigating, so use both the store's
// map and its computed allApps list, then re-apply the presentation shim.
// The original shortcut classification is restored when Big Picture closes.
function isBigPictureShortcutObject(app: any): boolean {
	if (!app || typeof app !== 'object') return false;
	const appId = Number(app.appid);
	const appType = Number(app.app_type || 0);
	return appType === 1073741824 || appId >= 2147483648;
}

function isManagedBigPictureShortcutObject(app: any): boolean {
	if (!isBigPictureShortcutObject(app)) return false;
	const rawId = Number(app?.appid);
	const shortcutId = rawId < 0 ? (rawId >>> 0) : rawId;
	return Number.isFinite(shortcutId) && gdlBigPictureMappedShortcutIds.has(shortcutId);
}

function installBigPicturePrototypeShim(app: any): void {
	const prototype = Object.getPrototypeOf(app) as any;
	if (!prototype) return;
	installBigPictureReadonlyField(app, 'controller_support', 2);
	installBigPictureReadonlyField(app, 'xbox_controller_support', 2);
	installBigPictureReadonlyField(app, 'ps4_controller_support', 2);
	installBigPictureReadonlyField(app, 'ps5_controller_support', 2);
	installBigPictureReadonlyField(app, 'gamepad_preferred', true);
	installBigPictureReadonlyField(app, 'steam_deck_compat_category', 3);
	if (typeof prototype.BIsShortcut === 'function' && !prototype.BIsShortcut.__gdlBigPicturePrototypeWrapped) {
		const original = prototype.BIsShortcut;
		const wrapped = function (this: any): boolean {
			return gdlBigPictureActive && isManagedBigPictureShortcutObject(this) ? false : original.call(this);
		};
		(wrapped as any).__gdlBigPicturePrototypeWrapped = true;
		try { prototype.BIsShortcut = wrapped; } catch {}
	}
	if (typeof prototype.BIsSteamDeckVerified === 'function' && !prototype.BIsSteamDeckVerified.__gdlBigPicturePrototypeWrapped) {
		const original = prototype.BIsSteamDeckVerified;
		const wrapped = function (this: any): boolean {
			return gdlBigPictureActive && isManagedBigPictureShortcutObject(this) ? true : original.call(this);
		};
		(wrapped as any).__gdlBigPicturePrototypeWrapped = true;
		try { prototype.BIsSteamDeckVerified = wrapped; } catch {}
	}
}

/** Wrap getter-only AppOverview fields that Big Picture uses for the
 * controller-compatible filter. Steam changed these fields to read-only on
 * some clients, so assigning them directly no longer updates that category. */
function installBigPictureReadonlyField(app: any, key: string, forcedValue: unknown): void {
	let owner: any = app;
	for (let depth = 0; owner && depth < 5; depth++, owner = Object.getPrototypeOf(owner)) {
		const descriptor = Object.getOwnPropertyDescriptor(owner, key) as PropertyDescriptor | undefined;
		if (!descriptor) continue;
		if (!descriptor.get || descriptor.set || !descriptor.configurable) return;
		if ((descriptor.get as any).__gdlBigPictureReadonlyShim) return;
		const originalGet = descriptor.get;
		const wrappedGet = function (this: any): unknown {
			if (gdlBigPictureActive && isManagedBigPictureShortcutObject(this)) return forcedValue;
			return originalGet.call(this);
		};
		(wrappedGet as any).__gdlBigPictureReadonlyShim = true;
		try {
			Object.defineProperty(owner, key, {
				configurable: descriptor.configurable,
				enumerable: descriptor.enumerable,
				get: wrappedGet,
			});
		} catch {}
		return;
	}
}

/** Steam has changed several AppOverview fields from writable values to
 * getter-only properties. A protected field must not prevent the playtime
 * patch from reaching the rest of the Big Picture cards. */
function setBigPictureField(target: any, key: string, value: unknown): boolean {
	try {
		if (target[key] === value) return false;
		target[key] = value;
		return target[key] === value;
	} catch {
		return false;
	}
}

function hideBigPictureShortcutTab(doc: Document): void {
	const styleId = 'gdl-big-picture-hide-shortcut-tab';
	if (!doc.getElementById(styleId)) {
		const style = doc.createElement('style');
		style.id = styleId;
		style.textContent = '[data-gdl-hidden-shortcut-tab="1"]{display:none!important;}';
		(doc.head || doc.documentElement).appendChild(style);
	}
	const labels = [
		'fuera de steam', 'no de steam', 'non-steam', 'non steam', 'nicht-steam',
		'hors steam', 'fora da steam', 'fuori da steam', 'poza steam', '非steam', '非 steam',
	];
	const isShortcutTabText = (value: string, label: string): boolean => {
		const compactValue = value.replace(/\s+/g, '');
		const compactLabel = label.replace(/\s+/g, '');
		return compactValue === compactLabel || new RegExp(`^${compactLabel}\\d+$`).test(compactValue);
	};
	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
		const label = labels.find(candidate => isShortcutTabText(text, candidate));
		if (!label) continue;
		let target = node.parentElement as HTMLElement | null;
		let pill: HTMLElement | null = null;
		for (let depth = 0; target && depth < 5; depth++, target = target.parentElement) {
			const targetText = (target.textContent || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
			// The title and count are separate descendants in current Big Picture.
			// Keep the highest compact ancestor whose text is only "label + count";
			// the next parent is the complete category row and must remain visible.
			if (isShortcutTabText(targetText, label)
				&& targetText.length <= label.length + 10) pill = target;
			else if (pill) break;
		}
		if (pill) {
			pill.dataset.gdlHiddenShortcutTab = '1';
			pill.style.setProperty('display', 'none', 'important');
		}
	}
}

export function mergeShortcutsIntoBigPictureLibrary(_doc: Document): void {
	// The category strip can render before Steam exposes appStore. Hide the
	// shortcut-only tab immediately so an empty "Non-Steam 0" pill never flashes
	// or survives after a shortcut is added/removed.
	hideBigPictureShortcutTab(_doc);
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return;
	const mappedShortcuts = getMappedShortcuts();
	gdlBigPictureMappedShortcutIds.clear();
	for (const shortcut of mappedShortcuts) gdlBigPictureMappedShortcutIds.add(shortcut.id);
	if (gdlBigPictureMappedShortcutIds.size === 0) return;
	gdlBigPictureActive = true;

	const candidates: any[] = [];
	try { for (const app of appStore.m_mapApps.values()) candidates.push(app); } catch {}
	try { candidates.push(...Array.from(appStore.allApps || [])); } catch {}
	const seen = new Set<object>();
	let changed = false;

	for (const app of candidates) {
		if (!app || typeof app !== 'object' || seen.has(app)) continue;
		seen.add(app);
		const rawId = Number(app.appid);
		const shortcutId = rawId < 0 ? (rawId >>> 0) : rawId;
		if (!gdlBigPictureMappedShortcutIds.has(shortcutId)) continue;
		const isShortcut = isBigPictureShortcutObject(app) || (typeof app.BIsShortcut === 'function' && app.BIsShortcut() === true);
		if (!isShortcut) continue;
		installBigPicturePrototypeShim(app);

		let state = bigPictureShortcutState.get(app);
		if (!state) {
			const clientData = [app.local_per_client_data, app.most_available_per_client_data, app.selected_per_client_data].filter(Boolean);
			state = {
				canonicalAppType: app.canonicalAppType,
				installed: clientData.map((data: any) => data.installed),
				controllerSupport: app.controller_support,
				xboxControllerSupport: app.xbox_controller_support,
				gamepadPreferred: app.gamepad_preferred,
				compatPacked: app.steam_hw_compat_category_packed,
				playtimeForever: app.minutes_playtime_forever,
				playtimeLastTwoWeeks: app.minutes_playtime_last_two_weeks,
				shortcutMethod: typeof app.BIsShortcut === 'function' ? app.BIsShortcut : undefined,
				deckVerifiedMethod: typeof app.BIsSteamDeckVerified === 'function' ? app.BIsSteamDeckVerified : undefined,
			};
			bigPictureShortcutState.set(app, state);
		}

		if (app.canonicalAppType !== 1 && setBigPictureField(app, 'canonicalAppType', 1)) changed = true;
		if (Number(app.controller_support || 0) !== 2 && setBigPictureField(app, 'controller_support', 2)) changed = true;
		// Big Picture's controller tab is backed by the native Xbox collection,
		// which filters this field (not the generic controller_support value).
		if (Number(app.xbox_controller_support || 0) !== 2 && setBigPictureField(app, 'xbox_controller_support', 2)) changed = true;
		if (app.gamepad_preferred !== true && setBigPictureField(app, 'gamepad_preferred', true)) changed = true;
		const packed = Number(app.steam_hw_compat_category_packed || 0);
		if ((packed & 3) !== 3 && setBigPictureField(app, 'steam_hw_compat_category_packed', (packed & ~3) | 3)) changed = true;

		for (const clientData of [app.local_per_client_data, app.most_available_per_client_data, app.selected_per_client_data]) {
			if (clientData && clientData.installed !== true) {
				if (setBigPictureField(clientData, 'installed', true)) changed = true;
			}
		}

		if (state.shortcutMethod && !(app.BIsShortcut as any).__gdlBigPictureWrapped) {
			const original = state.shortcutMethod;
			const wrapped = function (this: any): boolean {
				return gdlBigPictureActive && isManagedBigPictureShortcutObject(this) ? false : original.call(this);
			};
			(wrapped as any).__gdlBigPictureWrapped = true;
			if (setBigPictureField(app, 'BIsShortcut', wrapped)) changed = true;
		}
		if (state.deckVerifiedMethod && !(app.BIsSteamDeckVerified as any).__gdlBigPictureWrapped) {
			const original = state.deckVerifiedMethod;
			const wrapped = function (this: any): boolean {
				return gdlBigPictureActive && isManagedBigPictureShortcutObject(this) ? true : original.call(this);
			};
			(wrapped as any).__gdlBigPictureWrapped = true;
			if (setBigPictureField(app, 'BIsSteamDeckVerified', wrapped)) changed = true;
		}
	}

	// Hide only the individual shortcut category. Do not traverse to a broad
	// parent: doing so can hide the entire native category row. Run it again
	// after the overview mutation because Steam may have rebuilt the tab strip.
	hideBigPictureShortcutTab(_doc);

	if (changed) {
		try { (window as any).MILLENNIUM_STEAM_FORCE_RERENDER?.(); } catch {}
	}
}

export function restoreBigPictureShortcutState(): void {
	for (const [app, state] of bigPictureShortcutState) {
		setBigPictureField(app, 'canonicalAppType', state.canonicalAppType);
		setBigPictureField(app, 'controller_support', state.controllerSupport);
		setBigPictureField(app, 'xbox_controller_support', state.xboxControllerSupport);
		setBigPictureField(app, 'gamepad_preferred', state.gamepadPreferred);
		setBigPictureField(app, 'steam_hw_compat_category_packed', state.compatPacked);
		setBigPictureField(app, 'minutes_playtime_forever', state.playtimeForever);
		setBigPictureField(app, 'minutes_playtime_last_two_weeks', state.playtimeLastTwoWeeks);
		const clientData = [(app as any).local_per_client_data, (app as any).most_available_per_client_data, (app as any).selected_per_client_data].filter(Boolean);
		clientData.forEach((data: any, index: number) => { setBigPictureField(data, 'installed', state.installed[index]); });
		if (state.shortcutMethod) setBigPictureField(app, 'BIsShortcut', state.shortcutMethod);
		if (state.deckVerifiedMethod) setBigPictureField(app, 'BIsSteamDeckVerified', state.deckVerifiedMethod);
	}
	bigPictureShortcutState.clear();
	gdlBigPictureMappedShortcutIds.clear();
}

/** Resolve the ID after SetShortcutName has completed. Prefer a newly-created
 * matching ID over the pre-rename one, but retain the old ID if Steam has not
 * refreshed appStore yet. */

export function activateBigPicture(doc: Document): void {
	gdlBigPictureActive = true;
	gdlBigPictureDoc = doc;
}

export function deactivateBigPicture(): void {
	gdlBigPictureActive = false;
	gdlBigPictureDoc = null;
	restoreBigPictureShortcutState();
}

export function getBigPictureDocument(): Document | null {
	return gdlBigPictureDoc;
}

export function isBigPictureActive(): boolean {
	return gdlBigPictureActive;
}

export async function refreshBigPicture(doc: Document | null = gdlBigPictureDoc): Promise<void> {
	if (!doc) return;
	activateBigPicture(doc);
	mergeShortcutsIntoBigPictureLibrary(doc);
	await patchBigPictureHomePlaytime(doc);
}
