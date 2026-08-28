import type { LocalAchievementData, LocalAchievementItem } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { escapeHtml } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { ACH_CLASSES } from '../../steam/css';
import { cacheLocalAchievements, localAchievementDataSignature } from './cache';
import { localAchievementPercent } from './format';
import { ensureLocalPlaybarStat } from './playbar';
import { openLocalAchievementsModal } from './modal';

function localAchievementIcon(item: LocalAchievementItem, locked = false): string {
	const url = locked ? (item.icon_gray || item.icon) : item.icon;
	if (!url) return `<div class="gdl-la-icon gdl-la-icon-fallback${locked ? ' is-locked' : ''}">★</div>`;
	return `<img class="gdl-la-icon${locked ? ' is-locked' : ''}" src="${escapeHtml(url)}" loading="lazy" data-gdl-invisible-on-error="1" />`;
}

function renderAchievementIconRowHtml(items: LocalAchievementItem[], columns: number, locked: boolean): string {
	if (!items.length) return '';
	const showMore = items.length > columns;
	const countToShow = showMore ? Math.max(1, columns - 1) : items.length;
	const thumbnails = items.slice(0, countToShow);
	const moreCount = items.length - countToShow;
	const iconsHtml = thumbnails.map(item => localAchievementIcon(item, locked)).join('');
	const moreHtml = showMore && moreCount > 0 ? `<div class="gdl-la-more">+${moreCount}</div>` : '';
	return `<div class="gdl-la-icon-row" style="grid-template-columns: repeat(${columns}, 1fr);">${iconsHtml}${moreHtml}</div>`;
}

function renderFeaturedAchievementHtml(item: LocalAchievementItem): string {
	return `<div class="gdl-la-feature">${localAchievementIcon(item)}<div class="gdl-la-feature-copy"><div class="gdl-la-feature-title">${escapeHtml(item.display_name || item.name)}</div><div class="gdl-la-feature-desc">${escapeHtml(item.description || '')}</div></div></div>`;
}

export function renderLocalAchievementSidebarHtml(data: LocalAchievementData, columns = 5): string {
	if (data.total <= 0) return '';
	const signature = localAchievementDataSignature(data);
	const pct = localAchievementPercent(data);
	const earned = data.achievements.filter(item => item.earned).sort((a, b) => (b.earned_time || 0) - (a.earned_time || 0));
	const locked = data.achievements.filter(item => !item.earned);
	// A one-icon thumbnail strip looks detached from the featured achievement.
	// When only two achievements are earned, render both with their names and
	// descriptions; larger sets retain Steam's compact featured + icon layout.
	const featuredEarned = earned.length <= 2 ? earned : earned.slice(0, 1);
	const otherEarned = earned.length > 2 ? earned.slice(1) : [];
	const latestHtml = featuredEarned.map(renderFeaturedAchievementHtml).join('');
	const earnedRow = otherEarned.length
		? `<div class="gdl-la-earned-row-wrap">${renderAchievementIconRowHtml(otherEarned, columns, false)}</div>`
		: '';
	const lockedBlock = locked.length
		? `<div class="gdl-la-divider"></div><div class="gdl-la-locked-label">${escapeHtml(gdlText('locked_achievements', 'Locked achievements'))}</div><div class="gdl-la-locked-row-wrap">${renderAchievementIconRowHtml(locked, columns, true)}</div>`
		: '';
	return `<div class="${ACH_CLASSES().HighlightDiv} gdl-la-summary" data-gdl-local-ach="1" data-gdl-achievement-signature="${escapeHtml(signature)}"><div class="gdl-la-header"><div class="gdl-la-unlocked">${escapeHtml(gdlText('achievements_unlocked', '{unlocked} of {total} achievements unlocked', { unlocked: data.unlocked, total: data.total }))} <span class="pct">(${pct}%)</span></div><div class="gdl-la-progress-track"><div class="gdl-la-progress-fill" style="width:${pct}%"></div></div></div><div class="gdl-la-body">${latestHtml}${earnedRow}${lockedBlock}<div class="gdl-la-view">${escapeHtml(gdlText('view_all_achievements', 'View all achievements'))}</div></div></div>`;
}

