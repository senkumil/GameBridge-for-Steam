const LAUNCHER_BYPASS_APP_IDS = new Set<string>([
	'1817070', '1817190', '2651280', '1895840', '2215430', '2420110', '1151640',
	'1088850', '391220', '750920', '203160', '337000', '238010', '1086940',
	'435150', '1091500', '292030', '49520', '261640', '397540', '1286680',
	'409710', '409720', '8870', '1030840', '1055820', '360430', '268500',
	'368260', '1158310', '394360', '281990', '236850', '255710', '1142710',
	'594570', '364360', '779340',
]);

export function getOptimalLauncherSkipArg(steamAppId: string): string | null {
	const id = String(steamAppId || '').trim();
	if (!id) return null;
	if (id === '1091500' || id === '292030') return '--launcher-skip';
	if (id === '1086940' || id === '435150') return '--skip-launcher';
	if (LAUNCHER_BYPASS_APP_IDS.has(id)) return '-nolauncher';
	return null;
}

export function shouldAutoApplyNoLauncher(steamAppId: string): boolean {
	return Boolean(getOptimalLauncherSkipArg(steamAppId));
}

export function hasNoLauncherOption(value: string): boolean {
	const text = String(value || '').trim();
	return /(^|\s)(-nolauncher|--launcher-skip|--skip-launcher)(?=\s|$)/i.test(text);
}

export function removeIncompatibleLauncherBypass(existing: string, steamAppId: string): string {
	if (shouldAutoApplyNoLauncher(steamAppId)) return existing;
	return String(existing || '')
		.replace(/(^|\s)-nolauncher(?=\s|$)/gi, ' ')
		.replace(/(^|\s)--launcher-skip(?=\s|$)/gi, ' ')
		.replace(/(^|\s)--skip-launcher(?=\s|$)/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function mergeNoLauncherOption(existing: string, steamAppId = ''): string {
	const current = String(existing || '').trim();
	const arg = getOptimalLauncherSkipArg(steamAppId);
	if (!arg) return current;
	if (current.includes(arg)) return current;
	return current ? `${current} ${arg}` : arg;
}

export function applyNoLauncherOption(shortcutAppId: number, fallbackOptions = '', _automatic = false): boolean {
	const apps = (window as any).SteamClient?.Apps;
	if (typeof apps?.SetShortcutLaunchOptions !== 'function') return false;
	const current = String(fallbackOptions || '').trim();
	const arg = '-nolauncher';
	if (current.includes(arg)) return true;
	const updated = current ? `${current} ${arg}` : arg;
	try {
		void apps.SetShortcutLaunchOptions(shortcutAppId, updated);
		return true;
	} catch {
		return false;
	}
}
