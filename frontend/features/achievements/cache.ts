import type { LocalAchievementData } from '../../domain/types';

const localAchievementMemoryCache = new Map<string, LocalAchievementData>();
const MAX_LOCAL_ACHIEVEMENT_ALIASES = 64;
const LOCAL_ACHIEVEMENT_SNAPSHOT_STORAGE_KEY = 'gdl_local_achievement_snapshots_v1';
const MAX_PERSISTED_ACHIEVEMENT_SNAPSHOTS = 18;
const PERSISTED_ACHIEVEMENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface PersistedAchievementSnapshot {
	updatedAt: number;
	aliases: string[];
	signature: string;
	data: LocalAchievementData;
}

let persistedSnapshotsLoaded = false;
let persistedSnapshots: PersistedAchievementSnapshot[] = [];

/** Compact identity for both render deduplication and persistent-cache writes. */
export function localAchievementDataSignature(data: LocalAchievementData): string {
	const source = [
		data.appid, data.state_appid || '', data.unlocked, data.total,
		data.simulation_enabled ? 1 : 0, data.simulate_unlock_all ? 1 : 0,
		data.unlock_online ? 1 : 0, data.zero_progress ? 1 : 0,
		...data.achievements.map(item => [
			item.name, item.display_name, item.description, item.icon, item.icon_gray,
			item.earned ? 1 : 0, item.earned_time, item.progress, item.max_progress,
			item.is_online ? 1 : 0,
		].join(':')),
	].join('|');
	let hash = 2166136261;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return `${data.appid}:${data.state_appid || ''}:${data.unlocked}:${data.total}:${(hash >>> 0).toString(16)}`;
}

function validPersistentData(value: unknown): value is LocalAchievementData {
	const data = value as Partial<LocalAchievementData> | null;
	return Boolean(data && data.found && /^\d+$/.test(String(data.appid || ''))
		&& Number(data.total) > 0 && Array.isArray(data.achievements));
}

function loadPersistedSnapshots(): void {
	if (persistedSnapshotsLoaded) return;
	persistedSnapshotsLoaded = true;
	try {
		const raw = localStorage.getItem(LOCAL_ACHIEVEMENT_SNAPSHOT_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) as { version?: number; entries?: unknown[] } : null;
		if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return;
		const cutoff = Date.now() - PERSISTED_ACHIEVEMENT_MAX_AGE_MS;
		persistedSnapshots = parsed.entries.flatMap(rawEntry => {
			const entry = rawEntry as Partial<PersistedAchievementSnapshot>;
			if (!validPersistentData(entry.data) || Number(entry.updatedAt || 0) < cutoff) return [];
			return [{
				updatedAt: Number(entry.updatedAt),
				aliases: Array.from(new Set((Array.isArray(entry.aliases) ? entry.aliases : [])
					.map(String).filter(Boolean))),
				signature: String(entry.signature || localAchievementDataSignature(entry.data)),
				data: entry.data,
			}];
		}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PERSISTED_ACHIEVEMENT_SNAPSHOTS);
	} catch { persistedSnapshots = []; }
}

function persistSnapshots(): void {
	try {
		localStorage.setItem(LOCAL_ACHIEVEMENT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
			version: 1,
			entries: persistedSnapshots.slice(0, MAX_PERSISTED_ACHIEVEMENT_SNAPSHOTS),
		}));
	} catch {}
}

function memoryCache(data: LocalAchievementData, aliases: string[]): void {
	for (const alias of aliases) {
		localAchievementMemoryCache.delete(alias);
		localAchievementMemoryCache.set(alias, data);
	}
	trimLocalAchievementCache();
}

function trimLocalAchievementCache(): void {
	while (localAchievementMemoryCache.size > MAX_LOCAL_ACHIEVEMENT_ALIASES) {
		const oldest = localAchievementMemoryCache.keys().next().value as string | undefined;
		if (!oldest) break;
		localAchievementMemoryCache.delete(oldest);
	}
}

export function getCachedLocalAchievements(...keys: Array<string | null | undefined>): LocalAchievementData | null {
	for (const key of keys) {
		if (!key) continue;
		const value = localAchievementMemoryCache.get(key);
		if (value) {
			localAchievementMemoryCache.delete(key);
			localAchievementMemoryCache.set(key, value);
			return value;
		}
	}
	loadPersistedSnapshots();
	for (const key of keys.map(value => String(value || '')).filter(Boolean)) {
		const snapshot = persistedSnapshots.find(entry => entry.aliases.includes(key));
		if (!snapshot) continue;
		snapshot.updatedAt = Date.now();
		memoryCache(snapshot.data, snapshot.aliases);
		return snapshot.data;
	}
	return null;
}

export function hasCachedLocalAchievements(key: string): boolean {
	return Boolean(getCachedLocalAchievements(key));
}

export function cacheLocalAchievements(data: LocalAchievementData, ...aliases: Array<string | null | undefined>): void {
	if (!validPersistentData(data)) return;
	const allAliases = Array.from(new Set([data.appid, data.state_appid, ...aliases]
		.map(value => String(value || '')).filter(Boolean)));
	memoryCache(data, allAliases);
	loadPersistedSnapshots();
	const signature = localAchievementDataSignature(data);
	const identity = `${data.appid}|${data.state_appid || ''}`;
	const existingIndex = persistedSnapshots.findIndex(entry =>
		`${entry.data.appid}|${entry.data.state_appid || ''}` === identity);
	const existing = existingIndex >= 0 ? persistedSnapshots[existingIndex] : null;
	if (existing?.signature === signature
		&& allAliases.every(alias => existing.aliases.includes(alias))) return;
	const next: PersistedAchievementSnapshot = {
		updatedAt: Date.now(),
		aliases: Array.from(new Set([...(existing?.aliases || []), ...allAliases])),
		signature,
		data,
	};
	if (existingIndex >= 0) persistedSnapshots.splice(existingIndex, 1);
	persistedSnapshots.unshift(next);
	persistedSnapshots = persistedSnapshots.slice(0, MAX_PERSISTED_ACHIEVEMENT_SNAPSHOTS);
	persistSnapshots();
}

export function clearLocalAchievementCache(clearPersistent = true): void {
	localAchievementMemoryCache.clear();
	if (!clearPersistent) return;
	persistedSnapshotsLoaded = true;
	persistedSnapshots = [];
	try { localStorage.removeItem(LOCAL_ACHIEVEMENT_SNAPSHOT_STORAGE_KEY); } catch {}
}
