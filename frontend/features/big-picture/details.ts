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
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText, loc, steamIntlLocale, steamLanguageSync } from '../../steam/localization';
import { getMappedShortcuts, getSteamAppStore, toSignedShortcutAppId } from '../../steam/shortcuts';
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
	activity: ['activity', 'actividad', 'activité', 'aktivität', 'attività', 'atividade'],
	stuff: ['your stuff', 'tus cosas', 'vos trucs', 'deine sachen', 'le tue cose', 'suas coisas'],
	community: ['community', 'comunidad', 'communauté', 'community', 'comunità', 'comunidade'],
	info: ['game information', 'información del juego', 'informations sur le jeu', 'spielinformationen', 'informazioni sul gioco', 'informações do jogo'],
};

function normalizeUiText(value: unknown): string {
	return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function mappedShortcutIds(shortcut: MappedShortcut): string[] {
	const raw = shortcut.id;
	const unsigned = raw < 0 ? (raw >>> 0) : raw;
	const signed = raw > 2147483647 ? toSignedShortcutAppId(raw) : raw;
	return Array.from(new Set([String(raw), String(unsigned), String(signed)]));
}

function selectedShortcutFromStore(shortcuts: MappedShortcut[], doc: Document): MappedShortcut | null {
	const stores = [
		(doc.defaultView as any)?.appStore,
		getSteamAppStore(),
	].filter(Boolean);
	const byId = new Map<number, MappedShortcut>();
	for (const shortcut of shortcuts) {
		byId.set(shortcut.id, shortcut);
		byId.set(toSignedShortcutAppId(shortcut.id), shortcut);
		const unsigned = shortcut.id < 0 ? (shortcut.id >>> 0) : shortcut.id;
		byId.set(unsigned, shortcut);
	}
	for (const store of stores) {
		for (const key of Object.keys(store || {})) {
			if (!/(selected|current|active|focused).*(app|game)|(?:app|game).*(selected|current|active|focused)/i.test(key)) continue;
			let value: any;
			try { value = store[key]; } catch { continue; }
			const ids = [
				Number(value),
				Number(value?.appid),
				Number(value?.app_id),
				Number(value?.m_unAppID),
				Number(value?.m_nAppID),
			].filter(Number.isFinite);
			for (const id of ids) {
				const unsigned = id < 0 ? (id >>> 0) : id;
				const signed = id > 2147483647 ? toSignedShortcutAppId(id) : id;
				const match = byId.get(id) || byId.get(unsigned) || byId.get(signed);
				if (match) return match;
			}
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
	if (shortcuts.length === 0 || !doc.body) return null;

	// 1. A route AppID is the strongest transition signal.
	const href = decodeURIComponent(String(doc.defaultView?.location?.href || doc.location?.href || '')).toLocaleLowerCase();
	for (const shortcut of shortcuts) {
		const ids = mappedShortcutIds(shortcut);
		if (ids.some(id => new RegExp(`(?:^|[^0-9])${id.replace('-', '\\-')}(?:[^0-9]|$)`).test(href))) {
			return shortcut;
		}
	}

	// 2. Check AppIDs inside the active detail/hero surface.
	for (const shortcut of shortcuts) {
		const ids = mappedShortcutIds(shortcut);
		for (const id of ids) {
			if (doc.querySelector(`[class*="AppDetails"] [data-appid="${id}"], [class*="AppDetails"] [data-app-id="${id}"], [class*="AppDetails"] [data-app-id-value="${id}"], [class*="GameDetails"] [data-appid="${id}"], [class*="GameDetails"] [data-app-id="${id}"], [class*="GameDetails"] [data-app-id-value="${id}"], [class*="Hero"] [data-appid="${id}"], [class*="Hero"] [data-app-id="${id}"]`)) {
				return shortcut;
			}
		}
	}

	// 3. Store selection check.
	const selected = selectedShortcutFromStore(shortcuts, doc);
	if (selected) return selected;

	// 4. Protect real Steam games before title fallback.
	if (isNativeSteamGameActive(doc)) return null;

	const byLongestTitle = [...shortcuts].sort((a, b) => b.title.length - a.title.length);

	// 5. Check visible hero logo images.
	const heroLogos = Array.from(doc.querySelectorAll<HTMLElement>('[class*="AppDetails"] img[alt], [class*="GameDetails"] img[alt], [class*="Hero"] img[alt], [class*="Header"] [class*="Logo"] img[alt]'));
	for (const el of heroLogos) {
		const rect = el.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) continue;
		const alt = normalizeTitle(el.getAttribute('alt') || '');
		for (const shortcut of byLongestTitle) {
			const sTitle = normalizeTitle(shortcut.title);
			if (sTitle && (alt === sTitle || alt.includes(sTitle))) {
				return shortcut;
			}
		}
	}

	// 6. Match headings inside a detail/header surface.
	const titleHeadings = Array.from(doc.querySelectorAll<HTMLElement>(
		'[class*="AppDetails"] h1, [class*="AppDetails"] h2, [class*="GameDetails"] h1, [class*="GameDetails"] h2, [class*="GameTitle"], [class*="AppTitle"], [class*="TitleHeader"], [class*="HeaderTitle"], [class*="DetailTitle"]'
	));
	for (const heading of titleHeadings) {
		const rect = heading.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) continue;
		const headingText = normalizeTitle(heading.textContent || '');
		if (!headingText) continue;
		const match = byLongestTitle.find(shortcut => {
			const sTitle = normalizeTitle(shortcut.title);
			return sTitle && (headingText === sTitle || headingText.includes(sTitle));
		});
		if (match) return match;
	}

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
	if (!controls.has('activity')) return null;
	const values = Array.from(controls.values());
	let strip = commonAncestor(values);
	if (!strip || strip === doc.body) {
		strip = controls.get('activity')!.parentElement;
	}
	if (!strip || strip === doc.body) return null;
	while (strip.parentElement && strip.parentElement !== doc.body) {
		const rect = strip.getBoundingClientRect();
		if (rect.width >= 280 && rect.height > 20 && rect.height <= 150) break;
		const parent = strip.parentElement;
		if (!values.every(value => parent.contains(value))) break;
		strip = parent;
	}
	return { strip, controls };
}

function activeTabFromNative(doc: Document, controls: Map<BigPictureTab, HTMLElement>): BigPictureTab | null {
	let best: { tab: BigPictureTab; score: number } | null = null;
	const activeEl = doc.activeElement as HTMLElement | null;

	for (const [tab, control] of controls) {
		let score = 0;
		if (activeEl && (activeEl === control || control.contains(activeEl))) score += 100;
		if (control.getAttribute('aria-selected') === 'true' || control.getAttribute('aria-current')) score += 50;
		if (control.getAttribute('tabindex') === '0') score += 20;
		if (/(active|selected|current|focus)/i.test(control.className)) score += 10;

		const style = doc.defaultView?.getComputedStyle(control);
		const bg = style?.backgroundColor || '';
		const rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (rgbMatch) {
			const r = Number(rgbMatch[1]);
			const g = Number(rgbMatch[2]);
			const b = Number(rgbMatch[3]);
			const brightness = (r * 299 + g * 587 + b * 114) / 1000;
			if (brightness > 140) score += 40;
		}
		if (score > (best?.score || 0)) best = { tab, score };
	}
	return best && best.score > 0 ? best.tab : null;
}

function completionMedalSvg(): string {
	return `<svg viewBox="0 0 48 54" width="48" height="54" aria-hidden="true"><path fill="#0787ec" d="M12 10 18 4h12l6 6v12l-6 6H18l-6-6V10Z"/><circle cx="24" cy="16" r="8" fill="#ffc52f" stroke="#ff9d23" stroke-width="2"/><path fill="#0787ec" d="m14 28 8 2-7 20-5-8-9 1 8-17 5 2Zm20 0-8 2 7 20 5-8 9 1-8-17-5 2Z"/></svg>`;
}

function featureSvg(kind: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'): string {
	switch (kind) {
		case 'person': return `<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M5 21c.4-5 2.7-7.4 7-7.4S18.6 16 19 21H5Z" fill="currentColor"/></svg>`;
		case 'achievement': return `<svg viewBox="0 0 24 24"><path d="m12 1.5 2.3 3 3.7-.2.8 3.6 3.1 2-1.8 3.2 1.3 3.5-3.5 1.3-.8 3.6-3.6-.7L12 24l-2.6-3.2-3.6.7-.8-3.6-3.5-1.3 1.3-3.5L1 9.9l3.1-2 .8-3.6 3.7.2L12 1.5Z" fill="currentColor"/></svg>`;
		case 'cloud': return `<svg viewBox="0 0 24 24"><path d="M6.6 19h11a4.6 4.6 0 0 0 .6-9.1A6.4 6.4 0 0 0 6 8.1 5.5 5.5 0 0 0 6.6 19Z" fill="currentColor"/></svg>`;
		case 'family': return `<svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="17" cy="8" r="2.5" fill="currentColor"/><path d="M2 20c.3-5 2.3-7 6-7s5.7 2 6 7H2Zm11 0c.2-3.5 1.6-5.3 4.3-5.3 2.6 0 4.1 1.8 4.4 5.3H13Z" fill="currentColor"/></svg>`;
		case 'controller': return `<svg viewBox="0 0 24 24"><path d="M7 7h10c2.1 0 3.4 1.5 4 4l.8 3.7c.5 2.3-2.2 3.7-3.7 1.9l-1.6-1.9h-9l-1.6 1.9c-1.5 1.8-4.2.4-3.7-1.9L3 11c.6-2.5 1.9-4 4-4Zm1.8 3H7v1.7H5.3v1.8H7v1.7h1.8v-1.7h1.7v-1.8H8.8V10Zm6.5 1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm2.7 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" fill="currentColor"/></svg>`;
	}
}

function escapeAttr(value: string): string {
	return escapeHtml(value).replace(/`/g, '&#96;');
}

function nextDetailGeneration(doc: Document): number {
	const next = (detailGenerations.get(doc) || 0) + 1;
	detailGenerations.set(doc, next);
	return next;
}

function isLiveDetailState(doc: Document, state: BigPictureDetailState): boolean {
	const live = detailStates.get(doc);
	return live === state
		&& live.generation === state.generation
		&& live.shortcut.id === state.shortcut.id
		&& live.shortcut.steamAppId === state.shortcut.steamAppId
		&& live.language === state.language
		&& live.root.dataset.gdlSteamAppId === state.shortcut.steamAppId
		&& live.root.dataset.gdlShortcutAppId === String(state.shortcut.id);
}

/** Seed Big Picture from the same durable, language-scoped snapshots as the
 * desktop library. A stale snapshot is deliberately useful here: it keeps a
 * revisit stable while the resource owner refreshes it in the background. */
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

/** Every resource starts independently and every completion is tied to this
 * exact Document + shortcut + Steam AppID + language generation. A slow or
 * delisted Store endpoint must not hold achievements, news or community data. */
function startDetailHydration(doc: Document, state: BigPictureDetailState): void {
	if (state.hydrationStarted) return;
	state.hydrationStarted = true;
	const applyResource = <K extends keyof BigPictureDetailData>(key: K,
		request: Promise<BigPictureDetailData[K]>): void => {
		void request.then(value => {
			if (!isLiveDetailState(doc, state)) return;
			// A transient nullable source must not erase a durable snapshot that is
			// already on screen. Empty arrays remain meaningful terminal results.
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

function formatBigPictureFeedDate(ts: number): string {
	if (!ts || ts <= 0) return gdlText('recent', 'Recent').toUpperCase();
	const d = new Date(ts * 1000);
	const now = new Date();
	if (d.toDateString() === now.toDateString()) {
		return gdlText('today', 'Today').toUpperCase();
	}
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) {
		return gdlText('yesterday', 'Yesterday').toUpperCase();
	}
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
		if (!hydrationStarted) {
			return `<div class="gdl-bp-loading">${escapeHtml(loc('Loading', 'Loading…'))}</div>`;
		}
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
					<div class="gdl-bp-feed-card" tabindex="0">
						<div class="gdl-bp-feed-icon-wrap">
							<img class="gdl-bp-feed-avatar" src="${escapeAttr(p.user_avatar)}" alt="" />
						</div>
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
					<a class="gdl-bp-feed-card" href="${escapeAttr(item.url || '#')}" data-gdl-bp-external="1" tabindex="0">
						${thumbUrl
							? `<img class="gdl-bp-feed-thumb" src="${escapeAttr(thumbUrl)}" alt="" />`
							: `<div class="gdl-bp-feed-icon-wrap">${wrenchToolSvg()}</div>`
						}
						<div class="gdl-bp-feed-body">
							<div class="gdl-bp-feed-eyebrow">${escapeHtml(label.toUpperCase())}</div>
							<div class="gdl-bp-feed-title">${escapeHtml(item.title || '')}</div>
							${preview ? `<div class="gdl-bp-feed-desc">${escapeHtml(preview)}</div>` : ''}
						</div>
						${statsHtml}
					</a>`;
			}
		}
		feedHtml += `</div></div>`;
	}

	return feedHtml;
}

