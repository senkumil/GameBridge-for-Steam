import { stripSurroundingQuotes, templateToRegex } from '../../core/text';
import { loc } from '../../steam/localization';
import { hideNativeLibraryElement } from './layout';

const NON_STEAM_NOTICE_FALLBACK =
	'Some detailed information on %1$s is unavailable because it is a non-Steam game or mod. ' +
	'Steam will still manage launching the game for you and in most cases the in-game overlay will be available.';

const KNOWN_NOTICE_PATTERNS = [
	/(?:sobre|on|sur|über|para|delle|da)\s+([^\n\r]+?)\s+(?:no está disponible|is unavailable|n'est pas disponible|ist nicht verfügbar|não está disponível|non sono disponibili)/i,
	/(?:información sobre|information on|information sur|informationen über)\s+([^\n\r]+?)\s+(?:no está disponible|is unavailable|n'est pas disponible|ist nicht verfügbar)/i,
];

const NOTICE_ANCHORS = [
	'no es un juego de Steam',
	'no es un juego o mod',
	'non-Steam game',
	'is unavailable because it is a non-Steam game',
	'nicht von Steam',
	"n'est pas un jeu Steam",
	'não é um juego Steam',
	'não é um jogo Steam',
	'non è un juego de Steam',
	'non è un gioco di Steam',
	'не из Steam',
];

function localizedNoticeAnchor(): string {
	return loc('AppDetails_Shortcut_Explanation', NON_STEAM_NOTICE_FALLBACK)
		.split('%1$s')
		.reduce((left, right) => (right.trim().length > left.trim().length ? right : left), '')
		.trim()
		.slice(0, 60);
}

function findNoticeTextElement(doc: Document, text: string, allowHidden: boolean): Element | null {
	const start = doc.body || doc.documentElement;
	if (!start || !text) return null;
	const walker = doc.createTreeWalker(start, NodeFilter.SHOW_TEXT, null);
	const target = text.toLocaleLowerCase();
	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		if (!node.textContent?.trim().toLocaleLowerCase().includes(target)) continue;
		const element = node.parentElement;
		if (!element || element.closest('[id^="gdl-"]')) continue;
		const hiddenOwner = element.closest('[data-gdl-hidden]') as HTMLElement | null;
		if (!allowHidden && (hiddenOwner || (element instanceof HTMLElement
			&& (element.style.display === 'none' || element.style.visibility === 'hidden')))) continue;
		return element;
	}
	return null;
}

/** Cheap mutation-batch signal used to mount the loading cloak in the same
 * microtask that Steam inserts its shortcut explanation. */
export function mutationMayContainNonSteamNotice(roots: Iterable<Node>): boolean {
	const samples: string[] = [];
	let length = 0;
	for (const root of roots) {
		const text = String(root.textContent || root.parentElement?.textContent || '');
		if (!text) continue;
		samples.push(text);
		length += text.length;
		if (length >= 12000) break;
	}
	if (!samples.length) return false;
	const content = samples.join(' ');
	const localized = localizedNoticeAnchor();
	return Boolean((localized && content.includes(localized))
		|| NOTICE_ANCHORS.some(anchor => content.toLocaleLowerCase().includes(anchor.toLocaleLowerCase())));
}

/** Find Steam's localized non-Steam shortcut notice and extract its title. */
export function findNonSteamNotice(doc: Document): { element: Element; title: string } | null {
	if (!doc) return null;
	const template = loc('AppDetails_Shortcut_Explanation', NON_STEAM_NOTICE_FALLBACK);
	const anchorText = localizedNoticeAnchor();
	const loadingStageActive = Boolean(doc.getElementById('gdl-skeleton') || doc.getElementById('gdl-sidebar-skeleton'));
	let element: Element | null = anchorText ? findNoticeTextElement(doc, anchorText, loadingStageActive) : null;
	if (!element) {
		for (const anchor of NOTICE_ANCHORS) {
			element = findNoticeTextElement(doc, anchor, loadingStageActive);
			if (element) break;
		}
	}
	if (!element || !element.isConnected || element.closest('[id^="gdl-"]')) return null;
	// The loading stage intentionally conceals Steam's shortcut explanation.
	// Continue recognizing that exact native notice while our skeleton owns the
	// page so a layout retry can finish without requiring another navigation.
	if (element.closest('[data-gdl-hidden]') && !loadingStageActive) return null;
	if (element instanceof HTMLElement
		&& (element.style.display === 'none' || element.style.visibility === 'hidden')
		&& !loadingStageActive) return null;
	const content = element.textContent || '';
	const regex = templateToRegex(template);
	const match = regex ? content.match(regex) : null;
	if (match?.[1]?.trim()) {
		const title = stripSurroundingQuotes(match[1].trim());
		return { element, title };
	}
	for (const pattern of KNOWN_NOTICE_PATTERNS) {
		const fallbackMatch = content.match(pattern);
		if (fallbackMatch?.[1]?.trim()) {
			const title = stripSurroundingQuotes(fallbackMatch[1].trim());
			return { element, title };
		}
	}
	const heading = doc.querySelector('[class*="header_Title"], [class*="appheader_Title"], [class*="game_title"], [class*="Title_"]') as HTMLElement | null;
	const headingTitle = heading?.textContent?.trim() || '';
	return headingTitle
		? { element, title: stripSurroundingQuotes(headingTitle) }
		: null;
}

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
