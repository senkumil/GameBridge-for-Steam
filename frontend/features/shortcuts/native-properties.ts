import {
	detectGameCandidatesBackend,
	fetchLocalAchievementsBackend,
	fetchSteamAccountAchievementsBackend,
	getSteamCardFarmingStatusBackend,
	startSteamCardFarmingBackend,
	stopSteamCardFarmingBackend,
	syncSteamAccountAchievementsBackend,
} from '../../api/backend';
import type { LocalAchievementData } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { findNativeSteamAppIdByName, SHORTCUT_THRESHOLD } from '../../steam/shortcuts';
import { openAchievementPickerModal } from './achievement-picker-modal';

const GDL_NATIVE_PROP = 'gdl-native-properties-injected';

function parseIpcObject<T>(raw: unknown): T | null {
	try {
		let value: unknown = raw;
		for (let i = 0; i < 3 && typeof value === 'string'; i++) {
			const text = value.trim();
			if (!text) return null;
			value = JSON.parse(text);
		}
		return value && typeof value === 'object' ? value as T : null;
	} catch {
		return null;
	}
}

function steamSyncFailureMessage(error?: string): string {
	const detail = {
		steam_not_running: 'Steam is not running.',
		steam_user_not_logged_in: 'No Steam user is logged in.',
		steam_client_dll_not_found: 'Steam client files were not found.',
		steam_userstats_unavailable: 'Steam User Stats is unavailable.',
		request_current_stats_failed: 'Steam rejected the stats request for this AppID.',
		game_stats_not_owned_or_unavailable: 'Steam could not load stats for this game. Verify that this account owns the exact AppID.',
		store_stats_not_confirmed: 'Steam did not confirm that the changes were saved.',
		helper_not_found: 'The NativeGameLink Steam sync helper is missing.',
		empty_output: 'The NativeGameLink Steam sync helper returned no result.',
	}[String(error || '')] || String(error || 'sync_failed');
	return `${gdlText('game_achievement_picker_sync_failed', 'Failed to sync achievements with your Steam account (ensure the game is owned and Steam is running).')} ${detail}`;
}

