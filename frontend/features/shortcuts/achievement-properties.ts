import {
	getGameAchievementOptionsBackend,
	getGameAchievementCapabilitiesBackend,
	getGameAchievementPathBackend,
	setGameAchievementOptionsBackend,
	setGameAchievementPathBackend,
} from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { escapeHtml } from '../../core/text';
import {
	isEveryLaunchAchievementReplayEnabled,
	refreshLocalAchievementUI,
	setEveryLaunchAchievementReplayEnabled,
	subscribeAchievementReplayPreferences,
} from '../achievements/runtime';
import { gdlText, steamLanguageSync } from '../../steam/localization';

export interface ShortcutAchievementSettingsContext {
	section: HTMLElement;
	shortcutAppId: () => string;
	steamAppId: () => string;
}

interface GameAchievementOptions {
	ok?: boolean;
	configured?: boolean;
	simulate?: boolean;
	unlock_all?: boolean;
	unlock_online?: boolean;
	zero_progress?: boolean;
	error?: string;
}

interface GameAchievementCapabilities {
	ok?: boolean;
	has_online?: boolean;
	online_count?: number;
}

function parseIpcObject<T extends object>(raw: unknown): T | null {
	if (raw && typeof raw === 'object') return raw as T;
	if (typeof raw !== 'string' || !raw.trim()) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
	} catch { return null; }
}

