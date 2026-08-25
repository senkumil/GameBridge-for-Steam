export interface AchievementRuntimeHost {
	getCurrentInjectedAppId: () => string | null;
	getCurrentInjectedShortcutAppId: () => string | null;
	findNonSteamNotice: (doc: Document) => { title: string } | null;
	findActiveShortcutAppId: (doc: Document, title: string) => string | null;
}

let configuredAchievementRuntimeHost: AchievementRuntimeHost | null = null;

export function configureAchievementRuntimeHost(host: AchievementRuntimeHost): void {
	configuredAchievementRuntimeHost = host;
}

export function achievementRuntimeHost(): AchievementRuntimeHost {
	if (!configuredAchievementRuntimeHost) throw new Error('achievement_runtime_host_not_configured');
	return configuredAchievementRuntimeHost;
}

export function clearAchievementRuntimeHost(): void {
	configuredAchievementRuntimeHost = null;
}
