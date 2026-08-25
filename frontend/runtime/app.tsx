import React from 'react';
import { Millennium, IconsModule, definePlugin } from '@steambrew/client';
import { backendLog } from '../api/backend';
import { mappings, loadMappings, findMappingForTitle } from '../core/mappings';
import { clearGameDataCache } from '../core/game-data';
import { getSteamLanguage, subscribeSteamLanguageChange, startSteamLanguageWatcher, stopSteamLanguageWatcher, officialSteamText, setLocalizationDocumentProvider } from '../steam/localization';
import { SettingsContent } from '../settings/SettingsContent';
import { findActiveShortcutAppId } from '../steam/shortcuts';
import { clearLibraryAssetCaches } from '../features/library/artwork';
import { clearCommunityItemCaches } from '../features/library/community-items';
import { clearSocialRuntimeCaches, configureSocialRuntimeHost } from '../features/library/social';
import { configureLibraryRuntimeHost, disposeLibraryRuntime, findNonSteamNotice, getCurrentInjectedAppId, getCurrentInjectedShortcutAppId, hideNoticeQuick, refreshLibraryArtwork, resetLibraryInjection, tryInjectLibraryData } from '../features/library/runtime';
import { DisposableRegistry } from '../core/disposables';
import { configureShortcutRuntimeHost, startShortcutAutoDetector, stopShortcutAutoDetector, tryInjectPropertiesField } from '../features/shortcuts/runtime';
import { GDL_INJECTED } from '../features/library/constants';
import { activateBigPicture, deactivateBigPicture, getBigPictureDocument, isBigPictureActive, refreshBigPicture } from '../features/big-picture/runtime';
import { captureNativeUiBlueprints, clearNativeUiBlueprints } from '../steam/native-dom';
import { resetResolvedCssClassModules } from '../steam/css';
import {
	clearLocalAchievementCache,
	configureAchievementRuntimeHost,
	disposeAchievementRuntime,
	disposeLocalAchievementUI,
	installLocalAchievementUI,
	registerNativeAchievementToastWindow,
	showAchievementToast,
} from '../features/achievements/runtime';
let mainWindowDoc: Document | null = null;
setLocalizationDocumentProvider(() => mainWindowDoc);



// ── Millennium plugin-menu layout repair ─────────────────────────────────

const pluginMenuRepairAt = new WeakMap<Document, number>();

