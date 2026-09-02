import type {
	CommunityContentItem,
	LocalAchievementData,
	LocalAchievementItem,
	NewsItem,
	SteamCommunityItemsCatalog,
	SteamGameData,
} from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getCachedGameData, getGameData } from '../../core/game-data';
import { steamStringList } from '../../core/steam-game-data';
import { steamGameMainPageUrl } from '../../core/steam-links';
import { escapeAttr, escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText, loc, steamIntlLocale, steamLanguageSync } from '../../steam/localization';
import { findMappingForTitle } from '../../core/mappings';
import { getMappedShortcuts, getSteamAppStore, findShortcutAppIdByName, getShortcutAppById, toSignedShortcutAppId } from '../../steam/shortcuts';
import { findMappingForShortcut } from '../shortcuts/registry';
import { getCachedLocalAchievementsForGame } from '../achievements/cache';
import { fetchLocalAchievementData } from '../achievements/service';
import { compareEarnedAchievementsForDisplay, compareLockedAchievementsForDisplay, highlightedAchievementNames } from '../achievements/rarity';
import { getCachedOfficialCommunityItems, getOfficialCommunityItems } from '../library/community-items';
import {
	getCachedCommunityContent,
	getCachedNews,
	getCommunityContent,
	getNews,
	eventTypeLabel,
	isPatchNoteItem,
	newsExcerpt,
} from '../library/news';
import { type LocalActivityPost, loadLocalActivityPosts } from '../library/social/feed';
import { ensureNativePanelRoot, removeBigPictureFallbackPanel } from './panel-mount';
import { ensureBigPictureDetailsStyles } from './styles';
import { steamWebpackRuntime } from '../../steam/modules/SteamWebpackRuntime';
import { gamepadFeatureFlags } from '../gamepad/flags';
import { mountSingleNativeAchievement } from '../gamepad/achievements/SingleNativeAchievement';
import { getFocusableElements, installBigPictureGamepadNavigation } from './gamepad-nav';

type MappedShortcut = { id: number; title: string; steamAppId: string };
type BigPictureTab = 'activity' | 'stuff' | 'community' | 'info';

interface BigPictureDetailData {
	game: SteamGameData | null;
	achievements: LocalAchievementData | null;
	news: NewsItem[];
	community: CommunityContentItem[];
	cards: SteamCommunityItemsCatalog | null;
}

interface BigPictureDetailState {
	shortcut: MappedShortcut;
	language: string;
	activeTab: BigPictureTab;
	root: HTMLElement;
	panel: HTMLElement;
	data: BigPictureDetailData | null;
	generation: number;
	hydrationStarted: boolean;
	renderSignature: string;
	renderedRoot: HTMLElement | null;
}

const detailStates = new WeakMap<Document, BigPictureDetailState>();
const detailGenerations = new WeakMap<Document, number>();
const detailTabObservers = new WeakMap<Document, { strip: HTMLElement; observer: MutationObserver }>();
const detailRetryTimers = new WeakMap<Document, ReturnType<typeof setTimeout>>();
const detailRetryCounts = new WeakMap<Document, number>();
const detailTabSyncTimers = new WeakMap<Document, ReturnType<typeof setTimeout>>();

const TAB_TEXT: Record<BigPictureTab, string[]> = {
	activity: ['activity', 'actividad', 'activite', 'aktivitat', 'attivita', 'atividade'],
	stuff: ['your stuff', 'tus cosas', 'vos trucs', 'deine sachen', 'le tue cose', 'suas coisas'],
	community: ['community', 'comunidad', 'communaute', 'comunita', 'comunidade'],
	info: ['game information', 'game info', 'informacion del juego', 'informacion', 'informations sur le jeu', 'spielinformationen', 'informazioni sul gioco', 'informacoes do jogo'],
};

function normalizeUiText(value: unknown): string {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLocaleLowerCase();
}

function mappedShortcutIds(shortcut: MappedShortcut): string[] {
	const raw = shortcut.id;
	const unsigned = raw < 0 ? (raw >>> 0) : raw;
	const signed = raw > 2147483647 ? toSignedShortcutAppId(raw) : raw;
	return Array.from(new Set([String(raw), String(unsigned), String(signed)]));
}

