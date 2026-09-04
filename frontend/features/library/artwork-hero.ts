export type HeroVariant = 'base' | '2x' | 'legacy' | 'community' | 'user' | 'fallback';

export type HeroSelectionReason =
	| 'user_choice'
	| 'base_valid'
	| 'base_missing'
	| 'base_invalid'
	| 'legacy'
	| 'community'
	| 'degraded';

export interface HeroCandidateOptions {
	steamAppId: string;
	modern?: {
		hero?: string;
		hero2x?: string;
		legacy_header?: string;
	} | null;
	communityHero?: string;
	userHero?: string;
}

export interface HeroProvenanceData {
	url: string;
	provider: 'steam' | 'steam-legacy' | 'steamgriddb' | 'user' | 'fallback';
	variant: HeroVariant;
	selectionReason: HeroSelectionReason;
	heroPolicyVersion: number;
	width?: number;
	height?: number;
}

/** Check if a URL points to the high-DPI 2X hero variant. */
export function isHero2xUrl(url: string, modern?: { hero2x?: string } | null): boolean {
	if (!url) return false;
	if (modern?.hero2x && url === modern.hero2x) return true;
	return /\/library_hero_2x(?:_[a-z]+)?\.jpg(?:$|[?#])/i.test(url)
		|| (/\/library_hero/i.test(url) && /_2x\.jpg(?:$|[?#])/i.test(url));
}

/** Check if a URL points to the canonical Base hero variant. */
export function isHeroBaseUrl(url: string, modern?: { hero?: string; hero2x?: string } | null): boolean {
	if (!url) return false;
	if (isHero2xUrl(url, modern)) return false;
	if (modern?.hero && url === modern.hero) return true;
	return /\/library_hero(?:_[a-z]+)?\.jpg(?:$|[?#])/i.test(url);
}

/**
 * Builds the canonical deterministic candidate URL list for the Hero slot.
 * Priority:
 * 1. User explicit choice (if any)
 * 2. Official Steam Base Hero from metadata (modern.hero)
 * 3. Official Steam Base Hero direct CDN probes (library_hero.jpg across Steam CDNs)
 * 4. Official Steam 2X Hero from metadata (modern.hero2x)
 * 5. Official Steam 2X Hero direct CDN probes (library_hero_2x.jpg across Steam CDNs)
 * 6. Steam Legacy Hero (store header / legacy fallback)
 * 7. Community Hero (SteamGridDB)
 */
export function buildHeroCandidateUrls(options: HeroCandidateOptions): string[] {
	const { steamAppId, modern, communityHero, userHero } = options;
	const sharedBase = `https://shared.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
	const fastlyBase = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
	const cfBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${steamAppId}`;
	const cfCdnBase = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}`;
	const cdnBase = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}`;

	const candidates: (string | undefined)[] = [
		// 1. Explicit user selection (always highest priority if chosen)
		userHero,
		// 2. Official Steam Base Hero from metadata
		modern?.hero,
		// 3. Official Steam Base Hero direct CDN probes (Base First!)
		`${sharedBase}/library_hero.jpg`,
		`${fastlyBase}/library_hero.jpg`,
		`${cfBase}/library_hero.jpg`,
		`${cfCdnBase}/library_hero.jpg`,
		`${cdnBase}/library_hero.jpg`,
		// 4. Official Steam 2X Hero from metadata (Fallback only!)
		modern?.hero2x,
		// 5. Official Steam 2X Hero direct CDN probes (2X Fallback)
		`${sharedBase}/library_hero_2x.jpg`,
		`${fastlyBase}/library_hero_2x.jpg`,
		`${cfBase}/library_hero_2x.jpg`,
		`${cfCdnBase}/library_hero_2x.jpg`,
		`${cdnBase}/library_hero_2x.jpg`,
		// 6. Steam Legacy Hero (store header / legacy fallback)
		modern?.legacy_header,
		// 7. Community Hero (SteamGridDB)
		communityHero,
	];

	return Array.from(new Set(candidates.filter((u): u is string => Boolean(u))));
}

/**
 * Classifies a resolved Hero URL into its canonical variant.
 */
export function classifyHeroVariant(
	url: string,
	modern?: { hero?: string; hero2x?: string; legacy_header?: string } | null,
	isUser = false,
): HeroVariant {
	if (!url) return 'fallback';
	if (isUser) return 'user';
	if (isHeroBaseUrl(url, modern)) return 'base';
	if (isHero2xUrl(url, modern)) return '2x';
	if (modern?.legacy_header && url === modern.legacy_header) return 'legacy';
	if (/\/header\.jpg(?:$|[?#])/i.test(url)) return 'legacy';
	if (/steamgriddb\.com/i.test(url)) return 'community';
	return 'fallback';
}

/**
 * Determines the structured selection reason for provenance and diagnostics.
 */
export function determineHeroSelectionReason(
	variant: HeroVariant,
	baseCandidateResult?: { status: 'missing' | 'invalid' | 'corrupt' | 'network_error' } | null,
): HeroSelectionReason {
	if (variant === 'user') return 'user_choice';
	if (variant === 'base') return 'base_valid';
	if (variant === '2x') {
		if (baseCandidateResult?.status === 'invalid') return 'base_invalid';
		return 'base_missing';
	}
	if (variant === 'legacy') return 'legacy';
	if (variant === 'community') return 'community';
	return 'degraded';
}

/**
 * Emits structured diagnostics with prefix [NGL][HeroResolver].
 */
export function logHeroResolutionDiagnostics(
	appId: string | number,
	result: {
		selectedUrl?: string;
		variant: HeroVariant;
		reason: HeroSelectionReason;
		width?: number;
		height?: number;
	},
	logger?: (msg: string) => void,
): void {
	const log = logger || ((typeof window !== 'undefined' && (window as any)?.backendLog) ? (window as any).backendLog : console.log);
	log(
		`[NGL][HeroResolver] AppID=${appId} variant=${result.variant} reason=${result.reason} ` +
		`url=${result.selectedUrl || 'none'} dimensions=${result.width || 0}x${result.height || 0}`,
	);
}