function normalizedDomText(value: unknown): string {
	return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

const copiedFeedbackCleanupScheduled = new WeakSet<Element>();

function currentCopiedFeedbackLabels(): Set<string> {
	return new Set([
		normalizedDomText('Copied!'),
		normalizedDomText(officialSteamText('Copied!')),
		normalizedDomText(officialSteamText('Copied')),
	].filter(Boolean));
}

/**
 * Millennium sometimes leaves our transient "Copied" feedback portal mounted
 * after its owning settings view closes. Only target a floating, non-interactive
 * element whose complete text matches Steam's current localized copied-feedback label.
 */
function scheduleCopiedFeedbackCleanup(doc: Document): void {
	const copiedFeedbackLabels = currentCopiedFeedbackLabels();
	if (!doc.body || copiedFeedbackLabels.size === 0) return;
	for (const candidate of Array.from(doc.querySelectorAll<HTMLElement>('div, span'))) {
		const label = normalizedDomText(candidate.textContent);
		if (!copiedFeedbackLabels.has(label)) continue;
		if (candidate.matches('button, a, input, textarea, [role="button"]')
			|| candidate.closest('button, a, input, textarea, [role="button"]')) continue;
		// Work from the deepest text node so a matching portal is not scheduled
		// once for every wrapper around the same feedback label.
		if (Array.from(candidate.children).some(child => copiedFeedbackLabels.has(normalizedDomText(child.textContent)))) continue;

		let target: HTMLElement = candidate;
		let cursor: HTMLElement | null = candidate;
		let floating = false;
		for (let depth = 0; cursor && depth < 5; depth += 1) {
			if (normalizedDomText(cursor.textContent) !== label) break;
			const style = doc.defaultView?.getComputedStyle(cursor);
			const marker = `${String(cursor.className || '')} ${cursor.id || ''}`;
			if (/^(fixed|absolute|sticky)$/i.test(style?.position || '') || /tooltip|toast|copied|notification/i.test(marker)) {
				target = cursor;
				floating = true;
			}
			cursor = cursor.parentElement;
		}
		if (!floating || copiedFeedbackCleanupScheduled.has(target)) continue;
		copiedFeedbackCleanupScheduled.add(target);
		setTimeout(() => {
			if (target.isConnected && copiedFeedbackLabels.has(normalizedDomText(target.textContent))) target.remove();
		}, 1400);
	}
}

function visibleDomElement(element: Element | null): element is HTMLElement {
	if (!(element instanceof HTMLElement)) return false;
	const style = element.ownerDocument.defaultView?.getComputedStyle(element);
	if (style?.display === 'none' || style?.visibility === 'hidden' || Number(style?.opacity || 1) === 0) return false;
	const rect = element.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}

/**
 * Some Millennium builds mount the plugin action menu at (0, 0) when the
 * plugin manager is re-rendered. Detect our own menu structurally so the
 * repair is independent of the Steam/Millennium UI language.
 */
function repairOwnPluginMenuPosition(doc: Document): void {
	if (!doc.body) return;
	const titleText = normalizedDomText('GameBridge for Steam');
	const candidates: HTMLElement[] = [];
	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const element = node as HTMLElement;
		if (!visibleDomElement(element)) continue;
		const text = normalizedDomText(element.textContent);
		if (!text.includes(titleText)) continue;
		const interactiveCount = element.querySelectorAll('button, a, [role="button"], [tabindex]').length;
		if (interactiveCount < 3) continue;
		const rect = element.getBoundingClientRect();
		if (rect.width < 180 || rect.height < 80 || rect.width > 700) continue;
		candidates.push(element);
	}
	if (candidates.length === 0) return;

	// Choose the smallest matching ancestor: it is the menu surface rather
	// than the full plugin-manager page or its portal container.
	const menu = candidates.sort((a, b) => {
		const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
		const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
		return aArea - bArea;
	})[0];
	const now = Date.now();
	if (now - (pluginMenuRepairAt.get(doc) || 0) < 120) return;
	pluginMenuRepairAt.set(doc, now);

	const menuRect = menu.getBoundingClientRect();
	const misplaced = menuRect.left <= 2 && menuRect.top <= 2;
	if (!misplaced) return;

	// Locate the visible plugin row outside the menu. The row's right edge is
	// the stable anchor even when the client window is resized.
	const rowCandidates: HTMLElement[] = [];
	const rowWalker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
	while ((node = rowWalker.nextNode())) {
		const element = node as HTMLElement;
		if (element === menu || menu.contains(element) || !visibleDomElement(element)) continue;
		const text = normalizedDomText(element.textContent);
		if (text !== titleText && !text.startsWith(titleText + ' v')) continue;
		const rect = element.getBoundingClientRect();
		if (rect.top < 80 || rect.height < 20 || rect.height > 180 || rect.width < 300) continue;
		rowCandidates.push(element);
	}
	const row = rowCandidates.sort((a, b) => {
		const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
		const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
		return bArea - aArea;
	})[0];
	if (!row) return;

	const rowRect = row.getBoundingClientRect();
	const viewportWidth = doc.defaultView?.innerWidth || doc.documentElement.clientWidth || 0;
	const viewportHeight = doc.defaultView?.innerHeight || doc.documentElement.clientHeight || 0;
	const width = menuRect.width || 280;
	const height = menuRect.height || 180;
	const left = Math.max(8, Math.min(viewportWidth - width - 8, rowRect.right - width));
	const below = rowRect.bottom + 8;
	const top = below + height <= viewportHeight - 8
		? below
		: Math.max(8, rowRect.top - height - 8);

	menu.style.setProperty('position', 'fixed', 'important');
	menu.style.setProperty('left', `${Math.round(left)}px`, 'important');
	menu.style.setProperty('top', `${Math.round(top)}px`, 'important');
	menu.style.setProperty('right', 'auto', 'important');
	menu.style.setProperty('bottom', 'auto', 'important');
	menu.style.setProperty('transform', 'none', 'important');
	menu.style.setProperty('margin', '0', 'important');
}