function findActiveAppIdFromDOM(doc: Document): number | null {
	const view = doc.defaultView as any;
	const candidates: string[] = [
		String(view?.location?.hash || ''),
		String(view?.location?.pathname || ''),
		String(view?.location?.href || ''),
		String(view?.g_Router?.history?.location?.pathname || ''),
	];
	for (const url of candidates) {
		const m = url.match(/(?:\/app\/|\/details\/|\/game\/|appid=)(\d+)/i);
		if (m && m[1]) {
			const id = Number(m[1]);
			if (Number.isFinite(id) && id > 0) return id;
		}
	}

	const surfaceElements = Array.from(doc.querySelectorAll<HTMLElement>(
		'[class*="GamepadTab"], [class*="gamepadtab"], [class*="AppDetails"], [class*="GameDetails"], [role="tablist"], [class*="PlayBar"], [class*="playbar"], [class*="Header"], [class*="Hero"]'
	));
	for (const el of surfaceElements) {
		if (el.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel')) continue;
		let current: any = el;
		while (current && current !== doc && current !== doc.body) {
			const key = Object.keys(current).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactProps$'));
			if (key) {
				let fiber = current[key];
				let depth = 0;
				while (fiber && depth < 20) {
					const props = fiber.memoizedProps || fiber.props || fiber;
					const rawAppId = props?.appid ?? props?.appId ?? props?.nAppID ?? props?.app?.appid ?? props?.overview?.appid ?? props?.appOverview?.appid ?? props?.game?.appid;
					const num = Number(rawAppId);
					if (Number.isFinite(num) && num > 0) {
						return num;
					}
					fiber = fiber.return;
					depth++;
				}
			}
			current = current.parentElement;
		}
	}

	return null;
}

function isNativeSteamGameActive(doc: Document): boolean {
	const shortcuts = getMappedShortcuts();
	const shortcutIds = new Set<string>();
	for (const s of shortcuts) {
		shortcutIds.add(String(s.id));
		shortcutIds.add(String(toSignedShortcutAppId(s.id)));
		const unsigned = s.id < 0 ? (s.id >>> 0) : s.id;
		shortcutIds.add(String(unsigned));
	}

	const stores = [
		(doc.defaultView as any)?.appStore,
		getSteamAppStore(),
	].filter(Boolean);

	for (const store of stores) {
		for (const key of Object.keys(store || {})) {
			if (!/(selected|current|active|focused).*(app|game)|(?:app|game).*(selected|current|active|focused)/i.test(key)) continue;
			let value: any;
			try { value = store[key]; } catch { continue; }
			if (!value) continue;
			const rawAppId = Number(value.appid ?? value.app_id ?? value.m_unAppID ?? value.m_nAppID ?? value);
			if (Number.isFinite(rawAppId)) {
				const unsignedAppId = rawAppId < 0 ? (rawAppId >>> 0) : rawAppId;
				const signedAppId = rawAppId > 2147483647 ? toSignedShortcutAppId(rawAppId) : rawAppId;
				if (shortcutIds.has(String(rawAppId)) || shortcutIds.has(String(unsignedAppId)) || shortcutIds.has(String(signedAppId))) {
					return false;
				}
			}
			if (Number.isFinite(rawAppId) && rawAppId > 0 && rawAppId < 2147483648) {
				const isShortcut = Boolean(
					Number(value.app_type || 0) === 1073741824 ||
					(typeof value.BIsShortcut === 'function' && value.BIsShortcut()) ||
					shortcutIds.has(String(rawAppId))
				);
				if (!isShortcut) return true;
			}
		}
	}

	const href = decodeURIComponent(String(doc.defaultView?.location?.href || doc.location?.href || '')).toLocaleLowerCase();
	const appMatch = href.match(/(?:\/app\/|\/details\/|appid=|\/game\/)(\d+)/);
	if (appMatch) {
		const num = Number(appMatch[1]);
		if (num > 0 && num < 2147483648 && !shortcutIds.has(String(num))) {
			return true;
		}
	}

	return false;
}

function detectCurrentMappedShortcut(doc: Document): MappedShortcut | null {
	const shortcuts = getMappedShortcuts();
	if (!doc.body) return null;

	// 1. Authoritative AppID from DOM / React Fiber / Route
	const activeDomAppId = findActiveAppIdFromDOM(doc);
	if (activeDomAppId) {
		const unsigned = activeDomAppId < 0 ? (activeDomAppId >>> 0) : activeDomAppId;
		const signed = activeDomAppId > 2147483647 ? toSignedShortcutAppId(activeDomAppId) : activeDomAppId;
		const match = shortcuts.find(s => s.id === activeDomAppId || s.id === unsigned || s.id === signed);
		if (match) return match;

		const app = getShortcutAppById(activeDomAppId);
		const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
		const mappedAppId = findMappingForShortcut(activeDomAppId, title);
		if (mappedAppId && /^\d+$/.test(mappedAppId)) {
			return { id: unsigned, title: title || `App ${unsigned}`, steamAppId: mappedAppId };
		}
	}

	const byLongestTitle = [...shortcuts].sort((a, b) => b.title.length - a.title.length);

	// 2. A route AppID in the URL
	const href = decodeURIComponent(String(doc.defaultView?.location?.href || doc.location?.href || '')).toLocaleLowerCase();
	for (const shortcut of shortcuts) {
		const ids = mappedShortcutIds(shortcut);
		if (ids.some(id => new RegExp(`(?:^|[^0-9])${id.replace('-', '\\-')}(?:[^0-9]|$)`).test(href))) {
			return shortcut;
		}
	}

	// 3. Check visible hero logo images in the top area (< 450px from top)
	const heroLogos = Array.from(doc.querySelectorAll<HTMLElement>('img[alt], svg[aria-label]'));
	for (const el of heroLogos) {
		if (el.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel, [class*="nav" i], [class*="footer" i], [class*="avatar" i], [class*="QuickAccess" i], [class*="MainMenu" i]')) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || rect.top > 450) continue;
		const rawAlt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
		const alt = normalizeTitle(rawAlt);
		if (!alt) continue;
		for (const shortcut of byLongestTitle) {
			const sTitle = normalizeTitle(shortcut.title);
			if (sTitle && (alt === sTitle || alt.includes(sTitle) || sTitle.includes(alt))) {
				return shortcut;
			}
		}
		const mappedAppId = findMappingForTitle(rawAlt);
		if (mappedAppId) {
			const numAppId = findShortcutAppIdByName(rawAlt) || 0;
			return { id: numAppId, title: rawAlt, steamAppId: mappedAppId };
		}
	}

	// 4. Match headings inside the top area (< 450px from top)
	const titleHeadings = Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3, [class*="title" i], [class*="header" i], [class*="logo" i]'));
	for (const heading of titleHeadings) {
		if (heading.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel, [class*="nav" i], [class*="footer" i], [class*="QuickAccess" i], [class*="MainMenu" i]')) continue;
		const rect = heading.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || rect.top > 450) continue;
		const rawText = (heading.textContent || '').trim();
		const headingText = normalizeTitle(rawText);
		if (!headingText) continue;
		for (const shortcut of byLongestTitle) {
			const sTitle = normalizeTitle(shortcut.title);
			if (sTitle && (headingText === sTitle || headingText.includes(sTitle) || sTitle.includes(headingText))) {
				return shortcut;
			}
		}
		const mappedAppId = findMappingForTitle(rawText);
		if (mappedAppId) {
			const numAppId = findShortcutAppIdByName(rawText) || 0;
			return { id: numAppId, title: rawText, steamAppId: mappedAppId };
		}
	}

	// 5. Check AppIDs inside the active detail/hero surface.
	for (const shortcut of shortcuts) {
		const ids = mappedShortcutIds(shortcut);
		for (const id of ids) {
			if (doc.querySelector(`[data-appid="${id}"], [data-app-id="${id}"], [data-app-id-value="${id}"]`)) {
				return shortcut;
			}
		}
	}

	// 6. Protect real Steam games.
	if (isNativeSteamGameActive(doc)) return null;

	return null;
}

function tabAliases(tab: BigPictureTab): string[] {
	const dynamic = tab === 'activity'
		? [loc('AppDetails_SectionTitle_Activity', 'Activity')]
		: tab === 'info'
			? [loc('AppDetails_GameInfo', 'Game information')]
			: [];
	return [...dynamic, ...TAB_TEXT[tab]].map(normalizeUiText).filter(Boolean);
}

function findTabTextElement(doc: Document, tab: BigPictureTab): HTMLElement | null {
	const aliases = tabAliases(tab);
	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		const text = normalizeUiText(node.textContent || '');
		if (!aliases.includes(text) || !node.parentElement) continue;
		const el = node.parentElement;
		if (el.closest('#gdl-bp-detail-root')) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width > 0 && rect.height > 0) return el;
	}
	return null;
}

