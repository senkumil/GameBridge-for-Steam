import { fetchLocalAchievementsBackend } from '../../api/backend';
import type { LocalAchievementData } from '../../domain/types';
import { steamLanguageSync } from '../../steam/localization';

export interface LocalAchievementRequestOptions {
	stateAppId?: string | number | null;
	allowSimulated?: boolean;
}

export function localAchievementRequestJson(
	steamAppId: string | number,
	options: LocalAchievementRequestOptions = {},
): string {
	return JSON.stringify({
		steam_app_id: String(steamAppId),
		language: steamLanguageSync() || 'spanish',
		state_app_id: options.stateAppId == null ? '' : String(options.stateAppId),
		allow_simulated: options.allowSimulated ?? true,
	});
}

export async function fetchLocalAchievementData(
	steamAppId: string | number,
	options: LocalAchievementRequestOptions = {},
): Promise<LocalAchievementData | null> {
	try {
		const raw = await fetchLocalAchievementsBackend({
			request_json: localAchievementRequestJson(steamAppId, options),
		});
		const value = JSON.parse(raw) as LocalAchievementData;
		return value && typeof value === 'object' ? value : null;
	} catch {
		return null;
	}
}
