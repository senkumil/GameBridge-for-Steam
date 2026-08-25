import type { LocalAchievementData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { escapeHtml } from '../../core/text';
import { PLAYBAR_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import { buildNativeAchievementPlaybarBlueprint, elementsWithCssModuleClass, isRenderedElement } from '../../steam/native-dom';
import { localAchievementPercent } from './format';
import { openLocalAchievementsModal } from './modal';

export function findVisibleTextElement(doc: Document, wanted: string, root?: Node): HTMLElement | null {
	const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
	const target = normalize(wanted);
	const walker = doc.createTreeWalker(root || doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null);
	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		if (normalize(node.textContent || '') !== target || !node.parentElement) continue;
		if (isRenderedElement(doc, node.parentElement)) return node.parentElement;
	}
	return null;
}

function achievementMedalSvg(extraClass = ''): string {
	return `<svg class="${extraClass}" width="33" height="33" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="color:currentColor;display:block;"><path d="M30 30.05H26L24 34.05L20.11 27.57L22.9 24.8701L26.9 24.81L30 30.05ZM13.1 24.8701L9.1 24.81L6 30.05H10L12 34.05L15.89 27.57L13.1 24.8701ZM22.5 13.05C22.5 12.16 22.2361 11.29 21.7416 10.55C21.2471 9.80996 20.5443 9.23318 19.7221 8.89259C18.8998 8.552 17.995 8.46288 17.1221 8.63651C16.2492 8.81015 15.4474 9.23873 14.818 9.86807C14.1887 10.4974 13.7601 11.2992 13.5865 12.1721C13.4128 13.0451 13.5019 13.9499 13.8425 14.7721C14.1831 15.5944 14.7599 16.2972 15.4999 16.7917C16.24 17.2861 17.11 17.55 18 17.55C18.5913 17.5514 19.1771 17.4359 19.7236 17.2102C20.2702 16.9845 20.7668 16.6531 21.1849 16.235C21.603 15.8168 21.9345 15.3202 22.1601 14.7737C22.3858 14.2271 22.5013 13.6414 22.5 13.05ZM29 13.05L25.85 16.3L25.78 20.83L21.25 20.9L18 24.05L14.75 20.9L10.22 20.83L10.15 16.3L7 13.05L10.15 9.80005L10.22 5.27005L14.75 5.20005L18 2.05005L21.25 5.20005L25.78 5.27005L25.85 9.80005L29 13.05Z" fill="currentColor"/></svg>`;
}

export function ensureLocalPlaybarStat(doc: Document, data: LocalAchievementData): HTMLElement | null {
	if (!data || data.total <= 0) return null;
	const classes = PLAYBAR_CLASSES();
	const pct = localAchievementPercent(data);
	const progressText = `${data.unlocked}/${data.total}`;
	let sections = elementsWithCssModuleClass(doc, classes.GameStatsSection).filter(section => section.isConnected);
	if (sections.length === 0) {
		const cloud = doc.querySelector('[data-gdl-cloud-status="1"]') as HTMLElement | null;
		if (cloud?.parentElement) sections = [cloud.parentElement];
		else {
			const fallback = doc.querySelector('[class*="GameStatsSection"], [class*="gameStatsSection"], [class*="PlayBarStats"], [class*="playBarStats"]') as HTMLElement | null;
			if (fallback) sections = [fallback];
		}
	}
	if (sections.length === 0) return null;
	let lastStat: HTMLElement | null = null;
	for (const stats of sections) {
		let stat = stats.querySelector('[data-gdl-playbar-achievements="1"]') as HTMLElement | null;
		if (stat) {
			const count = stat.querySelector('.gdl-lp-count');
			if (count) count.textContent = progressText;
			const fill = stat.querySelector<HTMLElement>('.gdl-lp-fill');
			if (fill) fill.style.width = `${pct}%`;
			lastStat = stat;
			continue;
		}
		const open = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			void openLocalAchievementsModal(doc, data).catch(error => backendLog('Achievements modal error: ' + error));
		};
		let wrapper = buildNativeAchievementPlaybarBlueprint(doc, data.unlocked, data.total, open);
		if (wrapper) {
			stats.appendChild(wrapper);
			lastStat = wrapper;
			continue;
		}
		wrapper = doc.createElement('div');
		wrapper.dataset.gdlPlaybarAchievements = '1';
		wrapper.id = 'gdl-playbar-achievements';
		wrapper.className = `${classes.GameStat || ''} ${classes.MiniAchievements || classes.Playtime || ''} gdl-local-playbar`;
		wrapper.title = gdlText('view_linked_achievements', 'View achievements for this linked game');
		wrapper.innerHTML = `<div class="${classes.GameStatIcon || classes.GameStatIconForced || ''} ${classes.AchievementSVG || ''}">${achievementMedalSvg(classes.AchievementSVG || '')}</div><div class="${classes.HideWhenNarrow || ''} ${classes.GameStatRight || ''} ${classes.AchievementRight || ''}"><div class="${classes.PlayBarLabel || ''} ${classes.AchievementLabel || ''}">${escapeHtml(loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')))}</div><div class="${classes.AchievementProgressRow || ''}"><div class="gdl-lp-count ${classes.PlayBarDetailLabel || ''} ${classes.AchievementCountLabel || ''}">${progressText}</div><div class="gdl-lp-bar ${classes.DetailsProgressContainer || ''}"><div class="gdl-lp-fill ${classes.DetailsProgressBar || ''}" style="width:${pct}%;"></div></div></div></div>`;
		wrapper.addEventListener('click', open);
		stats.appendChild(wrapper);
		lastStat = wrapper;
	}
	return lastStat;
}