export async function resolveNativeGameAppId(doc: Document, gameTitle: string): Promise<string | null> {
	// 1. Direct search by name in Steam's loaded app store
	if (gameTitle) {
		const byStore = findNativeSteamAppIdByName(gameTitle);
		if (byStore) return byStore;
	}

	// 2. Check window/document location URLs
	const urls = [
		String(doc.defaultView?.location?.href || ''),
		String(doc.location?.href || ''),
		typeof window !== 'undefined' ? String(window.location?.href || '') : '',
	];
	for (const url of urls) {
		const match = url.match(/(?:properties|app|details)\/(\d+)/i) || url.match(/[?&]appid=(\d+)/i);
		if (match && Number(match[1]) > 0 && Number(match[1]) < SHORTCUT_THRESHOLD) {
			return match[1];
		}
	}

	// 3. Inspect React Fiber props on main container
	try {
		const root = doc.querySelector('.DialogContent') || doc.querySelector('[class*="properties_"]') || doc.body;
		if (root) {
			const keys = Object.keys(root);
			const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
			if (fiberKey) {
				let fiber = (root as unknown as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
				let depth = 0;
				while (fiber && depth < 30) {
					const props = (fiber.memoizedProps || fiber.pendingProps) as Record<string, unknown> | null;
					if (props) {
						const overview = props.overview as Record<string, unknown> | undefined;
						const candidate = props.appid || props.appId || props.nAppId || overview?.appid;
						if (candidate && Number(candidate) > 0 && Number(candidate) < SHORTCUT_THRESHOLD) {
							return String(candidate);
						}
					}
					fiber = (fiber.return || fiber.parent) as Record<string, unknown> | null;
					depth++;
				}
			}
		}
	} catch {}

	// 4. Query candidates by game title
	if (gameTitle) {
		try {
			const raw = await detectGameCandidatesBackend({
				request_json: JSON.stringify({ game_title: gameTitle }),
			});
			const parsed = parseIpcObject<{ candidates?: Array<{ steam_app_id?: string | number; name?: string }> }>(raw);
			if (parsed?.candidates && parsed.candidates.length > 0) {
				const cleanTitle = gameTitle.toLowerCase().trim();
				const match = parsed.candidates.find(c => (c.name || '').toLowerCase().trim() === cleanTitle) || parsed.candidates[0];
				if (match?.steam_app_id) return String(match.steam_app_id);
			}
		} catch {}
	}

	return null;
}

function formatElapsedMinutes(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	if (mins < 1) return '< 1 min';
	if (mins < 60) return `${mins} min`;
	const hours = Math.floor(mins / 60);
	const remMins = mins % 60;
	return `${hours}h ${remMins}m`;
}

export function tryInjectNativePropertiesField(doc: Document, gameTitle: string, container: Element): void {
	if (!doc || !container || container.querySelector(`.${GDL_NATIVE_PROP}`)) return;

	const section = doc.createElement('div');
	section.className = GDL_NATIVE_PROP;
	section.style.cssText = 'padding: 20px 0; margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); font-family: inherit;';

	section.innerHTML = `
		<div style="font-size: 14px; font-weight: 700; color: #dcdedf; margin-bottom: 6px;">
			${escapeHtml(gdlText('native_steam_achievements_title', 'Steam Achievements (NativeGameLink)'))}
		</div>
		<div style="font-size: 12px; color: #8f98a0; margin-bottom: 12px; line-height: 1.4;">
			${escapeHtml(gdlText('native_steam_achievements_desc', 'Manage, customize, and sync the official achievements for this game directly with your Steam account.'))}
		</div>
		<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
			<button class="gdl-native-open-picker-btn" type="button" style="padding: 8px 16px; background: #1e354a; border: 1px solid #1a9fff; border-radius: 2px; color: #66c0f4; font-size: 12px; font-weight: 600; cursor: pointer;">
				${escapeHtml(gdlText('native_steam_achievements_manage_btn', '☁️ Manage & sync achievements on Steam'))}
			</button>
			<div class="gdl-native-status" style="font-size: 12px; color: #8f98a0;"></div>
		</div>

		<div style="margin-top: 18px; padding-top: 14px; border-top: 1px dashed rgba(255,255,255,0.08);">
			<div style="font-size: 13px; font-weight: 600; color: #dcdedf; margin-bottom: 4px;">
				${escapeHtml(gdlText('native_steam_card_farming_title', 'Steam Card Farming (NativeGameLink)'))}
			</div>
			<div style="font-size: 11.5px; color: #8f98a0; margin-bottom: 10px; line-height: 1.35;">
				${escapeHtml(gdlText('native_steam_card_farming_desc', 'Simulate running the game in the background so Valve drops official trading cards directly into your Steam Inventory.'))}
			</div>
			<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
				<button class="gdl-native-farm-cards-btn" type="button" style="padding: 7px 14px; background: #242c38; border: 1px solid rgba(255,255,255,0.12); border-radius: 2px; color: #dcdedf; font-size: 12px; font-weight: 500; cursor: pointer;">
					${escapeHtml(gdlText('native_steam_card_farming_start_btn', '🃏 Start card farming'))}
				</button>
				<div class="gdl-native-farm-status" style="font-size: 12px; color: #8f98a0;"></div>
			</div>
		</div>
	`;

	container.appendChild(section);

	const btn = section.querySelector('.gdl-native-open-picker-btn') as HTMLButtonElement;
	const statusEl = section.querySelector('.gdl-native-status') as HTMLElement;
	const farmBtn = section.querySelector('.gdl-native-farm-cards-btn') as HTMLButtonElement;
	const farmStatusEl = section.querySelector('.gdl-native-farm-status') as HTMLElement;

	let isFarming = false;
	let farmingInterval: number | null = null;
	let farmingStartTime = 0;

	const updateFarmingUI = (active: boolean, elapsedSec = 0) => {
		isFarming = active;
		if (active) {
			farmBtn.textContent = gdlText('native_steam_card_farming_stop_btn', '⏹️ Stop card farming');
			farmBtn.style.background = '#4a2424';
			farmBtn.style.borderColor = '#d94126';
			farmBtn.style.color = '#ff8877';
			farmStatusEl.textContent = gdlText('native_steam_card_farming_active_status', '🟢 Farming cards ({elapsed} elapsed)...', {
				elapsed: formatElapsedMinutes(elapsedSec),
			});
			farmStatusEl.style.color = '#a4d007';
		} else {
			farmBtn.textContent = gdlText('native_steam_card_farming_start_btn', '🃏 Start card farming');
			farmBtn.style.background = '#242c38';
			farmBtn.style.borderColor = 'rgba(255,255,255,0.12)';
			farmBtn.style.color = '#dcdedf';
			farmStatusEl.textContent = '';
			if (farmingInterval) {
				clearInterval(farmingInterval);
				farmingInterval = null;
			}
		}
	};

	// Check current farming status
	void (async () => {
		try {
			const resolvedAppId = await resolveNativeGameAppId(doc, gameTitle);
			const raw = await getSteamCardFarmingStatusBackend();
			const status = parseIpcObject<{ ok?: boolean; active?: boolean; steam_app_id?: string; elapsed_seconds?: number; started_at?: number }>(raw);
			if (status?.active && status.steam_app_id === resolvedAppId) {
				farmingStartTime = status.started_at ? status.started_at * 1000 : Date.now() - ((status.elapsed_seconds || 0) * 1000);
				updateFarmingUI(true, status.elapsed_seconds || 0);
				farmingInterval = window.setInterval(() => {
					const curSec = Math.max(0, Math.floor((Date.now() - farmingStartTime) / 1000));
					farmStatusEl.textContent = gdlText('native_steam_card_farming_active_status', '🟢 Farming cards ({elapsed} elapsed)...', {
						elapsed: formatElapsedMinutes(curSec),
					});
				}, 5000);
			}
		} catch {}
	})();

	farmBtn?.addEventListener('click', async () => {
		farmBtn.disabled = true;
		try {
			if (isFarming) {
				await stopSteamCardFarmingBackend();
				updateFarmingUI(false);
				farmStatusEl.textContent = gdlText('native_steam_card_farming_stopped', 'Card farming stopped.');
				farmStatusEl.style.color = '#8f98a0';
			} else {
				const steamAppId = await resolveNativeGameAppId(doc, gameTitle);
				if (!steamAppId) {
					farmStatusEl.textContent = gdlText('no_match_found', 'No reliable match found. Enter AppID manually.');
					farmStatusEl.style.color = '#d6b24c';
					farmBtn.disabled = false;
					return;
				}
				const raw = await startSteamCardFarmingBackend({
					request_json: JSON.stringify({ steam_app_id: steamAppId, game_title: gameTitle }),
				});
				const res = parseIpcObject<{ ok?: boolean; active?: boolean; error?: string }>(raw);
				if (!res || !res.ok) {
					throw new Error(res?.error || 'launch_failed');
				}
				farmingStartTime = Date.now();
				updateFarmingUI(true, 0);
				farmingInterval = window.setInterval(() => {
					const curSec = Math.max(0, Math.floor((Date.now() - farmingStartTime) / 1000));
					farmStatusEl.textContent = gdlText('native_steam_card_farming_active_status', '🟢 Farming cards ({elapsed} elapsed)...', {
						elapsed: formatElapsedMinutes(curSec),
					});
				}, 5000);
			}
		} catch {
			farmStatusEl.textContent = gdlText('native_steam_card_farming_failed', 'Could not start card farming.');
			farmStatusEl.style.color = '#d94126';
		} finally {
			farmBtn.disabled = false;
		}
	});

	btn?.addEventListener('click', async () => {
		btn.disabled = true;
		statusEl.textContent = gdlText('native_steam_achievements_loading', 'Loading Steam achievements...');
		statusEl.style.color = '#8f98a0';

		try {
			const steamAppId = await resolveNativeGameAppId(doc, gameTitle);
			if (!steamAppId) {
				statusEl.textContent = gdlText('no_match_found', 'No reliable match found. Enter AppID manually.');
				statusEl.style.color = '#d6b24c';
				btn.disabled = false;
				return;
			}

			const [rawData, rawStatus] = await Promise.all([
				fetchLocalAchievementsBackend({
					request_json: JSON.stringify({ steam_app_id: steamAppId, non_steam_id: steamAppId }),
				}),
				fetchSteamAccountAchievementsBackend({ steam_app_id: steamAppId }),
			]);
			const data = parseIpcObject<LocalAchievementData>(rawData);
			if (!data || !Array.isArray(data.achievements) || data.achievements.length === 0) {
				statusEl.textContent = gdlText('native_steam_achievements_no_achievements', 'This game has no achievements on Steam.');
				statusEl.style.color = '#d6b24c';
				btn.disabled = false;
				return;
			}

			const statusData = parseIpcObject<{ ok?: boolean; achievements?: Record<string, { achieved?: boolean }> }>(rawStatus);

			if (statusData?.ok && statusData.achievements) {
				for (const item of data.achievements) {
					const achStatus = statusData.achievements[item.name];
					if (achStatus) {
						item.earned = Boolean(achStatus.achieved);
					}
				}
			}

			statusEl.textContent = '';
			btn.disabled = false;

			const currentSelected = data.achievements.filter(a => a.earned).map(a => a.name);
			const hasOnlineAchievements = data.achievements.some(a => a.is_online);

			openAchievementPickerModal({
				doc: section.ownerDocument || document,
				gameTitle: gameTitle || steamAppId,
				items: data.achievements,
				initialSelectedNames: currentSelected,
				hasOnlineAchievements,
				titleOverride: gdlText('native_steam_achievements_picker_title', 'Steam achievement selector'),
				descriptionOverride: gdlText('native_steam_achievements_picker_desc', 'Select the achievements to synchronize with your official Steam account. Steam will confirm any saved changes.'),
				onSyncSteam: async (selectedNames) => {
					statusEl.textContent = gdlText('game_achievement_picker_syncing', 'Syncing with Steam servers...');
					statusEl.style.color = '#8f98a0';
					try {
						const selectedSet = new Set(selectedNames);
						const unlockList: string[] = [];
						const lockList: string[] = [];
						for (const item of data.achievements) {
							if (selectedSet.has(item.name)) {
								unlockList.push(item.name);
							} else {
								lockList.push(item.name);
							}
						}
						const rawSync = await syncSteamAccountAchievementsBackend({
							request_json: JSON.stringify({
								steam_app_id: steamAppId,
								unlock: unlockList,
								lock: lockList,
							}),
						});
						const res = parseIpcObject<{ ok?: boolean; unlocked_count?: number; locked_count?: number; error?: string }>(rawSync);
						if (!res || !res.ok) {
							throw new Error(res?.error || 'sync_failed');
						}
						statusEl.textContent = gdlText('game_achievement_picker_sync_success', 'Achievements synced successfully with your Steam account.');
						statusEl.style.color = '#66c0f4';
					} catch (err) {
						statusEl.textContent = steamSyncFailureMessage(err instanceof Error ? err.message : undefined);
						statusEl.style.color = '#d94126';
					}
				},
			});
		} catch (err) {
			statusEl.textContent = steamSyncFailureMessage(err instanceof Error ? err.message : undefined);
			statusEl.style.color = '#d94126';
			btn.disabled = false;
		}
	});
}
