import { gdlText, steamIntlLocale } from '../../steam/localization';

export function formatPlaytimeMinutes(minutes: number): string {
	if (!Number.isFinite(minutes) || minutes <= 0) return gdlText('playtime_less_than_minute', '< 1 min');
	if (minutes < 60) return gdlText('playtime_minutes', '{count} min', { count: Math.max(1, Math.round(minutes)) });
	const hours = (minutes / 60).toFixed(1).replace(/\.0$/, '');
	return gdlText('playtime_hours', '{count} h', { count: hours });
}

export function formatLastPlayedDate(timestampSeconds: number): string {
	if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return '';
	const date = new Date(timestampSeconds * 1000);
	const now = new Date();

	const isToday = date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();
	if (isToday) return gdlText('last_played_today', 'Today');

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const isYesterday = date.getFullYear() === yesterday.getFullYear()
		&& date.getMonth() === yesterday.getMonth()
		&& date.getDate() === yesterday.getDate();
	if (isYesterday) return gdlText('last_played_yesterday', 'Yesterday');

	const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
	if (diffDays >= 2 && diffDays <= 6) {
		return gdlText('last_played_days_ago', '{count} days ago', { count: diffDays });
	}

	try {
		const formatter = new Intl.DateTimeFormat(steamIntlLocale(), {
			day: 'numeric',
			month: 'short',
			year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
		});
		return formatter.format(date);
	} catch {
		return date.toLocaleDateString();
	}
}