function clickableTabElement(element: HTMLElement): HTMLElement {
	let current: HTMLElement | null = element;
	for (let depth = 0; current && depth < 5; depth++, current = current.parentElement) {
		if (current.matches('button,[role="button"],[tabindex]')) return current;
	}
	return element;
}

function commonAncestor(elements: HTMLElement[]): HTMLElement | null {
	if (elements.length === 0) return null;
	let current: HTMLElement | null = elements[0];
	while (current) {
		if (elements.every(element => current === element || current!.contains(element))) return current;
		current = current.parentElement;
	}
	return null;
}

function findBigPictureTabStrip(doc: Document): { strip: HTMLElement; controls: Map<BigPictureTab, HTMLElement> } | null {
	const controls = new Map<BigPictureTab, HTMLElement>();
	for (const tab of ['activity', 'stuff', 'community', 'info'] as BigPictureTab[]) {
		const text = findTabTextElement(doc, tab);
		if (text) {
			controls.set(tab, clickableTabElement(text));
		}
	}
	if (controls.size < 2) return null;
	const values = Array.from(controls.values());
	let strip = commonAncestor(values);
	if (!strip || strip === doc.body) {
		strip = (controls.get('activity') || values[0])?.parentElement;
	}
	if (!strip || strip === doc.body) return null;
	while (strip.parentElement && strip.parentElement !== doc.body) {
		const rect = strip.getBoundingClientRect();
		if (rect.width >= 200 && rect.height > 20 && rect.height <= 150) break;
		const parent = strip.parentElement;
		if (!values.every(value => parent.contains(value))) break;
		strip = parent;
	}
	return { strip, controls };
}

