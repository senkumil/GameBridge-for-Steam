import { backendLog } from '../../api/backend';
import {
	getShortcutAppById,
	readShortcutOverviewField,
	shortcutExecutableIdentity,
	shortcutPathBasename,
	shortcutStableIdentityById,
} from '../../steam/shortcuts';
import { getAllShortcutRecords } from './registry';

const STORAGE_KEY = 'gdl_native_add_auto_prompt_suppressed_v1';

interface SuppressedAutoPrompt {
	identity: string;
	executable: string;
	createdAt: number;
}

function storage(): Storage | null {
	try { return typeof localStorage !== 'undefined' ? localStorage : null; }
	catch { return null; }
}

function readState(): SuppressedAutoPrompt[] {
	try {
		const raw = storage()?.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(item => item && typeof item === 'object')
			.map(item => ({
				identity: String(item.identity || ''),
				executable: String(item.executable || ''),
				createdAt: Number(item.createdAt) || Date.now(),
			}))
			.filter(item => !!(item.identity || item.executable));
	} catch { return []; }
}

function shortcutExecutableById(shortcutAppId: number): string {
	const app = getShortcutAppById(shortcutAppId);
	return shortcutExecutableIdentity(readShortcutOverviewField(
		app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
	));
}

/** Prompt suppression is disabled: games added via Steam will always show the auto-detection modal. */
export function suppressNativeAddAutoPrompt(_shortcutAppId: number, _executableHint = ''): void {
	// No-op: closing or rejecting the review no longer permanently blocks the game.
}

export function isNativeAddAutoPromptSuppressed(_shortcutAppId: number): boolean {
	return false;
}

/** Number of permanent automatic-prompt suppressions currently stored. */
export function getNativeAddAutoPromptSuppressionCount(): number {
	return readState().length;
}

export interface NativeAddAutoPromptSuppression {
	key: string;
	title: string;
	executable: string;
	presentInLibrary: boolean;
}

/** Resolve permanent suppressions back to current Steam shortcut names. Entries
 * whose shortcut was removed retain an executable label so the list remains
 * auditable instead of degrading to an anonymous counter. */
export function getNativeAddAutoPromptSuppressions(): NativeAddAutoPromptSuppression[] {
	const records = getAllShortcutRecords().map(record => ({
		record,
		identity: shortcutStableIdentityById(record.id),
		executable: shortcutExecutableById(record.id),
	}));
	return readState().map((item, index) => {
		const match = records.find(candidate => (item.identity && candidate.identity === item.identity)
			|| (item.executable && candidate.executable === item.executable));
		const executable = item.executable || item.identity.split('|')[0] || '';
		return {
			key: item.identity || item.executable || String(index),
			title: match?.record.title || shortcutPathBasename(executable) || `#${index + 1}`,
			executable,
			presentInLibrary: Boolean(match),
		};
	}).sort((left, right) => left.title.localeCompare(right.title));
}

/** Explicit user-only reset for the permanent suppression list. This is never
 * called by unlink, language changes, startup, or bulk operations. */
export function clearNativeAddAutoPromptSuppressions(): number {
	const count = readState().length;
	try { storage()?.removeItem(STORAGE_KEY); }
	catch (error) { backendLog('Could not clear native-add auto-prompt suppression: ' + String(error)); }
	backendLog(`Cleared ${count} native-add auto-link prompt suppression(s) by explicit user action.`);
	return count;
}
