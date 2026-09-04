import { PLAYBAR_CLASSES } from './css';
import { elementsWithCssModuleClass } from './native-dom';

interface OriginalDisplay {
	value: string;
	priority: string;
}

const originalDisplays = new WeakMap<HTMLElement, OriginalDisplay>();
const forcedElementsByDocument = new WeakMap<Document, Set<HTMLElement>>();

function forceFlexDisplay(doc: Document, element: HTMLElement): void {
	if (!originalDisplays.has(element)) {
		originalDisplays.set(element, {
			value: element.style.getPropertyValue('display'),
			priority: element.style.getPropertyPriority('display'),
		});
	}
	let forced = forcedElementsByDocument.get(doc);
	if (!forced) {
		forced = new Set<HTMLElement>();
		forcedElementsByDocument.set(doc, forced);
	}
	forced.add(element);
	// Steam applies display:none!important through NarrowRightPanel. An inline
	// important declaration wins that fixed logical-pixel breakpoint without
	// changing the native component's layout or affecting ordinary Steam games.
	element.style.setProperty('display', 'flex', 'important');
}

/** Keep linked-game play-bar copy visible while Steam's middle splitter marks
 * the right pane NarrowRightPanel even though its stats row still has room. */
export function preserveLinkedPlaybarVisibility(doc: Document): void {
	const classes = PLAYBAR_CLASSES();
	const sections = elementsWithCssModuleClass(doc, classes.GameStatsSection)
		.filter(section => section.isConnected);
	for (const section of sections) {
		for (const copy of elementsWithCssModuleClass(section, classes.HideWhenNarrow)) {
			forceFlexDisplay(doc, copy);
		}
		for (const achievements of elementsWithCssModuleClass(section, classes.MiniAchievements)) {
			forceFlexDisplay(doc, achievements);
		}
	}
}

/** Restore any native inline display value when the linked route is retired. */
export function restoreLinkedPlaybarVisibility(doc: Document): void {
	const forced = forcedElementsByDocument.get(doc);
	if (!forced) return;
	for (const element of forced) {
		const original = originalDisplays.get(element);
		if (original?.value) element.style.setProperty('display', original.value, original.priority);
		else element.style.removeProperty('display');
		originalDisplays.delete(element);
	}
	forced.clear();
	forcedElementsByDocument.delete(doc);
}