function activeTabFromNative(doc: Document, controls: Map<BigPictureTab, HTMLElement>): BigPictureTab | null {
	let best: { tab: BigPictureTab; score: number } | null = null;
	for (const [tab, el] of controls) {
		let score = 0;
		if (el.getAttribute('aria-selected') === 'true') score += 100;
		if (el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-current') === 'true') score += 90;
		if (el.classList.contains('active') || el.classList.contains('Selected') || el.classList.contains('focus')) score += 50;
		if (doc.activeElement && (doc.activeElement === el || el.contains(doc.activeElement))) score += 40;
		const focusedChild = el.querySelector(':focus');
		if (focusedChild) score += 30;
		const panelId = el.getAttribute('aria-controls');
		if (panelId) {
			const panel = doc.getElementById(panelId);
			if (panel && !panel.hasAttribute('hidden') && panel.getAttribute('aria-hidden') !== 'true') score += 80;
		}
		if (score > (best?.score || 0)) best = { tab, score };
	}
	return best && best.score > 0 ? best.tab : null;
}

function nextDetailGeneration(doc: Document): number {
	const next = (detailGenerations.get(doc) || 0) + 1;
	detailGenerations.set(doc, next);
	return next;
}

function isLiveDetailState(doc: Document, state: BigPictureDetailState): boolean {
	const live = detailStates.get(doc);
	if (!live || live !== state) return false;
	if (!state.root.isConnected || !state.panel.isConnected) return false;
	return live === state
		&& live.generation === state.generation
		&& live.shortcut.id === state.shortcut.id
		&& live.shortcut.steamAppId === state.shortcut.steamAppId
		&& live.language === state.language
		&& live.root.dataset.gdlSteamAppId === state.shortcut.steamAppId
		&& live.root.dataset.gdlShortcutAppId === String(state.shortcut.id);
}

function cachedBigPictureDetailData(shortcut: MappedShortcut, language: string): BigPictureDetailData {
	return {
		game: getCachedGameData(shortcut.steamAppId, language)?.data || null,
		achievements: getCachedLocalAchievementsForGame(shortcut.steamAppId, String(shortcut.id)),
		news: getCachedNews(shortcut.steamAppId, language)?.data || [],
		community: getCachedCommunityContent(shortcut.steamAppId, language)?.data || [],
		cards: getCachedOfficialCommunityItems(shortcut.steamAppId, language)?.data || null,
	};
}

function applyDetailPatch(doc: Document, state: BigPictureDetailState,
	patch: Partial<BigPictureDetailData>): void {
	if (!isLiveDetailState(doc, state)) return;
	state.data = { ...(state.data || cachedBigPictureDetailData(state.shortcut, state.language)), ...patch };
	renderRoot(state);
}

function startDetailHydration(doc: Document, state: BigPictureDetailState): void {
	if (state.hydrationStarted) return;
	state.hydrationStarted = true;
	const applyResource = <K extends keyof BigPictureDetailData>(key: K,
		request: Promise<BigPictureDetailData[K]>): void => {
		void request.then(value => {
			if (!isLiveDetailState(doc, state)) return;
			if (value == null && state.data?.[key] != null) return;
			applyDetailPatch(doc, state, { [key]: value } as Pick<BigPictureDetailData, K>);
		}).catch(() => {});
	};

	applyResource('game', getGameData(state.shortcut.steamAppId, state.language).then(game => {
		backendLog(`Big Picture linked core populated for "${state.shortcut.title}" (${state.shortcut.steamAppId})`);
		return game || state.data?.game || null;
	}));
	applyResource('achievements', fetchLocalAchievementData(state.shortcut.steamAppId, {
		stateAppId: String(state.shortcut.id),
		maxAgeMs: 5000,
	}));
	applyResource('news', getNews(state.shortcut.steamAppId, state.language));
	applyResource('community', getCommunityContent(state.shortcut.steamAppId, state.language));
	applyResource('cards', getOfficialCommunityItems(doc, state.shortcut.steamAppId, state.language));
}

function wrenchToolSvg(): string {
	return `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" style="display:block;color:#8f98a0;flex-shrink:0;"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M14.6 4.2a8.5 8.5 0 0 0-7.2 12.3l-5 5a2.5 2.5 0 0 0 0 3.5l3.5 3.5a2.5 2.5 0 0 0 3.5 0l5-5a8.5 8.5 0 0 0 12.3-7.2c0-1.4-.3-2.7-.9-3.8l-4.5 4.5-3.2-.8-.8-3.2 4.5-4.5a8.4 8.4 0 0 0-7.7-4.3Zm18.8 18.8a8.5 8.5 0 0 0-3.8.9l4.5 4.5-.8 3.2-3.2.8-4.5-4.5a8.5 8.5 0 0 0-7.2 12.3l-5 5a2.5 2.5 0 0 0 0 3.5l3.5 3.5a2.5 2.5 0 0 0 3.5 0l5-5a8.5 8.5 0 0 0 12.3-7.2 8.4 8.4 0 0 0-4.3-7.7Z"/></svg>`;
}

function completionMedalSvg(): string {
	return `<svg width="40" height="40" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;"><path stroke="url(#gdl-bp-medal-grad)" fill="url(#gdl-bp-medal-grad)" d="M10.18 10.03L10.39 9.81V5.53H14.6l.22-.22L18 2.07l3.18 3.24.22.22h4.21v4.28l.21.22 2.74 2.78-2.74 2.78-.21.22v4.28h-4.21l-.22.22L18 23.54l-3.18-3.23-.22-.23H10.39v-4.28l-.21-.22-2.74-2.78 2.74-2.8zM14.74 28.03L11.56 33.42 9.85 29.95l-.2-.42H6.29l2.39-4.17h3.43l2.63 2.67zm12.08 1.5l-.2-.42-1.71 3.48-3.18-5.39 2.63-2.67h3.43l2.39 4.17h-3.36z" stroke-width="1.5"/><circle stroke="#FFAB2C" fill="#FFC82C" cx="18" cy="13" r="5.5"/><defs><linearGradient id="gdl-bp-medal-grad" x1="7.08" y1="3.72" x2="33.67" y2="25.07" gradientUnits="userSpaceOnUse"><stop stop-color="#0056D6"/><stop offset="1" stop-color="#1A9FFF"/></linearGradient></defs></svg>`;
}

function featureSvg(kind: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'): string {
	switch (kind) {
		case 'person': return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
		case 'achievement': return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>';
		case 'cloud': return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>';
		case 'family': return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
		case 'controller': default: return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H8v-2H6v-1h2v-2h1v2h2v1zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>';
	}
}

function formatBigPictureFeedDate(ts: number): string {
	if (!ts || ts <= 0) return gdlText('recent', 'Recent').toUpperCase();
	const d = new Date(ts * 1000);
	const now = new Date();
	if (d.toDateString() === now.toDateString()) return gdlText('today', 'Today').toUpperCase();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) return gdlText('yesterday', 'Yesterday').toUpperCase();
	const isCurrentYear = d.getFullYear() === now.getFullYear();
	try {
		const formatted = new Intl.DateTimeFormat(steamIntlLocale(), isCurrentYear
			? { day: 'numeric', month: 'long' }
			: { day: 'numeric', month: 'short', year: 'numeric' }
		).format(d);
		return formatted.replace(/\./g, '').trim().toUpperCase();
	} catch {
		return d.toLocaleDateString(steamIntlLocale()).toUpperCase();
	}
}

type BigPictureFeedItem =
	| { type: 'post'; post: LocalActivityPost; date: number }
	| { type: 'news'; item: NewsItem; date: number };

