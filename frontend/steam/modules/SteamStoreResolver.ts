import { getSteamStore, getAppStore } from './SteamModuleResolver';

class SteamStoreResolver {
	public getAppStore(): any | null {
		return getAppStore();
	}

	public getFriendStore(): any | null {
		return getSteamStore('friendStore') || getSteamStore('FriendStore') || getSteamStore('friendsStore');
	}

	public getAchievementStore(): any | null {
		return getSteamStore('achievementStore') || getSteamStore('AchievementStore');
	}

	public getCommunityStore(): any | null {
		return getSteamStore('communityStore') || getSteamStore('CommunityStore');
	}
}

export const steamStores = new SteamStoreResolver();
