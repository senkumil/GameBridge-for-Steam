export interface SocialRuntimeHost {
	getCurrentInjectedAppId: () => string | null;
	getCurrentInjectedShortcutAppId: () => string | null;
}

let configuredSocialRuntimeHost: SocialRuntimeHost | null = null;

export function configureSocialRuntimeHost(host: SocialRuntimeHost): void {
	configuredSocialRuntimeHost = host;
}

export function socialRuntimeHost(): SocialRuntimeHost {
	if (!configuredSocialRuntimeHost) throw new Error('social_runtime_host_not_configured');
	return configuredSocialRuntimeHost;
}

export function clearSocialRuntimeHost(): void {
	configuredSocialRuntimeHost = null;
}
