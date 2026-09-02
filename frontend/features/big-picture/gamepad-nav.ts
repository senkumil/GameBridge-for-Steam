import type { BigPicturePanelTab } from './panel-mount';

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
	if (!root || !root.isConnected) return [];
	const selector = '.Focusable, .gdl-bp-feed-card, .gdl-bp-community-card, .gdl-bp-community-video-card, .gdl-bp-community-guide-card, .gdl-bp-action-button, .gdl-bp-info-link, .gdl-bp-ach-featured, .gdl-bp-ach-icon-frame, .gdl-bp-card-item, .gdl-bp-feed-post-input, .gdl-bp-feed-jump-news, .gdl-bp-feed-load-more-btn, .gdl-bp-open-ach-trigger, [data-focusable="true"], [tabindex="0"], button, a[href], input';
	return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => {
		if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
		const style = el.ownerDocument.defaultView?.getComputedStyle(el);
		if (style?.display === 'none' || style?.visibility === 'hidden') return false;
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
}

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

	const getActiveTab = (): HTMLElement | null => {
		const selected = strip.querySelector<HTMLElement>('[aria-selected="true"], [class*="Selected"], [class*="active"]')
			|| strip.querySelector<HTMLElement>('[tabindex="0"]')
			|| Array.from(controls.values())[0]
			|| null;
		return selected;
	};

	let lastNavTime = 0;
	let lastFocusedElement: HTMLElement | null = null;
	const NAV_COOLDOWN_MS = 140;

	const setFocusedElement = (target: HTMLElement | null): void => {
		if (!target || !target.isConnected) return;
		lastFocusedElement = target;
		try {
			root.querySelectorAll<HTMLElement>('.gpfocus, [data-focus="true"]').forEach(el => {
				if (el !== target) {
					el.classList.remove('gpfocus');
					delete el.dataset.focus;
				}
			});
			target.classList.add('gpfocus');
			target.dataset.focus = 'true';
			target.focus({ preventScroll: true });
			target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
		} catch {}
	};

	const handleNavDirection = (direction: 'down' | 'up' | 'left' | 'right' | 'select' | 'back'): boolean => {
		if (!root.isConnected) return false;
		const focusables = getFocusableElements(root);
		if (!focusables.length) return false;

		const active = doc.activeElement as HTMLElement | null;
		let current = (active && root.contains(active)) ? active : null;
		if (!current) {
			const marked = root.querySelector<HTMLElement>('.gpfocus, [data-focus="true"]');
			if (marked && marked.isConnected) {
				current = marked;
			} else if (lastFocusedElement && lastFocusedElement.isConnected && root.contains(lastFocusedElement)) {
				current = lastFocusedElement;
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
			const openScreen = doc.getElementById('gdl-bp-achievements-screen') || doc.getElementById('gdl-bp-card-modal') || doc.getElementById('gdl-bp-news-modal');
			if (openScreen) return false;

			if (current) {
				current.classList.remove('gpfocus');
				delete current.dataset.focus;
				lastFocusedElement = null;
				const tab = getActiveTab();
				if (tab) {
					tab.focus();
					tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
				return true;
			}
			return false;
		}

		if (direction === 'down') {
			if (!current) {
				// Enter the panel immediately whenever Down is pressed outside the panel
				if (focusables[0]) {
					setFocusedElement(focusables[0]);
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
				if (r.top >= currentRect.top + 10) {
					const vert = r.top - currentRect.top;
					const horiz = Math.abs(r.left - currentRect.left);
					const dist = vert + horiz * 0.4;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}

			if (!target) {
				// Fallback to next element in DOM order
				const idx = focusables.indexOf(current);
				if (idx >= 0 && idx < focusables.length - 1) {
					target = focusables[idx + 1];
				}
			}

			if (target) {
				setFocusedElement(target);
				return true;
			}
			return false;
		}

		if (direction === 'up') {
			if (!current) return false;
			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.top <= currentRect.top - 10) {
					const vert = currentRect.top - r.top;
					const horiz = Math.abs(r.left - currentRect.left);
					const dist = vert + horiz * 0.4;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
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
				setFocusedElement(target);
				return true;
			} else {
				// At top edge: move focus back to the active tab
				current.classList.remove('gpfocus');
				delete current.dataset.focus;
				lastFocusedElement = null;
				const tab = getActiveTab();
				if (tab) {
					tab.focus();
					tab.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
					return true;
				}
				return false;
			}
		}

		if (direction === 'right') {
			if (!current) return false;
			const currentRect = current.getBoundingClientRect();
			let target: HTMLElement | null = null;
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.left >= currentRect.left + 15 && Math.abs(r.top - currentRect.top) < 90) {
					const dist = (r.left - currentRect.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				setFocusedElement(target);
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
				if (r.left <= currentRect.left - 15 && Math.abs(r.top - currentRect.top) < 90) {
					const dist = (currentRect.left - r.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				setFocusedElement(target);
				return true;
			}
			return false;
		}

		return false;
	};

	const onGlobalKeyDown = (event: KeyboardEvent) => {
		const key = event.key;
		let dir: 'down' | 'up' | 'left' | 'right' | 'select' | 'back' | null = null;
		if (key === 'ArrowDown' || key === 'Down' || event.keyCode === 40) dir = 'down';
		else if (key === 'ArrowUp' || key === 'Up' || event.keyCode === 38) dir = 'up';
		else if (key === 'ArrowLeft' || key === 'Left' || event.keyCode === 37) dir = 'left';
		else if (key === 'ArrowRight' || key === 'Right' || event.keyCode === 39) dir = 'right';
		else if (key === 'Enter' || key === ' ' || event.keyCode === 13) dir = 'select';
		else if (key === 'Escape' || event.keyCode === 27) dir = 'back';

		if (!dir) return;

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

	doc.addEventListener('keydown', onGlobalKeyDown, true);
	root.addEventListener('focusin', onFocusIn);
	root.addEventListener('focusout', onFocusOut);

	activeNavInstances.set(doc, {
		doc,
		root,
		strip,
		controls,
		cleanup: () => {
			doc.removeEventListener('keydown', onGlobalKeyDown, true);
			root.removeEventListener('focusin', onFocusIn);
			root.removeEventListener('focusout', onFocusOut);
		},
	});
}
