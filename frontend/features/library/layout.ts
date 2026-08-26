import { backendLog } from '../../api/backend';
import { loc } from '../../steam/localization';

export interface NativeLibraryLayout {
	anchorRegion: HTMLElement | null;
	sidebarColumn: HTMLElement | null;
	twoColumnRow: HTMLElement | null;
	contentColumn: HTMLElement | null;
	noticeParent: Element | null;
}

function ancestorChain(element: Element): HTMLElement[] {
	const chain: HTMLElement[] = [element as HTMLElement];
	let current = element as HTMLElement;
	while (current.parentElement) {
		chain.push(current.parentElement);
		current = current.parentElement;
	}
	return chain;
}

function findElementByExactTextCaseInsensitive(root: Element | Document, text: string): Element | null {
	const ownerDoc = root instanceof Document ? root : (root.ownerDocument || document);
	const startNode = root instanceof Document ? (root.body || root.documentElement) : root;
	if (!startNode) return null;
	const target = text.trim().toLowerCase();
	if (!target) return null;

	const walker = ownerDoc.createTreeWalker(startNode, NodeFilter.SHOW_TEXT, null);
	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		if (node.textContent && node.textContent.trim().toLowerCase() === target) {
			return node.parentElement;
		}
	}
	return null;
}

/**
 * Resolve the current Steam desktop-library two-column layout from semantic,
 * localized anchors. The returned elements are live nodes owned by Steam; callers
 * must never persist or clone the complete row/column subtree across navigations.
 */
export function discoverNativeLibraryLayout(doc: Document, noticeElement: Element): NativeLibraryLayout {
	const candidateTexts = [
		loc('AppDetails_SectionTitle_GameNotes', 'Notes'),
		loc('AppDetails_SectionTitle_Media', 'Recordings and Screenshots'),
		'Notes',
		'Notas',
		'Recordings and Screenshots',
		'Grabaciones y capturas de pantalla',
		'Grabaciones y capturas',
	];

	let layoutAnchor: Element | null = null;
	for (const candidate of candidateTexts) {
		layoutAnchor = findElementByExactTextCaseInsensitive(doc, candidate);
		if (layoutAnchor) break;
	}

	let anchorRegion: HTMLElement | null = null;
	let sidebarColumn: HTMLElement | null = null;
	let twoColumnRow: HTMLElement | null = null;
	let contentColumn: HTMLElement | null = null;

	if (layoutAnchor) {
		let el: HTMLElement | null = layoutAnchor as HTMLElement;
		for (let i = 0; i < 8 && el && el.parentElement; i += 1) {
			el = el.parentElement;
			if (el && el.getAttribute('role') === 'region' && !el.id?.startsWith('gdl-') && !el.closest('#gdl-library-injected')) {
				anchorRegion = el;
				break;
			}
		}
		if (!anchorRegion && layoutAnchor.parentElement) {
			anchorRegion = layoutAnchor.parentElement;
		}

		if (anchorRegion) {
			const noticeChain = ancestorChain(noticeElement);
			const anchorChain = ancestorChain(anchorRegion);
			for (let ai = 1; ai < anchorChain.length; ai += 1) {
				const ni = noticeChain.indexOf(anchorChain[ai]);
				if (ni > 0) {
					twoColumnRow = anchorChain[ai];
					sidebarColumn = anchorChain[ai - 1];
					contentColumn = noticeChain[ni - 1];
					break;
				}
			}
		}
	}

	if (!twoColumnRow || !contentColumn || !sidebarColumn) {
		let cur: HTMLElement | null = noticeElement.parentElement;
		while (cur && cur !== doc.body) {
			const parent: HTMLElement | null = cur.parentElement;
			if (parent && parent.children.length >= 2) {
				const siblings = Array.from(parent.children).filter(c => c !== cur) as HTMLElement[];
				const foundSidebar = siblings.find(s => {
					const txt = (s.textContent || '').toLowerCase();
					return txt.includes('nota') || txt.includes('note') || txt.includes('captura') || txt.includes('screenshot') || s.querySelector('[role="region"]');
				}) || (siblings.length === 1 ? siblings[0] : null);
				if (foundSidebar) {
					twoColumnRow = parent;
					contentColumn = cur;
					sidebarColumn = foundSidebar;
					if (!anchorRegion) {
						anchorRegion = (foundSidebar.querySelector('[role="region"]') || foundSidebar.firstElementChild || foundSidebar) as HTMLElement;
					}
					break;
				}
			}
			cur = parent;
		}
	}

	backendLog(
		`Layout: sidebar=${String(!!sidebarColumn)} twoCol=${String(!!twoColumnRow)} `
		+ `content=${String(!!contentColumn)} region=${String(!!anchorRegion)}`,
	);

	return {
		anchorRegion,
		sidebarColumn,
		twoColumnRow,
		contentColumn,
		noticeParent: noticeElement.closest('div'),
	};
}

