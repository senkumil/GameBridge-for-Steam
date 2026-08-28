import { escapeHtml } from '../../core/text';
import { FEED_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import { GDL_INJECTED } from './constants';
import {
	discoverNativeLibraryLayout,
	hideNativeLibraryElement,
	restoreNativeLibraryStyles,
} from './layout';
import { hideNoticeQuick } from './notice';
import { renderActivityFeedSkeletonHtml } from './activity-skeleton';
import { ensureNativeGameInfoStyles } from './styles';

export const LINKED_LOADING_MAIN_ID = 'gdl-skeleton';
export const LINKED_LOADING_SIDEBAR_ID = 'gdl-sidebar-skeleton';

const loadingGenerations = new WeakMap<Document, number>();

function loadingBlock(height: number, width = '100%'): string {
	return `<div style="height:${height}px;width:${width};background:rgba(72,82,94,.26);border:1px solid rgba(255,255,255,.025);box-sizing:border-box;"></div>`;
}

function createMainSkeleton(doc: Document): HTMLElement {
	const skeleton = doc.createElement('div');
	skeleton.id = LINKED_LOADING_MAIN_ID;
	skeleton.className = FEED_CLASSES().ActivityFeedContainer;
	skeleton.setAttribute('aria-busy', 'true');
	skeleton.style.cssText = 'font-family:inherit;padding:0 12px 24px;overflow:hidden;pointer-events:none;';
	skeleton.innerHTML = `
		<div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:#8f98a0;margin-bottom:16px;">${escapeHtml(gdlText('activity', loc('AppDetails_SectionTitle_Activity', 'Activity')).toUpperCase())}</div>
		<div class="gdl-linked-loading-composer">${loadingBlock(46)}</div>
		${renderActivityFeedSkeletonHtml(gdlText('activity', loc('AppDetails_SectionTitle_Activity', 'Activity')))}`;
	return skeleton;
}

function createSidebarSkeleton(doc: Document): HTMLElement {
	const skeleton = doc.createElement('div');
	skeleton.id = LINKED_LOADING_SIDEBAR_ID;
	skeleton.setAttribute('aria-busy', 'true');
	skeleton.style.cssText = 'display:grid;gap:12px;padding:0 0 20px;opacity:.72;pointer-events:none;';
	skeleton.innerHTML = `${loadingBlock(92)}${loadingBlock(156)}${loadingBlock(124)}`;
	return skeleton;
}

/** Conceal Steam's incomplete shortcut body before any asynchronous mapping or
 * metadata work. The play bar and hero remain native and immediately usable. */
export function stageLinkedShortcutLoading(doc: Document, notice: Element, generation: number): void {
	loadingGenerations.set(doc, generation);
	ensureNativeGameInfoStyles(doc);
	hideNoticeQuick(notice);
	if (doc.getElementById(GDL_INJECTED)) return;
	const layout = discoverNativeLibraryLayout(doc, notice);
	const main = doc.getElementById(LINKED_LOADING_MAIN_ID) as HTMLElement | null || createMainSkeleton(doc);
	const sidebar = doc.getElementById(LINKED_LOADING_SIDEBAR_ID) as HTMLElement | null || createSidebarSkeleton(doc);
	main.dataset.gdlLoadingGeneration = String(generation);
	sidebar.dataset.gdlLoadingGeneration = String(generation);

	if (layout.contentColumn) {
		for (const child of Array.from(layout.contentColumn.children)) {
			if (child !== main) hideNativeLibraryElement(child as HTMLElement);
		}
		if (!main.isConnected) layout.contentColumn.insertBefore(main, layout.contentColumn.firstChild);
	} else if (!main.isConnected) {
		const host = notice.closest('div')?.parentElement;
		if (host) host.appendChild(main);
	}

	if (layout.sidebarColumn) {
		for (const child of Array.from(layout.sidebarColumn.children)) {
			if (child !== sidebar) hideNativeLibraryElement(child as HTMLElement);
		}
		if (!sidebar.isConnected) layout.sidebarColumn.insertBefore(sidebar, layout.sidebarColumn.firstChild);
	}
}

/** Cancel only the loading stage that belongs to this navigation. A stale
 * response must never reveal or remove the next game's UI. */
export function cancelLinkedShortcutLoading(doc: Document, generation?: number): void {
	const current = loadingGenerations.get(doc);
	if (generation !== undefined && current !== generation) return;
	doc.getElementById(LINKED_LOADING_MAIN_ID)?.remove();
	doc.getElementById(LINKED_LOADING_SIDEBAR_ID)?.remove();
	restoreNativeLibraryStyles(doc);
	loadingGenerations.delete(doc);
}

/** The final renderer already owns the native visibility snapshots. Completing
 * a successful stage removes only its temporary nodes, without restoring the
 * native shortcut body underneath the linked page. */
export function completeLinkedShortcutLoading(doc: Document, generation: number): void {
	if (loadingGenerations.get(doc) !== generation) return;
	doc.getElementById(LINKED_LOADING_MAIN_ID)?.remove();
	doc.getElementById(LINKED_LOADING_SIDEBAR_ID)?.remove();
	loadingGenerations.delete(doc);
}
