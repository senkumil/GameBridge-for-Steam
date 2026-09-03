import { backendLog, factoryResetBackend, setAchievementBasePathBackend } from '../../api/backend';
import { clearLibraryAssetCaches } from '../library/artwork';
import { DEFAULT_PREFERENCES, setPreferences } from '../../core/preferences';
import { mappings, persistMappingsSnapshot, updateMappingsChecked } from '../../core/mappings';
import { unlinkAllShortcutsFromSteam } from './unlinking';
import { shortcutRuntimeHost } from './host';

export interface FactoryResetOptions {
	deletePlaytime: boolean;
	doc?: Document | null;
}

export interface FactoryResetResult {
	ok: boolean;
	error?: string;
}

export async function performFactoryReset(options: FactoryResetOptions): Promise<FactoryResetResult> {
	backendLog(`Starting factory reset (deletePlaytime=${options.deletePlaytime})`);
	try {
		// 1. Unlink all shortcuts from Steam Client and remove custom Steam grid artwork
		try {
			await unlinkAllShortcutsFromSteam(options.doc);
		} catch (unlinkErr) {
			backendLog(`Factory reset shortcut unlink warning: ${unlinkErr}`);
		}

		// 2. Call backend factory reset IPC
		try {
			await factoryResetBackend({
				request_json: JSON.stringify({ delete_playtime: options.deletePlaytime }),
			});
		} catch (ipcErr) {
			backendLog(`Factory reset backend call warning: ${ipcErr}`);
		}

		// 3. Clear localStorage keys belonging to the plugin
		try {
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				const isPlaytimeKey = key.startsWith('gdl_playtime') || key.startsWith('gdl-playtime');
				if (!options.deletePlaytime && isPlaytimeKey) {
					continue;
				}
				if (
					key.startsWith('gdl_') ||
					key.startsWith('gdl-') ||
					key.startsWith('gdl:') ||
					key.startsWith('nativegamelink')
				) {
					localStorage.removeItem(key);
				}
			}
		} catch (storageErr) {
			backendLog(`Factory reset localStorage warning: ${storageErr}`);
		}

		// 4. Reset preferences to defaults and notify subscribers
		setPreferences({ ...DEFAULT_PREFERENCES });

		// 5. Reset mappings to empty in memory and notify subscribers
		try {
			const currentKeys = Object.keys(mappings);
			if (currentKeys.length > 0) {
				await updateMappingsChecked({ remove: currentKeys });
			}
			persistMappingsSnapshot({});
		} catch (mappingsErr) {
			backendLog(`Factory reset mappings clear warning: ${mappingsErr}`);
		}

		// 6. Reset achievement base path in backend
		try {
			await setAchievementBasePathBackend({ path: '%APPDATA%\\SteamAchievements' });
		} catch {}

		// 7. Clear library asset caches
		clearLibraryAssetCaches();

		// 8. If playtime was deleted, dispatch reset event
		if (options.deletePlaytime && typeof window !== 'undefined') {
			try {
				window.dispatchEvent(new CustomEvent('gdl:playtime-reset'));
			} catch {}
		}

		// 9. Reset library injection
		try {
			shortcutRuntimeHost().resetLibraryInjection?.(true, options.doc || undefined);
		} catch {}

		backendLog('Factory reset completed successfully');
		return { ok: true };
	} catch (err) {
		backendLog(`Factory reset failed: ${err}`);
		return { ok: false, error: String(err) };
	}
}
