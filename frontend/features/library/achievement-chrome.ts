import { backendLog } from '../../api/backend';
import { escapeHtml } from '../../core/text';
import { ACH_CLASSES, PLAYBAR_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import {
	buildNativeAchievementPlaybarBlueprint,
	elementsWithCssModuleClass,
	hasCssModuleClass,
	isRenderedElement,
} from '../../steam/native-dom';
import {
	ensureLocalPlaybarStat,
	findVisibleTextElement,
	focusAchievementsSection,
	getAchievementProgress,
	renderLocalAchievementSidebar,
} from '../achievements/runtime';
import { fetchLocalAchievementData } from '../achievements/service';

export interface LinkedAchievementChromeContext {
	steamAppId: string;
	fallbackTotal: number;
	stateAppId?: string;
	isCurrent: () => boolean;
}

async function injectPlayBarAchievements(doc: Document, context: LinkedAchievementChromeContext): Promise<void> {
	const progress = await getAchievementProgress(Number(context.steamAppId), context.fallbackTotal);
	if (!progress || progress.total <= 0 || !context.isCurrent()) return;
	if (doc.getElementById('gdl-playbar-achievements')) return;

	const findLabel = (text: string): HTMLElement | null => {
		const target = text.trim().toLocaleLowerCase();
		const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null);
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			if (node.textContent?.trim().toLocaleLowerCase() === target) return node.parentElement;
		}
		return null;
	};

	const playbar = PLAYBAR_CLASSES();
	const nativePlayStat = elementsWithCssModuleClass(doc, playbar.GameStatsSection)
		.flatMap(section => elementsWithCssModuleClass(section, playbar.GameStat))
		.find(candidate => hasCssModuleClass(candidate, playbar.Playtime) && isRenderedElement(doc, candidate)) || null;
	const label = nativePlayStat
		? elementsWithCssModuleClass(nativePlayStat, playbar.PlayBarLabel)[0]
			|| findVisibleTextElement(doc, loc('AppDetails_SectionTitle_PlayTime', 'Playtime'), nativePlayStat)
		: findLabel(loc('AppDetails_SectionTitle_PlayTime', 'Playtime'));
	if (!label) {
		backendLog('Play bar: PLAY TIME label not found');
		return;
	}
	const value = label.nextElementSibling as HTMLElement | null;
	if (!value) return;

	const lastPlayed = findLabel(loc('AppDetails_SectionTitle_LastPlayed', 'Last played'));
	let statRoot: HTMLElement = nativePlayStat || label;
	if (!nativePlayStat && lastPlayed && !label.contains(lastPlayed)) {
		while (statRoot.parentElement && !statRoot.parentElement.contains(lastPlayed)) statRoot = statRoot.parentElement;
	} else if (!nativePlayStat && label.parentElement?.parentElement) {
		statRoot = label.parentElement.parentElement;
	}
	const statsRow = statRoot.parentElement;
	if (!statsRow) return;

	const open = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		focusAchievementsSection(doc);
	};
	const nativeBlueprint = buildNativeAchievementPlaybarBlueprint(doc, progress.unlocked, progress.total, open);
	if (nativeBlueprint) {
		statsRow.insertBefore(nativeBlueprint, statRoot.nextSibling);
		return;
	}

	const achievements = ACH_CLASSES();
	const pct = Math.round((100 * progress.unlocked) / progress.total);
	const stat = doc.createElement('div');
	stat.id = 'gdl-playbar-achievements';
	stat.className = statRoot.className;
	const inner = `<div class="${label.className}">${escapeHtml(loc('AppDetails_SectionTitle_Achievements', 'Achievements'))}</div>
		<div class="${value.className}" style="display:flex;align-items:center;gap:8px;">
			<span>${progress.unlocked}/${progress.total}</span>
			<div class="${achievements.SingleAchievementProgressBar}" style="width:96px;"><div class="${achievements.AchievementProgress}" style="width:${pct}%;"></div></div>
		</div>`;
	const labelWrap = label.parentElement;
	stat.innerHTML = labelWrap && labelWrap !== statRoot ? `<div class="${labelWrap.className}">${inner}</div>` : inner;
	stat.style.cursor = 'pointer';
	stat.title = gdlText('view_linked_achievements', 'View achievements for this linked game');
	stat.addEventListener('click', open);
	statsRow.insertBefore(stat, statRoot.nextSibling);
}

/** Resolves local read-only progress first, then the Steam client cache. */
export async function finalizeLinkedAchievements(doc: Document, context: LinkedAchievementChromeContext): Promise<void> {
	try {
		const local = await fetchLocalAchievementData(context.steamAppId, { stateAppId: context.stateAppId });
		if (!context.isCurrent()) return;
		if (local?.found && Array.isArray(local.achievements) && local.total > 0) {
			renderLocalAchievementSidebar(doc, local);
			ensureLocalPlaybarStat(doc, local);
			return;
		}
	} catch (error) {
		backendLog('Local achievements check in finalizeLinkedAchievements error: ' + error);
	}

	await injectPlayBarAchievements(doc, context);
}
