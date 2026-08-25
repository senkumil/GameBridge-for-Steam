export interface ShortcutRuntimeHost {
	getMainWindowDoc: () => Document | null;
	findNonSteamNotice: (doc: Document) => { title: string } | null;
	resetLibraryInjection: (reinject: boolean) => void;
	refreshLibraryArtwork: (appId: number) => void;
}

let configuredHost: ShortcutRuntimeHost | null = null;

export function configureShortcutRuntimeHost(host: ShortcutRuntimeHost): void {
	configuredHost = host;
}

export function shortcutRuntimeHost(): ShortcutRuntimeHost {
	if (!configuredHost) throw new Error('shortcut_runtime_host_not_configured');
	return configuredHost;
}

export function clearShortcutRuntimeHost(): void {
	configuredHost = null;
}
