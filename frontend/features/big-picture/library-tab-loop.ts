/**
 * Loop navigation and wrap-around controller for Big Picture Library Tabs.
 *
 * When NativeGameLink merges mapped shortcuts into native library categories and
 * conceals the "Non-Steam" tab, Steam Gamepad UI internal state still indexes the
 * hidden tab. This module intercepts LB and RB at the edges (looping between the
 * first and last visible tabs) and instantly bounces out of the hidden tab if
 * Steam ever attempts to activate it, preventing black/blank screens.
 */

export const LIBRARY_TAB_SELECTOR = '[role="tab"], [class*="TabItem"], [class*="tabItem"], [class*="LibraryTab"], [class*="FilterTab"], [class*="tab_"], [class*="Tab_"], [class*="TopBar"] button, [class*="TabBar"] button';

const lastActiveTabEdge = new WeakMap<Document, 'first' | 'last' | 'middle'>();

export function isElementSelectedTab(el: HTMLElement): boolean {
	return el.getAttribute('aria-selected') === 'true'
		|| el.getAttribute('data-active') === 'true'
		|| /active|selected/i.test(el.className);
}

export function redirectIfHiddenTabSelected(doc: Document): void {
	if (!doc.body) return;
	const hiddenTabs = Array.from(doc.querySelectorAll<HTMLElement>('[data-gdl-hidden-shortcut-tab="1"]'));
	for (const hidden of hiddenTabs) {
		const isSelected = isElementSelectedTab(hidden) || hidden === doc.activeElement;
		if (isSelected) {
			const parent = hidden.parentElement;
			if (!parent) continue;
			const visibleTabs = Array.from(parent.querySelectorAll<HTMLElement>(LIBRARY_TAB_SELECTOR))
				.filter(t => !t.dataset.gdlHiddenShortcutTab && t.style.display !== 'none');
			if (visibleTabs.length === 0) continue;
			const edge = lastActiveTabEdge.get(doc) || 'last';
			const target = (edge === 'last') ? visibleTabs[0] : visibleTabs[visibleTabs.length - 1];
			target.click();
			target.focus();
			break;
		}
	}
}

export function trackVisibleTabEdges(doc: Document): void {
	const visibleTabs = Array.from(doc.querySelectorAll<HTMLElement>(LIBRARY_TAB_SELECTOR))
		.filter(t => !t.dataset.gdlHiddenShortcutTab && t.style.display !== 'none');
	if (visibleTabs.length < 2) return;
	if (isElementSelectedTab(visibleTabs[0])) {
		lastActiveTabEdge.set(doc, 'first');
	} else if (isElementSelectedTab(visibleTabs[visibleTabs.length - 1])) {
		lastActiveTabEdge.set(doc, 'last');
	} else if (visibleTabs.some(t => isElementSelectedTab(t))) {
		lastActiveTabEdge.set(doc, 'middle');
	}
}

let libraryTabLoopRaf: number | null = null;
const prevLibraryTabButtons = new Map<number, boolean>();
let lastLibraryTabNavTime = 0;
let libraryKeydownListener: ((e: KeyboardEvent) => void) | null = null;

function pollLibraryTabLoop(doc: Document): void {
	if (!doc.body?.isConnected) {
		if (libraryTabLoopRaf != null) {
			cancelAnimationFrame(libraryTabLoopRaf);
			libraryTabLoopRaf = null;
		}
		return;
	}

	trackVisibleTabEdges(doc);
	redirectIfHiddenTabSelected(doc);

	const win = doc.defaultView || window;
	const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
	const gp = Array.from(gamepads).find(g => g && g.connected);
	if (gp) {
		const btnLB = Boolean(gp.buttons[4]?.pressed);
		const btnRB = Boolean(gp.buttons[5]?.pressed);
		const prevLB = prevLibraryTabButtons.get(4) || false;
		const prevRB = prevLibraryTabButtons.get(5) || false;
		prevLibraryTabButtons.set(4, btnLB);
		prevLibraryTabButtons.set(5, btnRB);

		const now = Date.now();
		if (now - lastLibraryTabNavTime > 220) {
			const visibleTabs = Array.from(doc.querySelectorAll<HTMLElement>(LIBRARY_TAB_SELECTOR))
				.filter(t => !t.dataset.gdlHiddenShortcutTab && t.style.display !== 'none');

			if (visibleTabs.length > 1) {
				const activeIndex = visibleTabs.findIndex(t => isElementSelectedTab(t) || t === doc.activeElement);

				if (btnRB && !prevRB && activeIndex === visibleTabs.length - 1) {
					// User pressed RB on the last visible tab (e.g. "INSTALADOS"): wrap around to first tab!
					lastLibraryTabNavTime = now;
					lastActiveTabEdge.set(doc, 'first');
					visibleTabs[0].click();
					visibleTabs[0].focus();
				} else if (btnLB && !prevLB && activeIndex === 0) {
					// User pressed LB on the first visible tab (e.g. "COMPATIBLE"): wrap around to last tab!
					lastLibraryTabNavTime = now;
					lastActiveTabEdge.set(doc, 'last');
					const lastTab = visibleTabs[visibleTabs.length - 1];
					lastTab.click();
					lastTab.focus();
				}
			}
		}
	}

	libraryTabLoopRaf = win.requestAnimationFrame(() => pollLibraryTabLoop(doc));
}

export function startBigPictureLibraryTabLoop(doc: Document): void {
	if (libraryTabLoopRaf != null) return;
	const win = doc.defaultView || window;
	if (!libraryKeydownListener) {
		libraryKeydownListener = (event: KeyboardEvent) => {
			if (doc.activeElement instanceof HTMLInputElement) return;
			const key = event.key;
			const visibleTabs = Array.from(doc.querySelectorAll<HTMLElement>(LIBRARY_TAB_SELECTOR))
				.filter(t => !t.dataset.gdlHiddenShortcutTab && t.style.display !== 'none');
			if (visibleTabs.length < 2) return;
			const activeIndex = visibleTabs.findIndex(t => isElementSelectedTab(t) || t === doc.activeElement);
			if (activeIndex < 0) return;

			if ((key === 'PageDown' || key === 'e' || key === 'E') && activeIndex === visibleTabs.length - 1) {
				event.preventDefault();
				event.stopPropagation();
				lastActiveTabEdge.set(doc, 'first');
				visibleTabs[0].click();
				visibleTabs[0].focus();
			} else if ((key === 'PageUp' || key === 'q' || key === 'Q') && activeIndex === 0) {
				event.preventDefault();
				event.stopPropagation();
				lastActiveTabEdge.set(doc, 'last');
				const lastTab = visibleTabs[visibleTabs.length - 1];
				lastTab.click();
				lastTab.focus();
			}
		};
		win.addEventListener('keydown', libraryKeydownListener, true);
	}
	libraryTabLoopRaf = win.requestAnimationFrame(() => pollLibraryTabLoop(doc));
}

export function stopBigPictureLibraryTabLoop(doc: Document | null): void {
	if (libraryTabLoopRaf != null) {
		cancelAnimationFrame(libraryTabLoopRaf);
		libraryTabLoopRaf = null;
	}
	if (doc && libraryKeydownListener) {
		const win = doc.defaultView || window;
		win.removeEventListener('keydown', libraryKeydownListener, true);
		libraryKeydownListener = null;
	}
}
