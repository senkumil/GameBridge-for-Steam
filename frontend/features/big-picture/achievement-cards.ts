import type { LocalAchievementData } from '../../domain/types';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText, steamIntlLocale, steamLanguageSync } from '../../steam/localization';
import { getMappedShortcuts, getSteamAppStore, toSignedShortcutAppId } from '../../steam/shortcuts';
import { getCachedLocalAchievementsForGame } from '../achievements/cache';
import { localAchievementPercent } from '../achievements/format';
import { fetchLocalAchievementData, subscribeLocalAchievementData } from '../achievements/service';

type MappedShortcut = { id: number; title: string; steamAppId: string };

interface AchievementCardState {
	generation: number;
	results: Map<string, LocalAchievementData | null>;
	pending: Set<string>;
	queued: Set<string>;
	queue: MappedShortcut[];
	lastRequestedAt: Map<string, number>;
	activeRequests: number;
	refreshTimer: ReturnType<typeof setTimeout> | null;
	unsubscribe: () => void;
}

interface AchievementCardTarget {
	shortcut: MappedShortcut;
	card: HTMLElement;
}

const achievementCardStates = new WeakMap<Document, AchievementCardState>();
const MAX_ACHIEVEMENT_REQUESTS = 4;
const EMPTY_RETRY_MS = 30_000;

function shortcutIdentity(shortcut: MappedShortcut): string {
	return `${shortcut.id}:${shortcut.steamAppId}`;
}

function normalizedShortcutId(value: number): number {
	return value < 0 ? (value >>> 0) : value;
}

function numbersInAttributes(element: Element): number[] {
	const result: number[] = [];
	for (const name of element.getAttributeNames()) {
		// Artwork URLs contain the linked Store AppID but identify only the image,
		// not the card. Limit identity parsing to route/data attributes so a CDN URL
		// cannot make a shortcut capsule look like an official native-game capsule.
		if (!/(?:^href$|app.?id|data-panel|^id$|aria-controls|aria-labelledby)/i.test(name)) continue;
		const value = element.getAttribute(name) || '';
		for (const match of value.matchAll(/(?:^|[^0-9])-?\d{5,10}(?=$|[^0-9])/g)) {
			const numberText = match[0].match(/-?\d{5,10}/)?.[0] || '';
			const parsed = Number(numberText);
			if (Number.isFinite(parsed)) result.push(normalizedShortcutId(parsed));
		}
	}
	return result;
}

function hasPortraitVisual(scope: HTMLElement): boolean {
	const scopeRect = scope.getBoundingClientRect();
	if (scopeRect.width >= 90 && scopeRect.width <= 520 && scopeRect.height >= scopeRect.width * 1.12) return true;
	for (const visual of Array.from(scope.querySelectorAll<HTMLElement>('img,[role="img"],[style*="background-image"]'))) {
		const rect = visual.getBoundingClientRect();
		if (rect.width >= 80 && rect.height >= rect.width * 1.12) return true;
	}
	return false;
}

function findPortraitCard(start: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = start;
	let fallback: HTMLElement | null = null;
	for (let depth = 0; current && depth < 9 && current !== current.ownerDocument.body; depth += 1, current = current.parentElement) {
		if (current.closest('#gdl-bp-detail-root')) return null;
		const rect = current.getBoundingClientRect();
		if (!current.isConnected || rect.width < 80 || rect.width > 620 || rect.height < 120) continue;
		if (!hasPortraitVisual(current)) continue;
		fallback ||= current;
		if (current.matches('[role="listitem"],[role="gridcell"],li,[class*="GameItem"],[class*="AppPortrait"],[class*="LibraryItem"]')) {
			return current;
		}
	}
	return fallback;
}

function nativeTitlesInStore(): Set<string> {
	const titles = new Set<string>();
	const store = getSteamAppStore();
	if (!store?.m_mapApps) return titles;
	try {
		for (const [rawId, app] of store.m_mapApps) {
			const id = normalizedShortcutId(Number(rawId));
			if (!Number.isFinite(id) || id <= 0 || id >= 2147483648) continue;
			const title = normalizeTitle(String(app?.display_name || app?.m_strDisplayName || app?.name || ''));
			if (title) titles.add(title);
		}
	} catch {}
	return titles;
}

