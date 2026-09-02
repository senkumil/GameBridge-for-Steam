import { loc, gdlText, steamLanguageSync } from '../localization';

class SteamLocalizationResolver {
	public localize(token: string, fallback: string): string {
		return loc(token, fallback);
	}

	public text(key: string, fallback: string, params?: Record<string, string | number>): string {
		return gdlText(key, fallback, params);
	}

	public getCurrentLanguage(): string {
		return steamLanguageSync() || 'english';
	}
}

export const steamLocalization = new SteamLocalizationResolver();
