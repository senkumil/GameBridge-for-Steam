import { backendLog } from '../api/backend';

const installedDocuments = new WeakMap<Document, () => void>();

export function normalizeSteamNavigationUrl(raw: string): string | null {
	const value = String(raw || '').trim();
	if (!value) return null;
	try {
		const parsed = new URL(value);
		if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'steam:') return parsed.toString();
	} catch {
		if (/^steam:\/\//i.test(value)) return value;
	}
	return null;
}

/** Open a URL through Steam's own navigation surface whenever possible. */
export function openSteamNavigationUrl(doc: Document, raw: string): boolean {
	const url = normalizeSteamNavigationUrl(raw);
	if (!url) {
		backendLog('Blocked unsupported navigation URL: ' + String(raw || ''));
		return false;
	}
	try {
		const view = doc.defaultView as any;
		const steamClient = view?.SteamClient || (window as any).SteamClient;
		if (/^steam:\/\//i.test(url) && typeof steamClient?.URL?.ExecuteSteamURL === 'function') {
			steamClient.URL.ExecuteSteamURL(url);
			return true;
		}
		const manager = view?.MainWindowBrowserManager || (window as any).MainWindowBrowserManager;
		if (typeof manager?.ShowURL === 'function') {
			manager.ShowURL(url);
			return true;
		}
		if (typeof steamClient?.URL?.ExecuteSteamURL === 'function') {
			steamClient.URL.ExecuteSteamURL('steam://openurl/' + url);
			return true;
		}
		doc.defaultView?.open('steam://openurl/' + url);
		return true;
	} catch (error) {
		backendLog('Steam navigation failed: ' + String(error));
		return false;
	}
}

function handleDelegatedClick(doc: Document, event: MouseEvent): void {
	const target = event.target as Element | null;
	if (!target) return;

	const open = target.closest<HTMLElement>('[data-gdl-open-url]');
	if (open) {
		const url = open.dataset.gdlOpenUrl || '';
		if (url) {
			event.preventDefault();
			event.stopPropagation();
			openSteamNavigationUrl(doc, url);
		}
		return;
	}

	const toggle = target.closest<HTMLElement>('[data-gdl-toggle-target]');
	if (toggle) {
		const selector = toggle.dataset.gdlToggleTarget || '';
		if (!selector) return;
		const destination = doc.querySelector<HTMLElement>(selector);
		if (!destination) return;
		event.preventDefault();
		destination.style.display = '';
		if (toggle.dataset.gdlHideSelf === '1') toggle.style.display = 'none';
		return;
	}

	const scroll = target.closest<HTMLElement>('[data-gdl-scroll-target]');
	if (scroll) {
		const selector = scroll.dataset.gdlScrollTarget || '';
		const destination = selector ? doc.querySelector<HTMLElement>(selector) : null;
		if (!destination) return;
		event.preventDefault();
		try { destination.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
		catch { destination.scrollIntoView(); }
		return;
	}

	const swap = target.closest<HTMLElement>('[data-gdl-swap-main]');
	if (swap) {
		const mainId = swap.dataset.gdlSwapMain || '';
		const linkId = swap.dataset.gdlSwapLink || '';
		const src = swap.getAttribute('src') || '';
		const url = swap.dataset.gdlSwapUrl || '';
		const main = mainId ? doc.getElementById(mainId) as HTMLImageElement | null : null;
		const link = linkId ? doc.getElementById(linkId) as HTMLAnchorElement | null : null;
		if (!main) return;
		event.preventDefault();
		event.stopPropagation();
		const previousSrc = main.src;
		const previousUrl = link?.dataset.gdlOpenUrl || link?.href || '';
		main.src = src;
		if (link && url) {
			link.dataset.gdlOpenUrl = url;
			link.href = url;
		}
		if (swap instanceof HTMLImageElement) swap.src = previousSrc;
		if (previousUrl) swap.dataset.gdlSwapUrl = previousUrl;
	}
}

function handleDelegatedImageError(event: Event): void {
	const image = event.target as HTMLImageElement | null;
	if (!(image instanceof HTMLImageElement)) return;
	const fallback = image.dataset.gdlFallbackSrc;
	if (fallback && image.src !== fallback) {
		image.src = fallback;
		return;
	}
	if (image.dataset.gdlHideOnError === '1') image.style.display = 'none';
	if (image.dataset.gdlInvisibleOnError === '1') image.style.visibility = 'hidden';
}

/** Install one delegated behavior layer per Steam document. */
export function installSteamNavigation(doc: Document): () => void {
	const existing = installedDocuments.get(doc);
	if (existing) return existing;
	const click = (event: Event) => handleDelegatedClick(doc, event as MouseEvent);
	const error = (event: Event) => handleDelegatedImageError(event);
	doc.addEventListener('click', click, true);
	doc.addEventListener('error', error, true);
	const cleanup = (): void => {
		doc.removeEventListener('click', click, true);
		doc.removeEventListener('error', error, true);
		installedDocuments.delete(doc);
	};
	installedDocuments.set(doc, cleanup);
	return cleanup;
}

export function disposeSteamNavigation(doc: Document): void {
	installedDocuments.get(doc)?.();
}
