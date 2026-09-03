export type BigPicturePanelTab = 'activity' | 'stuff' | 'community' | 'info';

export interface BigPictureNativeTabs {
	strip: HTMLElement;
	controls: Map<BigPicturePanelTab, HTMLElement>;
}

function panelFromControl(doc: Document, control: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = control;
	for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
		const controlledIds = String(current.getAttribute('aria-controls') || '').split(/\s+/).filter(Boolean);
		for (const controlledId of controlledIds) {
			const controlled = doc.getElementById(controlledId) as HTMLElement | null;
			// Recent Steam builds no longer consistently expose role=tabpanel on
			// this node. aria-controls is already the stronger ownership signal.
			if (controlled) return controlled;
		}
		const id = current.id;
		if (id) {
			const labelled = Array.from(doc.querySelectorAll<HTMLElement>('[aria-labelledby]'))
				.find(panel => String(panel.getAttribute('aria-labelledby') || '').split(/\s+/).includes(id));
			if (labelled) return labelled;
		}
	}
	return null;
}

function usableNativePanel(
	doc: Document,
	panel: HTMLElement | null,
	strip: HTMLElement,
): panel is HTMLElement {
	if (!panel || !panel.isConnected || panel === doc.body || panel === doc.documentElement) return false;
	if (panel.contains(strip) || panel.closest('#gdl-bp-detail-root')) return false;
	if (panel.hidden || panel.getAttribute('aria-hidden') === 'true') return false;
	const style = doc.defaultView?.getComputedStyle(panel);
	if (style?.display === 'none' || style?.visibility === 'hidden') return false;
	const rect = panel.getBoundingClientRect();
	return rect.width >= 280;
}

function addPanelCandidate(candidates: Set<HTMLElement>, element: Element | null): void {
	// Elements belong to Steam's popup realm, so the main window's HTMLElement
	// constructor is not a reliable instanceof boundary here.
	if (element?.nodeType === 1) candidates.add(element as HTMLElement);
}

function commonPanelAncestor(elements: HTMLElement[]): HTMLElement | null {
	if (elements.length === 0) return null;
	let current: HTMLElement | null = elements[0];
	while (current) {
		if (elements.every(element => current === element || current!.contains(element))) return current;
		current = current.parentElement;
	}
	return null;
}

function findNativeTabPanel(
	doc: Document,
	tabs: BigPictureNativeTabs,
	tab: BigPicturePanelTab,
): HTMLElement | null {
	const explicit = panelFromControl(doc, tabs.controls.get(tab) || tabs.controls.get('activity')!);
	if (usableNativePanel(doc, explicit, tabs.strip)) return explicit;

	// Steam has shipped both ARIA tabpanels and anonymous CSS-module content
	// hosts. Collect both forms, plus nearby siblings, and rank them relative to
	// the visible native tab strip instead of relying on one unstable class name.
	const candidates = new Set<HTMLElement>();
	for (const panel of Array.from(doc.querySelectorAll<HTMLElement>(
		'[role="tabpanel"], [class*="TabPanel"], [class*="TabContent"], [class*="DetailsContent"], [class*="DetailContent"]'
	))) addPanelCandidate(candidates, panel);
	let branch: HTMLElement | null = tabs.strip;
	for (let depth = 0; branch && depth < 4; depth += 1) {
		addPanelCandidate(candidates, branch.nextElementSibling);
		branch = branch.parentElement;
	}

	const stripRect = tabs.strip.getBoundingClientRect();
	let best: { panel: HTMLElement; score: number } | null = null;
	for (const panel of candidates) {
		if (!usableNativePanel(doc, panel, tabs.strip)) continue;
		const rect = panel.getBoundingClientRect();
		const horizontalOverlap = Math.max(0,
			Math.min(rect.right, stripRect.right) - Math.max(rect.left, stripRect.left));
		const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, stripRect.width));
		const verticalGap = rect.top - stripRect.bottom;
		const semanticPanel = panel.matches(
			'[role="tabpanel"], [class*="TabPanel"], [class*="TabContent"], [class*="DetailsContent"], [class*="DetailContent"]'
		);
		// A play bar or hero is also a nearby sibling in several Steam layouts.
		// Anonymous candidates must begin below the tabs and close to them; this
		// prevents us from ever adopting (and hiding) those native regions.
		if (!semanticPanel && (verticalGap < -36 || verticalGap > 300)) continue;
		if (semanticPanel && !panel.matches('[role="tabpanel"]') && verticalGap < -72) continue;
		let score = rect.height > 0 ? 30 : 12;
		if (panel.matches('[role="tabpanel"]')) score += 70;
		if (verticalGap >= -28 && verticalGap <= 260) score += 55;
		else if (rect.bottom < stripRect.top - 20) score -= 120;
		if (overlapRatio >= 0.55) score += 35;
		if (panel.parentElement === tabs.strip.parentElement) score += 45;
		if (tabs.strip.parentElement?.contains(panel)) score += 35;
		const common = commonPanelAncestor([tabs.strip, panel]);
		if (common && common !== doc.body) score += 20;
		if (/panel|content/i.test(`${panel.id} ${String(panel.className || '')}`)) score += 12;
		if (!best || score > best.score) best = { panel, score };
	}
	return best && best.score >= 25 ? best.panel : null;
}