function discoverAchievementCardTargets(doc: Document, shortcuts: MappedShortcut[]): AchievementCardTarget[] {
	const byId = new Map<number, MappedShortcut>();
	const titleCounts = new Map<string, number>();
	for (const shortcut of shortcuts) {
		byId.set(shortcut.id, shortcut);
		byId.set(normalizedShortcutId(toSignedShortcutAppId(shortcut.id)), shortcut);
		const title = normalizeTitle(shortcut.title);
		titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
	}
	const nativeTitles = nativeTitlesInStore();
	const candidates = Array.from(doc.querySelectorAll<HTMLElement>(
		'[data-appid],[data-app-id],[data-app-id-value],[data-ds-appid],a[href],[aria-label],[title]',
	));
	const targets = new Map<string, AchievementCardTarget>();
	for (const element of candidates) {
		let shortcut = numbersInAttributes(element).map(id => byId.get(id)).find(Boolean) || null;
		if (!shortcut) {
			const label = normalizeTitle(element.getAttribute('aria-label') || element.getAttribute('title') || '');
			if (!label || titleCounts.get(label) !== 1 || nativeTitles.has(label)) continue;
			shortcut = shortcuts.find(item => normalizeTitle(item.title) === label) || null;
		}
		if (!shortcut) continue;
		const card = findPortraitCard(element);
		if (!card) continue;
		const explicitIds = [card, ...Array.from(card.querySelectorAll<HTMLElement>('*'))].flatMap(numbersInAttributes);
		const hasShortcutId = explicitIds.includes(shortcut.id);
		if (!hasShortcutId && explicitIds.some(id => id > 0 && id < 2147483648)) continue;
		const key = `${shortcutIdentity(shortcut)}:${targets.size}`;
		if (!Array.from(targets.values()).some(target => target.card === card && target.shortcut.id === shortcut!.id)) {
			targets.set(key, { shortcut, card });
		}
	}
	return Array.from(targets.values());
}

function isNativeAchievementFooterText(value: string): boolean {
	const text = value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	return /^(sin logros|no achievements|aucun succès|keine erfolge|nessun obiettivo|sem conquistas)$/.test(text)
		|| /^(completad|completed|terminé|abgeschlossen|completato|concluíd)/.test(text);
}

function findNativeAchievementHost(card: HTMLElement): HTMLElement | null {
	for (const element of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
		if (element.childElementCount > 2 || !isNativeAchievementFooterText(element.textContent || '')) continue;
		let host: HTMLElement = element;
		let parent = element.parentElement;
		while (parent && parent !== card) {
			const rect = parent.getBoundingClientRect();
			if (rect.height < 18 || rect.height > 72 || rect.width < 70) break;
			host = parent;
			parent = parent.parentElement;
		}
		return host;
	}
	return null;
}

function ensureAchievementHost(target: AchievementCardTarget): HTMLElement {
	const identity = shortcutIdentity(target.shortcut);
	let host = Array.from(target.card.querySelectorAll<HTMLElement>('[data-gdl-bp-achievement-host="1"]'))
		.find(element => element.dataset.gdlBpAchievementIdentity === identity) || null;
	if (!host) {
		host = findNativeAchievementHost(target.card);
		if (!host) {
			host = target.card.ownerDocument.createElement('div');
			host.className = 'gdl-bp-achievement-host-fallback';
			target.card.dataset.gdlBpAchievementCard = '1';
			target.card.appendChild(host);
		}
		host.dataset.gdlBpAchievementHost = '1';
	}
	host.dataset.gdlBpAchievementIdentity = identity;
	let footer = host.querySelector<HTMLElement>(':scope > .gdl-bp-achievement-footer');
	if (!footer) {
		footer = target.card.ownerDocument.createElement('span');
		footer.className = 'gdl-bp-achievement-footer';
		host.appendChild(footer);
	}
	return footer;
}

function achievementLabels(percent: number): { progress: string; empty: string; loading: string } {
	const language = String(steamLanguageSync() || 'english').toLocaleLowerCase();
	const number = percent.toLocaleString(steamIntlLocale(), { maximumFractionDigits: 0 });
	if (/^(spanish|latam|es)/.test(language)) {
		return { progress: `Completado un ${number} %`, empty: 'Sin logros', loading: 'Cargando logros…' };
	}
	return {
		progress: `Completed ${number}%`,
		empty: gdlText('no_achievements', 'No achievements'),
		loading: 'Loading achievements…',
	};
}

