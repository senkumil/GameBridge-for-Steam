import React from 'react';
import { Millennium, IconsModule, definePlugin } from '@steambrew/client';
import { backendLog } from '../api/backend';
import { findMappingForTitle, mappings, loadMappings } from '../core/mappings';
import { clearGameDataCache } from '../core/game-data';
import { getSteamLanguage, subscribeSteamLanguageChange, startSteamLanguageWatcher, stopSteamLanguageWatcher, officialSteamText, setLocalizationDocumentProvider } from '../steam/localization';
import { SettingsContent } from '../settings/SettingsContent';
import { findActiveShortcutAppId, isSteamLibraryActive } from '../steam/shortcuts';
import { clearLibraryAssetCaches } from '../features/library/artwork';
import { clearCommunityItemCaches } from '../features/library/community-items';
import { clearSocialRuntimeCaches, configureSocialRuntimeHost } from '../features/library/social';
import { configureLibraryRuntimeHost, disposeLibraryRuntime, findNonSteamNotice, getCurrentInjectedAppId, getCurrentInjectedShortcutAppId, handleLibraryNavigation, hideNoticeQuick, refreshLibraryArtwork, resetLibraryInjection, tryInjectLibraryData } from '../features/library/runtime';
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
import { startPlaytimeTracker, stopPlaytimeTracker } from '../features/playtime/tracker';
let mainWindowDoc: Document | null = null;
setLocalizationDocumentProvider(() => mainWindowDoc);
function normalizedDomText(value: unknown): string {
	return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}
const copiedFeedbackCleanupScheduled = new WeakSet<Element>();
function currentCopiedFeedbackLabels(): Set<string> {
	return new Set(['copied!', 'copied', '¡copiado!', 'copiado!', 'copiado', normalizedDomText(officialSteamText('Copied!')), normalizedDomText(officialSteamText('Copied'))].filter(Boolean));
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
		}, 300);
	}
}
// ── Window create hook ─────────────────────────────────────────────────

const observedDocs = new WeakSet<Document>();
const documentLifecycles = new Set<DisposableRegistry>();

