import { getSteamStore } from '../../modules/SteamModuleResolver';

export class NavigationStoreAdapter {
	public static getStore(): any | null {
		return getSteamStore('navigationStore') || getSteamStore('NavigationStore');
	}

	public static navigateTo(path: string): boolean {
		const store = this.getStore();
		if (store && typeof store.NavigateTo === 'function') {
			try {
				store.NavigateTo(path);
				return true;
			} catch {}
		}
		return false;
	}
}
