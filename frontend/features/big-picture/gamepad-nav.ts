import type { BigPicturePanelTab } from './panel-mount';

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
	if (!root || !root.isConnected) return [];
	const selector = '.Focusable, .gdl-bp-feed-card, .gdl-bp-community-card, .gdl-bp-community-video-card, .gdl-bp-community-guide-card, .gdl-bp-action-button, .gdl-bp-info-link, .gdl-bp-ach-featured, .gdl-bp-ach-icon-frame, .gdl-bp-card-item, .gdl-bp-feed-post-input, .gdl-bp-feed-jump-news, .gdl-bp-feed-load-more-btn, .gdl-bp-open-ach-trigger, .gdl-bp-friend-card, [data-focusable="true"], [tabindex="0"], button, a[href], input';
	return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => {
		if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
		const style = el.ownerDocument.defaultView?.getComputedStyle(el);
		if (style?.display === 'none' || style?.visibility === 'hidden') return false;
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
}

const TAB_ORDER: BigPicturePanelTab[] = ['activity', 'stuff', 'community', 'info'];

interface NavInstance {
	doc: Document;
	root: HTMLElement;
	strip: HTMLElement;
	controls: Map<BigPicturePanelTab, HTMLElement>;
	cleanup: () => void;
}

const activeNavInstances = new WeakMap<Document, NavInstance>();

export function disposeBigPictureGamepadNavigation(doc: Document | null): void {
	if (!doc) return;
	const inst = activeNavInstances.get(doc);
	if (inst) {
		inst.cleanup();
		activeNavInstances.delete(doc);
	}
}

