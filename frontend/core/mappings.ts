import type { Mappings } from '../domain/types';
import { getAllMappings, saveMappingBackend, removeMappingBackend, updateMappingsBackend, backendLog, backendResultStatus, parseMappingsResponse } from '../api/backend';
import { normalizeTitle } from './text';

export const MAPPINGS_CACHE_STORAGE_KEY = 'gdl_mappings_snapshot_v1';
const MAPPINGS_CHANGED_EVENT = 'gdl:mappings-changed';

function notifyMappingsChanged(): void {
	try { window.dispatchEvent(new CustomEvent<Mappings>(MAPPINGS_CHANGED_EVENT, { detail: { ...mappings } })); } catch {}
}

export function subscribeMappings(listener: (value: Mappings) => void): () => void {
	const handler = (event: Event): void => {
		const detail = (event as CustomEvent<Mappings>).detail;
		listener(detail && typeof detail === 'object' ? detail : mappings);
	};
	window.addEventListener(MAPPINGS_CHANGED_EVENT, handler);
	return () => window.removeEventListener(MAPPINGS_CHANGED_EVENT, handler);
}

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

const wait = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
let mappingLoadInFlight: Promise<void> | null = null;
let mappingOperationTail: Promise<void> = Promise.resolve();

/** Backend mutations return a complete mapping snapshot. Serializing them is
 * essential: otherwise a slower, older bulk-link response can overwrite a
 * newer snapshot in memory and make successful links appear to disappear. */
function enqueueMappingOperation<T>(operation: () => Promise<T>): Promise<T> {
	const request = mappingOperationTail.then(operation, operation);
	mappingOperationTail = request.then((): void => {}, (): void => {});
	return request;
}

function cleanMappings(value: Record<string, string>): Mappings {
	const clean: Mappings = {};
	for (const [key, appId] of Object.entries(value)) {
		if (key && typeof appId === 'string' && /^\d+$/.test(appId)) clean[key] = appId;
	}
	return clean;
}

async function hydrateMappings(): Promise<void> {
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 7; attempt += 1) {
		try {
			const parsed = parseMappingsResponse(await getAllMappings());
			if (!parsed) throw new Error('invalid_mappings_response');
			const backendMappings = cleanMappings(parsed);
			const cachedMappings = { ...mappings };
			const backendCount = Object.keys(backendMappings).length;
			const cachedCount = Object.keys(cachedMappings).length;
			if (backendCount === 0 && cachedCount > 0) {
				// A backend that is still activating (or a missing/corrupt primary
				// file) must never erase a verified browser snapshot. Repair the
				// source of truth transactionally from that snapshot.
				const repairRaw = await updateMappingsBackend({ request_json: JSON.stringify({ set: cachedMappings, remove: [] }) });
				const repair = parseMappingMutationResponse(repairRaw);
				if (!repair?.ok) throw new Error(repair?.error || 'empty_mapping_repair_failed');
				mappings = cleanMappings(repair.data || cachedMappings);
				backendLog('Recovered ' + Object.keys(mappings).length + ' mapping(s) from the persistent snapshot.');
			} else {
				mappings = backendMappings;
			}
			persistMappingsSnapshot(mappings);
			notifyMappingsChanged();
			backendLog('Loaded mapping snapshot (' + Object.keys(mappings).length + ' entries).');
			return;
		} catch (error) {
			lastError = error;
			if (attempt < 6) await wait(Math.min(250 * (2 ** attempt), 2500));
		}
	}
	backendLog('Failed to load mappings after startup retries: ' + lastError);
	// Retain the last verified snapshot. Clearing it here makes every linked
	// page look unlinked whenever the backend takes longer to reactivate.
}

export function loadMappings(): Promise<void> {
	if (mappingLoadInFlight) return mappingLoadInFlight;
	mappingLoadInFlight = enqueueMappingOperation(hydrateMappings).finally(() => { mappingLoadInFlight = null; });
	return mappingLoadInFlight;
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
async function updateMappingsCheckedUnlocked(mutation: MappingMutation): Promise<boolean> {
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
			notifyMappingsChanged();
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
		notifyMappingsChanged();
		return true;
	} catch { return false; }
}

export function updateMappingsChecked(mutation: MappingMutation): Promise<boolean> {
	return enqueueMappingOperation(() => updateMappingsCheckedUnlocked(mutation));
}

export function saveMappingChecked(key: string, value: string): Promise<boolean> {
	return enqueueMappingOperation(async () => {
	// New source prefers the transactional endpoint. Keep legacy callables as a
	// compatibility fallback for users who update the frontend before backend.
	if (await updateMappingsCheckedUnlocked({ set: { [key]: value } })) return true;
	try {
		const result = await saveMappingBackend({ non_steam_id: key, steam_id: value });
		if (backendResultStatus(result) !== 'ok') return false;
		mappings[key] = value;
		persistMappingsSnapshot(mappings);
		notifyMappingsChanged();
		return true;
	} catch { return false; }
	});
}

