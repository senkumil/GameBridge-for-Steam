import { getSteamStore } from '../../modules/SteamModuleResolver';

export class LibraryStoreAdapter {
	public static getStore(): any | null {
		return getSteamStore('libraryStore') || getSteamStore('LibraryStore');
	}
}