export function installBigPictureGamepadNavigation(
	doc: Document,
	root: HTMLElement,
	strip: HTMLElement,
	controls: Map<BigPicturePanelTab, HTMLElement>,
): void {
	const existing = activeNavInstances.get(doc);
	if (existing && existing.root === root) {
		existing.strip = strip;
		existing.controls = controls;
		return;
	}
	disposeBigPictureGamepadNavigation(doc);

	const win = doc.defaultView || window;

	const getActiveTab = (): HTMLElement | null => {
		const selected = strip.querySelector<HTMLElement>('[aria-selected="true"], [class*="Selected"], [class*="active"]')
			|| strip.querySelector<HTMLElement>('[tabindex="0"]')
			|| Array.from(controls.values())[0]
			|| null;
		return selected;
	};

	const getCurrentTabKey = (): BigPicturePanelTab => {
		for (const [key, el] of controls.entries()) {
			if (el.getAttribute('aria-selected') === 'true' || el.classList.contains('active') || el.classList.contains('Selected') || el.classList.contains('gpfocus')) {
				return key;
			}
		}
		return 'activity';
	};

	const switchTabByOffset = (offset: number): boolean => {
		const currentKey = getCurrentTabKey();
		const currentIdx = TAB_ORDER.indexOf(currentKey);
		const nextIdx = (currentIdx + offset + TAB_ORDER.length) % TAB_ORDER.length;
		const nextKey = TAB_ORDER[nextIdx];
		const targetControl = controls.get(nextKey);
		if (targetControl && targetControl.isConnected) {
			for (const c of controls.values()) {
				c.classList.remove('gpfocus');
			}
			targetControl.classList.add('gpfocus');
			targetControl.click();
			targetControl.focus();
			return true;
		}
		return false;
	};

	let lastNavTime = 0;
	let lastFocusedElement: HTMLElement | null = null;
	const NAV_COOLDOWN_MS = 140;

	const getActiveModal = (): HTMLElement | null => {
		const modal = doc.getElementById('gdl-bp-achievements-screen')
			|| doc.getElementById('gdl-bp-card-modal')
			|| doc.getElementById('gdl-bp-news-modal')
			|| doc.getElementById('gdl-bp-community-modal');
		return (modal && modal.isConnected) ? modal : null;
	};

	const isInsidePlaybar = (): boolean => {
		const active = doc.activeElement as HTMLElement | null;
		if (active && active.closest('[class*="PlayBar"], [class*="playbar"], [class*="PlayButton"], [class*="Header"], [class*="AppButtonsContainer"]')) {
			if (strip && (strip === active || strip.contains(active))) return false;
			if (root && (root === active || root.contains(active))) return false;
			return true;
		}
		return false;
	};

	const isInsidePanel = (): boolean => {
		const active = doc.activeElement as HTMLElement | null;
		if (active && (root === active || root.contains(active))) return true;
		const marked = root.querySelector<HTMLElement>('.gpfocus, [data-focus="true"]');
		if (marked && marked.isConnected && (!active || (!strip.contains(active) && !isInsidePlaybar()))) return true;
		if (lastFocusedElement && lastFocusedElement.isConnected && root.contains(lastFocusedElement)) {
			if (!active || (!strip.contains(active) && !isInsidePlaybar())) return true;
		}
		return false;
	};

	const isTabStripFocused = (): boolean => {
		const active = doc.activeElement as HTMLElement | null;
		if (active && (root === active || root.contains(active))) return false;
		if (active && (strip === active || strip.contains(active))) return true;
		for (const el of controls.values()) {
			if (el === active || el.contains(active)) return true;
		}
		return false;
	};

	const setFocusedElement = (target: HTMLElement | null, scope: HTMLElement = root): void => {
		if (!target || !target.isConnected) return;
		if (scope === root) lastFocusedElement = target;
		try {
			strip.querySelectorAll<HTMLElement>('.gpfocus').forEach(el => el.classList.remove('gpfocus'));
			scope.querySelectorAll<HTMLElement>('.gpfocus, [data-focus="true"]').forEach(el => {
				if (el !== target) {
					el.classList.remove('gpfocus');
					delete el.dataset.focus;
				}
			});
			if (!target.hasAttribute('tabindex')) {
				target.setAttribute('tabindex', '0');
			}
			target.classList.add('gpfocus');
			target.dataset.focus = 'true';
			target.focus({ preventScroll: true });
			target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
		} catch {}
	};

	const handleNavDirection = (direction: 'down' | 'up' | 'left' | 'right' | 'select' | 'back'): boolean => {
		const modal = getActiveModal();
		const currentScope = modal || root;
		if (!currentScope.isConnected) return false;

		const focusables = getFocusableElements(currentScope);
		if (!focusables.length) {
			if (direction === 'back' && modal) {
				const closeBtn = modal.querySelector<HTMLElement>('.gdl-bp-news-modal-close, .gdl-bp-ach-close-trigger, .gdl-bp-fullscreen-card-close-btn');
				if (closeBtn) closeBtn.click();
				else modal.remove();
				return true;
			}
			return false;
		}

		// When on the tab strip, Left/Right changes tabs
		if ((direction === 'left' || direction === 'right') && !modal && isTabStripFocused()) {
			if (switchTabByOffset(direction === 'left' ? -1 : 1)) {
				return true;
			}
		}

		const active = doc.activeElement as HTMLElement | null;
		let current: HTMLElement | null = (active && currentScope.contains(active)) ? active : null;
		if (!current) {
			const marked = currentScope.querySelector<HTMLElement>('.gpfocus, [data-focus="true"]');
			if (marked && marked.isConnected) {
				current = marked;
			} else if (currentScope === root && lastFocusedElement && lastFocusedElement.isConnected && root.contains(lastFocusedElement)) {
				// Only reuse lastFocusedElement if we are already inside the panel
				if (isInsidePanel()) {
					current = lastFocusedElement;
				}
			}
		}

		if (direction === 'select') {
			if (current) {
				if (current instanceof HTMLInputElement) {
					current.focus();
					return true;
				}
				current.click();
				return true;
			}
			return false;
		}

		if (direction === 'back') {
			if (modal) {
				const closeBtn = modal.querySelector<HTMLElement>('.gdl-bp-news-modal-close, .gdl-bp-news-modal-close-btn, .gdl-bp-ach-close-trigger, .gdl-bp-fullscreen-card-close-btn');
				if (closeBtn) closeBtn.click();
				else modal.remove();
				return true;
			}

			if (current || isInsidePanel()) {
				if (current) {
					current.classList.remove('gpfocus');
					delete current.dataset.focus;
				}
				lastFocusedElement = null;
				const tab = getActiveTab();
				if (tab) {
					tab.focus();
					tab.classList.add('gpfocus');
					tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
				return true;
			}
			return false;
		}

		if (direction === 'down') {
			// If focus is currently in play bar, move down to the active tab
			if (!modal && isInsidePlaybar()) {
				const tab = getActiveTab();
				if (tab) {
					tab.focus();
					tab.classList.add('gpfocus');
					tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					return true;
				}
			}

			// If focus is currently on the tab strip or outside the panel, enter the panel
			if (!modal && (!current || isTabStripFocused())) {
				const primary = currentScope.querySelector<HTMLElement>(
					'.gdl-bp-feed-card, .gdl-bp-ach-featured, .gdl-bp-ach-progress, .gdl-bp-community-card, .gdl-bp-card-item, .gdl-bp-info-link'
				);
				const target = primary || focusables[0];
				if (target) {
					setFocusedElement(target, currentScope);
					return true;
				}
				return false;
			}

			if (!current) {
				const primary = currentScope.querySelector<HTMLElement>(
					'.gdl-bp-feed-card, .gdl-bp-ach-featured, .gdl-bp-ach-progress, .gdl-bp-community-card, .gdl-bp-card-item, .gdl-bp-info-link'
				);
				const target = primary || focusables[0];
				if (target) {
					setFocusedElement(target, currentScope);
					return true;
				}
				return false;
			}

			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.top >= currentRect.top + 8) {
					const vert = r.top - currentRect.top;
					const horiz = Math.abs((r.left + r.width / 2) - (currentRect.left + currentRect.width / 2));
					const dist = vert + horiz * 0.4;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}

			if (!target) {
				const idx = focusables.indexOf(current);
				if (idx >= 0 && idx < focusables.length - 1) {
					target = focusables[idx + 1];
				}
			}

			if (target) {
				setFocusedElement(target, currentScope);
				return true;
			}
			return false;
		}

		if (direction === 'up') {
			if (!modal && isTabStripFocused()) {
				// Move focus from tab strip back to play button
				const playBtn = doc.querySelector<HTMLElement>('[class*="PlayButton"], button[class*="Play"], .PlayButton');
				if (playBtn) {
					strip.querySelectorAll('.gpfocus').forEach(el => el.classList.remove('gpfocus'));
					playBtn.focus();
					playBtn.classList.add('gpfocus');
					return true;
				}
				return false;
			}
			if (!current) return false;
			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.bottom <= currentRect.bottom - 8 || r.top <= currentRect.top - 8) {
					const vert = currentRect.top - r.top;
					if (vert > 5) {
						const horiz = Math.abs((r.left + r.width / 2) - (currentRect.left + currentRect.width / 2));
						const dist = vert + horiz * 0.4;
						if (dist < bestDist) {
							bestDist = dist;
							target = el;
						}
					}
				}
			}

			if (!target) {
				const idx = focusables.indexOf(current);
				if (idx > 0) {
					const prev = focusables[idx - 1];
					if (prev.getBoundingClientRect().top < currentRect.top) {
						target = prev;
					}
				}
			}

			if (target) {
				setFocusedElement(target, currentScope);
				return true;
			} else if (!modal) {
				// At top edge of panel: move focus back to the active tab
				current.classList.remove('gpfocus');
				delete current.dataset.focus;
				lastFocusedElement = null;
				const tab = getActiveTab();
				if (tab) {
					tab.focus();
					tab.classList.add('gpfocus');
					tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					return true;
				}
				return false;
			}
			return false;
		}

		if (direction === 'right') {
			if (!current) return false;
			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.left >= currentRect.left + 12 && Math.abs(r.top - currentRect.top) < 95) {
					const dist = (r.left - currentRect.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				setFocusedElement(target, currentScope);
				return true;
			}
			return false;
		}

		if (direction === 'left') {
			if (!current) return false;
			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.left <= currentRect.left - 12 && Math.abs(r.top - currentRect.top) < 95) {
					const dist = (currentRect.left - r.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				setFocusedElement(target, currentScope);
				return true;
			}
			return false;
		}

		return false;
	};

	const onGlobalKeyDown = (event: KeyboardEvent) => {
		const key = event.key;
		if (key === 'PageUp' || key === 'q' || key === 'Q') {
			if (!getActiveModal() && !(doc.activeElement instanceof HTMLInputElement)) {
				if (switchTabByOffset(-1)) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
			}
		} else if (key === 'PageDown' || key === 'e' || key === 'E') {
			if (!getActiveModal() && !(doc.activeElement instanceof HTMLInputElement)) {
				if (switchTabByOffset(1)) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
			}
		}

		let dir: 'down' | 'up' | 'left' | 'right' | 'select' | 'back' | null = null;
		if (key === 'ArrowDown' || key === 'Down' || event.keyCode === 40) dir = 'down';
		else if (key === 'ArrowUp' || key === 'Up' || event.keyCode === 38) dir = 'up';
		else if (key === 'ArrowLeft' || key === 'Left' || event.keyCode === 37) dir = 'left';
		else if (key === 'ArrowRight' || key === 'Right' || event.keyCode === 39) dir = 'right';
		else if (key === 'Enter' || key === ' ' || event.keyCode === 13) dir = 'select';
		else if (key === 'Escape' || key === 'Backspace' || event.keyCode === 27 || event.keyCode === 8) dir = 'back';
		else if (key === 'Tab') dir = event.shiftKey ? 'up' : 'down';

		if (!dir) return;

		// If user is inside an active text input typing, don't trap directional navigation
		if (doc.activeElement instanceof HTMLInputElement) {
			if (dir === 'down' || dir === 'up' || dir === 'right' || dir === 'back') {
				(doc.activeElement as HTMLElement).blur();
			} else if (dir === 'select') {
				return;
			}
		}

		const now = Date.now();
		if (now - lastNavTime < NAV_COOLDOWN_MS) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}

		const handled = handleNavDirection(dir);
		if (handled) {
			lastNavTime = now;
			event.preventDefault();
			event.stopPropagation();
		}
	};

	const onFocusIn = (event: FocusEvent) => {
		const target = event.target as HTMLElement | null;
		if (target && root.contains(target)) {
			lastFocusedElement = target;
			target.classList.add('gpfocus');
			target.dataset.focus = 'true';
		}
	};

	const onFocusOut = (event: FocusEvent) => {
		const target = event.target as HTMLElement | null;
		if (target) {
			target.classList.remove('gpfocus');
			delete target.dataset.focus;
		}
	};

	// -------------------------------------------------------------
	// GAMEPAD POLLING (HTML5 Gamepad API)
	// Supports Xbox, PlayStation, Steam Deck & generic controllers
	// -------------------------------------------------------------
	let gamepadRafId: number | null = null;
	const prevButtonStates = new Map<number, boolean>();
	const lastDirTriggerTime = new Map<string, number>();
	const dirHoldStartTime = new Map<string, number>();

	const pollGamepads = () => {
		if (!root.isConnected || !doc.body?.isConnected) {
			if (gamepadRafId != null) {
				win.cancelAnimationFrame(gamepadRafId);
				gamepadRafId = null;
			}
			return;
		}

		const nav = win.navigator || window.navigator;
		const gamepads = typeof nav?.getGamepads === 'function' ? nav.getGamepads() : (typeof window.navigator?.getGamepads === 'function' ? window.navigator.getGamepads() : []);
		const gp = Array.from(gamepads).find(g => g && g.connected);

		if (gp) {
			const now = Date.now();

			// Read standard directional inputs (D-Pad and Left Stick)
			const isUp = Boolean(gp.buttons[12]?.pressed || (gp.axes[1] != null && gp.axes[1] < -0.55));
			const isDown = Boolean(gp.buttons[13]?.pressed || (gp.axes[1] != null && gp.axes[1] > 0.55));
			const isLeft = Boolean(gp.buttons[14]?.pressed || (gp.axes[0] != null && gp.axes[0] < -0.55));
			const isRight = Boolean(gp.buttons[15]?.pressed || (gp.axes[0] != null && gp.axes[0] > 0.55));

			const directions: Array<[string, boolean, 'up' | 'down' | 'left' | 'right']> = [
				['up', isUp, 'up'],
				['down', isDown, 'down'],
				['left', isLeft, 'left'],
				['right', isRight, 'right'],
			];

			for (const [name, active, dir] of directions) {
				if (active) {
					const holdStart = dirHoldStartTime.get(name) || 0;
					const lastTrigger = lastDirTriggerTime.get(name) || 0;
					if (!holdStart) {
						dirHoldStartTime.set(name, now);
						lastDirTriggerTime.set(name, now);
						handleNavDirection(dir);
					} else if (now - holdStart > 320 && now - lastTrigger > 140) {
						lastDirTriggerTime.set(name, now);
						handleNavDirection(dir);
					}
				} else {
					dirHoldStartTime.delete(name);
					lastDirTriggerTime.delete(name);
				}
			}

			// Read action buttons (Edge-triggered on press only)
			// Button 0: A / Cross (Select)
			const btnA = Boolean(gp.buttons[0]?.pressed);
			if (btnA && !prevButtonStates.get(0)) {
				handleNavDirection('select');
			}
			prevButtonStates.set(0, btnA);

			// Button 1: B / Circle (Back)
			const btnB = Boolean(gp.buttons[1]?.pressed);
			if (btnB && !prevButtonStates.get(1)) {
				handleNavDirection('back');
			}
			prevButtonStates.set(1, btnB);

			// Button 4: LB (Left Bumper -> Previous Tab)
			const btnLB = Boolean(gp.buttons[4]?.pressed);
			if (btnLB && !prevButtonStates.get(4)) {
				if (!getActiveModal()) {
					switchTabByOffset(-1);
				}
			}
			prevButtonStates.set(4, btnLB);

			// Button 5: RB (Right Bumper -> Next Tab)
			const btnRB = Boolean(gp.buttons[5]?.pressed);
			if (btnRB && !prevButtonStates.get(5)) {
				if (!getActiveModal()) {
					switchTabByOffset(1);
				}
			}
			prevButtonStates.set(5, btnRB);

			// Right Stick Vertical: Smoothly scroll active modal or page
			const rightStickY = gp.axes[3];
			if (rightStickY != null && Math.abs(rightStickY) > 0.25) {
				const modal = getActiveModal();
				const scrollTarget = modal ? (modal.querySelector('.gdl-bp-news-modal-window, .gdl-bp-ach-screen-list') || modal) : (doc.scrollingElement || doc.documentElement);
				if (scrollTarget) {
					scrollTarget.scrollBy({ top: rightStickY * 16, behavior: 'auto' });
				}
			}
		}

		gamepadRafId = win.requestAnimationFrame(pollGamepads);
	};

	win.addEventListener('keydown', onGlobalKeyDown, true);
	doc.addEventListener('keydown', onGlobalKeyDown, true);
	root.addEventListener('focusin', onFocusIn);
	root.addEventListener('focusout', onFocusOut);

	gamepadRafId = win.requestAnimationFrame(pollGamepads);

	activeNavInstances.set(doc, {
		doc,
		root,
		strip,
		controls,
		cleanup: () => {
			if (gamepadRafId != null) {
				win.cancelAnimationFrame(gamepadRafId);
				gamepadRafId = null;
			}
			win.removeEventListener('keydown', onGlobalKeyDown, true);
			doc.removeEventListener('keydown', onGlobalKeyDown, true);
			root.removeEventListener('focusin', onFocusIn);
			root.removeEventListener('focusout', onFocusOut);
			lastFocusedElement = null;
		},
	});
}

