import type { CommunityContentItem, SteamGameData } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import type { NativeLibraryLayout } from './layout';
import { buildNativeSidebarSection } from './layout';

const progressiveRevealCleanup = new WeakMap<HTMLElement, () => void>();

export function disposeCommunityProgressiveReveal(root: HTMLElement): void {
	progressiveRevealCleanup.get(root)?.();
}

/** Progressive reveal that owns and disposes every listener/observer it installs. */
export function setupCommunityProgressiveReveal(doc: Document, root: HTMLElement): () => void {
	disposeCommunityProgressiveReveal(root);
	const sentinel = root.querySelector('.gdl-community-sentinel') as HTMLElement | null;
	if (!sentinel) return () => {};

	const hiddenCards = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.gdl-community-card[hidden]'));
	if (hiddenCards().length === 0) {
		sentinel.style.display = 'none';
		return () => {};
	}

	let disposed = false;
	const revealNext = (): void => {
		for (const card of hiddenCards().slice(0, 6)) card.removeAttribute('hidden');
		if (hiddenCards().length === 0) sentinel.style.display = 'none';
	};
	const checkScrollPosition = (): void => {
		if (!root.isConnected) {
			cleanup();
			return;
		}
		const bounds = sentinel.getBoundingClientRect();
		if (bounds.top <= (doc.defaultView?.innerHeight || 0) + 360) revealNext();
	};

	const scrollTargets: EventTarget[] = [doc.defaultView || doc];
	let parent: HTMLElement | null = root.parentElement;
	while (parent) {
		const style = doc.defaultView?.getComputedStyle(parent);
		if (style && (style.overflowY === 'auto' || style.overflowY === 'scroll' || parent.scrollHeight > parent.clientHeight + 4)) {
			scrollTargets.push(parent);
		}
		parent = parent.parentElement;
	}
	for (const target of scrollTargets) target.addEventListener('scroll', checkScrollPosition, { passive: true });

	const IntersectionObserverCtor = (doc.defaultView as any)?.IntersectionObserver as typeof IntersectionObserver | undefined;
	const intersectionObserver = typeof IntersectionObserverCtor === 'function'
		? new IntersectionObserverCtor((entries: IntersectionObserverEntry[]) => {
			if (!root.isConnected) {
				cleanup();
				return;
			}
			if (!entries.some(entry => entry.isIntersecting)) return;
			revealNext();
			if (hiddenCards().length === 0) intersectionObserver?.disconnect();
		}, { root: null, rootMargin: '320px 0px' })
		: null;
	if (intersectionObserver) intersectionObserver.observe(sentinel);
	else while (hiddenCards().length > 0) revealNext();

	const MutationObserverCtor = (doc.defaultView as any)?.MutationObserver as typeof MutationObserver | undefined;
	const lifecycleObserver = MutationObserverCtor && doc.documentElement
		? new MutationObserverCtor(() => {
			if (!root.isConnected) cleanup();
		})
		: null;
	lifecycleObserver?.observe(doc.documentElement, { childList: true, subtree: true });

	function cleanup(): void {
		if (disposed) return;
		disposed = true;
		intersectionObserver?.disconnect();
		lifecycleObserver?.disconnect();
		for (const target of scrollTargets) target.removeEventListener('scroll', checkScrollPosition);
		progressiveRevealCleanup.delete(root);
	}

	progressiveRevealCleanup.set(root, cleanup);
	checkScrollPosition();
	return cleanup;
}

