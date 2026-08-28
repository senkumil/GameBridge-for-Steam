import { gdlText } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName } from '../../steam/shortcuts';
import { findMappingForShortcut, isShortcutDismissed, normalizedShortcutAppId, requestManualShortcutLink } from '../shortcuts/runtime';

export interface NonSteamNoticeInfo { element: Element; title: string }

const manualLinkNoticeObservers = new WeakMap<Document, MutationObserver>();

function ensureManualLinkNoticeButtonStyles(doc: Document): void {
	if (doc.getElementById('gdl-manual-link-notice-styles')) return;
	const style = doc.createElement('style');
	style.id = 'gdl-manual-link-notice-styles';
	style.textContent = `
		#gdl-manual-link-notice-button { margin-top:14px;display:inline-flex;align-items:center;justify-content:center;min-width:120px;height:34px;padding:0 18px;border:1px solid rgba(255,255,255,.12);border-radius:2px;background:linear-gradient(90deg,#1a9fff 0%,#1578ff 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.15);color:#fff;font-size:15px;font-weight:500;cursor:pointer;text-decoration:none; }
		#gdl-manual-link-notice-button:hover { filter:brightness(1.06); }
		#gdl-manual-link-notice-button:active { filter:brightness(.97); }
		#gdl-manual-link-notice-button-row { display:flex;align-items:center;justify-content:flex-start; }
	`;
	(doc.head || doc.documentElement).appendChild(style);
}

function disconnectManualLinkNoticeObserver(doc: Document): void {
	manualLinkNoticeObservers.get(doc)?.disconnect();
	manualLinkNoticeObservers.delete(doc);
}

export function removeManualLinkNoticeButton(doc: Document): void {
	doc.getElementById('gdl-manual-link-notice-button-row')?.remove();
	disconnectManualLinkNoticeObserver(doc);
}

function mountManualLinkNoticeButton(doc: Document, noticeElement: Element, shortcutAppId: string, gameTitle: string): boolean {
	const host = (noticeElement.closest('div') || noticeElement.parentElement) as HTMLElement | null;
	if (!host) return false;
	let row = doc.getElementById('gdl-manual-link-notice-button-row') as HTMLElement | null;
	if (!row) {
		row = doc.createElement('div');
		row.id = 'gdl-manual-link-notice-button-row';
		const button = doc.createElement('button');
		button.id = 'gdl-manual-link-notice-button';
		button.type = 'button';
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			const id = Number(button.dataset.shortcutAppId || '0');
			if (id > 0) requestManualShortcutLink(id);
		});
		row.appendChild(button);
	}
	const button = row.querySelector('button') as HTMLButtonElement | null;
	if (!button) return false;
	button.dataset.shortcutAppId = shortcutAppId;
	button.setAttribute('aria-label', `${gdlText('link_button', 'Link')} ${gameTitle}`);
	button.textContent = gdlText('link_button', 'Link');
	if (row.parentElement !== host) host.appendChild(row);
	return true;
}

export function ensureManualLinkNoticeButton(
	doc: Document,
	noticeElement: Element,
	shortcutAppId: string,
	gameTitle: string,
	findNotice: () => NonSteamNoticeInfo | null,
): void {
	ensureManualLinkNoticeButtonStyles(doc);
	if (!mountManualLinkNoticeButton(doc, noticeElement, shortcutAppId, gameTitle)) return;
	const host = (noticeElement.closest('div') || noticeElement.parentElement) as HTMLElement | null;
	if (!host) return;
	disconnectManualLinkNoticeObserver(doc);
	const Observer = doc.defaultView?.MutationObserver;
	if (typeof Observer !== 'function') return;
	const observer = new Observer(() => {
		const current = findNotice();
		if (!current) { removeManualLinkNoticeButton(doc); return; }
		const title = current.title || gameTitle;
		const shortcutByName = findShortcutAppIdByName(title);
		const routedShortcutAppId = findActiveShortcutAppId(doc, '');
		const titleMatchedShortcutAppId = findActiveShortcutAppId(doc, title);
		const activeShortcutAppId = titleMatchedShortcutAppId || routedShortcutAppId || (shortcutByName ? String(shortcutByName) : null);
		const normalizedActiveShortcutId = normalizedShortcutAppId(activeShortcutAppId);
		const dismissed = Boolean(normalizedActiveShortcutId && isShortcutDismissed(normalizedActiveShortcutId));
		const activeMapping = dismissed ? null : findMappingForShortcut(activeShortcutAppId, title);
		if (activeMapping) { removeManualLinkNoticeButton(doc); return; }
		if (activeShortcutAppId) mountManualLinkNoticeButton(doc, current.element, String(activeShortcutAppId), title);
	});
	observer.observe(host, { childList: true, subtree: true });
	manualLinkNoticeObservers.set(doc, observer);
}