// ── Window create hook ─────────────────────────────────────────────────

const observedDocs = new WeakSet<Document>();
const documentLifecycles = new Set<DisposableRegistry>();

function disposeDocumentLifecycles(): void {
	for (const lifecycle of Array.from(documentLifecycles)) lifecycle.dispose();
	documentLifecycles.clear();
}

function windowCreated(context: any): void {
	const popupWin: Window | undefined = context?.window;
	const popupDoc: Document | undefined = popupWin?.document;
	const popupName: string = context?.m_strName || '';
	const popupTitle: string = context?.m_strTitle || '';

	if (!popupDoc?.body) return;

	if (observedDocs.has(popupDoc)) return;
	observedDocs.add(popupDoc);

	let lifecycle!: DisposableRegistry;
	lifecycle = new DisposableRegistry(() => documentLifecycles.delete(lifecycle));
	documentLifecycles.add(lifecycle);
	const disposeWindow = () => lifecycle.dispose();
	lifecycle.listen(popupWin, 'beforeunload', disposeWindow, { once: true });
	lifecycle.listen(popupWin, 'unload', disposeWindow, { once: true });
	lifecycle.add(() => disposeLocalAchievementUI(popupDoc));

	const isMainWindow = popupName === 'SP Desktop' || (popupName.includes('SP Desktop') && !popupName.includes('Popup') && !popupName.includes('Login'));
	// Steam names the current Big Picture window "SP BPM_uidN". Keep the
	// additional names as fallbacks because this has changed between client
	// builds and is also used by some Steam forks.
	const isBigPictureWindow = /SP BPM|SP Big Picture|Big Picture|Gamepad/i.test(`${popupName} ${popupTitle}`);
	const isOverlayWindow = /desktopoverlay|SP Overlay|Game Overlay/i.test(`${popupName} ${popupTitle}`);
	if (isOverlayWindow) {
		registerNativeAchievementToastWindow(popupWin, 'overlay', `${popupName} ${popupTitle}`.trim());
	} else if (isBigPictureWindow) {
		registerNativeAchievementToastWindow(popupWin, 'bigpicture', `${popupName} ${popupTitle}`.trim());
	} else if (isMainWindow) {
		registerNativeAchievementToastWindow(popupWin, 'desktop', `${popupName} ${popupTitle}`.trim());
	}
	if (isBigPictureWindow) {
		activateBigPicture(popupDoc);
		// Keep the real-achievement watcher alive when the game was launched
		// from Big Picture. Persistent baselines suppress duplicate toasts if the
		// desktop and Big Picture documents observe the same file change.
		installLocalAchievementUI(popupDoc);
	}

	if (isMainWindow) {
		mainWindowDoc = popupDoc;
		installLocalAchievementUI(popupDoc);
		scheduleCopiedFeedbackCleanup(popupDoc);
	}

	let mutationTimer: ReturnType<typeof setTimeout> | null = null;
	lifecycle.add(() => { if (mutationTimer) clearTimeout(mutationTimer); mutationTimer = null; });
	let lastNavUrl = '';
	const runInjection = () => {
		tryInjectPropertiesField(popupDoc, popupTitle);
		if (isMainWindow) captureNativeUiBlueprints(popupDoc, { skip: () => Boolean(findNonSteamNotice(popupDoc) || popupDoc.getElementById(GDL_INJECTED)) });
		if (isMainWindow) tryInjectLibraryData(popupDoc);
		if (isMainWindow) repairOwnPluginMenuPosition(popupDoc);
		if (isMainWindow) scheduleCopiedFeedbackCleanup(popupDoc);
		if (isBigPictureWindow) {
			void refreshBigPicture(popupDoc).catch(e => backendLog('Big Picture refresh error: ' + e));
		}
	};
	const observer = new MutationObserver(() => {
		const currentUrl = String(popupDoc.defaultView?.location?.href || popupDoc.location?.href || '');
		if (currentUrl && currentUrl !== lastNavUrl) {
			lastNavUrl = currentUrl;
			if (mutationTimer) { clearTimeout(mutationTimer); mutationTimer = null; }
			runInjection();
			return;
		}
		// Fast path: if a non-Steam notice exists and is visible, process immediately to prevent flash
		if (isMainWindow) {
			const noticeInfo = findNonSteamNotice(popupDoc);
			if (noticeInfo && (noticeInfo.element as HTMLElement).style.display !== 'none') {
				const activeShortcutAppId = findActiveShortcutAppId(popupDoc, noticeInfo.title);
				const steamAppId = findMappingForTitle(noticeInfo.title, activeShortcutAppId);
				if (steamAppId) {
					hideNoticeQuick(noticeInfo.element);
				}
				if (mutationTimer) { clearTimeout(mutationTimer); mutationTimer = null; }
				runInjection();
				return;
			}
		}
		if (mutationTimer) return;
		runInjection();
		mutationTimer = setTimeout(() => {
			mutationTimer = null;
			runInjection();
		}, 150);
	});
	lifecycle.observe(observer, popupDoc.body, { childList: true, subtree: true });

	// Big Picture replaces its app overviews while moving between tabs and
	// after Steam finishes loading the library. Keep the shim alive through
	// those replacements instead of applying it only during initial render.
	let refreshInterval: ReturnType<typeof setInterval> | null = null;
	lifecycle.add(() => { if (refreshInterval) clearInterval(refreshInterval); refreshInterval = null; });
	if (isBigPictureWindow) {
		refreshInterval = setInterval(() => {
			try {
				if (popupWin.closed || !popupDoc.body) {
					if (refreshInterval) clearInterval(refreshInterval);
					if (getBigPictureDocument() === popupDoc) deactivateBigPicture();
					return;
				}
				runInjection();
			} catch (e) {
				backendLog('Big Picture refresh error: ' + e);
			}
		}, 900);
	}

	lifecycle.timeout(() => {
		tryInjectPropertiesField(popupDoc, popupTitle);
		if (isMainWindow) tryInjectLibraryData(popupDoc);
		if (isMainWindow) repairOwnPluginMenuPosition(popupDoc);
		if (isBigPictureWindow) void refreshBigPicture(popupDoc).catch(error => backendLog('Big Picture refresh error: ' + error));
	}, 100);
	lifecycle.timeout(() => {
		tryInjectPropertiesField(popupDoc, popupTitle);
		if (isMainWindow) tryInjectLibraryData(popupDoc);
		if (isMainWindow) repairOwnPluginMenuPosition(popupDoc);
		if (isBigPictureWindow) void refreshBigPicture(popupDoc).catch(error => backendLog('Big Picture refresh error: ' + error));
	}, 400);
	lifecycle.timeout(() => {
		tryInjectPropertiesField(popupDoc, popupTitle);
		if (isMainWindow) tryInjectLibraryData(popupDoc);
		if (isBigPictureWindow) void refreshBigPicture(popupDoc).catch(error => backendLog('Big Picture refresh error: ' + error));
	}, 1000);
}

