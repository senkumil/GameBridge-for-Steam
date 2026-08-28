import { findElementByText } from '../../core/dom';
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
	'não é um jogo Steam',
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
	let element: Element | null = anchorText ? findElementByText(doc, anchorText) : null;
	if (!element) {
		for (const anchor of NOTICE_ANCHORS) {
			element = findElementByText(doc, anchor);
			if (element) break;
		}
	}
	if (!element) return null;
	const content = element.textContent || '';
	const regex = templateToRegex(template);
	const match = regex ? content.match(regex) : null;
	if (match?.[1]?.trim()) return { element, title: stripSurroundingQuotes(match[1].trim()) };
	for (const pattern of KNOWN_NOTICE_PATTERNS) {
		const fallbackMatch = content.match(pattern);
		if (fallbackMatch?.[1]?.trim()) {
			return { element, title: stripSurroundingQuotes(fallbackMatch[1].trim()) };
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