function completionMedal(): string {
	return '<svg class="gdl-bp-card-medal" viewBox="0 0 32 38" aria-hidden="true"><path fill="#0787ec" d="M7 6 12 1h8l5 5v9l-5 5h-8l-5-5V6Z"/><circle cx="16" cy="10" r="6" fill="#ffc52f"/><path fill="#0787ec" d="m10 20 6 2-5 15-4-6-6 1 6-13 3 1Zm12 0-6 2 5 15 4-6 6 1-6-13-3 1Z"/></svg>';
}

function renderAchievementFooter(footer: HTMLElement, data: LocalAchievementData | null | undefined): void {
	const pending = data === undefined;
	const hasAchievements = Boolean(data && data.found && data.total > 0);
	const percent = hasAchievements ? localAchievementPercent(data!) : 0;
	const labels = achievementLabels(percent);
	const label = pending ? labels.loading : hasAchievements ? labels.progress : labels.empty;
	footer.className = `gdl-bp-achievement-footer${pending ? ' is-loading' : ''}${hasAchievements ? ' has-progress' : ' is-empty'}${percent >= 100 ? ' is-complete' : ''}`;
	footer.innerHTML = `${percent >= 100 ? completionMedal() : ''}<span class="gdl-bp-card-ach-label">${escapeHtml(label)}</span>${hasAchievements ? `<span class="gdl-bp-card-ach-track"><span class="gdl-bp-card-ach-fill" style="width:${percent}%"></span></span>` : ''}`;
	footer.setAttribute('aria-label', label);
	if (hasAchievements) {
		footer.setAttribute('role', 'progressbar');
		footer.setAttribute('aria-valuemin', '0');
		footer.setAttribute('aria-valuemax', '100');
		footer.setAttribute('aria-valuenow', String(percent));
	} else {
		footer.removeAttribute('role');
		footer.removeAttribute('aria-valuenow');
	}
}

function ensureAchievementCardStyles(doc: Document): void {
	if (doc.getElementById('gdl-bp-achievement-cards-style')) return;
	const style = doc.createElement('style');
	style.id = 'gdl-bp-achievement-cards-style';
	style.textContent = `
		[data-gdl-bp-achievement-host="1"]{position:relative!important;min-height:32px!important;isolation:isolate;}
		.gdl-bp-achievement-host-fallback{position:absolute!important;left:0;right:0;bottom:0;height:34px;z-index:20;pointer-events:none;}
		[data-gdl-bp-achievement-card="1"]{position:relative!important;}
		.gdl-bp-achievement-footer{box-sizing:border-box;position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;gap:7px;min-height:32px;padding:4px 9px 6px;background:rgba(55,61,68,.98);color:#e7e8ea;font:600 14px/20px "Motiva Sans",Arial,sans-serif;text-align:center;white-space:nowrap;overflow:visible;}
		.gdl-bp-achievement-footer.is-loading{color:#aeb4ba;background:linear-gradient(90deg,rgba(52,58,66,.96),rgba(68,76,86,.96),rgba(52,58,66,.96));background-size:220% 100%;animation:gdl-bp-ach-loading 1.8s linear infinite;}
		.gdl-bp-achievement-footer.is-complete{background:#0787ec;color:#fff;}
		.gdl-bp-card-ach-label{overflow:hidden;text-overflow:ellipsis;}
		.gdl-bp-card-ach-track{position:absolute;left:0;right:0;bottom:0;height:4px;background:#252b31;overflow:hidden;}
		.gdl-bp-card-ach-fill{display:block;height:100%;background:#1a9fff;}
		.gdl-bp-achievement-footer.is-complete .gdl-bp-card-ach-track{background:rgba(0,0,0,.20);}
		.gdl-bp-achievement-footer.is-complete .gdl-bp-card-ach-fill{background:#fff;}
		.gdl-bp-card-medal{position:absolute;left:-13px;bottom:-11px;width:38px;height:46px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5));overflow:visible;}
		@keyframes gdl-bp-ach-loading{from{background-position:100% 0}to{background-position:-120% 0}}
	`;
	(doc.head || doc.documentElement).appendChild(style);
}

function scheduleCardRefresh(doc: Document, state: AchievementCardState): void {
	if (state.refreshTimer) return;
	state.refreshTimer = setTimeout(() => {
		state.refreshTimer = null;
		if (achievementCardStates.get(doc) === state && doc.body?.isConnected) refreshBigPictureAchievementCards(doc);
	}, 0);
}