function renderActivity(data: BigPictureDetailData, shortcut: MappedShortcut, hydrationStarted = false): string {
	const localPosts = loadLocalActivityPosts(shortcut.steamAppId, String(shortcut.id));
	const sortedNews = (Array.isArray(data.news) ? [...data.news] : [])
		.filter(item => item && item.title && Number(item.date || 0) > 0)
		.sort((a, b) => Number(b.date || 0) - Number(a.date || 0));

	const allItems: BigPictureFeedItem[] = [
		...localPosts.map(p => ({ type: 'post' as const, post: p, date: p.timestamp })),
		...sortedNews.slice(0, 16).map(item => ({ type: 'news' as const, item, date: Number(item.date || 0) })),
	].sort((a, b) => b.date - a.date);

	if (allItems.length === 0) {
		if (!hydrationStarted) return `<div class="gdl-bp-loading">${escapeHtml(loc('Loading', 'Loading…'))}</div>`;
		return `<div class="gdl-bp-empty">${escapeHtml(loc('AppActivity_NoActivity', gdlText('no_recent_activity', 'No recent activity.')))}</div>`;
	}

	const groups: { dateLabel: string; items: BigPictureFeedItem[] }[] = [];
	const map = new Map<string, BigPictureFeedItem[]>();
	for (const entry of allItems) {
		const label = formatBigPictureFeedDate(entry.date);
		if (!map.has(label)) {
			map.set(label, []);
			groups.push({ dateLabel: label, items: map.get(label)! });
		}
		map.get(label)!.push(entry);
	}

	let feedHtml = '';
	for (const group of groups) {
		feedHtml += `<div class="gdl-bp-feed-group">
			<div class="gdl-bp-date-heading">${escapeHtml(group.dateLabel)}</div>
			<div class="gdl-bp-feed-list">`;
		for (const entry of group.items) {
			if (entry.type === 'post') {
				const p = entry.post;
				feedHtml += `
					<div class="gdl-bp-feed-card Focusable" tabindex="0" role="button" data-focusable="true">
						<div class="gdl-bp-feed-icon-wrap"><img class="gdl-bp-feed-avatar" src="${escapeAttr(p.user_avatar)}" alt="" /></div>
						<div class="gdl-bp-feed-body">
							<div class="gdl-bp-feed-eyebrow">${escapeHtml(gdlText('user_status', 'Status Post').toUpperCase())}</div>
							<div class="gdl-bp-feed-title">${escapeHtml(p.user_name)}</div>
							<div class="gdl-bp-feed-desc">${escapeHtml(p.text)}</div>
						</div>
					</div>`;
			} else {
				const item = entry.item;
				const eventType = Number(item.event_type || 0);
				const isPatch = eventType === 0 && isPatchNoteItem(item);
				const label = eventType > 0
					? eventTypeLabel(eventType)
					: (isPatch ? loc('AppActivity_MinorUpdate', 'ACTUALIZACIÓN MENOR / NOTAS DE PARCHE') : (item.feedlabel || gdlText('feed_news', 'NOTICIAS')));
				const preview = newsExcerpt(item.contents || '', 220);
				const thumbUrl = item.image || data.game?.header_image || data.game?.background || data.game?.background_raw || '';
				const comments = Number((item as any).commentcount || (item as any).comments || 0);
				const upvotes = Number((item as any).upvotes || (item as any).votes || 0);
				const statsHtml = (comments > 0 || upvotes > 0)
					? `<div class="gdl-bp-feed-meta">${comments > 0 ? `<span>${comments.toLocaleString(steamIntlLocale())} 💬</span>` : ''}${upvotes > 0 ? `<span>${upvotes.toLocaleString(steamIntlLocale())} 👍</span>` : ''}</div>`
					: '';

				feedHtml += `
					<a class="gdl-bp-feed-card Focusable" href="${escapeAttr(item.url || '#')}" ${item.url ? 'data-gdl-bp-external="1"' : ''} tabindex="0" role="button" data-focusable="true">
						${thumbUrl
							? `<div class="gdl-bp-feed-thumb-wrap"><img class="gdl-bp-feed-thumb" src="${escapeAttr(thumbUrl)}" alt="" loading="lazy" /></div>`
							: `<div class="gdl-bp-feed-icon-wrap">${wrenchToolSvg()}</div>`
						}
						<div class="gdl-bp-feed-body">
							<div class="gdl-bp-feed-eyebrow">${escapeHtml(label.toUpperCase())}</div>
							<div class="gdl-bp-feed-title">${escapeHtml(item.title)}</div>
							${preview ? `<div class="gdl-bp-feed-desc">${escapeHtml(preview)}</div>` : ''}
							${statsHtml}
						</div>
					</a>`;
			}
		}
		feedHtml += '</div></div>';
	}

	return `<div class="gdl-bp-activity-feed">${feedHtml}</div>`;
}

function renderAchievements(data: LocalAchievementData | null): string {
	const title = escapeHtml(loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')));
	if (!data) return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(loc('Loading', 'Loading…'))}</div></section>`;
	if (data.total <= 0) return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(gdlText('no_achievements', 'No achievements found.'))}</div></section>`;
	const pct = Math.max(0, Math.min(100, Math.round((data.unlocked * 100) / Math.max(1, data.total))));
	const complete = data.unlocked >= data.total;
	const earned = data.achievements.filter(item => item.earned).sort(compareEarnedAchievementsForDisplay);
	const locked = data.achievements.filter(item => !item.earned).sort(compareLockedAchievementsForDisplay);
	const ordered = [...earned, ...locked];
	const featured = ordered[0] || null;
	const strip = ordered.filter(item => item !== featured).slice(0, 9);
	const highlightedNames = highlightedAchievementNames(earned);
	const isHighlighted = (item: LocalAchievementItem): boolean => item.earned && highlightedNames.has(String(item.name));
	const progressLabel = complete
		? gdlText('all_achievements_unlocked', 'You have unlocked all achievements! {unlocked}/{total}', { unlocked: data.unlocked, total: data.total })
		: loc('AppDetails_PlayerUnlockedPercent', 'You have unlocked %1$s/%2$s').replace('%1$s', String(data.unlocked)).replace('%2$s', String(data.total));
	return `<section class="gdl-bp-section">
		<h2 class="gdl-bp-section-title">${title}</h2>
		<div class="gdl-bp-achievements-shell">
			<div class="gdl-bp-ach-progress">
				${complete ? `<div class="gdl-bp-medal">${completionMedalSvg()}</div>` : '<div></div>'}
				<div class="gdl-bp-ach-progress-copy"><div class="gdl-bp-ach-progress-label"><strong>${escapeHtml(progressLabel)}</strong> <span>(${pct}%)</span></div><div class="gdl-bp-progress-track"><div class="gdl-bp-progress-fill" style="width:${pct}%"></div></div></div>
			</div>
			<div class="gdl-bp-ach-strip">
				${featured ? `<div class="gdl-bp-ach-featured Focusable${isHighlighted(featured) ? ' is-rare' : ''}" tabindex="0" role="button" data-focusable="true"><div class="gdl-bp-ach-img-frame${isHighlighted(featured) ? ' is-rare' : ''}"><div class="gdl-bp-ach-rare-glow"></div><div class="gdl-bp-ach-rare-ring"></div><div class="gdl-bp-ach-rare-beam"></div><img class="gdl-bp-ach-img" src="${escapeAttr(featured.earned ? featured.icon : (featured.icon_gray || featured.icon))}" alt=""></div><div><strong>${escapeHtml(featured.display_name || featured.name)}</strong><p>${escapeHtml(featured.description || '')}</p><p>${Number(featured.global_percent || 0).toFixed(1)}% ${escapeHtml(gdlText('players_have_achievement', 'of players have this achievement'))}</p></div></div>` : '<div></div>'}
				<div id="gdl-bp-native-achievement-mount" class="gdl-bp-native-achievement-mount"></div>
				<div class="gdl-bp-ach-icons">${strip.map(item => `<div class="gdl-bp-ach-icon-frame Focusable${isHighlighted(item) ? ' is-rare' : ''}" tabindex="0" role="button" data-focusable="true" title="${escapeAttr(item.display_name || item.name)}"><div class="gdl-bp-ach-rare-glow"></div><div class="gdl-bp-ach-rare-ring"></div><div class="gdl-bp-ach-rare-beam"></div><img class="gdl-bp-ach-icon${!item.earned ? ' is-locked' : ''}" src="${escapeAttr(item.earned ? item.icon : (item.icon_gray || item.icon))}" alt=""></div>`).join('')}</div>
			</div>
		</div>
	</section>`;
}