export function renderCommunityContentHtml(data: SteamGameData, communityItems: CommunityContentItem[] | undefined): string {
	const items = communityItems && communityItems.length > 0 ? communityItems : [];
	const fallbackScreenshots = items.length === 0 && !!data.screenshots?.length;
	const displayItems: CommunityContentItem[] = fallbackScreenshots
		? data.screenshots!.slice(0, 15).map(screenshot => ({ type: 'screenshot', image: screenshot.path_thumbnail, link: screenshot.path_full }))
		: items;
	if (displayItems.length === 0) return '';

	const screenshots = displayItems.filter(item => item.type !== 'guide');
	const guides = displayItems.filter(item => item.type === 'guide');
	const ordered = [...screenshots.slice(0, 3), ...guides.slice(0, 3), ...screenshots.slice(3), ...guides.slice(3)];

	const authorBar = (item: CommunityContentItem): string => {
		if (!item.author_name && !item.author_avatar) return '';
		return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(0,0,0,.25);margin-top:auto;min-height:32px;">
			${item.author_avatar ? `<img src="${escapeHtml(item.author_avatar)}" style="width:32px;height:32px;flex-shrink:0;object-fit:cover;" data-gdl-hide-on-error="1" />` : ''}
			<span class="gdl-community-author" style="font-size:13px;color:#8f98a0;">${escapeHtml(item.author_name || '')}</span>
		</div>`;
	};

	const card = (item: CommunityContentItem, index: number): string => {
		const click = item.link ? ` data-gdl-open-url="${escapeHtml(item.link)}"` : '';
		const hidden = index >= 9 ? ' hidden' : '';
		if (item.type === 'guide') {
			return `<div class="gdl-community-card" data-gdl-community-card="${index}"${hidden}${click}>
				<div style="padding:8px 12px;background:rgba(0,0,0,.25);font-size:11px;letter-spacing:.5px;font-weight:500;color:#9da4ab;text-transform:uppercase;">${escapeHtml(gdlText('community_guide', 'Community guide').toUpperCase())}</div>
				<div style="display:flex;gap:12px;padding:12px;align-items:flex-start;">
					<img src="${escapeHtml(item.image || '')}" style="width:92px;height:92px;object-fit:cover;flex-shrink:0;" data-gdl-hide-on-error="1" />
					<div class="gdl-community-card-title" style="font-size:15px;font-weight:500;color:#dcdedf;line-height:1.35;min-width:0;">${escapeHtml(item.title || '')}</div>
				</div>
				${item.description ? `<div class="gdl-community-card-description" style="font-size:13px;color:#9da4ab;line-height:1.5;padding:0 12px 12px;">${escapeHtml(item.description)}</div>` : ''}
				${authorBar(item)}
			</div>`;
		}
		return `<div class="gdl-community-card" data-gdl-community-card="${index}"${hidden}${click}>
			<img src="${escapeHtml(item.image || '')}" style="width:100%;max-width:100%;aspect-ratio:16/9;object-fit:cover;display:block;" data-gdl-hide-on-error="1" />
			${item.title ? `<div class="gdl-community-card-title" style="padding:8px 12px 4px;font-size:13px;color:#dcdedf;line-height:1.35;">${escapeHtml(item.title)}</div>` : ''}
			${authorBar(item)}
		</div>`;
	};

	return `<div class="gdl-community-grid">${ordered.map(card).join('')}<div class="gdl-community-sentinel" aria-hidden="true"></div></div>`;
}

export function insertCommunitySection(
	doc: Document,
	layout: NativeLibraryLayout,
	activityWrapper: HTMLElement,
	communityHtml: string,
): HTMLElement | null {
	if (!communityHtml || !activityWrapper.parentElement) return null;
	let node = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-community-content',
		headerText: loc('AppDetails_SectionTitle_Community', 'Community Content'),
		innerId: 'gdl-community-inner',
		innerHtml: communityHtml,
		cloneInnerClass: false,
	});

	if (node) {
		node.classList.add('gdl-community-section');
		activityWrapper.parentElement.insertBefore(node, activityWrapper.nextSibling);
		const heading = node.querySelector('h2');
		const text = (heading?.querySelector('div div') || heading?.querySelector('div') || heading) as HTMLElement | null;
		if (text) {
			const help = doc.createElement('span');
			help.className = 'gdl-community-help';
			help.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1px solid #8f98a0;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#8f98a0;cursor:help;margin-inline-start:8px;vertical-align:middle;';
			help.innerHTML = `?<span class="gdl-community-help-tooltip">${escapeHtml('This section contains screenshots, artwork, videos, guides, and more submitted by the community.')}<br><br>${escapeHtml('You can rate, share, comment on, or report this content.')}</span>`;
			text.appendChild(help);
		}
	} else {
		node = doc.createElement('div');
		node.id = 'gdl-community-content';
		node.className = 'gdl-community-section';
		node.style.cssText = 'color:#acb2b8;font-family:inherit;padding:0 12px 24px;overflow:visible;';
		node.innerHTML = `<h2>${escapeHtml(gdlText('community_content', loc('AppDetails_SectionTitle_Community', 'Community Content')).toUpperCase())}<span title="${escapeHtml('Community screenshots, artwork, and guides')}" style="width:16px;height:16px;border-radius:50%;border:1px solid #8f98a0;display:inline-flex;align-items:center;justify-content:center;font-size:10px;margin-inline-start:8px;">?</span></h2><div id="gdl-community-inner">${communityHtml}</div>`;
		activityWrapper.parentElement.insertBefore(node, activityWrapper.nextSibling);
	}

	setupCommunityProgressiveReveal(doc, node);
	return node;
}
