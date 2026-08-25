import type { LocalAchievementData } from '../../domain/types';
import { steamIntlLocale } from '../../steam/localization';

export function localAchievementPercent(data: LocalAchievementData): number {
	return data.total > 0 ? Math.round((data.unlocked * 100) / data.total) : 0;
}

/** Stable development-only simulated progress. Production keeps simulation disabled. */
export function deterministicTestUnlockCount(appid: string, total: number): number {
	if (!Number.isFinite(total) || total <= 0) return 0;
	if (total === 1) return 1;
	if (total === 52) return 11;
	const appidNum = Number(appid) || 0;
	const pctTarget = 0.20 + (((appidNum * 17) % 6) * 0.01);
	return Math.max(1, Math.min(total - 1, Math.floor(total * pctTarget)));
}

export function formatLocalUnlockDate(timestampSeconds: number): string {
	if (!timestampSeconds) return '';
	try {
		return new Date(timestampSeconds * 1000).toLocaleString(steamIntlLocale(), {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	} catch {
		return new Date(timestampSeconds * 1000).toLocaleString('en-US');
	}
}