function renderAchievements(data: LocalAchievementData | null): string {
	const title = escapeHtml(loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')));
	if (!data) {
		return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(loc('Loading', 'Loading…'))}</div></section>`;
	}
	if (data.total <= 0) {
		return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${title}</h2><div class="gdl-bp-empty">${escapeHtml(gdlText('no_achievements', 'No achievements found.'))}</div></section>`;
	}
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
				${featured ? `<div class="gdl-bp-ach-featured${isHighlighted(featured) ? ' is-rare' : ''}"><div class="gdl-bp-ach-img-frame${isHighlighted(featured) ? ' is-rare' : ''}"><div class="gdl-bp-ach-rare-glow"></div><div class="gdl-bp-ach-rare-ring"></div><div class="gdl-bp-ach-rare-beam"></div><img class="gdl-bp-ach-img" src="${escapeAttr(featured.earned ? featured.icon : (featured.icon_gray || featured.icon))}" alt=""></div><div><strong>${escapeHtml(featured.display_name || featured.name)}</strong><p>${escapeHtml(featured.description || '')}</p><p>${Number(featured.global_percent || 0).toFixed(1)}% ${escapeHtml(gdlText('players_have_achievement', 'of players have this achievement'))}</p></div></div>` : '<div></div>'}
				<div class="gdl-bp-ach-icons">${strip.map(item => `<div class="gdl-bp-ach-icon-frame${isHighlighted(item) ? ' is-rare' : ''}" title="${escapeAttr(item.display_name || item.name)}"><div class="gdl-bp-ach-rare-glow"></div><div class="gdl-bp-ach-rare-ring"></div><div class="gdl-bp-ach-rare-beam"></div><img class="gdl-bp-ach-icon${!item.earned ? ' is-locked' : ''}" src="${escapeAttr(item.earned ? item.icon : (item.icon_gray || item.icon))}" alt=""></div>`).join('')}</div>
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
	return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Media', 'Media'))}</h2><div class="gdl-bp-media-box"><div class="gdl-bp-media-copy">${escapeHtml(loc('AppDetails_ScreenshotHint_Gamepad', 'You can take a screenshot while playing from the Steam overlay.'))}</div><button class="gdl-bp-action-button" type="button" tabindex="0">${escapeHtml(loc('AppDetails_GoToMediaLibrary', 'Go to my media library'))}</button></div></section>
	<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_GameNotes', 'Notes'))}</h2><div class="gdl-bp-notes-box"><button class="gdl-bp-action-button" type="button" tabindex="0">✎ ${escapeHtml(loc('AppDetails_CreateNewNote', 'New note'))}</button></div></section>`;
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
	return `<section class="gdl-bp-section"><h2 class="gdl-bp-section-title">${escapeHtml(loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Community Content')))}</h2><div class="gdl-bp-community-grid">${items.map(item => `<a class="gdl-bp-community-card" href="${escapeAttr(item.link || '#')}" ${item.link ? 'data-gdl-bp-external="1"' : ''}><img class="gdl-bp-community-media" src="${escapeAttr(item.image)}" alt=""><div class="gdl-bp-community-title">${escapeHtml(item.title || item.label || '')}</div><div class="gdl-bp-community-author">${item.author_avatar ? `<img src="${escapeAttr(item.author_avatar)}" alt="">` : ''}<span>${escapeHtml(item.author_name || item.label || '')}</span></div></a>`).join('')}</div></section>`;
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
		[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), `https://store.steampowered.com/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_DLC', gdlText('dlc_links', 'DLC')), `https://store.steampowered.com/dlc/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_PointsShop', gdlText('points_shop', 'Points Shop')), `https://store.steampowered.com/points/shop/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${shortcut.steamAppId}/discussions/`],
		[loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${shortcut.steamAppId}/guides/`],
		[loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${shortcut.steamAppId}`],
	];
	return `<section class="gdl-bp-section"><div class="gdl-bp-info-grid"><img class="gdl-bp-info-portrait" src="${escapeAttr(portrait)}" alt=""><div><div class="gdl-bp-info-description">${escapeHtml(game.short_description || '')}</div><div class="gdl-bp-info-meta">${developer ? `${escapeHtml(loc('AppDetails_Developer', gdlText('developer', 'Developer')))}: <strong>${escapeHtml(developer)}</strong><br>` : ''}${publisher ? `${escapeHtml(loc('AppDetails_Publisher', gdlText('publisher', 'Publisher')))}: <strong>${escapeHtml(publisher)}</strong><br>` : ''}${franchise ? `${escapeHtml(loc('AppDetails_Franchise', gdlText('franchise', 'Franchise')))}: <strong>${escapeHtml(franchise)}</strong><br>` : ''}${release ? `<br>${escapeHtml(loc('AppDetails_ReleaseDate', gdlText('release_date', 'Release date')))}: <strong>${escapeHtml(release)}</strong>` : ''}</div></div><div>${features.map(feature => `<div class="gdl-bp-feature">${featureSvg(feature.icon)}<span>${escapeHtml(feature.label)}</span></div>`).join('')}</div></div><div class="gdl-bp-info-links">${links.map(([label, url]) => `<a class="gdl-bp-info-link" href="${escapeAttr(url)}" data-gdl-bp-external="1">${escapeHtml(label)}</a>`).join('')}</div></section>`;
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
	if (state.renderedRoot === root && state.renderSignature === signature) return;
	root.innerHTML = markup;
	state.renderedRoot = root;
	state.renderSignature = signature;
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
			if (event.key === 'Enter' || event.key === ' ') scheduleTabSync(doc, tab);
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