/** Restore only the geometry we intentionally need for the linked-game render. */
export function prepareNativeLibraryLayout(layout: NativeLibraryLayout): void {
	if (layout.contentColumn) {
		layout.contentColumn.style.display = 'block';
		layout.contentColumn.style.height = 'auto';
		layout.contentColumn.style.minHeight = '0';
		layout.contentColumn.style.alignSelf = 'flex-start';
		layout.contentColumn.removeAttribute('data-gdl-hidden');
	}
	if (layout.twoColumnRow) {
		layout.twoColumnRow.style.display = '';
		layout.twoColumnRow.style.alignItems = 'flex-start';
		layout.twoColumnRow.removeAttribute('data-gdl-hidden');
	}
}

/**
 * Hide Steam's non-Steam explanation and wrapper padding without touching the
 * actual content/two-column containers or surfaces owned by another plugin.
 */
export function hideLinkedShortcutNotice(noticeElement: Element, layout: NativeLibraryLayout): void {
	let element: HTMLElement | null = noticeElement as HTMLElement;
	for (let depth = 0; depth < 4 && element; depth += 1) {
		if (element === layout.contentColumn || element === layout.twoColumnRow) break;
		if (depth > 0 && element.querySelector('[data-nsp]')) break;
		element.style.display = 'none';
		element.setAttribute('data-gdl-hidden', '1');
		const parent = element.parentElement;
		if (!parent || parent.childElementCount > 1) break;
		element = parent;
	}
}

export interface NativeSidebarSectionOptions {
	sectionId: string;
	headerText: string;
	innerId: string;
	innerHtml: string;
	cloneInnerClass?: boolean;
}

/**
 * Build one sidebar/content region using the live classes and wrapper topology
 * of Steam's own Notes/Media section. Only the small section shell is cloned;
 * the complete native page tree is never copied or persisted.
 */
export function buildNativeSidebarSection(
	doc: Document,
	layout: NativeLibraryLayout,
	options: NativeSidebarSectionOptions,
): HTMLElement | null {
	const { anchorRegion, sidebarColumn } = layout;
	if (!anchorRegion) return null;

	const regionChildren = Array.from(anchorRegion.children);
	const sourceHeading = regionChildren.find(child => child.tagName === 'H2') as HTMLElement | undefined;
	const sourceBody = regionChildren.find(child => child.tagName === 'DIV') as HTMLElement | undefined;

	const region = doc.createElement('div');
	region.className = anchorRegion.className;
	region.setAttribute('role', 'region');

	if (sourceHeading) {
		const heading = sourceHeading.cloneNode(true) as HTMLElement;
		const textElement = heading.querySelector('div div') || heading.querySelector('div') || heading;
		textElement.textContent = options.headerText;
		region.appendChild(heading);
	}

	if (sourceBody) {
		const body = doc.createElement('div');
		body.className = sourceBody.className;
		const sourceInner = sourceBody.firstElementChild as HTMLElement | null;
		const inner = doc.createElement('div');
		inner.id = options.innerId;
		if ((options.cloneInnerClass ?? true) && sourceInner) inner.className = sourceInner.className;
		inner.innerHTML = options.innerHtml;
		body.appendChild(inner);
		region.appendChild(body);
	}

	const anchorWrapper = anchorRegion.parentElement;
	let outer: HTMLElement = region;
	if (anchorWrapper && anchorWrapper.parentElement === sidebarColumn) {
		const wrapper = doc.createElement('div');
		wrapper.className = anchorWrapper.className;
		wrapper.appendChild(region);
		outer = wrapper;
	}
	outer.id = options.sectionId;
	return outer;
}

export function insertMainContent(
	wrapper: HTMLElement,
	layout: NativeLibraryLayout,
	protectedIds: ReadonlySet<string>,
): void {
	const { contentColumn, noticeParent } = layout;
	if (contentColumn) {
		for (const child of Array.from(contentColumn.children)) {
			const element = child as HTMLElement;
			if (child === wrapper || protectedIds.has(element.id)) continue;
			element.style.display = 'none';
			element.setAttribute('data-gdl-hidden', '1');
		}
		contentColumn.insertBefore(wrapper, contentColumn.firstChild);
		return;
	}
	if (noticeParent?.parentElement) noticeParent.parentElement.insertBefore(wrapper, noticeParent.nextSibling);
}