function ensureAchievementCardState(doc: Document): AchievementCardState {
	const existing = achievementCardStates.get(doc);
	if (existing) return existing;
	let state!: AchievementCardState;
	state = {
		generation: 1,
		results: new Map(), pending: new Set(), queued: new Set(), queue: [],
		lastRequestedAt: new Map(), activeRequests: 0, refreshTimer: null,
		unsubscribe: subscribeLocalAchievementData(update => {
			const live = achievementCardStates.get(doc);
			if (live !== state) return;
			const shortcut = getMappedShortcuts().find(item => item.steamAppId === update.steamAppId
				&& (!update.stateAppId || String(item.id) === update.stateAppId));
			if (!shortcut) return;
			live.results.set(shortcutIdentity(shortcut), update.data);
			scheduleCardRefresh(doc, live);
		}),
	};
	achievementCardStates.set(doc, state);
	return state;
}

function pumpAchievementRequests(doc: Document, state: AchievementCardState): void {
	while (state.activeRequests < MAX_ACHIEVEMENT_REQUESTS && state.queue.length > 0) {
		const shortcut = state.queue.shift()!;
		const identity = shortcutIdentity(shortcut);
		state.queued.delete(identity);
		if (state.pending.has(identity)) continue;
		state.pending.add(identity);
		state.activeRequests += 1;
		state.lastRequestedAt.set(identity, Date.now());
		const generation = state.generation;
		void fetchLocalAchievementData(shortcut.steamAppId, { stateAppId: shortcut.id, maxAgeMs: 5000 })
			.then(data => {
				const live = achievementCardStates.get(doc);
				if (live !== state || live.generation !== generation) return;
				live.results.set(identity, data);
				scheduleCardRefresh(doc, live);
			})
			.catch(() => {})
			.finally(() => {
				const live = achievementCardStates.get(doc);
				if (live !== state) return;
				live.pending.delete(identity);
				live.activeRequests = Math.max(0, live.activeRequests - 1);
				pumpAchievementRequests(doc, live);
			});
	}
}

function queueAchievementRequest(doc: Document, state: AchievementCardState, shortcut: MappedShortcut): void {
	const identity = shortcutIdentity(shortcut);
	if (state.pending.has(identity) || state.queued.has(identity)) return;
	if (Date.now() - (state.lastRequestedAt.get(identity) || 0) < EMPTY_RETRY_MS) return;
	state.queued.add(identity);
	state.queue.push(shortcut);
	pumpAchievementRequests(doc, state);
}

function removeOwnedAchievementFooters(doc: Document, validIdentities?: Set<string>): void {
	for (const host of Array.from(doc.querySelectorAll<HTMLElement>('[data-gdl-bp-achievement-host="1"]'))) {
		if (validIdentities?.has(host.dataset.gdlBpAchievementIdentity || '')) continue;
		host.querySelector(':scope > .gdl-bp-achievement-footer')?.remove();
		delete host.dataset.gdlBpAchievementHost;
		delete host.dataset.gdlBpAchievementIdentity;
		if (host.classList.contains('gdl-bp-achievement-host-fallback')) {
			const card = host.parentElement;
			host.remove();
			if (card) delete card.dataset.gdlBpAchievementCard;
		}
	}
}

export function refreshBigPictureAchievementCards(doc: Document): void {
	if (!doc.body) return;
	ensureAchievementCardStyles(doc);
	const shortcuts = getMappedShortcuts();
	if (shortcuts.length === 0) {
		removeOwnedAchievementFooters(doc);
		return;
	}
	const state = ensureAchievementCardState(doc);
	const targets = discoverAchievementCardTargets(doc, shortcuts);
	const validIdentities = new Set(targets.map(target => shortcutIdentity(target.shortcut)));
	removeOwnedAchievementFooters(doc, validIdentities);
	for (const target of targets) {
		const identity = shortcutIdentity(target.shortcut);
		const cached = getCachedLocalAchievementsForGame(target.shortcut.steamAppId, String(target.shortcut.id));
		if (cached) state.results.set(identity, cached);
		const data = cached || (state.results.has(identity) ? state.results.get(identity)! : undefined);
		renderAchievementFooter(ensureAchievementHost(target), data);
		queueAchievementRequest(doc, state, target.shortcut);
	}
}

export function disposeBigPictureAchievementCards(doc: Document | null): void {
	if (!doc) return;
	removeOwnedAchievementFooters(doc);
	const state = achievementCardStates.get(doc);
	if (!state) return;
	state.generation += 1;
	state.unsubscribe();
	if (state.refreshTimer) clearTimeout(state.refreshTimer);
	achievementCardStates.delete(doc);
}