function findFallbackMount(
	doc: Document,
	strip: HTMLElement,
): { parent: HTMLElement; anchor: HTMLElement } | null {
	let anchor = strip;
	for (let depth = 0; depth < 6; depth += 1) {
		const parent = anchor.parentElement;
		if (!parent || parent === doc.body || parent === doc.documentElement) break;
		const style = doc.defaultView?.getComputedStyle(parent);
		const horizontalNoWrap = style?.display.includes('flex')
			&& style.flexDirection.startsWith('row')
			&& style.flexWrap === 'nowrap';
		const clippedBand = /hidden|clip/.test(String(style?.overflowY || style?.overflow || ''))
			&& parent.getBoundingClientRect().height <= strip.getBoundingClientRect().height + 48;
		if (!horizontalNoWrap && !clippedBand) return { parent, anchor };
		anchor = parent;
	}
	const parent = strip.parentElement;
	return parent && parent !== doc.body ? { parent, anchor: strip } : null;
}

function ensureFallbackPanel(doc: Document, strip: HTMLElement): HTMLElement | null {
	let panel = doc.getElementById('gdl-bp-detail-fallback-panel') as HTMLElement | null;
	if (panel?.isConnected) return panel;
	panel?.remove();
	const mount = findFallbackMount(doc, strip);
	if (!mount) return null;
	panel = doc.createElement('section');
	panel.id = 'gdl-bp-detail-fallback-panel';
	panel.dataset.gdlBpFallbackPanel = '1';
	panel.setAttribute('aria-live', 'polite');
	panel.style.cssText = 'display: block !important; visibility: visible !important; width: 100%; min-height: 400px; position: relative; z-index: 10;';
	mount.parent.insertBefore(panel, mount.anchor.nextSibling);
	return panel;
}

/** Mount inside Steam's own active tabpanel or directly adjacent fallback region. */
export function ensureNativePanelRoot(
	doc: Document,
	tabs: BigPictureNativeTabs,
	tab: BigPicturePanelTab,
): { panel: HTMLElement; root: HTMLElement } | null {
	const nativePanel = findNativeTabPanel(doc, tabs, tab);
	const panel = nativePanel || ensureFallbackPanel(doc, tabs.strip);
	if (!panel) return null;
	let root = doc.getElementById('gdl-bp-detail-root') as HTMLElement | null;
	if (!root) {
		root = doc.createElement('div');
		root.id = 'gdl-bp-detail-root';
		root.dataset.gdlBigPictureDetails = '1';
	}
	root.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; width: 100%; min-height: 350px;';
	panel.dataset.gdlBpNativePanel = '1';
	if (root.parentElement !== panel) panel.appendChild(root);
	if (panel.firstChild !== root) panel.insertBefore(root, panel.firstChild);
	Array.from(panel.children).forEach(child => {
		if (child !== root && child.id !== 'gdl-bp-detail-root') {
			const text = (child.textContent || '').toLowerCase();
			if (child.matches('[class*="EmptyDetails"], [class*="NonSteamNotice"], [class*="NonSteamExplanation"], [class*="CollectionsSection"]') || text.includes('no-steam') || text.includes('non-steam')) {
				(child as HTMLElement).style.display = 'none';
			}
		}
	});
	const fallback = doc.getElementById('gdl-bp-detail-fallback-panel');
	if (nativePanel && fallback && fallback !== panel) fallback.remove();
	return { panel, root };
}

export function removeBigPictureFallbackPanel(doc: Document): void {
	doc.getElementById('gdl-bp-detail-fallback-panel')?.remove();
}

export function hideBigPictureNonSteamNotices(doc: Document): void {
	if (!doc.body) return;
	const anchors = ['no es un juego de steam', 'no es un juego o mod', 'non-steam game', 'nicht von steam', "n'est pas un jeu steam", 'não é um juego steam', 'не из steam', 'juegos instalados localmente', 'installed locally'];
	for (const el of Array.from(doc.querySelectorAll<HTMLElement>('div, p, section, [class*="Collection"], [class*="Shelf"], [class*="Notice"], [class*="Description"]'))) {
		if (el.closest('#gdl-bp-detail-root, #gdl-bp-cloud-divider')) continue;
		const text = (el.textContent || '').trim().toLowerCase();
		if (text && anchors.some(anchor => text.includes(anchor))) {
			const container = (el.closest('[class*="Section"], [class*="Container"], [class*="Shelf"], [class*="Panel"]') as HTMLElement) || el;
			if (!container.contains(doc.getElementById('gdl-bp-detail-root')!)) {
				container.style.setProperty('display', 'none', 'important');
				container.setAttribute('aria-hidden', 'true');
			}
		}
	}
}

