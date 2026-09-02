import { loc } from '../../steam/localization';

export interface NativeLibraryLayout {
	anchorRegion: HTMLElement | null;
	sidebarColumn: HTMLElement | null;
	twoColumnRow: HTMLElement | null;
	contentColumn: HTMLElement | null;
	noticeParent: Element | null;
}

type ManagedStyleProperty = 'display' | 'height' | 'minHeight' | 'alignSelf' | 'alignItems';
type NativeStyleSnapshot = Partial<Record<ManagedStyleProperty, string>>;

// Steam reuses live library nodes while changing routes. Keep the exact inline
// values that existed before GDL touched them, per document, so a linked-game
// cleanup cannot leak geometry into the next native game page.
const nativeStyleSnapshots = new WeakMap<HTMLElement, NativeStyleSnapshot>();
const managedNativeElements = new WeakMap<Document, Set<HTMLElement>>();

function rememberNativeStyle(element: HTMLElement, property: ManagedStyleProperty): void {
	let snapshot = nativeStyleSnapshots.get(element);
	if (!snapshot) {
		snapshot = {};
		nativeStyleSnapshots.set(element, snapshot);
	}
	if (snapshot[property] === undefined) snapshot[property] = element.style[property];
	const doc = element.ownerDocument;
	let elements = managedNativeElements.get(doc);
	if (!elements) {
		elements = new Set();
		managedNativeElements.set(doc, elements);
	}
	elements.add(element);
}

function setNativeStyle(element: HTMLElement, property: ManagedStyleProperty, value: string): void {
	rememberNativeStyle(element, property);
	element.style[property] = value;
}

export function hideNativeLibraryElement(element: HTMLElement): void {
	setNativeStyle(element, 'display', 'none');
	element.setAttribute('data-gdl-hidden', '1');
}

function applyNativeSurfaceTokens(target: HTMLElement, samples: Array<HTMLElement | null | undefined>): void {
	const view = target.ownerDocument.defaultView;
	if (!view) return;
	for (const sample of samples) {
		if (!sample || !sample.isConnected) continue;
		const style = view.getComputedStyle(sample);
		const painted = style.backgroundImage !== 'none' || !/rgba?\(0,\s*0,\s*0,\s*0\)/i.test(style.backgroundColor);
		if (!painted) continue;
		// Take the live Steam Notes/Media surface rather than guessing a theme.
		target.style.setProperty('--gdl-native-panel-bg', style.background);
		target.style.setProperty('--gdl-native-panel-border', style.borderColor);
		break;
	}
}

/** Restore every native inline style GDL changed in this document. */
export function restoreNativeLibraryStyles(doc: Document): void {
	const elements = managedNativeElements.get(doc);
	if (elements) {
		for (const element of elements) {
			const snapshot = nativeStyleSnapshots.get(element);
			if (!snapshot) continue;
			for (const property of Object.keys(snapshot) as ManagedStyleProperty[]) {
				element.style[property] = snapshot[property] || '';
			}
			element.removeAttribute('data-gdl-hidden');
			nativeStyleSnapshots.delete(element);
		}
		elements.clear();
		managedNativeElements.delete(doc);
	}
	try {
		doc.querySelectorAll<HTMLElement>('[data-gdl-hidden]').forEach(el => {
			el.removeAttribute('data-gdl-hidden');
			el.style.display = '';
		});
	} catch {}
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
				const isPlaybarOrHeader = (el: HTMLElement): boolean => {
					const className = String(el.className || '');
					if (/playbar|gamestats|header|hero/i.test(className)) return true;
					if (el.querySelector('[class*="PlayBar"], [class*="playbar"], [class*="PlayButton"], [class*="playButton"], [class*="GameStatsSection"]')) return true;
					return false;
				};
				const hasInnerPlaybar = Boolean(parent.querySelector('[class*="PlayBar"], [class*="playbar"], [class*="PlayButton"], [class*="playButton"], [class*="GameStatsSection"]'));
				if (!isPlaybarOrHeader(parent) && !hasInnerPlaybar) {
					const siblings = Array.from(parent.children).filter(c => c !== cur) as HTMLElement[];
					const validSiblings = siblings.filter(s => !isPlaybarOrHeader(s));
					const foundSidebar = validSiblings.find(s => {
						const txt = (s.textContent || '').toLowerCase();
						return txt.includes('nota') || txt.includes('note') || txt.includes('captura') || txt.includes('screenshot') || s.querySelector('[role="region"]');
					});
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
			}
			cur = parent;
		}
	}

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
		setNativeStyle(layout.contentColumn, 'display', 'block');
		setNativeStyle(layout.contentColumn, 'height', 'auto');
		setNativeStyle(layout.contentColumn, 'minHeight', '0');
		setNativeStyle(layout.contentColumn, 'alignSelf', 'flex-start');
		layout.contentColumn.removeAttribute('data-gdl-hidden');
	}
	if (layout.twoColumnRow) {
		setNativeStyle(layout.twoColumnRow, 'display', '');
		setNativeStyle(layout.twoColumnRow, 'alignItems', 'flex-start');
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
		hideNativeLibraryElement(element);
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
	const sourceInner = sourceBody?.firstElementChild as HTMLElement | null | undefined;

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
	applyNativeSurfaceTokens(outer, [sourceInner, sourceBody, anchorRegion]);
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
			hideNativeLibraryElement(element);
		}
		contentColumn.insertBefore(wrapper, contentColumn.firstChild);
		return;
	}
	if (noticeParent?.parentElement) noticeParent.parentElement.insertBefore(wrapper, noticeParent.nextSibling);
}