function renderCards(catalog: SteamCommunityItemsCatalog | null): string {
	if (!catalog?.cards?.length) return '';
	const badge = catalog.foil_badge || catalog.badges?.[0] || null;
	return `<section class="gdl-bp-section">
		<h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Trading Cards')))}</h2>
		<div class="gdl-bp-cards-shell">
			<div class="gdl-bp-badge-row">${badge?.image ? `<img class="gdl-bp-badge-img" src="${escapeAttr(badge.image)}" alt="">` : '<div class="gdl-bp-badge-img"></div>'}<div class="gdl-bp-badge-copy">${escapeHtml(badge?.title || gdlText('trading_cards', 'Trading Cards'))}<br>${escapeHtml(String((badge?.level || 0) * 100 || 100))} EXP</div></div>
			<div class="gdl-bp-card-count">${catalog.cards.length} ${escapeHtml(loc('AppDetails_CardsToCollect', 'cards to collect'))}</div>
			<div class="gdl-bp-card-row">${catalog.cards.slice(0, 10).map(card => `<img src="${escapeAttr(card.image)}" title="${escapeAttr(card.title || '')}" alt="">`).join('')}</div>
		</div>
	</section>`;
}

function renderMediaAndNotes(): string {
	return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Media', 'Media'))}</h2><div class="gdl-bp-media-box"><div class="gdl-bp-media-copy">${escapeHtml(loc('AppDetails_ScreenshotHint_Gamepad', 'You can take a screenshot while playing from the Steam overlay.'))}</div><button class="gdl-bp-action-button Focusable" type="button" tabindex="0" data-focusable="true">${escapeHtml(loc('AppDetails_GoToMediaLibrary', 'Go to my media library'))}</button></div></section>
	<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_GameNotes', 'Notes'))}</h2><div class="gdl-bp-notes-box"><button class="gdl-bp-action-button Focusable" type="button" tabindex="0" data-focusable="true">✎ ${escapeHtml(loc('AppDetails_CreateNewNote', 'New note'))}</button></div></section>`;
}

function renderStuff(data: BigPictureDetailData): string {
	return `${renderAchievements(data.achievements)}${renderCards(data.cards)}${renderMediaAndNotes()}`;
}

function fallbackCommunity(data: BigPictureDetailData): CommunityContentItem[] {
	if (data.community.length) return data.community;
	return (data.game?.screenshots || []).slice(0, 8).map((shot, index) => ({
		type: 'screenshot',
		label: loc('AppDetails_Community_Screenshot', 'Screenshot'),
		image: shot.path_full || shot.path_thumbnail,
		title: data.game?.name || `Screenshot ${index + 1}`,
	}));
}

function renderCommunity(data: BigPictureDetailData): string {
	const items = fallbackCommunity(data).filter(item => item.image).slice(0, 12);
	if (items.length === 0) return `<div class="gdl-bp-empty">${escapeHtml(loc('AppDetails_Community_NoContent', 'No community content is available.'))}</div>`;
	return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Community Content')))}</h2><div class="gdl-bp-community-grid">${items.map(item => `<a class="gdl-bp-community-card Focusable" href="${escapeAttr(item.link || '#')}" ${item.link ? 'data-gdl-bp-external="1"' : ''} tabindex="0" role="button" data-focusable="true"><img class="gdl-bp-community-media" src="${escapeAttr(item.image)}" alt=""><div class="gdl-bp-community-title">${escapeHtml(item.title || item.label || '')}</div><div class="gdl-bp-community-author">${item.author_avatar ? `<img src="${escapeAttr(item.author_avatar)}" alt="">` : ''}<span>${escapeHtml(item.author_name || item.label || '')}</span></div></a>`).join('')}</div></section>`;
}

function hasCategory(game: SteamGameData | null, id: number): boolean {
	return Boolean(Array.isArray(game?.categories) && game.categories.some(category => Number(category.id) === id));
}

