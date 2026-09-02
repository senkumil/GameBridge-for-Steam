import type { BigPicturePanelTab } from './panel-mount';

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
	if (!root || !root.isConnected) return [];
	const selector = '.gdl-bp-feed-card, .gdl-bp-community-card, .gdl-bp-action-button, .gdl-bp-info-link, .gdl-bp-ach-featured, .gdl-bp-ach-icon-frame, [data-focusable="true"], [tabindex="0"], button, a[href]';
	return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => {
		if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
		const style = el.ownerDocument.defaultView?.getComputedStyle(el);
		if (style?.display === 'none' || style?.visibility === 'hidden') return false;
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
}

export function installBigPictureGamepadNavigation(
	doc: Document,
	root: HTMLElement,
	strip: HTMLElement,
	controls: Map<BigPicturePanelTab, HTMLElement>,
): void {
	if (root.dataset.gdlGamepadNavInstalled === '1') return;
	root.dataset.gdlGamepadNavInstalled = '1';

	const getActiveTab = (): HTMLElement | null => {
		const selected = strip.querySelector<HTMLElement>('[aria-selected="true"], [class*="Selected"], [class*="active"]')
			|| strip.querySelector<HTMLElement>('[tabindex="0"]')
			|| Array.from(controls.values())[0] || null;
		return selected;
	};

	root.addEventListener('keydown', (event: KeyboardEvent) => {
		const key = event.key;
		const isNavKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Down' || key === 'Up' || key === 'Left' || key === 'Right';
		const isActionKey = key === 'Enter' || key === ' ';
		if (!isNavKey && !isActionKey) return;

		const focusables = getFocusableElements(root);
		if (!focusables.length) return;

		const active = (doc.activeElement as HTMLElement | null);
		const current = (active && root.contains(active)) ? active : null;

		if (isActionKey && current) {
			event.preventDefault();
			event.stopPropagation();
			current.click();
			return;
		}

		if (!current) {
			event.preventDefault();
			event.stopPropagation();
			focusables[0]?.focus();
			focusables[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			return;
		}

		const currentRect = current.getBoundingClientRect();
		let target: HTMLElement | null = null;

		if (key === 'ArrowDown' || key === 'Down') {
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.top >= currentRect.top + 10) {
					const vert = r.top - currentRect.top;
					const horiz = Math.abs(r.left - currentRect.left);
					const dist = vert + horiz * 0.45;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				event.preventDefault();
				event.stopPropagation();
				target.focus();
				target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		} else if (key === 'ArrowUp' || key === 'Up') {
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.top <= currentRect.top - 10) {
					const vert = currentRect.top - r.top;
					const horiz = Math.abs(r.left - currentRect.left);
					const dist = vert + horiz * 0.45;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				event.preventDefault();
				event.stopPropagation();
				target.focus();
				target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			} else {
				event.preventDefault();
				event.stopPropagation();
				const tabControl = getActiveTab();
				if (tabControl) {
					tabControl.focus();
					tabControl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}
		} else if (key === 'ArrowRight' || key === 'Right') {
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.left >= currentRect.left + 10 && Math.abs(r.top - currentRect.top) < 70) {
					const dist = (r.left - currentRect.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				event.preventDefault();
				event.stopPropagation();
				target.focus();
				target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		} else if (key === 'ArrowLeft' || key === 'Left') {
			let bestDist = Infinity;
			for (const el of focusables) {
				if (el === current) continue;
				const r = el.getBoundingClientRect();
				if (r.left <= currentRect.left - 10 && Math.abs(r.top - currentRect.top) < 70) {
					const dist = (currentRect.left - r.left) + Math.abs(r.top - currentRect.top) * 2;
					if (dist < bestDist) {
						bestDist = dist;
						target = el;
					}
				}
			}
			if (target) {
				event.preventDefault();
				event.stopPropagation();
				target.focus();
				target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			}
		}
	});

	root.addEventListener('focusin', (event: FocusEvent) => {
		const target = event.target as HTMLElement | null;
		if (target && root.contains(target)) {
			target.classList.add('gpfocus');
			target.dataset.focus = 'true';
			target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	root.addEventListener('focusout', (event: FocusEvent) => {
		const target = event.target as HTMLElement | null;
		if (target) {
			target.classList.remove('gpfocus');
			delete target.dataset.focus;
		}
	});
}