/** One-time compatibility cleanup for builds that moved Steam's React-owned
 * tab strip into #gdl-bp-detail-shell. A hot reload can leave that old shell in
 * the document even though its JavaScript state no longer exists. */
function retireLegacyDetailShell(doc: Document): void {
	const placeholder = doc.getElementById('gdl-bp-native-strip-placeholder') as HTMLElement | null;
	const shell = doc.getElementById('gdl-bp-detail-shell') as HTMLElement | null;
	const tabsHost = doc.getElementById('gdl-bp-native-tabs-host') as HTMLElement | null;
	const movedStrip = tabsHost?.querySelector<HTMLElement>('[data-gdl-bp-native-strip="1"]')
		|| tabsHost?.firstElementChild as HTMLElement | null;
	if (placeholder?.parentElement && movedStrip) {
		delete movedStrip.dataset.gdlBpNativeStrip;
		placeholder.parentElement.insertBefore(movedStrip, placeholder.nextSibling);
	}
	shell?.remove();
	placeholder?.remove();
}

function removeBigPictureDetailsNodes(doc: Document): void {
	const root = doc.getElementById('gdl-bp-detail-root');
	if (detailStates.has(doc) || root) nextDetailGeneration(doc);
	root?.remove();
	removeBigPictureFallbackPanel(doc);
	retireLegacyDetailShell(doc);
	for (const panel of Array.from(doc.querySelectorAll<HTMLElement>('[data-gdl-bp-native-panel="1"]'))) {
		delete panel.dataset.gdlBpNativePanel;
	}
	detailTabObservers.get(doc)?.observer.disconnect();
	detailTabObservers.delete(doc);
	const retry = detailRetryTimers.get(doc);
	if (retry) clearTimeout(retry);
	detailRetryTimers.delete(doc);
	detailRetryCounts.delete(doc);
	const sync = detailTabSyncTimers.get(doc);
	if (sync) clearTimeout(sync);
	detailTabSyncTimers.delete(doc);
	detailStates.delete(doc);
}