function renderInfo(data: BigPictureDetailData, shortcut: MappedShortcut): string {
	const game = data.game;
	if (!game) return `<div class="gdl-bp-empty">${escapeHtml(loc('AppDetails_GameInfo', 'Game information'))}</div>`;
	const developer = steamStringList(game.developers).join(', ');
	const publisher = steamStringList(game.publishers).join(', ');
	const franchise = steamStringList(game.franchises).join(', ');
	const release = game.release_date?.date || '';
	const portrait = game.capsule_image || game.capsule_imagev5 || game.header_image || '';
	const features: Array<{ icon: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'; label: string }> = [];
	if (hasCategory(game, 2) || !hasCategory(game, 1)) features.push({ icon: 'person', label: loc('AppDetails_Feature_SinglePlayer', gdlText('single_player', 'Single-player')) });
	if ((data.achievements?.total || game.achievements?.total || 0) > 0) features.push({ icon: 'achievement', label: loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')) });
	features.push({ icon: 'cloud', label: loc('AppDetails_Feature_SteamCloud', gdlText('cloud_saves', 'Cloud saves')) });
	features.push({ icon: 'family', label: loc('AppDetails_Feature_FamilySharing', gdlText('family_sharing', 'Family Sharing')) });
	features.push({ icon: 'controller', label: loc('AppDetails_Feature_FullController', gdlText('full_controller', 'Full controller support')) });
	const links = [
		[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), steamGameMainPageUrl(shortcut.steamAppId, game.is_delisted === true)],
		[loc('AppDetails_Links_DLC', gdlText('dlc_links', 'DLC')), `https://store.steampowered.com/dlc/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_PointsShop', gdlText('points_shop', 'Points Shop')), `https://store.steampowered.com/points/shop/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${shortcut.steamAppId}/discussions/`],
		[loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${shortcut.steamAppId}/guides/`],
		[loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${shortcut.steamAppId}`],
	];
	return `<section class="gdl-bp-section"><div class="gdl-bp-info-grid"><img class="gdl-bp-info-portrait" src="${escapeAttr(portrait)}" alt=""><div><div class="gdl-bp-info-description">${escapeHtml(game.short_description || '')}</div><div class="gdl-bp-info-meta">${developer ? `${escapeHtml(loc('AppDetails_Developer', gdlText('developer', 'Developer')))}: <strong>${escapeHtml(developer)}</strong><br>` : ''}${publisher ? `${escapeHtml(loc('AppDetails_Publisher', gdlText('publisher', 'Publisher')))}: <strong>${escapeHtml(publisher)}</strong><br>` : ''}${franchise ? `${escapeHtml(loc('AppDetails_Franchise', gdlText('franchise', 'Franchise')))}: <strong>${escapeHtml(franchise)}</strong><br>` : ''}${release ? `<br>${escapeHtml(loc('AppDetails_ReleaseDate', gdlText('release_date', 'Release date')))}: <strong>${escapeHtml(release)}</strong>` : ''}</div></div><div>${features.map(feature => `<div class="gdl-bp-feature">${featureSvg(feature.icon)}<span>${escapeHtml(feature.label)}</span></div>`).join('')}</div></div><div class="gdl-bp-info-links">${links.map(([label, url]) => `<a class="gdl-bp-info-link Focusable" href="${escapeAttr(url)}" data-gdl-bp-external="1" tabindex="0" role="button" data-focusable="true">${escapeHtml(label)}</a>`).join('')}</div></section>`;
}

function markupSignature(tab: BigPictureTab, markup: string): string {
	let hash = 2166136261;
	for (let index = 0; index < markup.length; index += 1) {
		hash ^= markup.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `${tab}:${markup.length}:${(hash >>> 0).toString(16)}`;
}

function renderRoot(state: BigPictureDetailState): void {
	const root = state.root;
	try { steamWebpackRuntime.captureRuntime(root.ownerDocument); } catch {}
	let markup = '<div class="gdl-bp-loading">Steam</div>';
	if (state.data) {
		switch (state.activeTab) {
			case 'activity': markup = renderActivity(state.data, state.shortcut, state.hydrationStarted); break;
			case 'stuff': markup = renderStuff(state.data); break;
			case 'community': markup = renderCommunity(state.data); break;
			case 'info': markup = renderInfo(state.data, state.shortcut); break;
		}
	}
	const signature = markupSignature(state.activeTab, markup);
	if (state.renderedRoot === root && state.renderSignature === signature && root.children.length > 0) return;
	root.innerHTML = markup;
	state.renderedRoot = root;
	state.renderSignature = signature;
	if (state.activeTab === 'stuff' && state.data?.achievements?.achievements?.length && gamepadFeatureFlags.gamepadNativeAchievements) {
		const nativeMount = root.querySelector<HTMLElement>('#gdl-bp-native-achievement-mount');
		const featured = state.data.achievements.achievements[0];
		if (nativeMount && featured) {
			try { mountSingleNativeAchievement(nativeMount, featured); } catch {}
		}
	}
	for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-gdl-bp-external="1"]'))) {
		link.addEventListener('click', event => {
			const href = link.href;
			if (!href || href.endsWith('#')) return;
			event.preventDefault();
			try { (docWindow(root.ownerDocument) as any)?.SteamClient?.System?.OpenInSystemBrowser?.(href); }
			catch { try { root.ownerDocument.defaultView?.open(href, '_blank'); } catch {} }
		});
	}
}

function docWindow(doc: Document): Window | null {
	return doc.defaultView;
}

function scheduleDetailRetry(doc: Document): void {
	if (detailRetryTimers.has(doc)) return;
	const attempt = (detailRetryCounts.get(doc) || 0) + 1;
	if (attempt > 30) return;
	detailRetryCounts.set(doc, attempt);
	const timer = setTimeout(() => {
		detailRetryTimers.delete(doc);
		if (doc.body?.isConnected) void refreshBigPictureShortcutDetails(doc);
	}, Math.min(80 * attempt, 360));
	detailRetryTimers.set(doc, timer);
}

function scheduleTabSync(doc: Document, preferredTab?: BigPictureTab): void {
	const live = detailStates.get(doc);
	if (live && preferredTab) live.activeTab = preferredTab;
	const pending = detailTabSyncTimers.get(doc);
	if (pending) clearTimeout(pending);
	const timer = setTimeout(() => {
		detailTabSyncTimers.delete(doc);
		if (doc.body?.isConnected) void refreshBigPictureShortcutDetails(doc);
	}, 0);
	detailTabSyncTimers.set(doc, timer);
}

function bindTabs(
	doc: Document,
	strip: HTMLElement,
	controls: Map<BigPictureTab, HTMLElement>,
): void {
	for (const [tab, control] of controls) {
		control.dataset.gdlBpTab = tab;
		if (control.dataset.gdlBpBound === '1') continue;
		control.dataset.gdlBpBound = '1';
		control.addEventListener('click', () => scheduleTabSync(doc, tab));
		control.addEventListener('focusin', () => scheduleTabSync(doc, tab));
		control.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				scheduleTabSync(doc, tab);
			} else if (event.key === 'ArrowDown' || event.key === 'Down') {
				const root = doc.getElementById('gdl-bp-detail-root');
				if (root) {
					const first = getFocusableElements(root)[0];
					if (first) {
						event.preventDefault();
						event.stopPropagation();
						first.focus();
						first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					}
				}
			}
		});
	}
	const current = detailTabObservers.get(doc);
	if (current?.strip === strip) return;
	current?.observer.disconnect();
	const observer = new MutationObserver(() => scheduleTabSync(doc));
	observer.observe(strip, {
		attributes: true,
		childList: true,
		subtree: true,
		attributeFilter: ['aria-selected', 'aria-current', 'tabindex', 'class'],
	});
	detailTabObservers.set(doc, { strip, observer });
}

