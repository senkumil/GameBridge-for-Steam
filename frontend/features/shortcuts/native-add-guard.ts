import { shortcutExecutableIdentity } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';

function isRenderedNativeElement(doc: Document, element: Element): element is HTMLElement {
	const ElementCtor = doc.defaultView?.HTMLElement || HTMLElement;
	if (!(element instanceof ElementCtor) || !element.isConnected) return false;
	try {
		const view = doc.defaultView || window;
		const style = view.getComputedStyle(element);
		if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0) return false;
		const rect = element.getBoundingClientRect();
		return rect.width > 2 && rect.height > 2;
	} catch { return false; }
}

function normalizedDialogText(value: unknown): string {
	return String(value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** Steam renders Properties and “Add a Non-Steam Game” with many of the same
 * generic Dialog classes. A paged settings navigation is the stable structural
 * difference: the add-game picker never owns Shortcut/Controller/Customization
 * pages. Detect this before looking at text fields or executable paths. */
function isPropertiesDialog(candidate: HTMLElement): boolean {
	const propertiesNavSelector = [
		'[class*="PagedSettingsDialog"]', '[class*="pagedsettings"]',
		'[class*="PageList"]', '[class*="SettingsNav"]', '[class*="DialogNav"]',
	].join(',');
	return candidate.matches(propertiesNavSelector) || Boolean(candidate.querySelector(propertiesNavSelector));
}

function isNativeAddTitle(element: HTMLElement): boolean {
	const titleElements = Array.from(element.querySelectorAll<HTMLElement>(
		'h1, h2, h3, [role="heading"], [class*="DialogHeader"], [class*="DialogTitle"], [class*="ModalTitle"]',
	));
	const titleText = normalizedDialogText(titleElements.map(item => item.textContent || '').join(' '));
	const scopedText = titleText || normalizedDialogText(element.textContent);
	return scopedText.includes('add a non-steam game')
		|| scopedText.includes('add non-steam game')
		|| scopedText.includes('select a program to add')
		|| scopedText.includes('juego que no es de steam')
		|| scopedText.includes('selecciona un programa para anadir')
		|| scopedText.includes('selecciona un programa para agregar')
		|| scopedText.includes('adicionar um jogo nao steam')
		|| scopedText.includes('adicionar um jogo que nao e steam')
		|| scopedText.includes('ajouter un jeu non steam')
		|| scopedText.includes('steam-fremdes spiel hinzufugen');
}

function isSearchLikeField(element: HTMLElement): boolean {
	const input = element as HTMLInputElement;
	if (String(input.type || '').toLowerCase() === 'search' || element.getAttribute('role') === 'searchbox') return true;
	const signature = normalizedDialogText([
		element.getAttribute('placeholder'), element.getAttribute('aria-label'),
		element.getAttribute('title'), element.getAttribute('name'),
	].join(' '));
	return /(?:^|\s)(?:search|buscar|busca|rechercher|suchen|cerca|поиск|検索|검색)(?:\s|$)/.test(signature);
}

/** All Steam documents currently exposed by Millennium. */
export function candidateSteamDocuments(): Document[] {
	const host = shortcutRuntimeHost();
	const docs = [...(host.getSteamDocuments?.() || [])];
	const main = host.getMainWindowDoc();
	if (main && !docs.includes(main)) docs.unshift(main);
	// Steam can create the native picker in a popup that is not reported through
	// Millennium's window hook on every client build. Include the popup manager
	// registry as a secondary source so the detector observes that document too.
	try {
		const manager = (typeof window !== 'undefined' ? (window as any).g_PopupManager : null);
		const addWindow = (candidate: any): void => {
			const win = candidate?.m_popup?.window || candidate?.window || candidate?.m_popup || candidate;
			const doc = win?.document;
			if (doc && !docs.includes(doc)) docs.push(doc);
		};
		const popups = manager?.GetPopups?.();
		if (popups && typeof popups[Symbol.iterator] === 'function') {
			for (const popup of popups) addWindow(popup);
		}
		if (manager?.m_mapPopups?.values) {
			for (const popup of manager.m_mapPopups.values()) addWindow(popup);
		}
		for (const name of ['SP Desktop_uid0', 'SP Desktop', 'SP BPM_uid0', 'SP BPM']) {
			addWindow(manager?.GetExistingPopup?.(name));
		}
	} catch {}
	if (typeof document !== 'undefined' && !docs.includes(document)) docs.push(document);
	return docs.filter((doc, index) => {
		if (!doc?.body || docs.indexOf(doc) !== index) return false;
		try { return Boolean(doc.defaultView && !doc.defaultView.closed); }
		catch { return false; }
	});
}

function executableStringsFromElement(element: Element): string[] {
	const values: string[] = [];
	const push = (value: unknown) => {
		const text = String(value || '');
		if (!text) return;
		// Steam may quote Windows paths and may expose the full path only in a
		// title/data attribute while visually truncating the row.
		const matches = text.match(/(?:"?[a-z]:[\\/][^\n\r<>|]{1,420}?\.exe"?|\/(?:home|usr|opt|applications)\/[^\n\r<>|]{1,420}?(?:\.exe|\.appimage))/gi) || [];
		for (const match of matches) {
			const normalized = shortcutExecutableIdentity(match.replace(/^"|"$/g, ''));
			if (normalized && !values.includes(normalized)) values.push(normalized);
		}
	};
	push(element.textContent);
	for (const attr of ['title', 'aria-label', 'data-path', 'data-exe', 'data-executable', 'value']) {
		try { push(element.getAttribute(attr)); } catch {}
	}
	for (const descendant of Array.from(element.querySelectorAll<HTMLElement>('[title],[aria-label],[data-path],[data-exe],[data-executable],input'))) {
		for (const attr of ['title', 'aria-label', 'data-path', 'data-exe', 'data-executable', 'value']) {
			try { push(descendant.getAttribute(attr)); } catch {}
		}
		if (descendant instanceof (element.ownerDocument.defaultView?.HTMLInputElement || HTMLInputElement)) push((descendant as HTMLInputElement).value);
	}
	return values;
}

function isSelectedControl(doc: Document, element: HTMLElement): boolean {
	const inputCtor = doc.defaultView?.HTMLInputElement || HTMLInputElement;
	if (element instanceof inputCtor && (element as HTMLInputElement).type === 'checkbox') return (element as HTMLInputElement).checked;
	const ariaChecked = String(element.getAttribute('aria-checked') || '').toLowerCase();
	if (ariaChecked === 'true') return true;
	const ariaSelected = String(element.getAttribute('aria-selected') || '').toLowerCase();
	if (ariaSelected === 'true') return true;
	const cls = String(element.className || '').toLowerCase();
	return /(?:^|\s|_)(?:checked|selected|active)(?:$|\s|_)/.test(cls);
}

function nearestExecutableRow(control: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = control;
	for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
		if (executableStringsFromElement(current).length > 0) return current;
	}
	return null;
}

/** Detect Steam's native Add a Non-Steam Game picker structurally.
 *
 * This intentionally does not depend on translated labels. Popup builds differ
 * substantially: some expose native checkboxes/rows, others render custom divs.
 * A rendered search field plus multiple executable paths is the most stable
 * cross-language signature we have observed. */
export function documentHasNativeAddNonSteamDialog(doc: Document): boolean {
	if (!doc?.body) return false;
	const modalCandidates = Array.from(doc.querySelectorAll<HTMLElement>(
		'[role="dialog"], [aria-modal="true"], [class*="Modal"], [class*="Dialog"]',
	)).filter(candidate => isRenderedNativeElement(doc, candidate)
		&& candidate.id !== 'gdl-manual-link-modal'
		&& !candidate.closest('#gdl-manual-link-modal'));
	// Looking through document.body while a modal is present mixes the dialog
	// with Steam Library's permanent “Add a product” footer and search/filter
	// controls. That combination used to classify every Properties dialog as the
	// native add-game picker and blocked only the Personalización artwork panel.
	const candidates: HTMLElement[] = modalCandidates.length > 0 ? modalCandidates : [doc.body];
	for (const candidate of candidates) {
		if (!isRenderedNativeElement(doc, candidate) || isPropertiesDialog(candidate)) continue;
		const rect = candidate.getBoundingClientRect();
		if (candidate !== doc.body && (rect.width < 250 || rect.height < 150)) continue;
		const matchesTitle = isNativeAddTitle(candidate);
		const textFields = Array.from(candidate.querySelectorAll<HTMLElement>(
			'input[type="search"], input[type="text"], input:not([type]), [contenteditable="true"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		const searchFields = textFields.filter(isSearchLikeField);
		const checkboxLike = Array.from(candidate.querySelectorAll<HTMLElement>(
			'input[type="checkbox"], [role="checkbox"], [aria-checked], [aria-selected], [class*="Checkbox"], [class*="checkbox"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		const rowLike = Array.from(candidate.querySelectorAll<HTMLElement>(
			'[role="row"], tr, [class*="ListRow"], [class*="listrow"], [class*="Program"], [class*="program"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		const executables = executableStringsFromElement(candidate);
		const hasSelectionList = rowLike.length >= 1 || checkboxLike.length >= 2;
		if (matchesTitle && hasSelectionList && (searchFields.length >= 1 || executables.length >= 1)) return true;
		// Fallback for client builds whose dialog title is not exposed in the DOM.
		// Require a real search box and repeated selectable rows; a Properties
		// target field plus its two settings toggles must never satisfy this path.
		if (candidate !== doc.body && searchFields.length >= 1 && rowLike.length >= 2 && checkboxLike.length >= 1) return true;
	}
	return false;
}

/** Executables explicitly selected in the currently open native picker.
 * Capturing this is essential because deleting and re-adding the same shortcut
 * can reuse the exact same Shortcut AppID, making an ID-only before/after diff
 * impossible to distinguish from Steam's stale appStore entry. */
export function nativeAddSelectedExecutableIdentities(): string[] {
	const result: string[] = [];
	for (const doc of candidateSteamDocuments()) {
		if (!documentHasNativeAddNonSteamDialog(doc)) continue;
		const controls = Array.from(doc.querySelectorAll<HTMLElement>(
			'input[type="checkbox"], [role="checkbox"], [aria-checked], [aria-selected], [class*="Checkbox"], [class*="checkbox"]',
		)).filter(element => isRenderedNativeElement(doc, element) && isSelectedControl(doc, element));
		for (const control of controls) {
			const row = nearestExecutableRow(control);
			if (!row) continue;
			for (const executable of executableStringsFromElement(row)) {
				if (!result.includes(executable)) result.push(executable);
			}
		}
	}
	return result;
}

export function nativeAddNonSteamDialogOpen(): boolean {
	for (const doc of candidateSteamDocuments()) {
		try { if (documentHasNativeAddNonSteamDialog(doc)) return true; }
		catch {}
	}
	return false;
}
