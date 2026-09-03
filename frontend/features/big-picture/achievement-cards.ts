import type { LocalAchievementData } from '../../domain/types';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText, loc, steamIntlLocale, steamLanguageSync } from '../../steam/localization';
import { getMappedShortcuts, getSteamAppStore, toSignedShortcutAppId, canonicalizeGameTitle, looseMatchTitle } from '../../steam/shortcuts';
import { cacheLocalAchievements, getCachedLocalAchievementsForGame } from '../achievements/cache';
import { localAchievementPercent } from '../achievements/format';
import { fetchLocalAchievementData, subscribeLocalAchievementData } from '../achievements/service';
import { loadMappings } from '../../core/mappings';

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
	mutationObserver: MutationObserver | null;
	unsubscribe: () => void;
}

interface AchievementCardTarget {
	shortcut: MappedShortcut;
	card: HTMLElement;
}

const achievementCardStates = new WeakMap<Document, AchievementCardState>();
const MAX_ACHIEVEMENT_REQUESTS = 4;
const EMPTY_RETRY_MS = 3_500;

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
	for (let depth = 0; current && depth < 10 && current !== current.ownerDocument.body; depth += 1, current = current.parentElement) {
		if (current.closest('#gdl-bp-detail-root')) return null;
		const rect = current.getBoundingClientRect();
		if (!current.isConnected || rect.width < 80 || rect.width > 620 || rect.height < 100) continue;
		if (!hasPortraitVisual(current)) continue;
		if (current.querySelector<HTMLElement>('.gdl-bp-achievement-host-fallback, [data-gdl-bp-achievement-host="1"]')) return current;
		fallback ||= current;
		if (current.matches('[role="listitem"],[role="gridcell"],li,[class*="GameItem"],[class*="LibraryItem"]')) {
			return current;
		}
	}
	return fallback;
}

