import { backendLog } from '../../api/backend';
import { getCachedGameData, getGameData } from '../../core/game-data';
import { normalizeTitle } from '../../core/text';
import { gdlText, loc, steamLanguageSync } from '../../steam/localization';
import { getMappedShortcuts, getSteamAppStore, getShortcutAppById, toSignedShortcutAppId } from '../../steam/shortcuts';
import { findMappingForShortcut } from '../shortcuts/registry';
import { getCachedLocalAchievementsForGame } from '../achievements/cache';
import { fetchLocalAchievementData } from '../achievements/service';
import { openBigPictureAchievementsScreen } from './achievements-view';
import { getCachedOfficialCommunityItems, getOfficialCommunityItems } from '../library/community-items';
import { getCachedCommunityContent, getCachedNews, getCommunityContent, getNews } from '../library/news';
import { type LocalActivityPost, saveLocalActivityPost, getCurrentSteamUser } from '../library/social/feed';
import { ensureNativePanelRoot, hideBigPictureNonSteamNotices, removeBigPictureFallbackPanel } from './panel-mount';
import { ensureBigPictureDetailsStyles } from './styles';
import { steamWebpackRuntime } from '../../steam/modules/SteamWebpackRuntime';
import { gamepadFeatureFlags } from '../gamepad/flags';
import { mountSingleNativeAchievement } from '../gamepad/achievements/SingleNativeAchievement';
import { installBigPictureGamepadNavigation, disposeBigPictureGamepadNavigation } from './gamepad-nav';
import { syncBigPicturePlaybarEnhancements, removeBigPicturePlaybarEnhancements } from './playbar';
import { getCachedFriendData, getFriendData } from '../library/social/friends';
import { cachePersona, hasCachedPersona } from '../library/social/personas';
import { fetchFriendPersonasBackend } from '../../api/backend';
import { linkedShortcutPortrait } from '../library/artwork';
import { openBigPictureCardModal, openBigPictureNewsModal, openBigPictureCommunityModal } from './news-modal';
import {
	renderActivity,
	renderAchievements,
	renderCards,
	renderMediaAndNotes,
	renderCommunity,
	renderInfo,
	fallbackCommunity,
	type BigPictureDetailData,
	type BigPictureTab,
	type MappedShortcut,
} from './tab-renderers';
import {
	findBigPictureTabStrip,
	activeTabFromNative,
} from './tabs';

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

	const domAppId = findActiveAppIdFromDOM(doc);
	if (domAppId && domAppId > 0 && domAppId < 2147483648 && !shortcutIds.has(String(domAppId))) return true;

	for (const el of Array.from(doc.querySelectorAll<HTMLElement>('[data-appid],[data-app-id],[data-app-id-value],a[href*="/app/"]'))) {
		if (el.closest('#gdl-bp-detail-root, #gdl-bp-detail-fallback-panel')) continue;
		const raw = el.getAttribute('data-appid') || el.getAttribute('data-app-id') || el.getAttribute('data-app-id-value') || el.getAttribute('href')?.match(/\/app\/(\d+)/)?.[1];
		const num = Number(raw);
		if (Number.isFinite(num) && num > 0 && num < 2147483648 && !shortcutIds.has(String(num))) return true;
	}

	for (const store of [(doc.defaultView as any)?.appStore, getSteamAppStore()].filter(Boolean)) {
		for (const key of Object.keys(store || {})) {
			if (!/(selected|current|active|focused).*(app|game)|(?:app|game).*(selected|current|active|focused)/i.test(key)) continue;
			let value: any;
			try { value = store[key]; } catch { continue; }
			if (!value) continue;
			const rawAppId = Number(value.appid ?? value.app_id ?? value.m_unAppID ?? value.m_nAppID ?? value);
			if (Number.isFinite(rawAppId)) {
				const unsignedAppId = rawAppId < 0 ? (rawAppId >>> 0) : rawAppId;
				const signedAppId = rawAppId > 2147483647 ? toSignedShortcutAppId(rawAppId) : rawAppId;
				if (shortcutIds.has(String(rawAppId)) || shortcutIds.has(String(unsignedAppId)) || shortcutIds.has(String(signedAppId))) return false;
			}
			if (Number.isFinite(rawAppId) && rawAppId > 0 && rawAppId < 2147483648) {
				const isShortcut = Boolean(Number(value.app_type || 0) === 1073741824 || (typeof value.BIsShortcut === 'function' && value.BIsShortcut()) || shortcutIds.has(String(rawAppId)));
				if (!isShortcut) return true;
			}
		}
	}

	const href = decodeURIComponent(String(doc.defaultView?.location?.href || doc.location?.href || '')).toLocaleLowerCase();
	const appMatch = href.match(/(?:\/app\/|\/details\/|appid=|\/game\/)(\d+)/);
	return Boolean(appMatch && Number(appMatch[1]) > 0 && Number(appMatch[1]) < 2147483648 && !shortcutIds.has(String(Number(appMatch[1]))));
}

