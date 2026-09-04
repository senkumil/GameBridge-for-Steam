import { getAppStore } from '../../modules/SteamModuleResolver';

export class AppStoreAdapter {
	public static getStore(): any | null {
		return getAppStore();
	}

	public static getAppOverview(appid: number): any | null {
		const store = this.getStore();
		if (!store) return null;
		if (typeof store.GetAppOverviewByAppID === 'function') {
			return store.GetAppOverviewByAppID(appid);
		}
		if (typeof store.m_mapApps?.get === 'function') {
			return store.m_mapApps.get(appid);
		}
		return null;
	}
}