function setupDynamicGrid(summary: HTMLElement, data: LocalAchievementData): () => void {
	let currentColumns = 5;
	const update = (width: number) => {
		if (width <= 0) return;
		const usable = Math.max(100, width - 28);
		// Steam's desktop sidebar keeps a five-slot achievement strip at normal
		// widths (four icons + a +N tile when overflowed). Only shrink below five
		// when the actual sidebar becomes narrower.
		const columns = Math.max(3, Math.min(5, Math.floor((usable + 8) / 60)));
		if (columns === currentColumns) return;
		currentColumns = columns;
		const earned = data.achievements.filter(item => item.earned).sort((a, b) => (b.earned_time || 0) - (a.earned_time || 0));
		const locked = data.achievements.filter(item => !item.earned);
		const otherEarned = earned.length > 2 ? earned.slice(1) : [];
		const earnedWrap = summary.querySelector<HTMLElement>('.gdl-la-earned-row-wrap');
		if (earnedWrap && otherEarned.length) earnedWrap.innerHTML = renderAchievementIconRowHtml(otherEarned, columns, false);
		const lockedWrap = summary.querySelector<HTMLElement>('.gdl-la-locked-row-wrap');
		if (lockedWrap && locked.length) lockedWrap.innerHTML = renderAchievementIconRowHtml(locked, columns, true);
	};
	const ResizeObserverCtor = summary.ownerDocument.defaultView?.ResizeObserver;
	if (typeof ResizeObserverCtor === 'function') {
		const observer = new ResizeObserverCtor(entries => {
			for (const entry of entries) update(entry.contentRect.width || (entry.target as HTMLElement).clientWidth);
		});
		observer.observe(summary);
		if (summary.clientWidth > 0) update(summary.clientWidth);
		return () => observer.disconnect();
	}
	const onResize = () => { if (summary.isConnected) update(summary.clientWidth); };
	summary.ownerDocument.defaultView?.addEventListener('resize', onResize);
	return () => summary.ownerDocument.defaultView?.removeEventListener('resize', onResize);
}

const sidebarGridCleanup = new WeakMap<HTMLElement, () => void>();

/** Reveal a metadata-only fallback after the local progress request has
 * conclusively completed. Until then, showing it as 0/N would be misleading. */
export function revealPendingAchievementSidebar(doc: Document): void {
	doc.getElementById('gdl-achievements-section')
		?.removeAttribute('data-gdl-achievements-pending');
}

export function renderLocalAchievementSidebar(doc: Document, data: LocalAchievementData): void {
	cacheLocalAchievements(data);
	ensureLocalPlaybarStat(doc, data);
	if (data.total <= 0) return;
	const host = doc.getElementById('gdl-achievements-content');
	if (!host) return;
	const previous = host.querySelector<HTMLElement>('.gdl-la-summary');
	const signature = localAchievementDataSignature(data);
	if (previous?.dataset.gdlAchievementSignature === signature) {
		if (!sidebarGridCleanup.has(previous)) {
			sidebarGridCleanup.set(previous, setupDynamicGrid(previous, data));
		}
		revealPendingAchievementSidebar(doc);
		return;
	}
	if (previous) sidebarGridCleanup.get(previous)?.();
	host.innerHTML = renderLocalAchievementSidebarHtml(data);
	const summary = host.querySelector<HTMLElement>('.gdl-la-summary');
	if (!summary) return;
	sidebarGridCleanup.set(summary, setupDynamicGrid(summary, data));
	summary.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		void openLocalAchievementsModal(doc, data).catch(error => backendLog('Achievements modal error: ' + error));
	});
	revealPendingAchievementSidebar(doc);
}
