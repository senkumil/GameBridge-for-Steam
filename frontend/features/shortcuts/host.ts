export interface ShortcutRuntimeHost {
	getMainWindowDoc: () => Document | null;
	refreshLibraryArtwork?: (appId: number) => void;
	resetLibraryInjection?: (reinject?: boolean, targetDoc?: Document | null) => void;
	findNonSteamNotice: (doc: Document) => { title: string } | null;
	isLibraryActive?: (doc?: Document | null) => boolean;
	runPendingLinkJobs?: () => void;
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
