import { backendLog } from '../../api/backend';

class SteamRouterResolver {
	public navigateToApp(appId: number | string, tab?: string): boolean {
		const win = typeof window !== 'undefined' ? (window as any) : null;
		if (!win) return false;

		backendLog(`[NGL][Router] Navigating to app ${appId}${tab ? ` (tab: ${tab})` : ''}`);

		try {
			if (typeof win.SteamClient?.URL?.OpenURL === 'function') {
				const url = `steam://nav/games/details/${appId}${tab ? `/${tab}` : ''}`;
				win.SteamClient.URL.OpenURL(url);
				return true;
			}
		} catch {}

		try {
			if (win.location) {
				win.location.hash = `#/appdetails/${appId}${tab ? `/${tab}` : ''}`;
				return true;
			}
		} catch {}

		return false;
	}

	public openInSystemBrowser(url: string): void {
		const win = typeof window !== 'undefined' ? (window as any) : null;
		if (!win || !url) return;

		try {
			if (typeof win.SteamClient?.System?.OpenInSystemBrowser === 'function') {
				win.SteamClient.System.OpenInSystemBrowser(url);
				return;
			}
		} catch {}

		try {
			win.open(url, '_blank');
		} catch {}
	}
}

export const steamRouter = new SteamRouterResolver();