export function removeMappingChecked(key: string): Promise<boolean> {
	return enqueueMappingOperation(async () => {
	if (await updateMappingsCheckedUnlocked({ remove: [key] })) return true;
	try {
		const result = await removeMappingBackend({ non_steam_id: key });
		if (backendResultStatus(result) !== 'ok') return false;
		delete mappings[key];
		persistMappingsSnapshot(mappings);
		notifyMappingsChanged();
		return true;
	} catch { return false; }
	});
}

export function shortcutMappingKey(shortcutAppId: string | number): string {
	return 'shortcut:' + String(shortcutAppId);
}

export function launchIdentityMappingKey(identity: string): string {
	const normalized = String(identity || '').trim().toLowerCase();
	return normalized ? 'launch_identity:' + normalized : '';
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

export interface ShortcutMappingIdentity {
	shortcutAppId: string | number;
	title?: string | null;
	exePath?: string | null;
	steamAppId?: string | null;
}

/**
 * Remove every mapping alias owned by one shortcut without deleting aliases
 * that may still be shared by another shortcut linked to the same Steam app.
 * This is the inverse of the aliases written by linkShortcutToSteam().
 */
export async function removeShortcutMappingsChecked(identity: ShortcutMappingIdentity): Promise<boolean> {
	const exactKey = shortcutMappingKey(identity.shortcutAppId);
	const target = String(identity.steamAppId || mappings[exactKey] || '').trim();
	const candidates = new Set<string>([exactKey]);
	const title = String(identity.title || '').trim();
	if (title) {
		candidates.add(title);
		const normalized = normalizeTitle(title);
		if (normalized) candidates.add(normalized);
	}
	const exePath = String(identity.exePath || '').trim();
	if (exePath) {
		candidates.add(exeMappingKey(exePath));
		const stem = exeStemMappingKey(exePath);
		if (stem) candidates.add(stem);
	}

	if (/^\d+$/.test(target)) {
		const otherExactOwner = Object.entries(mappings).some(([key, value]) =>
			key.startsWith('shortcut:') && key !== exactKey && String(value) === target);
		if (!otherExactOwner) {
			// With a single exact owner, every non-shortcut alias for this AppID was
			// created for the same logical link. Removing them also cleans aliases
			// left by an earlier language/name or executable migration.
			for (const [key, value] of Object.entries(mappings)) {
				if (!key.startsWith('shortcut:') && String(value) === target) candidates.add(key);
			}
		}
	}

	const remove = Array.from(candidates).filter(key => {
		if (!Object.prototype.hasOwnProperty.call(mappings, key)) return false;
		return !/^\d+$/.test(target) || String(mappings[key]) === target || key === exactKey;
	});
	return updateMappingsChecked({ remove });
}

/** Resolve only a full executable-path alias. This is safe enough for identity
 * recovery when Steam regenerates a Shortcut AppID. Executable stems are not
 * identity: unrelated games can legitimately ship the same filename. */
export function findMappingByExactExe(exePath: string): string | null {
	if (!exePath) return null;
	const fullKey = exeMappingKey(exePath);
	if (mappings[fullKey] && /^\d+$/.test(String(mappings[fullKey]))) {
		return String(mappings[fullKey]);
	}
	const lower = exePath.trim().toLowerCase();
	const normalizedLower = lower.replace(/\\/g, '/');
	for (const [k, v] of Object.entries(mappings)) {
		if (k.startsWith('exe:') && /^\d+$/.test(String(v))) {
			const target = k.replace('exe:', '').toLowerCase();
			if (target === lower || target === normalizedLower) return String(v);
		}
	}
	return null;
}

/** Legacy loose executable resolver used only where no concrete shortcut
 * identity is available. Prefer findMappingByExactExe for all link decisions. */
export function findMappingByExe(exePath: string): string | null {
	const exact = findMappingByExactExe(exePath);
	if (exact) return exact;
	const stemKey = exeStemMappingKey(exePath);
	if (stemKey && mappings[stemKey] && /^\d+$/.test(String(mappings[stemKey]))) {
		return String(mappings[stemKey]);
	}
	return null;
}

export function findMappingForTitle(title: string, shortcutAppId?: string | number | null): string | null {
	if (shortcutAppId) {
		const stable = mappings[shortcutMappingKey(shortcutAppId)];
		return stable && /^\d+$/.test(String(stable)) ? String(stable) : null;
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

export function findShortcutIdForMappedSteamAppId(steamAppId: string | number): number | null {
	const target = String(steamAppId);
	for (const [key, mappedAppId] of Object.entries(mappings)) {
		if (mappedAppId === target && key.startsWith('shortcut:')) {
			const rawId = Number(key.replace('shortcut:', ''));
			if (Number.isFinite(rawId) && rawId >= 2147483648) return rawId;
		}
	}
	return null;
}
