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

/** All Steam documents currently exposed by Millennium. */
export function candidateSteamDocuments(): Document[] {
	const host = shortcutRuntimeHost();
	const docs = host.getSteamDocuments?.() || [];
	const main = host.getMainWindowDoc();
	if (main && !docs.includes(main)) docs.unshift(main);
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
	));
	const candidates: HTMLElement[] = [...modalCandidates];
	if (doc.body && !candidates.includes(doc.body)) candidates.push(doc.body);
	for (const candidate of candidates) {
		if (!isRenderedNativeElement(doc, candidate) || candidate.id === 'gdl-manual-link-modal' || candidate.closest('#gdl-manual-link-modal')) continue;
		const rect = candidate.getBoundingClientRect();
		if (candidate !== doc.body && (rect.width < 420 || rect.height < 300)) continue;
		const searchFields = Array.from(candidate.querySelectorAll<HTMLElement>(
			'input[type="search"], input[type="text"], input:not([type]), [contenteditable="true"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		if (!searchFields.length) continue;
		const checkboxLike = Array.from(candidate.querySelectorAll<HTMLElement>(
			'input[type="checkbox"], [role="checkbox"], [aria-checked], [aria-selected], [class*="Checkbox"], [class*="checkbox"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		const rowLike = Array.from(candidate.querySelectorAll<HTMLElement>(
			'[role="row"], tr, [class*="ListRow"], [class*="listrow"], [class*="Program"], [class*="program"]',
		)).filter(element => isRenderedNativeElement(doc, element));
		const executables = executableStringsFromElement(candidate);
		// Some Steam builds expose neither semantic rows nor native checkbox
		// inputs. Multiple executable paths + the picker search box is still a
		// strong signature and avoids tying detection to any language.
		if (executables.length >= 2 && (checkboxLike.length >= 1 || rowLike.length >= 2 || candidate.children.length >= 2)) return true;
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