function switchHtml(className: string, title: string, description: string): string {
	return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);border-radius:3px;">
		<div style="min-width:0;"><div style="font-size:11.5px;font-weight:600;color:#dcdedf;">${escapeHtml(title)}</div><div style="margin-top:3px;font-size:10.8px;line-height:1.35;color:#6c7580;">${escapeHtml(description)}</div></div>
		<button type="button" class="${className}" role="switch" aria-checked="false" style="position:relative;width:42px;height:24px;flex:0 0 42px;padding:0;border:0;border-radius:12px;background:#4b5869;cursor:pointer;">
			<span style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#f1f1f1;transition:left .12s ease;"></span>
		</button>
	</div>`;
}

export function shortcutAchievementSettingsHtml(): string {
	return `<div class="gdl-game-achievement-source" style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06);">
		<div style="font-size:12px;font-weight:500;color:#8f98a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;">${escapeHtml(gdlText('game_achievement_path_title', 'Achievement progress file'))}</div>
		<div style="font-size:11px;color:#6c7580;margin-bottom:9px;line-height:1.4;">${escapeHtml(gdlText('game_achievement_path_description', 'Optional. Paste this game\'s achievements JSON file, or a folder that contains achievements.json. This source is checked before the global AppID folders.'))}</div>
		<div style="display:flex;gap:8px;align-items:center;">
			<input class="gdl-game-achievement-path-input" type="text" placeholder="${escapeHtml(gdlText('game_achievement_path_placeholder', 'Example: D:\\Game\\achievements.json'))}" style="flex:1;min-width:0;padding:8px 12px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.1);border-radius:3px;color:#dcdedf;font-size:12px;outline:none;" />
			<button class="gdl-game-achievement-path-save" type="button" style="padding:8px 14px;background:#1a9fff;border:0;border-radius:3px;color:#fff;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;">${escapeHtml(gdlText('game_achievement_path_save', 'Save path'))}</button>
			<button class="gdl-game-achievement-path-clear" type="button" style="padding:8px 12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.06);border-radius:3px;color:#8f98a0;font-size:12px;cursor:pointer;white-space:nowrap;">${escapeHtml(gdlText('game_achievement_path_clear', 'Use automatic'))}</button>
		</div>
		<div class="gdl-game-achievement-path-status" style="font-size:11px;color:#8f98a0;margin-top:7px;min-height:16px;"></div>
		<div style="margin-top:12px;font-size:12px;font-weight:500;color:#8f98a0;text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(gdlText('game_achievement_options_title', 'Achievement progress options'))}</div>
		<div class="gdl-game-achievement-options" style="display:grid;gap:6px;margin-top:8px;">
			${switchHtml('gdl-game-achievement-zero', gdlText('game_zero_achievements_title', 'Ignore local progress and show 0'), gdlText('game_zero_achievements_description', 'Ignore the custom path and global AppID folders for this game without deleting their files.'))}
			${switchHtml('gdl-game-achievement-simulate', gdlText('game_simulated_achievements_title', 'Simulated achievements'), gdlText('game_simulated_achievements_description', 'Show deterministic progress using the real Steam names and icons.'))}
			${switchHtml('gdl-game-achievement-all', gdlText('game_simulated_unlock_all_title', 'Unlock all achievements'), gdlText('game_simulated_unlock_all_description', 'Show 100% completion instead of partial simulated progress.'))}
			${switchHtml('gdl-game-achievement-online', gdlText('game_online_achievements_title', 'Unlock online achievements only'), gdlText('game_online_achievements_description', 'Also unlock achievements identified as online, multiplayer or cooperative.'))}
			${switchHtml('gdl-game-achievement-replay-every', gdlText('game_replay_every_achievements_title', 'Show all achievements on every launch'), gdlText('game_replay_every_achievements_description', 'Replays every currently unlocked achievement whenever this game starts.'))}
		</div>
		<div style="display:flex;align-items:center;gap:9px;margin-top:8px;">
			<button class="gdl-game-achievement-reset" type="button" style="padding:6px 9px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:3px;color:#8f98a0;font-size:10.8px;cursor:pointer;">${escapeHtml(gdlText('game_achievement_options_reset', 'Use global defaults'))}</button>
			<span class="gdl-game-achievement-options-status" style="font-size:10.8px;color:#8f98a0;"></span>
		</div>
	</div>`;
}

function setSwitch(button: HTMLButtonElement | null, checked: boolean, disabled = false): void {
	if (!button) return;
	button.setAttribute('aria-checked', checked ? 'true' : 'false');
	button.disabled = disabled;
	button.style.background = checked ? '#1a9fff' : '#4b5869';
	button.style.cursor = disabled ? 'default' : 'pointer';
	button.style.opacity = disabled ? '.45' : '1';
	const knob = button.firstElementChild as HTMLElement | null;
	if (knob) knob.style.left = checked ? '21px' : '3px';
}

export function bindShortcutAchievementSettings(context: ShortcutAchievementSettingsContext): void {
	const { section } = context;
	const pathInput = section.querySelector<HTMLInputElement>('.gdl-game-achievement-path-input');
	const pathSave = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-path-save');
	const pathClear = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-path-clear');
	const pathStatus = section.querySelector<HTMLElement>('.gdl-game-achievement-path-status');
	const simulateSwitch = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-simulate');
	const allSwitch = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-all');
	const onlineSwitch = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-online');
	const onlineRow = onlineSwitch?.parentElement as HTMLElement | null;
	const zeroSwitch = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-zero');
	const replayEverySwitch = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-replay-every');
	const resetButton = section.querySelector<HTMLButtonElement>('.gdl-game-achievement-reset');
	const optionsStatus = section.querySelector<HTMLElement>('.gdl-game-achievement-options-status');
	if (!pathInput || !pathSave || !pathClear || !pathStatus || !optionsStatus) return;

	let options: Required<Pick<GameAchievementOptions, 'configured' | 'simulate' | 'unlock_all' | 'unlock_online' | 'zero_progress'>> = {
		configured: false, simulate: false, unlock_all: false, unlock_online: false, zero_progress: false,
	};
	let loading = true;
	let saving = false;
	let hasOnlineAchievements = false;
	let capabilitiesLoaded = false;
	const replayIdentity = (): [string, string] => [context.steamAppId(), context.shortcutAppId() || context.steamAppId()];
	let replayEvery = isEveryLaunchAchievementReplayEnabled(...replayIdentity());
	const syncReplayPreferences = (): void => {
		replayEvery = isEveryLaunchAchievementReplayEnabled(...replayIdentity());
		render();
	};
	const unsubscribeReplayPreferences = subscribeAchievementReplayPreferences(syncReplayPreferences);
	const cleanupObserver = new MutationObserver(() => {
		if (section.isConnected) return;
		unsubscribeReplayPreferences();
		cleanupObserver.disconnect();
	});
	if (section.ownerDocument.documentElement) {
		cleanupObserver.observe(section.ownerDocument.documentElement, { childList: true, subtree: true });
	}

	const request = (extra: Record<string, unknown> = {}): string => {
		const global = getPreferences();
		return JSON.stringify({
			shortcut_app_id: context.shortcutAppId(),
			steam_app_id: context.steamAppId(),
			global_simulate: global.simulateAchievements,
			// Full simulated completion is intentionally configured per game.
			global_unlock_all: false,
			global_unlock_online: global.unlockOnlineAchievements,
			language: steamLanguageSync() || 'spanish',
			...extra,
		});
	};
	const refreshCurrentGame = (): void => {
		refreshLocalAchievementUI({
			steamAppId: context.steamAppId(),
			stateAppId: context.shortcutAppId() || context.steamAppId(),
		});
	};

	const render = (): void => {
		const busy = loading || saving;
		setSwitch(zeroSwitch, options.zero_progress, busy);
		setSwitch(simulateSwitch, options.simulate, busy || options.zero_progress);
		setSwitch(allSwitch, options.unlock_all, busy || options.zero_progress || !options.simulate);
		setSwitch(onlineSwitch, options.unlock_online, busy || options.zero_progress);
		// The global switch supplies the inherited value. Keep this per-game
		// control available so the user can explicitly turn that default off.
		if (onlineRow) onlineRow.style.display = hasOnlineAchievements ? 'flex' : 'none';
		setSwitch(replayEverySwitch, replayEvery, busy);
		for (const control of [pathInput, pathSave, pathClear]) {
			control.disabled = busy || options.simulate || options.zero_progress;
			control.style.opacity = busy || options.simulate || options.zero_progress ? '.45' : '1';
		}
		if (resetButton) resetButton.disabled = busy;
		optionsStatus.style.color = '#8f98a0';
		optionsStatus.textContent = options.configured
			? gdlText('game_achievement_options_local', 'Using settings saved for this game.')
			: gdlText('game_achievement_options_global', 'Using the global plugin defaults.');
		if (options.zero_progress) {
			pathStatus.textContent = gdlText('game_achievement_path_zero_blocked', 'Local achievement progress is disabled for this game; the real Steam list will be shown at 0%.');
		} else if (options.simulate) {
			pathStatus.textContent = gdlText('game_achievement_path_simulation_blocked', 'Simulated achievements are active; a custom progress path cannot be used at the same time.');
		} else if (!pathInput.value.trim()) {
			pathStatus.textContent = gdlText('game_achievement_path_automatic', 'Using automatic AppID folders from the global plugin setting.');
		}
	};

	const applyOptions = (value: GameAchievementOptions): void => {
		options = {
			configured: value.configured === true,
			zero_progress: value.zero_progress === true,
			simulate: value.zero_progress !== true && value.simulate === true,
			unlock_all: value.zero_progress !== true && value.simulate === true && value.unlock_all === true,
			unlock_online: value.zero_progress !== true && value.unlock_online === true
				&& (!capabilitiesLoaded || hasOnlineAchievements),
		};
		render();
	};

	const saveOptions = async (next: Partial<typeof options>, reset = false): Promise<void> => {
		if (loading || saving) return;
		const candidate = { ...options, ...next };
		saving = true;
		render();
		optionsStatus.textContent = gdlText('game_achievement_options_saving', 'Saving achievement options...');
		try {
			const raw = await setGameAchievementOptionsBackend({ request_json: request({
				reset,
				zero_progress: candidate.zero_progress,
				simulate: candidate.simulate,
				unlock_all: candidate.unlock_all,
				unlock_online: candidate.unlock_online,
			}) });
			const result = parseIpcObject<GameAchievementOptions>(raw) || {};
			if (!result.ok) throw new Error(result.error || 'save_failed');
			saving = false;
			applyOptions(result);
			if (options.simulate) pathInput.value = '';
			refreshCurrentGame();
		} catch {
			saving = false;
			render();
			optionsStatus.textContent = gdlText('game_achievement_options_failed', 'Achievement options could not be saved.');
			optionsStatus.style.color = '#d94126';
		}
	};

	zeroSwitch?.addEventListener('click', () => { void saveOptions({ zero_progress: !options.zero_progress, simulate: false, unlock_all: false, unlock_online: false }); });
	simulateSwitch?.addEventListener('click', () => { void saveOptions({ zero_progress: false, simulate: !options.simulate, unlock_all: false }); });
	allSwitch?.addEventListener('click', () => { if (options.simulate) void saveOptions({ unlock_all: !options.unlock_all }); });
	onlineSwitch?.addEventListener('click', () => {
		if (hasOnlineAchievements) {
			void saveOptions({ zero_progress: false, unlock_online: !options.unlock_online });
		}
	});
	replayEverySwitch?.addEventListener('click', () => {
		if (loading || saving) return;
		replayEvery = !replayEvery;
		setEveryLaunchAchievementReplayEnabled(...replayIdentity(), replayEvery);
		render();
	});
	resetButton?.addEventListener('click', () => { void saveOptions({}, true); });

	pathInput.addEventListener('keydown', event => {
		if (event.key === 'Enter') { event.preventDefault(); pathSave.click(); }
	});
	pathSave.addEventListener('click', async () => {
		const path = pathInput.value.trim();
		if (!path) {
			pathStatus.textContent = gdlText('game_achievement_path_enter', 'Enter a JSON file or folder path.');
			pathStatus.style.color = '#d6b24c';
			return;
		}
		try {
			const raw = await setGameAchievementPathBackend({ request_json: request({ path, unlock_online: options.unlock_online }) });
			const result = parseIpcObject<{ ok?: boolean; usable?: boolean; error?: string }>(raw) || {};
			if (!result.ok) throw new Error(result.error || 'save_failed');
			options.zero_progress = false; options.simulate = false; options.unlock_all = false; options.configured = true;
			render();
			pathStatus.textContent = result.usable
				? gdlText('game_achievement_path_saved', 'Achievement source saved for this game.')
				: gdlText('game_achievement_path_saved_missing', 'The path is saved, but no readable achievements JSON was found there.');
			pathStatus.style.color = result.usable ? '#66c0f4' : '#d6b24c';
			refreshCurrentGame();
		} catch {
			pathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be saved.');
			pathStatus.style.color = '#d94126';
		}
	});
	pathClear.addEventListener('click', async () => {
		try {
			const raw = await setGameAchievementPathBackend({ request_json: request({ path: '' }) });
			const result = parseIpcObject<{ ok?: boolean; error?: string }>(raw) || {};
			if (!result.ok) throw new Error(result.error || 'clear_failed');
			pathInput.value = '';
			pathStatus.textContent = gdlText('game_achievement_path_cleared', 'Custom source removed; automatic AppID folders will be used.');
			pathStatus.style.color = '#8f98a0';
			refreshCurrentGame();
		} catch {
			pathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be saved.');
			pathStatus.style.color = '#d94126';
		}
	});

	pathStatus.textContent = gdlText('game_achievement_path_loading', 'Loading achievement source...');
	render();
	void Promise.all([
		getGameAchievementPathBackend({ request_json: request() }),
		getGameAchievementOptionsBackend({ request_json: request() }),
	]).then(([pathRaw, optionsRaw]) => {
		const pathResult = parseIpcObject<{ ok?: boolean; configured?: boolean; path?: string; usable?: boolean }>(pathRaw) || {};
		const optionsResult = parseIpcObject<GameAchievementOptions>(optionsRaw) || {};
		if (pathResult.ok) {
			pathInput.value = pathResult.path || '';
			pathStatus.textContent = pathResult.configured
				? (pathResult.usable ? gdlText('game_achievement_path_ready', 'This game will use the selected achievement file.') : gdlText('game_achievement_path_saved_missing', 'The path is saved, but no readable achievements JSON was found there.'))
				: gdlText('game_achievement_path_automatic', 'Using automatic AppID folders from the global plugin setting.');
		}
		loading = false;
		if (optionsResult.ok) applyOptions(optionsResult);
		else render();
	}).catch(() => {
		loading = false;
		render();
		pathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be loaded.');
		pathStatus.style.color = '#d94126';
	});

	// Capability detection is intentionally independent from the fast settings
	// load: a slow Steam metadata response must not block the rest of Properties.
	void getGameAchievementCapabilitiesBackend({ request_json: request() }).then(raw => {
		const result = parseIpcObject<GameAchievementCapabilities>(raw) || {};
		capabilitiesLoaded = true;
		hasOnlineAchievements = result.ok === true && result.has_online === true && Number(result.online_count || 0) > 0;
		if (!hasOnlineAchievements) options.unlock_online = false;
		render();
	}).catch(() => {
		capabilitiesLoaded = true;
		hasOnlineAchievements = false;
		options.unlock_online = false;
		render();
	});
}