// ── Plugin entry point ─────────────────────────────────────────────────

export default definePlugin(() => {
	console.log('[GDL] definePlugin callback executing - frontend initialized successfully');
	configureLibraryRuntimeHost({ getMainWindowDoc: () => mainWindowDoc });
	configureAchievementRuntimeHost({
		getCurrentInjectedAppId,
		getCurrentInjectedShortcutAppId,
		findNonSteamNotice: (doc) => {
			const info = findNonSteamNotice(doc);
			return info ? { title: info.title } : null;
		},
		findActiveShortcutAppId,
	});
	configureShortcutRuntimeHost({
		getMainWindowDoc: () => mainWindowDoc,
		findNonSteamNotice: (doc) => {
			const info = findNonSteamNotice(doc);
			return info ? { title: info.title } : null;
		},
		resetLibraryInjection,
		refreshLibraryArtwork,
	});
	configureSocialRuntimeHost({
		getCurrentInjectedAppId,
		getCurrentInjectedShortcutAppId,
	});
	if (Object.keys(mappings).length > 0) {
		backendLog('Instant startup mapping snapshot: ' + Object.keys(mappings).length + ' entrie(s)');
	}

	const refreshForUIMode = (mode: number): void => {
		if (Number(mode) === 4) {
			const doc = getBigPictureDocument() || mainWindowDoc;
			if (doc) void refreshBigPicture(doc).catch(error => backendLog('Big Picture mode refresh error: ' + error));
			return;
		}
		if (Number(mode) === 7 && isBigPictureActive()) deactivateBigPicture();
	};

	loadMappings()
		.then(() => {
			backendLog('Loaded ' + Object.keys(mappings).length + ' mapping(s)');
			startShortcutAutoDetector();
			if (mainWindowDoc) {
				tryInjectLibraryData(mainWindowDoc).catch(e => backendLog('Post-startup library refresh error: ' + e));
			}
			const bigPictureDoc = getBigPictureDocument();
			if (bigPictureDoc) void refreshBigPicture(bigPictureDoc).catch(e => backendLog('Big Picture refresh error: ' + e));
		})
		.catch((e) => {
			console.error('[GDL] Failed to load mappings from backend:', e);
			// Continue anyway - the UI should still work, just without saved mappings
			startShortcutAutoDetector();
		});

	const unsubscribeLanguageRefresh = subscribeSteamLanguageChange((language, previousLanguage) => {
		if (!previousLanguage || previousLanguage === language) return;
		clearGameDataCache();
		clearCommunityItemCaches();
		clearSocialRuntimeCaches();
		clearLibraryAssetCaches();
		clearLocalAchievementCache();
		clearNativeUiBlueprints();
		resetLibraryInjection(true);
		const bigPictureDoc = getBigPictureDocument();
		if (bigPictureDoc) void refreshBigPicture(bigPictureDoc).catch(() => {});
	});
	startSteamLanguageWatcher();

	// The cached language is available synchronously; validate it in the
	// background in case the user changed Steam's language since the last run.
	getSteamLanguage(true).catch(() => {});
	let unregisterUIModeChanged: (() => void) | null = null;
	try {
		const registration = (window as any).SteamClient?.UI?.RegisterForUIModeChanged?.(refreshForUIMode);
		if (typeof registration === 'function') unregisterUIModeChanged = registration;
		void (async () => {
			try {
			const currentMode = await (window as any).SteamClient?.UI?.GetUIMode?.();
			if (currentMode !== undefined) refreshForUIMode(Number(currentMode));
		} catch {}
		})();
	} catch {}

	Millennium.AddWindowCreateHook(windowCreated);
	console.log('[GDL] Window create hook registered');

	return {
		title: 'GameBridge for Steam',
		icon: <IconsModule.Settings />,
		content: <SettingsContent clearAchievementCache={clearLocalAchievementCache} showAchievementToast={showAchievementToast} />,
		onDismount: () => {
			disposeDocumentLifecycles();
			unsubscribeLanguageRefresh();
			unregisterUIModeChanged?.();
			stopSteamLanguageWatcher();
			stopShortcutAutoDetector();
			deactivateBigPicture();
			disposeLibraryRuntime();
			disposeAchievementRuntime();
			clearNativeUiBlueprints();
			resetResolvedCssClassModules();
		},
	};
});