export async function refreshBigPictureShortcutDetails(doc: Document): Promise<void> {
	if (!doc.body) return;
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
		// Retire A's route-owned content before looking for B's native panel.
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

	state = detailStates.get(doc);
	if (!state) {
		const cached = coldCached || cachedBigPictureDetailData(shortcut, language);
		state = {
			shortcut,
			language,
			activeTab: nativeTab,
			root: nodes.root,
			panel: nodes.panel,
			// Even a true cold visit gets a useful native-looking empty/loading state;
			// optional resources then patch independently as they arrive.
			data: cached,
			generation: nextDetailGeneration(doc),
			hydrationStarted: false,
			renderSignature: '',
			renderedRoot: null,
		};
		detailStates.set(doc, state);
		renderRoot(state);
	} else {
		const rootChanged = state.root !== nodes.root;
		state.root = nodes.root;
		state.panel = nodes.panel;
		if (nativeTab !== state.activeTab) state.activeTab = nativeTab;
		if (rootChanged) {
			state.renderSignature = '';
			state.renderedRoot = null;
		}
	}
	bindTabs(doc, tabs.strip, tabs.controls);
	renderRoot(state);
	startDetailHydration(doc, state);
}

export function disposeBigPictureShortcutDetails(doc: Document | null): void {
	if (!doc) return;
	removeBigPictureDetailsNodes(doc);
}

export function clearBigPictureDetailCache(): void {
	// Detail data is intentionally owned by the shared language-scoped resource
	// caches. Route state is invalidated by dispose/remount instead of maintaining
	// a second aggregate cache with a conflicting TTL.
}