function disposeDocumentLifecycles(): void {
	for (const lifecycle of Array.from(documentLifecycles)) lifecycle.dispose();
	documentLifecycles.clear();
}
function windowCreated(context: any): void {
	const popupWin: Window | undefined = context?.window || (context?.document ? context : (typeof window !== 'undefined' ? window : undefined));
	const popupDoc: Document | undefined = popupWin?.document;
	const popupName: string = context?.m_strName || popupWin?.name || '';
	const popupTitle: string = context?.m_strTitle || popupDoc?.title || '';

	if (!popupWin || !popupDoc) return;

	if (!popupDoc.body) {
		popupWin.addEventListener('DOMContentLoaded', () => windowCreated(context), { once: true });
		return;
	}

	if (observedDocs.has(popupDoc)) return;
	observedDocs.add(popupDoc);

	const isBigPictureWindow = /SP BPM|SP Big Picture|Big Picture|Gamepad/i.test(`${popupName} ${popupTitle}`);
	const isOverlayWindow = /desktopoverlay|SP Overlay|Game Overlay/i.test(`${popupName} ${popupTitle}`);
	const isMainWindow = popupName === 'SP Desktop'
		|| (popupName.includes('SP Desktop') && !popupName.includes('Popup') && !popupName.includes('Login'))
		|| (!popupName && popupWin === window && !isBigPictureWindow && !isOverlayWindow);
	let lifecycle!: DisposableRegistry;
	lifecycle = new DisposableRegistry(() => documentLifecycles.delete(lifecycle));
	documentLifecycles.add(lifecycle);
	// SP Desktop performs internal navigations while Steam rebuilds a shortcut.
	// Its beforeunload/unload events are not proof that the visible CEF window is
	// gone; disposing here permanently loses the observer until Steam restarts.
	if (!isMainWindow) {
		const disposeWindow = () => lifecycle.dispose();
		lifecycle.listen(popupWin, 'beforeunload', disposeWindow, { once: true });
		lifecycle.listen(popupWin, 'unload', disposeWindow, { once: true });
	}
	lifecycle.add(() => disposeLocalAchievementUI(popupDoc));
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
		// A full CEF document replacement does require a new observer. Wait until
		// the replacement document actually exists, then hand ownership over; do
		// not tear the active observer down on Steam's earlier unload signal.
		lifecycle.interval(() => {
			try {
				if (popupWin.closed) { lifecycle.dispose(); return; }
				const liveDoc = popupWin.document;
				if (liveDoc !== popupDoc && liveDoc?.body) {
					lifecycle.dispose();
					windowCreated({ window: popupWin, m_strName: popupName || 'SP Desktop', m_strTitle: popupTitle });
				}
			} catch {}
		}, 250);
	}

	let mutationTimer: ReturnType<typeof setTimeout> | null = null;
	lifecycle.add(() => { if (mutationTimer) clearTimeout(mutationTimer); mutationTimer = null; });
	let lastNavUrl = String(popupDoc.defaultView?.location?.href || popupDoc.location?.href || '');
	const runInjection = () => {
		tryInjectPropertiesField(popupDoc, popupTitle);
		if (isMainWindow) captureNativeUiBlueprints(popupDoc, { skip: () => Boolean(findNonSteamNotice(popupDoc) || popupDoc.getElementById(GDL_INJECTED)) });
		if (isMainWindow) void tryInjectLibraryData(popupDoc).catch(e => backendLog('Library injection error: ' + e));
		if (isMainWindow) scheduleCopiedFeedbackCleanup(popupDoc);
		if (isBigPictureWindow) {
			void refreshBigPicture(popupDoc).catch(e => backendLog('Big Picture refresh error: ' + e));
		}
	};
	const isGdlOwnedNode = (node: Node, fallback: Node): boolean => {
		const element = (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement)
			|| (fallback.nodeType === Node.ELEMENT_NODE ? fallback as Element : fallback.parentElement);
		return Boolean(element?.closest?.('[id^="gdl-"], [data-gdl-hidden], [data-gdl-shortcut-app-id]'));
	};
	const isGdlOnlyMutation = (records: MutationRecord[]): boolean => records.length > 0 && records.every(record => {
		const changed = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
		return changed.length > 0 && changed.every(node => isGdlOwnedNode(node, record.target));
	});
	const isVisibleNotice = (element: Element): boolean => {
		const view = popupDoc.defaultView;
		if (!view || !element.isConnected) return false;
		const style = view.getComputedStyle(element);
		return style.display !== 'none' && style.visibility !== 'hidden' && (element as HTMLElement).getClientRects().length > 0;
	};
	// The library list does not consistently change location.href before it
	// starts replacing the app page.  Capture a game-row activation so pending
	// linked-game work is invalidated before Steam can reuse the old page DOM.
	const isLibraryGameRow = (target: EventTarget | null): boolean => {
		if (!(target instanceof Element) || target.closest('[id^="gdl-"]')) return false;
		const row = target.closest('[class*="AppListEntry"], [class*="appListEntry"], [class*="applist_entry"]');
		if (row) return true;
		const link = target.closest<HTMLAnchorElement>('a[href]');
		return Boolean(link && /(?:games\/details|library\/app|\/app)\/\d+/i.test(link.href));
	};
	if (isMainWindow) {
		lifecycle.listen(popupDoc, 'pointerdown', event => {
			if (isLibraryGameRow(event.target)) handleLibraryNavigation(popupDoc);
		}, true);
	}
	const observer = new MutationObserver((records) => {
		const currentUrl = String(popupDoc.defaultView?.location?.href || popupDoc.location?.href || '');
		if (currentUrl && currentUrl !== lastNavUrl) {
			lastNavUrl = currentUrl;
			if (mutationTimer) { clearTimeout(mutationTimer); mutationTimer = null; }
			if (isMainWindow) handleLibraryNavigation(popupDoc);
			runInjection();
			return;
		}
		// Rendering a linked page creates several DOM mutations of its own. They
		// are already complete, so feeding them back into the navigation observer
		// used to schedule redundant injection/cleanup passes and visible flicker.
		if (isGdlOnlyMutation(records)) return;
		// Fast path: if a non-Steam notice exists and is visible, process immediately to prevent flash
		if (isMainWindow) {
			const noticeInfo = findNonSteamNotice(popupDoc);
			if (noticeInfo && isVisibleNotice(noticeInfo.element)) {
				const activeShortcutAppId = findActiveShortcutAppId(popupDoc, noticeInfo.title);
				if (findMappingForTitle(noticeInfo.title, activeShortcutAppId)) hideNoticeQuick(noticeInfo.element);
				if (mutationTimer) { clearTimeout(mutationTimer); mutationTimer = null; }
				runInjection();
				return;
			}
		}
		// Steam emits a burst of separate mutations while rebuilding its first
		// library route. Coalesce that burst into one pass instead of mounting,
		// cleaning and mounting our chrome several times in the first second.
		if (mutationTimer) return;
		mutationTimer = setTimeout(() => {
			mutationTimer = null;
			runInjection();
		}, 90);
	});
	lifecycle.observe(observer, popupDoc.body, { childList: true, subtree: true });
	// Steam can update the route before it mutates the library subtree. Polling
	// the URL lightly closes that gap without observing every React attribute.
	lifecycle.interval(() => {
		try {
			const currentUrl = String(popupDoc.defaultView?.location?.href || popupDoc.location?.href || '');
			if (!currentUrl || currentUrl === lastNavUrl) return;
			lastNavUrl = currentUrl;
			if (mutationTimer) { clearTimeout(mutationTimer); mutationTimer = null; }
			if (isMainWindow) handleLibraryNavigation(popupDoc);
			runInjection();
		} catch {}
	}, 120);

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

	// One settled startup pass is sufficient. The observer and route watcher
	// cover late Steam content; the former 100/400/1000 ms passes fought the
	// native initial render and were a major source of background/bar flashes.
	lifecycle.timeout(() => {
		runInjection();
	}, 350);
}

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
		refreshLibraryArtwork,
		resetLibraryInjection,
		findNonSteamNotice: (doc) => {
			const info = findNonSteamNotice(doc);
			return info ? { title: info.title } : null;
		},
		isLibraryActive: (doc) => {
			const target = doc || mainWindowDoc;
			return Boolean(target && (findNonSteamNotice(target) || isSteamLibraryActive(target)));
		},
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
			startPlaytimeTracker();
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
			startPlaytimeTracker();
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
	try {
		windowCreated(window);
	} catch (e) {
		console.error('[GDL] Failed to initialize current window hook:', e);
	}
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
			stopPlaytimeTracker();
			deactivateBigPicture();
			disposeLibraryRuntime();
			disposeAchievementRuntime();
			clearNativeUiBlueprints();
			resetResolvedCssClassModules();
		},
	};
});