function retireLegacyDetailShell(doc: Document): void {
	const placeholder = doc.getElementById('gdl-bp-native-strip-placeholder') as HTMLElement | null;
	const shell = doc.getElementById('gdl-bp-detail-shell') as HTMLElement | null;
	if (shell && placeholder && placeholder.parentElement) {
		placeholder.parentElement.insertBefore(shell, placeholder);
		placeholder.remove();
	}
	for (const stale of Array.from(doc.querySelectorAll('#gdl-bp-detail-shell, #gdl-bp-native-strip-placeholder'))) {
		stale.remove();
	}
}

function removeBigPictureDetailsNodes(doc: Document): void {
	const live = detailStates.get(doc);
	if (live) {
		live.renderedRoot = null;
		live.renderSignature = '';
		detailStates.delete(doc);
	}
	nextDetailGeneration(doc);
	for (const el of Array.from(doc.querySelectorAll('#gdl-bp-detail-root, .gdl-bp-detail-panel, #gdl-bp-detail-shell, #gdl-bp-native-strip-placeholder'))) {
		el.remove();
	}
	removeBigPictureFallbackPanel(doc);
}

export async function refreshBigPictureShortcutDetails(doc: Document): Promise<void> {
	if (!doc.body) return;
	// Safety check: Abort if called on a Desktop window
	if (doc.title?.includes('SP Desktop') || doc.body.classList.contains('DesktopUI') || doc.querySelector('.DesktopUI')) {
		removeBigPictureDetailsNodes(doc);
		return;
	}
	if (doc.getElementById('gdl-bp-detail-shell')) retireLegacyDetailShell(doc);
	const shortcut = detectCurrentMappedShortcut(doc);
	if (!shortcut) {
		backendLog('Big Picture details: no mapped shortcut detected for current view');
		removeBigPictureDetailsNodes(doc);
		return;
	}
	backendLog(`Big Picture details: mapped shortcut detected "${shortcut.title}" (id=${shortcut.id}, steamAppId=${shortcut.steamAppId})`);
	const language = String(steamLanguageSync() || 'english').toLowerCase();
	let state = detailStates.get(doc);
	const changedShortcut = !state
		|| state.shortcut.id !== shortcut.id
		|| state.shortcut.steamAppId !== shortcut.steamAppId
		|| state.language !== language;
	if (changedShortcut && state) {
		removeBigPictureDetailsNodes(doc);
		state = undefined;
	}
	const coldCached = state ? null : cachedBigPictureDetailData(shortcut, language);
	const tabs = findBigPictureTabStrip(doc);
	if (!tabs) {
		backendLog('Big Picture details: tab strip not found in DOM, scheduling retry');
		scheduleDetailRetry(doc);
		return;
	}
	backendLog(`Big Picture details: tab strip found with tabs: ${Array.from(tabs.controls.keys()).join(', ')}`);
	ensureBigPictureDetailsStyles(doc);
	const nativeTab = activeTabFromNative(doc, tabs.controls) || state?.activeTab || 'activity';
	const nodes = ensureNativePanelRoot(doc, tabs, nativeTab);
	if (!nodes) {
		backendLog('Big Picture details: ensureNativePanelRoot failed to mount, scheduling retry');
		scheduleDetailRetry(doc);
		return;
	}
	backendLog(`Big Picture details: panel mounted in <${nodes.panel.tagName.toLowerCase()}> with root #${nodes.root.id}`);
	detailRetryCounts.delete(doc);
	nodes.root.dataset.gdlSteamAppId = shortcut.steamAppId;
	nodes.root.dataset.gdlShortcutAppId = String(shortcut.id);

	if (!state || changedShortcut || state.root !== nodes.root || state.panel !== nodes.panel) {
		const generation = nextDetailGeneration(doc);
		const cached = coldCached || cachedBigPictureDetailData(shortcut, language);
		state = {
			shortcut,
			language,
			activeTab: nativeTab,
			root: nodes.root,
			panel: nodes.panel,
			data: cached,
			generation,
			hydrationStarted: false,
			renderSignature: '',
			renderedRoot: null,
		};
		detailStates.set(doc, state);
		renderRoot(state);
		startDetailHydration(doc, state);
	} else {
		state.activeTab = nativeTab;
		renderRoot(state);
	}

	bindTabs(doc, tabs.strip, tabs.controls);
	installBigPictureGamepadNavigation(doc, nodes.root, tabs.strip, tabs.controls);
}

export function disposeBigPictureShortcutDetails(doc: Document | null): void {
	if (!doc) return;
	const retryTimer = detailRetryTimers.get(doc);
	if (retryTimer) {
		clearTimeout(retryTimer);
		detailRetryTimers.delete(doc);
	}
	const tabSyncTimer = detailTabSyncTimers.get(doc);
	if (tabSyncTimer) {
		clearTimeout(tabSyncTimer);
		detailTabSyncTimers.delete(doc);
	}
	detailRetryCounts.delete(doc);
	detailTabObservers.get(doc)?.observer.disconnect();
	detailTabObservers.delete(doc);
	removeBigPictureDetailsNodes(doc);
}
