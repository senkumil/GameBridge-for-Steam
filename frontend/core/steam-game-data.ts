import type { SteamGameData } from '../domain/types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function steamValues(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null || value === '') return [];
	if (isRecord(value)) {
		const keys = Object.keys(value);
		if (keys.some(key => /^\d+$/.test(key))) {
			return keys.sort((left, right) => Number(left) - Number(right)).map(key => value[key]);
		}
		return [value];
	}
	return [value];
}

function steamString(value: unknown): string {
	if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
	if (!isRecord(value)) return '';
	for (const key of ['name', 'description', 'display_name', 'developer', 'publisher', 'title', 'value']) {
		const candidate = value[key];
		if (typeof candidate === 'string' || typeof candidate === 'number') {
			const text = String(candidate).trim();
			if (text) return text;
		}
	}
	return '';
}

/** Steam has several historical AppDetails schemas. Retired records can expose
 * string lists as one string or as a numeric-keyed object instead of JSON arrays. */
export function steamStringList(value: unknown): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of steamValues(value)) {
		const text = steamString(item);
		if (!text || seen.has(text)) continue;
		seen.add(text);
		result.push(text);
	}
	return result;
}

function steamNumber(value: unknown, fallback = 0): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function steamBoolean(value: unknown): boolean {
	if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
	return Boolean(value);
}

function normalizeDescriptions(value: unknown): { id: string; description: string }[] {
	return steamValues(value).map((item, index) => {
		if (isRecord(item)) {
			return {
				id: steamString(item.id ?? item.genre_id ?? index),
				description: steamString(item.description ?? item.name ?? item.value),
			};
		}
		const text = steamString(item);
		return { id: /^\d+$/.test(text) ? text : String(index), description: /^\d+$/.test(text) ? '' : text };
	}).filter(item => Boolean(item.id || item.description));
}

function normalizeCategories(value: unknown): { id: number; description: string }[] {
	return steamValues(value).map(item => {
		if (isRecord(item)) {
			return {
				id: steamNumber(item.id ?? item.category_id, Number.NaN),
				description: steamString(item.description ?? item.name ?? item.value),
			};
		}
		return { id: steamNumber(item, Number.NaN), description: '' };
	}).filter(item => Number.isFinite(item.id));
}

function normalizeScreenshots(value: unknown): { id: number; path_thumbnail: string; path_full: string }[] {
	return steamValues(value).map((item, index) => {
		if (!isRecord(item)) return null;
		const thumbnail = steamString(item.path_thumbnail ?? item.thumbnail ?? item.path_full ?? item.url);
		const full = steamString(item.path_full ?? item.full ?? item.url ?? item.path_thumbnail);
		if (!thumbnail && !full) return null;
		return { id: steamNumber(item.id, index), path_thumbnail: thumbnail || full, path_full: full || thumbnail };
	}).filter((item): item is { id: number; path_thumbnail: string; path_full: string } => Boolean(item));
}

function normalizeMovies(value: unknown): { id: number; name: string; thumbnail: string }[] {
	return steamValues(value).map((item, index) => {
		if (!isRecord(item)) return null;
		const thumbnail = steamString(item.thumbnail ?? item.url);
		if (!thumbnail) return null;
		return { id: steamNumber(item.id, index), name: steamString(item.name), thumbnail };
	}).filter((item): item is { id: number; name: string; thumbnail: string } => Boolean(item));
}

function normalizeDlc(value: unknown): number[] {
	const raw = typeof value === 'string' ? (value.match(/\d+/g) || []) : steamValues(value);
	return Array.from(new Set(raw.map(item => steamNumber(item, Number.NaN)).filter(Number.isFinite)));
}

function normalizeAchievements(value: unknown): SteamGameData['achievements'] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (!isRecord(value)) return { total: Math.max(0, steamNumber(value)) };
	const highlighted = steamValues(value.highlighted).map(item => {
		if (!isRecord(item)) return null;
		const name = steamString(item.name ?? item.display_name);
		const path = steamString(item.path ?? item.icon);
		return name || path ? { name, path } : null;
	}).filter((item): item is { name: string; path: string } => Boolean(item));
	return {
		total: Math.max(0, steamNumber(value.total)),
		highlighted: highlighted.length ? highlighted : undefined,
	};
}

/** Normalize Store/App Hub metadata before any cache or renderer can consume it.
 * This also repairs snapshots written by older plugin builds when they are read. */
export function normalizeSteamGameData(value: unknown): SteamGameData | null {
	if (!isRecord(value)) return null;
	const steamAppId = steamNumber(value.steam_appid, Number.NaN);
	const name = steamString(value.name);
	if (!Number.isFinite(steamAppId) && !name) return null;
	const release = value.release_date;
	const releaseDate = isRecord(release)
		? { coming_soon: steamBoolean(release.coming_soon), date: steamString(release.date) }
		: (steamString(release) ? { coming_soon: false, date: steamString(release) } : undefined);
	const platforms = isRecord(value.platforms) ? {
		windows: steamBoolean(value.platforms.windows),
		mac: steamBoolean(value.platforms.mac),
		linux: steamBoolean(value.platforms.linux),
	} : undefined;

	return {
		...value,
		type: steamString(value.type) || undefined,
		name: name || `Steam App ${Number.isFinite(steamAppId) ? steamAppId : ''}`.trim(),
		steam_appid: Number.isFinite(steamAppId) ? steamAppId : 0,
		header_image: steamString(value.header_image),
		short_description: steamString(value.short_description),
		detailed_description: steamString(value.detailed_description) || undefined,
		about_the_game: steamString(value.about_the_game) || undefined,
		developers: steamStringList(value.developers),
		publishers: steamStringList(value.publishers),
		franchises: steamStringList(value.franchises),
		genres: normalizeDescriptions(value.genres),
		categories: normalizeCategories(value.categories),
		dlc: normalizeDlc(value.dlc),
		screenshots: normalizeScreenshots(value.screenshots),
		movies: normalizeMovies(value.movies),
		release_date: releaseDate,
		achievements: normalizeAchievements(value.achievements),
		background: steamString(value.background) || undefined,
		background_raw: steamString(value.background_raw) || undefined,
		capsule_image: steamString(value.capsule_image) || undefined,
		capsule_imagev5: steamString(value.capsule_imagev5) || undefined,
		website: steamString(value.website) || undefined,
		controller_support: steamString(value.controller_support) || undefined,
		platforms,
		is_delisted: steamBoolean(value.is_delisted),
	} as SteamGameData;
}