function getElementAppId(element: HTMLElement): number | null {
	for (const name of ['data-appid', 'data-app-id', 'data-app-id-value', 'data-ds-appid']) {
		const val = element.getAttribute(name);
		if (val) {
			const num = Number(val);
			if (Number.isFinite(num)) return num;
		}
	}
	const panel = element.getAttribute('data-panel');
	if (panel) {
		const m = panel.match(/(?:app.?id["']?\s*:\s*|AppOverview_)(-?\d+)/i);
		if (m) {
			const num = Number(m[1]);
			if (Number.isFinite(num)) return num;
		}
	}
	const link = element.matches('a[href]')
		? (element as HTMLAnchorElement)
		: element.querySelector<HTMLAnchorElement>('a[href*="/app/"], a[href*="/details/"], a[href*="appid="]');
	if (link) {
		const m = link.href.match(/(?:\/app\/|\/details\/|appid=)(-?\d+)/i);
		if (m) {
			const num = Number(m[1]);
			if (Number.isFinite(num)) return num;
		}
	}
	const key = Object.keys(element).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$'));
	if (key) {
		let fiber = (element as any)[key];
		let depth = 0;
		while (fiber && depth < 16) {
			const props = fiber.memoizedProps || fiber.props;
			const rawAppId = props?.appid
				?? props?.appId
				?? props?.nAppID
				?? props?.app?.appid
				?? props?.app?.m_unAppID
				?? props?.overview?.appid
				?? props?.overview?.m_unAppID
				?? props?.appOverview?.appid
				?? props?.appOverview?.m_unAppID
				?? props?.item?.appid
				?? props?.item?.m_unAppID
				?? props?.game?.appid;
			const num = Number(rawAppId);
			if (Number.isFinite(num)) return num;
			fiber = fiber.return;
			depth++;
		}
	}
	return null;
}

function extractGameTitleFromCard(card: HTMLElement): string {
	const key = Object.keys(card).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$') || k.startsWith('__reactInternalInstance$'));
	if (key) {
		let fiber = (card as any)[key];
		let depth = 0;
		while (fiber && depth < 16) {
			const props = fiber.memoizedProps || fiber.props;
			const name = props?.overview?.display_name
				|| props?.overview?.m_strDisplayName
				|| props?.appOverview?.display_name
				|| props?.appOverview?.m_strDisplayName
				|| props?.app?.display_name
				|| props?.app?.m_strDisplayName
				|| props?.name;
			if (typeof name === 'string' && name.trim()) return name.trim();
			fiber = fiber.return;
			depth++;
		}
	}

	const raw = card.getAttribute('aria-label')
		|| card.getAttribute('title')
		|| card.querySelector('[aria-label]')?.getAttribute('aria-label')
		|| card.querySelector('img')?.getAttribute('alt')
		|| card.querySelector('img')?.getAttribute('title')
		|| '';

	if (raw) {
		const parts = raw.split(/[,–—]/);
		const first = parts[0]?.trim();
		if (first && !isNativeAchievementFooterText(first)) return first;
	}
	return '';
}

function nativeTitlesInStore(doc?: Document): Set<string> {
	const titles = new Set<string>();
	const store = getSteamAppStore(doc);
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
	const bySteamAppId = new Map<string, MappedShortcut>();
	const byTitle = new Map<string, MappedShortcut>();
	for (const shortcut of shortcuts) {
		const raw = shortcut.id;
		const unsigned = raw < 0 ? (raw >>> 0) : raw;
		const signed = raw > 2147483647 ? toSignedShortcutAppId(raw) : raw;
		byId.set(raw, shortcut);
		byId.set(unsigned, shortcut);
		byId.set(signed, shortcut);
		if (shortcut.steamAppId && !bySteamAppId.has(shortcut.steamAppId)) {
			bySteamAppId.set(shortcut.steamAppId, shortcut);
		}
		const title = normalizeTitle(shortcut.title);
		if (!byTitle.has(title)) byTitle.set(title, shortcut);
		const canonical = canonicalizeGameTitle(shortcut.title);
		if (!byTitle.has(canonical)) byTitle.set(canonical, shortcut);
	}

	const nativeTitles = nativeTitlesInStore(doc);
	const candidates = Array.from(doc.querySelectorAll<HTMLElement>(
		'[role="gridcell"], [role="listitem"], [class*="GameItem"], [class*="AppPortrait"], [class*="LibraryItem"], [class*="Capsule"], [class*="RecentApp"], [data-panel*="app"], [data-panel*="App"], [data-appid], [data-app-id], [data-app-id-value], [data-ds-appid], a[href], [aria-label], [title]'
	));

	const seenCards = new Set<HTMLElement>();
	const targets = new Map<number, AchievementCardTarget>();

	for (const element of candidates) {
		if (element.closest('#gdl-bp-detail-root')) continue;
		const card = findPortraitCard(element) || (hasPortraitVisual(element) ? element : null);
		if (!card || !card.isConnected || seenCards.has(card)) continue;
		seenCards.add(card);

		let shortcut: MappedShortcut | null = null;
		const directId = getElementAppId(card) ?? getElementAppId(element);
		if (directId != null) {
			const unsignedId = normalizedShortcutId(directId);
			if (byId.has(unsignedId)) {
				shortcut = byId.get(unsignedId) || null;
			} else if (byId.has(directId)) {
				shortcut = byId.get(directId) || null;
			}
		}

		if (!shortcut) {
			for (const id of numbersInAttributes(card)) {
				if (byId.has(id)) {
					shortcut = byId.get(id) || null;
					break;
				}
			}
		}

		if (!shortcut) {
			const cardTitle = extractGameTitleFromCard(card) || extractGameTitleFromCard(element);
			if (cardTitle) {
				const norm = normalizeTitle(cardTitle);
				const canonical = canonicalizeGameTitle(cardTitle);
				if (byTitle.has(norm)) {
					shortcut = byTitle.get(norm) || null;
				} else if (byTitle.has(canonical)) {
					shortcut = byTitle.get(canonical) || null;
				} else {
					for (const s of shortcuts) {
						if (looseMatchTitle(cardTitle, s.title) || normalizeTitle(s.title) === norm) {
							shortcut = s;
							break;
						}
					}
				}
			}
		}

		if (!shortcut) {
			const img = card.querySelector<HTMLImageElement>('img[src*="/apps/"]');
			if (img && img.src) {
				const m = img.src.match(/\/apps\/(\d+)\//);
				if (m && bySteamAppId.has(m[1])) {
					shortcut = bySteamAppId.get(m[1]) || null;
				}
			}
		}

		if (!shortcut) continue;

		const cardTitle = extractGameTitleFromCard(card);
		const label = normalizeTitle(cardTitle || shortcut.title);
		const explicitIds = [card, ...Array.from(card.querySelectorAll<HTMLElement>('*'))].flatMap(numbersInAttributes);
		const hasOfficialId = explicitIds.some(id => id > 0 && id < 2147483648);
		const hasShortcutId = explicitIds.some(id => id >= 2147483648);
		if (!hasShortcutId && hasOfficialId && nativeTitles.has(label)) continue;

		if (!targets.has(shortcut.id)) {
			targets.set(shortcut.id, { shortcut, card });
		}
	}
	return Array.from(targets.values());
}

function isNativeAchievementFooterText(value: string): boolean {
	const text = value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	if (!text) return false;

	const dynamicNoAchievements = [
		loc('AppDetails_NoAchievements', ''),
		loc('Achievement_Filter_None', ''),
		loc('AppOverview_NoAchievements', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	for (const token of dynamicNoAchievements) {
		if (text.includes(token)) return true;
	}

	return /^(sin logros|no achievements|aucun succès|keine erfolge|keine errungenschaften|nessun obiettivo|sem conquistas|sem proezas|brak osiągnięć|нет достижений|достижений нет|немає досягнень|geen prestaties|ingen præstationer|inga prestationer|inga framsteg|ingen prestasjoner|ei saavutuksia|başarım yok|žádné achievementy|žádné úspěchy|nincsenek teljesítmények|fără realizări|няма постижения|χωρίς επιτεύγματα|không có thành tựu|ไม่มีความสำเร็จ|tidak ada pencapaian|لا توجد إنجازات|無成就|无成就|実績なし|도전 과제 없음)/i.test(text)
		|| /^(completad|completed|terminé|abgeschlossen|completato|concluíd|ukończono|завершено|達成|完成|완료)/i.test(text)
		|| text.includes('sin logros')
		|| text.includes('no achievements');
}

function findPosterContainer(card: HTMLElement): HTMLElement {
	const img = card.querySelector<HTMLElement>('img, [role="img"]');
	if (img) {
		const parent = img.parentElement;
		if (parent && parent !== card) {
			const rect = parent.getBoundingClientRect();
			if (rect.height >= 80 && rect.width >= 60) return parent;
		}
	}
	const capsule = card.querySelector<HTMLElement>('[class*="Capsule"], [class*="Portrait"], [class*="AppPortrait"]');
	if (capsule && capsule !== card) {
		const rect = capsule.getBoundingClientRect();
		if (rect.height >= 80 && rect.width >= 60) return capsule;
	}
	return card;
}

function ensureAchievementHost(target: AchievementCardTarget): HTMLElement {
	const identity = shortcutIdentity(target.shortcut);
	const poster = findPosterContainer(target.card);
	poster.style.position = poster.style.position || 'relative';

	let host = poster.querySelector<HTMLElement>(':scope > .gdl-bp-achievement-host-fallback')
		|| target.card.querySelector<HTMLElement>(':scope > .gdl-bp-achievement-host-fallback')
		|| poster.querySelector<HTMLElement>('[data-gdl-bp-achievement-host="1"]');

	if (!host) {
		host = poster.ownerDocument.createElement('div');
		host.className = 'gdl-bp-achievement-host-fallback';
		poster.appendChild(host);
	}

	host.dataset.gdlBpAchievementHost = '1';
	host.dataset.gdlBpAchievementIdentity = identity;

	let footer = host.querySelector<HTMLElement>(':scope > .gdl-bp-achievement-footer');
	if (!footer) {
		footer = host.ownerDocument.createElement('span');
		footer.className = 'gdl-bp-achievement-footer';
		host.appendChild(footer);
	}
	return footer;
}

function achievementLabels(percent: number): { progress: string; empty: string; loading: string } {
	const number = percent.toLocaleString(steamIntlLocale(), { maximumFractionDigits: 0 });
	const rawCompletedTemplate = loc('AppBox_PercentComplete', '') || loc('AppOverview_PercentComplete', '') || '';
	let progressText = '';
	if (rawCompletedTemplate) {
		progressText = rawCompletedTemplate.replace(/%1\$s/g, number).replace(/%s/g, number);
		if (!progressText.includes(number)) progressText = `${progressText} ${number}%`;
	} else {
		const language = String(steamLanguageSync() || 'english').toLocaleLowerCase();
		if (/^(spanish|latam|es)/.test(language)) {
			progressText = `Completado un ${number} %`;
		} else {
			progressText = `Completed ${number}%`;
		}
	}

	const emptyText = loc('AppDetails_NoAchievements', '') || gdlText('no_achievements', 'No achievements');
	const loadingText = loc('Loading', '') || loc('Generic_Loading', '') || (String(steamLanguageSync() || '').startsWith('es') ? 'Cargando logros…' : 'Loading achievements…');

	return {
		progress: progressText,
		empty: emptyText,
		loading: loadingText,
	};
}

function completionMedal(): string {
	return `<svg class="gdl-bp-card-medal" viewBox="0 0 36 44" aria-hidden="true">
		<path fill="#0256a4" d="M12 28 L7 42 L13 39 L17 43 L15 28 Z"/>
		<path fill="#036ac7" d="M24 28 L29 42 L23 39 L19 43 L21 28 Z"/>
		<polygon fill="#0b76db" points="18,4 21,7 25,6 26,10 30,11 29,15 32,18 29,21 30,25 26,26 25,30 21,29 18,32 15,29 11,30 10,26 6,25 7,21 4,18 7,15 6,11 10,10 11,6 15,7"/>
		<polygon fill="#0d85f7" points="18,6 20,8 24,8 24,11 28,12 27,15 30,18 27,21 28,24 24,25 24,28 20,28 18,30 16,28 12,28 12,25 8,24 9,21 6,18 9,15 8,12 12,11 12,8 16,8"/>
		<circle cx="18" cy="18" r="7.5" fill="#f4b728"/>
		<circle cx="18" cy="18" r="6.2" fill="#ffca36"/>
		<circle cx="18" cy="18" r="5" fill="#f4b728" opacity="0.3"/>
	</svg>`;
}

function renderAchievementFooter(footer: HTMLElement, data: LocalAchievementData | null | undefined): void {
	const pending = data === undefined;
	const hasAchievements = Boolean(data && data.found && data.total > 0);
	const percent = hasAchievements ? localAchievementPercent(data!) : 0;
	const isComplete = percent >= 100;
	const labels = achievementLabels(percent);
	const label = pending ? labels.loading : hasAchievements ? labels.progress : labels.empty;
	const host = footer.parentElement;
	if (host) {
		host.style.display = '';
		host.style.overflow = 'visible';
	}
	footer.style.display = '';
	footer.className = `gdl-bp-achievement-footer${pending ? ' is-loading' : ''}${isComplete ? ' is-complete' : (hasAchievements ? ' has-progress' : ' is-empty')}`;
	footer.innerHTML = `${isComplete ? completionMedal() : ''}<span class="gdl-bp-card-ach-label">${escapeHtml(label)}</span>${hasAchievements && !isComplete ? `<span class="gdl-bp-card-ach-track"><span class="gdl-bp-card-ach-fill" style="width:${percent}%"></span></span>` : ''}`;
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
		[data-gdl-bp-achievement-card="1"] { position: relative !important; overflow: visible !important; }
		.gdl-bp-achievement-host-fallback {
			box-sizing: border-box !important;
			position: absolute !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			height: 32px !important;
			max-height: 32px !important;
			z-index: 20 !important;
			pointer-events: none !important;
			border-radius: 0 0 4px 4px !important;
			overflow: visible !important;
		}
		.gdl-bp-achievement-footer {
			box-sizing: border-box !important;
			position: absolute !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			width: 100% !important;
			height: 32px !important;
			max-height: 32px !important;
			display: flex !important;
			align-items: center !important;
			justify-content: center !important;
			gap: 6px !important;
			padding: 2px 8px 4px !important;
			background: rgba(30, 36, 44, 0.92) !important;
			color: #e7e8ea !important;
			font: 600 13px/18px "Motiva Sans", Arial, sans-serif !important;
			text-align: center !important;
			white-space: nowrap !important;
			overflow: visible !important;
			text-overflow: ellipsis !important;
			border-radius: 0 0 4px 4px !important;
		}
		.gdl-bp-achievement-footer.is-loading {
			color: #aeb4ba !important;
			background: linear-gradient(90deg, rgba(32,38,46,.92), rgba(52,60,72,.92), rgba(32,38,46,.92)) !important;
			background-size: 220% 100% !important;
			animation: gdl-bp-ach-loading 1.8s linear infinite !important;
		}
		.gdl-bp-achievement-footer.has-progress {
			background: rgba(30, 36, 44, 0.92) !important;
			color: #e7e8ea !important;
		}
		.gdl-bp-achievement-footer.is-complete {
			background: #199fff !important;
			background: linear-gradient(180deg, #1ea3ff 0%, #0885f0 100%) !important;
			color: #ffffff !important;
			font-weight: 700 !important;
			text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25) !important;
			padding-left: 36px !important;
			border-radius: 0 0 4px 4px !important;
		}
		.gdl-bp-card-ach-label {
			overflow: hidden !important;
			text-overflow: ellipsis !important;
			white-space: nowrap !important;
			pointer-events: none !important;
		}
		.gdl-bp-card-ach-track {
			position: absolute !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			height: 3px !important;
			background: rgba(0, 0, 0, 0.5) !important;
			overflow: hidden !important;
		}
		.gdl-bp-card-ach-fill {
			display: block !important;
			height: 100% !important;
			background: #1a9fff !important;
		}
		.gdl-bp-card-medal {
			position: absolute !important;
			left: 6px !important;
			bottom: -5px !important;
			width: 32px !important;
			height: 40px !important;
			z-index: 35 !important;
			pointer-events: none !important;
			filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)) !important;
		}
		@keyframes gdl-bp-ach-loading { from { background-position: 100% 0 } to { background-position: -120% 0 } }
	`;
	(doc.head || doc.documentElement).appendChild(style);
}

function scheduleCardRefresh(doc: Document, state: AchievementCardState): void {
	if (state.refreshTimer) return;
	state.refreshTimer = setTimeout(() => {
		state.refreshTimer = null;
		if (achievementCardStates.get(doc) === state && doc.body?.isConnected) refreshBigPictureAchievementCards(doc);
	}, 60);
}

function ensureAchievementCardState(doc: Document): AchievementCardState {
	const existing = achievementCardStates.get(doc);
	if (existing) return existing;
	let state!: AchievementCardState;
	const observer = new MutationObserver(() => {
		if (achievementCardStates.get(doc) === state && doc.body?.isConnected) {
			scheduleCardRefresh(doc, state);
		}
	});
	if (doc.body) {
		try {
			observer.observe(doc.body, { childList: true, subtree: true });
		} catch {}
	}
	state = {
		generation: 1,
		results: new Map(), pending: new Set(), queued: new Set(), queue: [],
		lastRequestedAt: new Map(), activeRequests: 0, refreshTimer: null,
		mutationObserver: observer,
		unsubscribe: subscribeLocalAchievementData(update => {
			const live = achievementCardStates.get(doc);
			if (live !== state) return;
			const shortcut = getMappedShortcuts(doc).find(item => item.steamAppId === update.steamAppId
				&& (!update.stateAppId
					|| String(item.id) === update.stateAppId
					|| String(toSignedShortcutAppId(item.id)) === update.stateAppId));
			if (!shortcut) return;
			live.results.set(shortcutIdentity(shortcut), update.data);
			scheduleCardRefresh(doc, live);
		}),
	};
	achievementCardStates.set(doc, state);

	// Periodic retries during startup hydration so recent cards get achievements even if React mounts slowly
	for (const delay of [250, 600, 1200, 2500, 4500]) {
		setTimeout(() => {
			if (achievementCardStates.get(doc) === state && doc.body?.isConnected) {
				refreshBigPictureAchievementCards(doc);
			}
		}, delay);
	}

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
		void fetchLocalAchievementData(shortcut.steamAppId, {
			stateAppId: shortcut.id,
			maxAgeMs: 5000,
			allowSimulated: true,
		})
			.then(data => {
				const live = achievementCardStates.get(doc);
				if (live !== state || live.generation !== generation) return;
				if (data?.found && data.total > 0) {
					live.results.set(identity, data);
					cacheLocalAchievements(data, shortcut.steamAppId, String(shortcut.id));
				} else {
					const existingCached = getCachedLocalAchievementsForGame(shortcut.steamAppId, String(shortcut.id));
					if (!existingCached && !live.results.get(identity)?.found) {
						live.results.set(identity, data);
					}
				}
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
		host.remove();
	}
}

export function refreshBigPictureAchievementCards(doc: Document): void {
	if (!doc.body) return;
	ensureAchievementCardStyles(doc);
	const shortcuts = getMappedShortcuts(doc);
	if (shortcuts.length === 0) {
		void loadMappings().then(() => {
			if (doc.body?.isConnected) refreshBigPictureAchievementCards(doc);
		});
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
		const hasResult = state.results.has(identity);
		const isPendingOrQueued = state.pending.has(identity) || state.queued.has(identity);
		const resultData = hasResult ? state.results.get(identity)! : undefined;
		const data = cached || (resultData?.found && resultData.total > 0 ? resultData : (isPendingOrQueued ? undefined : resultData));
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
	state.mutationObserver?.disconnect();
	if (state.refreshTimer) clearTimeout(state.refreshTimer);
	achievementCardStates.delete(doc);
}