function detectCurrentMappedShortcut(doc: Document): MappedShortcut | null {
	if (!doc.body || isNativeSteamGameActive(doc)) return null;
	const shortcuts = getMappedShortcuts();

	// 1. Authoritative AppID from DOM / React Fiber / Route
	const activeDomAppId = findActiveAppIdFromDOM(doc);
	if (activeDomAppId) {
		const unsigned = activeDomAppId < 0 ? (activeDomAppId >>> 0) : activeDomAppId;
		const signed = activeDomAppId > 2147483647 ? toSignedShortcutAppId(activeDomAppId) : activeDomAppId;
		const match = shortcuts.find(s => s.id === activeDomAppId || s.id === unsigned || s.id === signed);
		if (match) return match;
		if (activeDomAppId > 0 && activeDomAppId < 2147483648) return null;

		const app = getShortcutAppById(activeDomAppId);
		const title = String(app?.display_name || app?.m_strDisplayName || '').trim();
		const mappedAppId = findMappingForShortcut(activeDomAppId, title);
		if (mappedAppId && /^\d+$/.test(mappedAppId)) {
			return { id: unsigned, title: title || `App ${unsigned}`, steamAppId: mappedAppId };
		}
		return null;
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
			if (sTitle && alt === sTitle) {
				return shortcut;
			}
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
			if (sTitle && headingText === sTitle) {
				return shortcut;
			}
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
		friends: getCachedFriendData(shortcut.steamAppId)?.data || null,
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
	applyResource('friends', getFriendData(state.shortcut.steamAppId).then(async res => {
		const friendData = res.data;
		if (friendData && friendData.totalCount > 0) {
			const visibleIds = [
				...friendData.recentlyPlayed.map(f => f.steamid),
				...friendData.previouslyPlayed.map(f => f.steamid),
				...(friendData.wishlisted || []).map(f => f.steamid),
			];
			const idsToFetch = [...new Set(visibleIds)].filter(id => !hasCachedPersona(id)).slice(0, 24);
			if (idsToFetch.length > 0) {
				try {
					const raw = await fetchFriendPersonasBackend({ steam_ids_csv: idsToFetch.join(',') });
					const personas = JSON.parse(raw);
					if (Array.isArray(personas)) {
						for (const p of personas) cachePersona(p);
					}
				} catch {}
			}
		}
		return friendData;
	}));
}
function renderStuff(data: BigPictureDetailData): string {
	return `${renderAchievements(data.achievements)}${renderCards(data.cards)}${renderMediaAndNotes()}`;
}

function markupSignature(tab: BigPictureTab, markup: string): string {
	let hash = 2166136261;
	for (let i = 0; i < markup.length; i++) hash = Math.imul(hash ^ markup.charCodeAt(i), 16777619);
	return `${tab}:${markup.length}:${(hash >>> 0).toString(16)}`;
}

function renderRoot(state: BigPictureDetailState): void {
	const root = state.root;
	try { steamWebpackRuntime.captureRuntime(root.ownerDocument); } catch {}
	hideBigPictureNonSteamNotices(root.ownerDocument);
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
	if (state.activeTab === 'stuff' && state.data?.achievements) {
		const ach = state.data.achievements;
		const portrait = linkedShortcutPortrait(state.shortcut.id, state.shortcut.steamAppId)
			|| (state.shortcut.steamAppId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${state.shortcut.steamAppId}/library_600x900_2x.jpg` : '')
			|| state.data.game?.capsule_image || state.data.game?.header_image || '';

		const openAchievements = () => {
			const bg = state.data?.game?.background || state.data?.game?.background_raw || state.data?.game?.header_image || '';
			openBigPictureAchievementsScreen(
				root.ownerDocument,
				ach,
				state.data?.game?.name || state.shortcut.title,
				portrait,
				state.shortcut.id,
				bg
			);
		};

		root.querySelectorAll<HTMLElement>('.gdl-bp-open-ach-trigger, #gdl-bp-ach-featured-preview, .gdl-bp-ach-progress').forEach(el => {
			el.addEventListener('click', openAchievements);
		});

		const previewCard = root.querySelector<HTMLElement>('#gdl-bp-ach-featured-preview');
		root.querySelectorAll<HTMLElement>('.gdl-bp-ach-icon-frame').forEach(iconEl => {
			iconEl.addEventListener('click', openAchievements);
			const onFocus = () => {
				if (!previewCard) return;
				const title = iconEl.dataset.achTitle || '';
				const desc = iconEl.dataset.achDesc || '';
				const pct = iconEl.dataset.achPct || '';
				const img = iconEl.dataset.achImg || '';
				const titleEl = previewCard.querySelector('.gdl-bp-ach-featured-title');
				const descEl = previewCard.querySelector('.gdl-bp-ach-featured-desc');
				const pctEl = previewCard.querySelector('.gdl-bp-ach-featured-pct');
				const imgEl = previewCard.querySelector<HTMLImageElement>('.gdl-bp-ach-img');
				if (titleEl && title) titleEl.textContent = title;
				if (descEl && desc) descEl.textContent = desc;
				if (pctEl && pct) pctEl.textContent = `${pct}% ${gdlText('players_have_achievement', 'de los jugadores tienen este logro')}`;
				if (imgEl && img) imgEl.src = img;
			};
			iconEl.addEventListener('focus', onFocus);
			iconEl.addEventListener('mouseenter', onFocus);
		});
	}
	if (state.activeTab === 'stuff' && state.data?.cards?.cards?.length) {
		const catalog = state.data.cards;
		const cards = catalog.cards || [];
		const badge = catalog.foil_badge || catalog.badges?.[0] || null;
		root.querySelectorAll<HTMLElement>('.gdl-bp-card-item[data-gdl-card-idx]').forEach(cardEl => {
			const idx = Number(cardEl.dataset.gdlCardIdx);
			const item = cards[idx];
			if (item) {
				cardEl.addEventListener('click', () => {
					openBigPictureCardModal(root.ownerDocument, {
						title: item.title || state.shortcut.title,
						image: item.image,
						artwork: item.artwork,
						foil: item.foil,
						badgeTitle: badge?.title ? `${badge.title} • ${(badge.level || 1) * 100} EXP` : undefined,
						gameName: state.data?.game?.name || state.shortcut.title,
					});
				});
			}
		});
	}
	if (state.activeTab === 'activity') {
		const postInput = root.querySelector<HTMLInputElement>('.gdl-bp-feed-post-input');
		if (postInput) {
			const triggerKeyboard = () => {
				try {
					const steamSystem = (window as any).SteamClient?.System;
					if (typeof steamSystem?.ShowGamepadTextInput === 'function') {
						steamSystem.ShowGamepadTextInput(0, 0, loc('AppActivity_PostPlaceholder', 'Diles algo sobre este juego a tus amigos...'), 500, postInput.value || '');
					}
				} catch {}
			};
			postInput.addEventListener('click', triggerKeyboard);
			postInput.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' && postInput.value.trim()) {
					e.preventDefault();
					const text = postInput.value.trim();
					const user = getCurrentSteamUser(root.ownerDocument);
					const newPost: LocalActivityPost = {
						id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
						text,
						timestamp: Math.floor(Date.now() / 1000),
						user_name: user.name || 'Tú',
						user_avatar: user.avatar || '',
					};
					saveLocalActivityPost(state.shortcut.steamAppId, newPost, String(state.shortcut.id));
					postInput.value = '';
					state.renderSignature = '';
					renderRoot(state);
				}
			});
		}

		const jumpBtn = root.querySelector<HTMLElement>('.gdl-bp-feed-jump-news');
		if (jumpBtn) {
			jumpBtn.addEventListener('click', () => {
				const firstCard = root.querySelector<HTMLElement>('.gdl-bp-feed-card[data-gdl-news-gid]');
				if (firstCard) {
					firstCard.focus();
					firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
			});
		}

		const loadMoreBtn = root.querySelector<HTMLElement>('.gdl-bp-feed-load-more-btn');
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', () => {
				loadMoreBtn.textContent = loc('AppActivity_NoMoreActivity', 'No hay más actividad');
			});
		}

		if (state.data?.news) {
			const newsList = state.data.news;
			root.querySelectorAll<HTMLElement>('.gdl-bp-feed-card[data-gdl-news-gid]').forEach(card => {
				const gid = card.dataset.gdlNewsGid;
				const item = newsList.find(n => n.gid === gid || n.url === gid);
				if (item) {
					card.addEventListener('click', event => {
						event.preventDefault();
						event.stopPropagation();
						openBigPictureNewsModal(root.ownerDocument, item, state.data?.game?.name || state.shortcut.title, state.data?.game?.header_image || state.data?.game?.capsule_image || '');
					});
				}
			});
		}
	}
	if (state.activeTab === 'community') {
		const communityItems = fallbackCommunity(state.data || { game: null, achievements: null, news: [], community: [], cards: null, friends: null }).filter(item => item.image);
		const videos = communityItems.filter(item => item.type === 'video' || Boolean(item.youtube_id)).slice(0, 2);
		const nonVideos = communityItems.filter(item => item.type !== 'video' && !item.youtube_id);
		const displayedVideos = videos.length > 0 ? videos : communityItems.slice(0, 2);
		const displayedGuides = nonVideos.length > 0 ? nonVideos.slice(0, 8) : communityItems.slice(2, 10);

		root.querySelectorAll<HTMLElement>('.gdl-bp-community-video-card[data-gdl-comm-video-idx]').forEach(cardEl => {
			const idx = Number(cardEl.dataset.gdlCommVideoIdx);
			const item = displayedVideos[idx] || communityItems[idx];
			if (item) {
				cardEl.addEventListener('click', e => {
					e.preventDefault();
					e.stopPropagation();
					openBigPictureCommunityModal(root.ownerDocument, item, state.data?.game?.name || state.shortcut.title);
				});
			}
		});

		root.querySelectorAll<HTMLElement>('.gdl-bp-community-guide-card[data-gdl-comm-guide-idx]').forEach(cardEl => {
			const idx = Number(cardEl.dataset.gdlCommGuideIdx);
			const item = displayedGuides[idx] || communityItems[idx + 2];
			if (item) {
				cardEl.addEventListener('click', e => {
					e.preventDefault();
					e.stopPropagation();
					openBigPictureCommunityModal(root.ownerDocument, item, state.data?.game?.name || state.shortcut.title);
				});
			}
		});
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
	disposeBigPictureGamepadNavigation(doc);
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
	removeBigPicturePlaybarEnhancements(doc);
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
	syncBigPicturePlaybarEnhancements(doc, tabs.strip, state?.data?.achievements || coldCached?.achievements || null, shortcut.id);
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
	disposeBigPictureGamepadNavigation(doc);
	removeBigPictureDetailsNodes(doc);
}
