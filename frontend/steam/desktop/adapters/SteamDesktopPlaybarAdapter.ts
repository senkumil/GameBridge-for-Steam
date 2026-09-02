import { backendLog } from '../../../api/backend';

export interface SteamDesktopPlaybarShape {
	nAppID: number;
	strGameName: string;
	bIsRunning: boolean;
	bIsLaunching: boolean;
	bIsUpdating: boolean;
	nPlaytimeMinutes: number;
	rtLastPlayed?: number;
	onPlay: () => void;
}

export function toSteamDesktopPlaybar(
	shortcutAppId: number | string,
	gameName: string,
	playtimeMinutes: number,
	options?: {
		isRunning?: boolean;
		isLaunching?: boolean;
		isUpdating?: boolean;
		lastPlayed?: number;
		onCustomLaunch?: () => void;
	},
): SteamDesktopPlaybarShape {
	const numericShortcutId = Number(shortcutAppId);

	return {
		nAppID: numericShortcutId,
		strGameName: gameName,
		bIsRunning: Boolean(options?.isRunning),
		bIsLaunching: Boolean(options?.isLaunching),
		bIsUpdating: Boolean(options?.isUpdating),
		nPlaytimeMinutes: playtimeMinutes,
		rtLastPlayed: options?.lastPlayed,
		onPlay: () => {
			backendLog(`[NGL][Desktop][Playbar] Launch requested for shortcut ${numericShortcutId} ("${gameName}")`);
			if (options?.onCustomLaunch) {
				options.onCustomLaunch();
				return;
			}
			const apps = (window as any)?.SteamClient?.Apps;
			if (typeof apps?.RunGame === 'function') {
				try { apps.RunGame(numericShortcutId, '', -1, 0); } catch (e) {
					backendLog(`[NGL][Desktop][Playbar] RunGame error: ${e}`);
				}
			}
		},
	};
}
