import { getMappedShortcuts, getShortcutAppById, getShortcutPlaytimeMinutes } from '../../steam/shortcuts';
import { fetchPlaytimeStatsBatch, type PlaytimeStats } from './service';
import { formatPlaytimeMinutes } from './format';
import {
	patchDesktopLibraryHomePlaytimeCards,
	type DesktopPlaytimeDomSnapshot,
} from './library-home-dom';

type DesktopPlaytimeKey =
	| 'minutes_playtime_forever'
	| 'minutes_playtime_last_two_weeks'
	| 'rt_last_time_played'
	| 'rt_recent_activity_time';

interface DesktopPlaytimeRefreshResult {
	changed: boolean;
	shortcutAppId: number;
	title: string;
	minutesForever: number;
	minutesRecent: number;
	lastPlayedAt: number;
}

const DESKTOP_PLAYTIME_SNAPSHOT_STORAGE_KEY = 'gdl_desktop_playtime_snapshots_v1';
const MAX_DESKTOP_PLAYTIME_SNAPSHOTS = 96;
const desktopPlaytimeRefreshes = new Map<number, Promise<DesktopPlaytimeRefreshResult>>();

function readDesktopPlaytimeSnapshots(): Map<number, DesktopPlaytimeDomSnapshot> {
	const snapshots = new Map<number, DesktopPlaytimeDomSnapshot>();
	try {
		const raw = localStorage.getItem(DESKTOP_PLAYTIME_SNAPSHOT_STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) as { version?: number; values?: unknown[] } : null;
		if (parsed?.version !== 1 || !Array.isArray(parsed.values)) return snapshots;
		for (const value of parsed.values.slice(-MAX_DESKTOP_PLAYTIME_SNAPSHOTS)) {
			const item = value as Partial<DesktopPlaytimeDomSnapshot>;
			const shortcutAppId = Number(item.shortcutAppId);
			const minutesForever = normalizedWholeNumber(item.minutesForever);
			if (!Number.isFinite(shortcutAppId) || shortcutAppId <= 0 || minutesForever <= 0) continue;
			snapshots.set(shortcutAppId, {
				shortcutAppId,
				title: String(item.title || ''),
				minutesForever,
				minutesRecent: normalizedWholeNumber(item.minutesRecent),
				lastPlayedAt: normalizedWholeNumber(item.lastPlayedAt),
			});
		}
	} catch {}
	return snapshots;
}

function persistDesktopPlaytimeSnapshots(): void {
	try {
		const values = Array.from(desktopPlaytimeSnapshots.values())
			.slice(-MAX_DESKTOP_PLAYTIME_SNAPSHOTS);
		localStorage.setItem(DESKTOP_PLAYTIME_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 1, values }));
	} catch {}
}

const desktopPlaytimeSnapshots = readDesktopPlaytimeSnapshots();
const desktopPlaytimeHydratedApps = new WeakSet<object>();

/** Distinguish a value supplied by GameBridge from playtime Steam already
 * provided. The detail fallback must not mistake our AppOverview hydration for
 * an independent native source and then remove its own synchronized widget. */
export function isDesktopLibraryPlaytimeHydrated(app: unknown): boolean {
	return Boolean(app && typeof app === 'object' && desktopPlaytimeHydratedApps.has(app as object));
}

