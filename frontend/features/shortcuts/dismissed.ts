import { backendLog } from '../../api/backend';
import { shortcutStableIdentityById } from '../../steam/shortcuts';

const DISMISSED_SHORTCUTS_KEY = 'gdl_dismissed_shortcuts_v4';
const LEGACY_DISMISSED_SHORTCUTS_KEY = 'gdl_dismissed_shortcuts_v3';

type DismissedShortcutState = Record<string, string>;

function loadDismissedShortcuts(): DismissedShortcutState {
	const state: DismissedShortcutState = {};
	try {
		const raw = localStorage.getItem(DISMISSED_SHORTCUTS_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			for (const [id, identity] of Object.entries(parsed)) {
				const numericId = Number(id);
				if (Number.isFinite(numericId) && numericId >= 2147483648) {
					state[String(numericId)] = typeof identity === 'string' ? identity : '';
				}
			}
		}
	} catch {}

	// Migrate older ID-only dismissals. If the shortcut still exists, capture its
	// language-independent launch identity so a later Steam rename/AppID rebuild
	// does not resurrect the automatic linking modal.
	try {
		const legacyRaw = localStorage.getItem(LEGACY_DISMISSED_SHORTCUTS_KEY);
		const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
		if (Array.isArray(legacy)) {
			for (const value of legacy) {
				const id = Number(value);
				if (!Number.isFinite(id) || id < 2147483648) continue;
				const key = String(id);
				if (!(key in state)) state[key] = shortcutStableIdentityById(id);
			}
		}
	} catch {}
	return state;
}

function saveDismissedShortcuts(state: DismissedShortcutState): void {
	try {
		localStorage.setItem(DISMISSED_SHORTCUTS_KEY, JSON.stringify(state));
		localStorage.removeItem(LEGACY_DISMISSED_SHORTCUTS_KEY);
	} catch {}
}

const dismissedShortcuts = loadDismissedShortcuts();
saveDismissedShortcuts(dismissedShortcuts);

/** Persist an explicit user decision not to auto-link this logical shortcut. */
export function dismissShortcut(shortcutAppId: number): void {
	if (!shortcutAppId) return;
	dismissedShortcuts[String(shortcutAppId)] = shortcutStableIdentityById(shortcutAppId);
	saveDismissedShortcuts(dismissedShortcuts);
	backendLog(`Shortcut ${shortcutAppId} dismissed from auto-link until it is explicitly linked again.`);
}

/** Any explicit link action wins over an older reject/unlink decision, even if
 * Steam regenerated the shortcut AppID after a title mutation. */
export function undismissShortcut(shortcutAppId: number): void {
	if (!shortcutAppId) return;
	const key = String(shortcutAppId);
	const currentIdentity = shortcutStableIdentityById(shortcutAppId);
	const storedIdentity = dismissedShortcuts[key] || '';
	let changed = false;
	for (const [id, identity] of Object.entries({ ...dismissedShortcuts })) {
		if (id === key || (currentIdentity && identity === currentIdentity) || (storedIdentity && identity === storedIdentity)) {
			delete dismissedShortcuts[id];
			changed = true;
		}
	}
	if (changed) {
		saveDismissedShortcuts(dismissedShortcuts);
		backendLog(`Shortcut ${shortcutAppId} restored to linked/auto-link eligible state.`);
	}
}

export function isShortcutDismissed(shortcutAppId: number): boolean {
	const key = String(shortcutAppId);
	if (Object.prototype.hasOwnProperty.call(dismissedShortcuts, key)) return true;
	const identity = shortcutStableIdentityById(shortcutAppId);
	return Boolean(identity && Object.values(dismissedShortcuts).includes(identity));
}

/** Older builds stored only a volatile Shortcut AppID. If Steam regenerated
 * that ID before this build could capture the launch fingerprint, the safest
 * migration is to suppress alias-based startup recovery and require one
 * explicit Properties link. This prevents a stale alias from resurrecting a
 * shortcut the user explicitly unlinked. */
export function hasUnresolvedDismissedShortcutIdentities(): boolean {
	return Object.values(dismissedShortcuts).some(identity => !identity);
}

export function clearAllDismissedShortcuts(): void {
	for (const id of Object.keys(dismissedShortcuts)) {
		delete dismissedShortcuts[id];
	}
	saveDismissedShortcuts({});
	try {
		localStorage.removeItem(DISMISSED_SHORTCUTS_KEY);
		localStorage.removeItem(LEGACY_DISMISSED_SHORTCUTS_KEY);
	} catch {}
	backendLog('Cleared all dismissed shortcuts in memory and storage.');
}

