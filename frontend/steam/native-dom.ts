import { ACH_CLASSES, LINKS_BAR_CLASSES, PLAYBAR_CLASSES } from './css';
import { gdlText, loc, steamLanguageSync } from './localization';

export const NATIVE_UI_BLUEPRINT_KEYS = {
	playbarAchievements: 'playbar-achievements',
	cloudStatus: 'cloud-status',
	infoButton: 'info-button',
	primaryLinks: 'primary-links',
} as const;

export type NativeUiBlueprintKey = typeof NATIVE_UI_BLUEPRINT_KEYS[keyof typeof NATIVE_UI_BLUEPRINT_KEYS];

/** Session-scoped only. Persisting private Steam DOM across client updates is unsafe. */
const nativeUiBlueprints = new Map<string, string>();

function blueprintKey(key: NativeUiBlueprintKey): string {
	return `${steamLanguageSync() || 'english'}:${key}`;
}

export function clearNativeUiBlueprints(): void {
	nativeUiBlueprints.clear();
}

export function saveNativeUiBlueprint(key: NativeUiBlueprintKey, element: HTMLElement): void {
	const html = element.outerHTML;
	if (html) nativeUiBlueprints.set(blueprintKey(key), html);
}

export function loadNativeUiBlueprint(doc: Document, key: NativeUiBlueprintKey): HTMLElement | null {
	const html = nativeUiBlueprints.get(blueprintKey(key));
	if (!html) return null;
	try {
		const template = doc.createElement('template');
		template.innerHTML = html.trim();
		return template.content.firstElementChild as HTMLElement | null;
	} catch {
		return null;
	}
}

export function cssModuleTokens(value?: string): string[] {
	return String(value || '').split(/\s+/).filter(Boolean);
}

export function hasCssModuleClass(element: Element | null, value?: string): boolean {
	if (!element) return false;
	const tokens = cssModuleTokens(value);
	return tokens.length > 0 && tokens.every(token => element.classList.contains(token));
}

export function addCssModuleClass(element: Element, value?: string): void {
	for (const token of cssModuleTokens(value)) element.classList.add(token);
}

export function removeCssModuleClass(element: Element, value?: string): void {
	for (const token of cssModuleTokens(value)) element.classList.remove(token);
}

export function elementsWithCssModuleClass(root: Document | Element, value?: string): HTMLElement[] {
	const tokens = cssModuleTokens(value);
	if (tokens.length === 0) return [];
	const result: HTMLElement[] = [];
	if ((root as Element).nodeType === 1 && tokens.every(token => (root as Element).classList.contains(token))) {
		result.push(root as HTMLElement);
	}
	const collection = root.getElementsByClassName(tokens[0]);
	for (const candidate of Array.from(collection)) {
		if (tokens.every(token => candidate.classList.contains(token))) result.push(candidate as HTMLElement);
	}
	return result;
}

export function closestWithCssModuleClass(element: Element | null, value?: string): HTMLElement | null {
	let current = element as HTMLElement | null;
	while (current) {
		if (hasCssModuleClass(current, value)) return current;
		current = current.parentElement;
	}
	return null;
}

