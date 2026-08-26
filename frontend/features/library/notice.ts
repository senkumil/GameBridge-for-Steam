import { hideNativeLibraryElement } from './layout';

/** Hide Steam's shortcut explanation immediately while the cached page mounts. */
export function hideNoticeQuick(noticeElement: Element): void {
	let element: HTMLElement | null = noticeElement as HTMLElement;
	for (let depth = 0; depth < 4 && element; depth += 1) {
		if (depth > 0 && element.querySelector('[data-nsp]')) break;
		hideNativeLibraryElement(element);
		const parent = element.parentElement;
		if (!parent || parent.childElementCount > 1) break;
		element = parent;
	}
}
