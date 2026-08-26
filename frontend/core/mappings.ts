import type { Mappings } from '../domain/types';
import { getAllMappings, saveMappingBackend, removeMappingBackend, updateMappingsBackend, backendLog, backendResultStatus, parseMappingsResponse } from '../api/backend';
import { normalizeTitle } from './text';

export const MAPPINGS_CACHE_STORAGE_KEY = 'gdl_mappings_snapshot_v1';

export function readCachedMappings(): Mappings {
	try {
		const raw = localStorage.getItem(MAPPINGS_CACHE_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const clean: Mappings = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === 'string' && /^\d+$/.test(value)) clean[String(key)] = value;
		}
		return clean;
	} catch { return {}; }
}

export function persistMappingsSnapshot(value: Mappings): void {
	try { localStorage.setItem(MAPPINGS_CACHE_STORAGE_KEY, JSON.stringify(value)); } catch {}
}

export let mappings: Mappings = readCachedMappings();

export async function loadMappings(): Promise<void> {
	try {
		const json = await getAllMappings();
		const parsed = parseMappingsResponse(json);
		if (!parsed) throw new Error('invalid_mappings_response');
		mappings = parsed;
		persistMappingsSnapshot(mappings);
		backendLog('Loaded mappings: ' + JSON.stringify(mappings));
	} catch (e) {
		backendLog('Failed to load mappings: ' + e);
		// Retain the last backend-verified snapshot. Clearing it here causes all
		// linked pages to disappear temporarily when the backend starts slowly.
	}
}


export interface MappingMutation {
	set?: Record<string, string>;
	remove?: string[];
}

interface MappingMutationResponse {
	ok?: boolean;
	error?: string;
	data?: Mappings;
}

function parseMappingMutationResponse(raw: unknown): MappingMutationResponse | null {
	try {
		let value: unknown = raw;
		for (let attempt = 0; attempt < 3 && typeof value === 'string'; attempt++) {
			const text = value.trim();
			if (!text) return null;
			value = JSON.parse(text);
		}
		return value && typeof value === 'object' ? value as MappingMutationResponse : null;
	} catch { return null; }
}

/** Apply mapping aliases/removals in one backend file transaction. */
export async function updateMappingsChecked(mutation: MappingMutation): Promise<boolean> {
	const set: Record<string, string> = {};
	for (const [key, value] of Object.entries(mutation.set || {})) {
		if (key && /^\d+$/.test(String(value))) set[key] = String(value);
	}
	const remove = Array.from(new Set((mutation.remove || []).filter(Boolean)));
	if (Object.keys(set).length === 0 && remove.length === 0) return true;

	try {
		const raw = await updateMappingsBackend({ request_json: JSON.stringify({ set, remove }) });
		const response = parseMappingMutationResponse(raw);
		if (response?.ok) {
			if (response.data && typeof response.data === 'object') mappings = response.data;
			else {
				for (const [key, value] of Object.entries(set)) mappings[key] = value;
				for (const key of remove) delete mappings[key];
			}
			persistMappingsSnapshot(mappings);
			return true;
		}
	} catch (error) {
		backendLog('Batch mapping update failed: ' + error);
	}

	// Verify source-of-truth state before reporting a failure.
	try {
		const current = parseMappingsResponse(await getAllMappings());
		if (!current) return false;
		const setMatches = Object.entries(set).every(([key, value]) => current[key] === value);
		const removalsMatch = remove.every(key => !Object.prototype.hasOwnProperty.call(current, key));
		if (!setMatches || !removalsMatch) return false;
		mappings = current;
		persistMappingsSnapshot(mappings);
		return true;
	} catch { return false; }
}

export async function saveMappingChecked(key: string, value: string): Promise<boolean> {
	// New source prefers the transactional endpoint. Keep legacy callables as a
	// compatibility fallback for users who update the frontend before backend.
	if (await updateMappingsChecked({ set: { [key]: value } })) return true;
	try {
		const result = await saveMappingBackend({ non_steam_id: key, steam_id: value });
		if (backendResultStatus(result) !== 'ok') return false;
		mappings[key] = value;
		persistMappingsSnapshot(mappings);
		return true;
	} catch { return false; }
}

export async function removeMappingChecked(key: string): Promise<boolean> {
	if (await updateMappingsChecked({ remove: [key] })) return true;
	try {
		const result = await removeMappingBackend({ non_steam_id: key });
		if (backendResultStatus(result) !== 'ok') return false;
		delete mappings[key];
		persistMappingsSnapshot(mappings);
		return true;
	} catch { return false; }
}

export function shortcutMappingKey(shortcutAppId: string | number): string {
	return 'shortcut:' + String(shortcutAppId);
}

export function exeMappingKey(exePath: string): string {
	const cleaned = (exePath || '').trim().toLowerCase().replace(/\\/g, '/');
	return 'exe:' + cleaned;
}

export function exeStemMappingKey(exePath: string): string | null {
	const cleaned = (exePath || '').trim().toLowerCase().replace(/\\/g, '/');
	const filename = cleaned.split('/').pop() || '';
	const stem = filename.replace(/\.(exe|com|bat|cmd|appimage)$/i, '').trim();
	if (!stem || stem.length < 2) return null;
	const generic = new Set([
		'game', 'start', 'launcher', 'launch', 'shipping', 'win64-shipping', 'win32-shipping',
		'bootstrapper', 'play', 'playnite', 'heroic', 'epicgameslauncher', 'steam', 'retroarch',
	]);
	if (generic.has(stem)) return null;
	return 'exe_stem:' + stem;
}

export function findMappingByExe(exePath: string): string | null {
	if (!exePath) return null;
	const fullKey = exeMappingKey(exePath);
	if (mappings[fullKey] && /^\d+$/.test(String(mappings[fullKey]))) {
		return String(mappings[fullKey]);
	}
	const stemKey = exeStemMappingKey(exePath);
	if (stemKey && mappings[stemKey] && /^\d+$/.test(String(mappings[stemKey]))) {
		return String(mappings[stemKey]);
	}
	const lower = exePath.trim().toLowerCase();
	const normalizedLower = lower.replace(/\\/g, '/');
	for (const [k, v] of Object.entries(mappings)) {
		if (k.startsWith('exe:') && /^\d+$/.test(String(v))) {
			const target = k.replace('exe:', '').toLowerCase();
			if (target === lower || target === normalizedLower) {
				return String(v);
			}
		}
	}
	return null;
}

export function findMappingForTitle(title: string, shortcutAppId?: string | number | null): string | null {
	if (shortcutAppId) {
		const stable = mappings[shortcutMappingKey(shortcutAppId)];
		if (stable && /^\d+$/.test(String(stable))) return String(stable);
	}
	if (!title) return null;
	const trimmedTitle = String(title).trim();
	if (mappings[trimmedTitle] && /^\d+$/.test(String(mappings[trimmedTitle]))) {
		return String(mappings[trimmedTitle]);
	}
	const normKey = normalizeTitle(trimmedTitle);
	if (normKey && mappings[normKey] && /^\d+$/.test(String(mappings[normKey]))) {
		return String(mappings[normKey]);
	}
	const lower = trimmedTitle.toLowerCase();
	for (const [k, v] of Object.entries(mappings)) {
		if (k.startsWith('shortcut:') || k.startsWith('exe:') || k.startsWith('exe_stem:') || !/^\d+$/.test(String(v))) continue;
		if (k.toLowerCase() === lower || normalizeTitle(k) === normKey) {
			return String(v);
		}
	}
	return null;
}