export function normalizedUiText(value: string): string {
	return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function isRenderedElement(doc: Document, element: HTMLElement): boolean {
	const rect = element.getBoundingClientRect?.();
	const style = doc.defaultView?.getComputedStyle?.(element);
	return Boolean(rect && rect.width > 0 && rect.height > 0
		&& style?.display !== 'none' && style?.visibility !== 'hidden');
}

export interface CaptureNativeUiBlueprintOptions {
	skip?: () => boolean;
}

/**
 * Learns only small, self-contained controls from the current Steam session.
 * Large structural containers are not persisted across sessions/client builds.
 */
export function captureNativeUiBlueprints(doc: Document, options: CaptureNativeUiBlueprintOptions = {}): void {
	if (!doc.body || options.skip?.()) return;
	const ps = PLAYBAR_CLASSES();

	try {
		const nativeAchStat = elementsWithCssModuleClass(doc, ps.GameStatsSection)
			.flatMap(section => elementsWithCssModuleClass(section, ps.GameStat))
			.find(stat => hasCssModuleClass(stat, ps.MiniAchievements)
				&& !stat.closest('[data-gdl-playbar-achievements]') && isRenderedElement(doc, stat));
		if (nativeAchStat) saveNativeUiBlueprint(NATIVE_UI_BLUEPRINT_KEYS.playbarAchievements, nativeAchStat);
	} catch {}

	try {
		const nativeCloud = elementsWithCssModuleClass(doc, ps.PlayBarCloudStatusContainer)
			.find(el => !el.closest('[data-gdl-cloud-status]') && isRenderedElement(doc, el));
		if (nativeCloud) saveNativeUiBlueprint(NATIVE_UI_BLUEPRINT_KEYS.cloudStatus, nativeCloud);
	} catch {}

	try {
		const showInfo = normalizedUiText(loc('GameAction_ViewDetails', gdlText('show_game_details', 'Show game details')));
		const hideInfo = normalizedUiText(loc('GameAction_ViewDetails_Collapse', gdlText('hide_game_details', 'Hide game details')));
		for (const buttons of elementsWithCssModuleClass(doc, ps.AppButtonsContainer)) {
			const candidates = Array.from(buttons.querySelectorAll<HTMLElement>('button,[role="button"]'))
				.filter(button => !button.closest('[data-gdl-game-info-button]') && isRenderedElement(doc, button));
			let nativeInfoButton = candidates.find(button => {
				const text = normalizedUiText(button.getAttribute('aria-label') || button.getAttribute('title') || '');
				return !!text && (text === showInfo || text === hideInfo);
			}) || null;
			if (!nativeInfoButton) {
				const menus = candidates.filter(button => {
					if (!hasCssModuleClass(button, ps.MenuButton) || hasCssModuleClass(button, ps.FavoriteButton)) return false;
					const text = normalizedUiText(button.getAttribute('aria-label') || button.getAttribute('title') || '');
					if (/controller|gamepad|mando|manette|steuer|joystick/i.test(text)) return false;
					if (button.querySelector('svg[class*="Controller"], svg[class*="Gamepad"], [class*="Controller"]')) return false;
					return true;
				});
				nativeInfoButton = menus.length >= 2 ? menus[menus.length - 1] : null;
			}
			if (nativeInfoButton) {
				saveNativeUiBlueprint(NATIVE_UI_BLUEPRINT_KEYS.infoButton, nativeInfoButton);
				break;
			}
		}
	} catch {}

	try {
		const ls = LINKS_BAR_CLASSES();
		const nativeLinksBar = elementsWithCssModuleClass(doc, ls.LinksSection)
			.find(el => !el.closest('#gdl-library-injected') && !el.id?.startsWith('gdl-') && isRenderedElement(doc, el));
		if (nativeLinksBar) saveNativeUiBlueprint(NATIVE_UI_BLUEPRINT_KEYS.primaryLinks, nativeLinksBar);
	} catch {}
}

export function buildNativeAchievementPlaybarBlueprint(
	doc: Document,
	unlocked: number,
	total: number,
	onClick: (event: Event) => void,
): HTMLElement | null {
	const stat = loadNativeUiBlueprint(doc, NATIVE_UI_BLUEPRINT_KEYS.playbarAchievements);
	if (!stat) return null;
	const ps = PLAYBAR_CLASSES();
	const c = ACH_CLASSES();
	if (ps.GameStat && !hasCssModuleClass(stat, ps.GameStat)) return null;
	const pct = total > 0 ? Math.round((100 * unlocked) / total) : 0;
	stat.removeAttribute('id');
	stat.id = 'gdl-playbar-achievements';
	stat.dataset.gdlPlaybarAchievements = '1';
	stat.classList.add('gdl-local-playbar');
	stat.style.cursor = 'pointer';
	stat.title = gdlText('view_linked_achievements', 'View achievements for this linked game');

	const label = elementsWithCssModuleClass(stat, ps.PlayBarLabel)[0];
	if (label) label.textContent = loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements'));
	let count = elementsWithCssModuleClass(stat, ps.AchievementCountLabel)[0] || null;
	if (!count) count = Array.from(stat.querySelectorAll<HTMLElement>('div,span')).find(el => /^\s*\d+\s*\/\s*\d+\s*$/.test(el.textContent || '')) || null;
	if (count) count.textContent = `${unlocked}/${total}`;
	const fill = elementsWithCssModuleClass(stat, ps.DetailsProgressBar)[0]
		|| elementsWithCssModuleClass(stat, c.AchievementProgress)[0] || null;
	if (fill) fill.style.width = `${pct}%`;
	stat.addEventListener('click', onClick);
	return stat;
}

export function buildNativeCloudBlueprint(doc: Document): HTMLElement | null {
	const wrapper = loadNativeUiBlueprint(doc, NATIVE_UI_BLUEPRINT_KEYS.cloudStatus);
	if (!wrapper) return null;
	const ps = PLAYBAR_CLASSES();
	if (ps.PlayBarCloudStatusContainer && !hasCssModuleClass(wrapper, ps.PlayBarCloudStatusContainer)) return null;
	wrapper.removeAttribute('id');
	wrapper.dataset.gdlCloudStatus = '1';
	wrapper.title = loc('AppDetails_CloudStatus_Tooltip_Synchronized', 'Your Steam Cloud files are synchronized for this app.');
	const label = elementsWithCssModuleClass(wrapper, ps.PlayBarLabel)[0];
	const detail = elementsWithCssModuleClass(wrapper, ps.PlayBarDetailLabel)[0];
	if (label) label.textContent = loc('AppDetails_SectionTitle_CloudStatus', 'Cloud status');
	if (detail) detail.textContent = loc('AppDetails_CloudStatus_Synchronized', 'Up to date');
	return wrapper;
}

export function buildNativeInfoButtonBlueprint(doc: Document): HTMLElement | null {
	const button = loadNativeUiBlueprint(doc, NATIVE_UI_BLUEPRINT_KEYS.infoButton);
	if (!button) return null;
	const ps = PLAYBAR_CLASSES();
	if (ps.MenuButton && !hasCssModuleClass(button, ps.MenuButton)) return null;
	button.removeAttribute('id');
	button.removeAttribute('onclick');
	button.dataset.gdlGameInfoButton = '1';
	button.dataset.gdlNativeBlueprint = '1';
	removeCssModuleClass(button, ps.MenuActive);
	return button;
}