function normalizedWholeNumber(value: unknown): number {
	const number = Number(value || 0);
	return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

/** Steam has shipped both writable MobX fields and getter-only AppOverview
 * fields. Prefer normal assignment so MobX observes the update, then use an
 * instance value as a compatibility fallback. Steam can rebuild the overview;
 * the mutation-driven desktop refresh will safely reapply the larger value. */
function setDesktopPlaytimeField(target: any, key: DesktopPlaytimeKey, value: number): boolean {
	const current = normalizedWholeNumber(target?.[key]);
	if (value <= current) return false;
	try {
		target[key] = value;
		if (normalizedWholeNumber(target[key]) >= value) return true;
	} catch {}

	try {
		const ownDescriptor = Object.getOwnPropertyDescriptor(target, key);
		Object.defineProperty(target, key, {
			configurable: true,
			enumerable: ownDescriptor?.enumerable ?? true,
			writable: true,
			value,
		});
		return normalizedWholeNumber(target[key]) >= value;
	} catch {
		return false;
	}
}

async function refreshDesktopShortcutPlaytime(
	shortcut: { id: number; title: string; steamAppId: string },
	fallback: PlaytimeStats | null,
): Promise<DesktopPlaytimeRefreshResult> {
	const existing = desktopPlaytimeRefreshes.get(shortcut.id);
	if (existing) return existing;

	const refresh = (async (): Promise<DesktopPlaytimeRefreshResult> => {
		const app = getShortcutAppById(shortcut.id);
		if (!app) return {
			changed: false,
			shortcutAppId: shortcut.id,
			title: shortcut.title,
			minutesForever: 0,
			minutesRecent: 0,
			lastPlayedAt: 0,
		};
		const knownNativeMinutes = normalizedWholeNumber(app.minutes_playtime_forever);
		const nativeMinutes = knownNativeMinutes > 0
			? knownNativeMinutes
			: await getShortcutPlaytimeMinutes(shortcut.id);
		if (!fallback && !nativeMinutes) return {
			changed: false,
			shortcutAppId: shortcut.id,
			title: shortcut.title,
			minutesForever: 0,
			minutesRecent: 0,
			lastPlayedAt: 0,
		};
		if (Number(fallback?.minutesForever || 0) > 0) desktopPlaytimeHydratedApps.add(app);

		// Never reduce a value Steam already knows. The canonical GameBridge
		// sessions fill only the zero/older shortcut values that Steam leaves on
		// desktop Library Home cards.
		const forever = Math.max(
			normalizedWholeNumber(app.minutes_playtime_forever),
			normalizedWholeNumber(nativeMinutes),
			normalizedWholeNumber(fallback?.minutesForever),
		);
		const recent = Math.max(
			normalizedWholeNumber(app.minutes_playtime_last_two_weeks),
			normalizedWholeNumber(fallback?.minutesLastTwoWeeks),
		);
		const lastPlayedAt = Math.max(
			normalizedWholeNumber(app.rt_last_time_played),
			normalizedWholeNumber(fallback?.lastPlayedAt),
		);

		let changed = false;
		if (setDesktopPlaytimeField(app, 'minutes_playtime_forever', forever)) changed = true;
		if (setDesktopPlaytimeField(app, 'minutes_playtime_last_two_weeks', recent)) changed = true;
		if (lastPlayedAt > 0) {
			if (setDesktopPlaytimeField(app, 'rt_last_time_played', lastPlayedAt)) changed = true;
			if (setDesktopPlaytimeField(app, 'rt_recent_activity_time', lastPlayedAt)) changed = true;
		}
		return {
			changed,
			shortcutAppId: shortcut.id,
			title: shortcut.title,
			minutesForever: forever,
			minutesRecent: recent,
			lastPlayedAt,
		};
	})();

	desktopPlaytimeRefreshes.set(shortcut.id, refresh);
	try {
		return await refresh;
	} finally {
		if (desktopPlaytimeRefreshes.get(shortcut.id) === refresh) desktopPlaytimeRefreshes.delete(shortcut.id);
	}
}

/** Reapply the last resolved values to cards Steam mounted after the async
 * startup read completed. This is synchronous and performs no backend I/O. */
export function syncDesktopLibraryHomePlaytimeDom(doc: Document): void {
	const snapshots = Array.from(desktopPlaytimeSnapshots.values());
	for (const snapshot of snapshots) {
		const app = getShortcutAppById(snapshot.shortcutAppId);
		if (!app || snapshot.minutesForever <= 0) continue;
		desktopPlaytimeHydratedApps.add(app);
		setDesktopPlaytimeField(app, 'minutes_playtime_forever', snapshot.minutesForever);
		setDesktopPlaytimeField(app, 'minutes_playtime_last_two_weeks', snapshot.minutesRecent);
		if (Number(snapshot.lastPlayedAt || 0) > 0) {
			setDesktopPlaytimeField(app, 'rt_last_time_played', Number(snapshot.lastPlayedAt));
			setDesktopPlaytimeField(app, 'rt_recent_activity_time', Number(snapshot.lastPlayedAt));
		}
	}
	patchDesktopLibraryHomePlaytimeCards(doc, snapshots);
}

/** Hydrate Steam Desktop's native AppOverview model for linked non-Steam
 * shortcuts. Library Home renders both "Total" and "Last two weeks" directly
 * from these fields; updating only the detail-page DOM cannot affect the shelf. */
export async function patchDesktopLibraryHomePlaytime(doc: Document): Promise<void> {
	if (!doc.body || doc.hidden) return;
	const shortcuts = getMappedShortcuts();
	if (shortcuts.length === 0) return;
	// Paint the last backend-confirmed values before the first IPC round trip.
	// The async refresh below only advances this snapshot; it never regresses a
	// visible card to Steam's temporary startup value of zero.
	syncDesktopLibraryHomePlaytimeDom(doc);
	const fallbacks = await fetchPlaytimeStatsBatch(shortcuts.map(shortcut => ({
		shortcutAppId: shortcut.id,
		title: shortcut.title,
		steamAppId: shortcut.steamAppId,
	})));
	const results = await Promise.all(shortcuts.map(shortcut =>
		refreshDesktopShortcutPlaytime(shortcut, fallbacks.get(shortcut.id) ?? null)));
	for (const result of results) {
		if (result.minutesForever <= 0) continue;
			desktopPlaytimeSnapshots.set(result.shortcutAppId, {
			shortcutAppId: result.shortcutAppId,
			title: result.title,
				minutesForever: result.minutesForever,
				minutesRecent: result.minutesRecent,
				lastPlayedAt: result.lastPlayedAt,
			});
	}
	persistDesktopPlaytimeSnapshots();
	syncDesktopLibraryHomePlaytimeDom(doc);

	// The detail-page fallback is GameBridge-owned DOM. Keep it aligned with the
	// same resolved value used by Library Home.
	for (const result of results) {
		if (result.minutesForever <= 0) continue;
		const selector = `[data-gdl-playtime="1"][data-gdl-playtime-shortcut-id="${result.shortcutAppId}"] [data-gdl-playtime-value="1"]`;
		for (const value of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
			value.textContent = formatPlaytimeMinutes(result.minutesForever);
		}
	}
}
