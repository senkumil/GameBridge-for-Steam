import { getSteamStore } from '../../modules/SteamModuleResolver';

export class UserStoreAdapter {
	public static getStore(): any | null {
		return getSteamStore('userStore') || getSteamStore('UserStore');
	}

	public static getPersonaName(): string {
		const store = this.getStore();
		return String(store?.m_strPersonaName || store?.personaName || '');
	}
}
