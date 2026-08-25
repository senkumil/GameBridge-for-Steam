export interface Mappings { [gameTitle: string]: string }

export interface GameDataCache { [steamAppId: string]: SteamGameData | null }

export interface FriendPersona {
	steamid: string;
	name: string;
	avatar: string;
}

export interface FriendPlayInfo {
	steamid: string;
	minutes_played: number;
	minutes_played_recently: number;
}

export interface FriendCategories {
	recentlyPlayed: FriendPlayInfo[];
	previouslyPlayed: FriendPlayInfo[];
	totalCount: number;
}

export interface CommunityContentItem {
	type: string;
	label?: string;
	image: string;
	title?: string;
	description?: string;
	author_name?: string;
	author_avatar?: string;
	link?: string;
}

export interface SteamCommunityCardAsset {
	title: string;
	image: string;
	artwork?: string;
}

export interface SteamCommunityBadgeAsset {
	title: string;
	image: string;
	foil?: boolean;
	level?: number;
}

export interface SteamCommunityItemsCatalog {
	appid?: number;
	cards: SteamCommunityCardAsset[];
	badges?: SteamCommunityBadgeAsset[];
	foil_badge?: SteamCommunityBadgeAsset | null;
	source?: string;
	error?: string;
}

export interface SteamGameData {
	type?: string;
	name: string;
	steam_appid: number;
	header_image: string;
	short_description: string;
	detailed_description?: string;
	about_the_game?: string;
	developers?: string[];
	publishers?: string[];
	franchises?: string[];
	genres?: { id: string; description: string }[];
	release_date?: { coming_soon: boolean; date: string };
	metacritic?: { score: number; url: string };
	categories?: { id: number; description: string }[];
	dlc?: number[];
	screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
	background?: string;
	background_raw?: string;
	capsule_image?: string;
	capsule_imagev5?: string;
	website?: string;
	movies?: { id: number; name: string; thumbnail: string }[];
	achievements?: { total: number; highlighted?: { name: string; path: string }[] };
	controller_support?: string;
	platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
}

export interface ShortcutDetectionCandidate {
	appid: string;
	name: string;
	image?: string;
	score: number;
	confidence: 'exact' | 'high' | 'medium' | 'low';
	reasons?: string[];
	executable_match?: boolean;
	direct?: boolean;
}

export interface ShortcutDetectionResult {
	candidates: ShortcutDetectionCandidate[];
	launcher_detected?: boolean;
	generic_launcher?: boolean;
	executable?: string;
	source?: string;
	error?: string;
}

export interface ShortcutDetectionContext {
	shortcutAppId: number;
	title: string;
	exePath: string;
	startDir: string;
	launchOptions: string;
	bootstrapDetected?: boolean;
	recommendedExePath?: string;
	recommendedStartDir?: string;
}

export interface ShortcutLinkResult {
	ok: boolean;
	data?: SteamGameData;
	shortcutAppId?: number | null;
	aliases?: string[];
	error?: string;
}

export interface AchievementBasePathResponse {
	ok?: boolean;
	path?: string;
	exists?: boolean;
	configured?: boolean;
	error?: string;
}

export interface NewsItem {
	gid: string;
	title: string;
	url: string;
	contents: string;
	date: number;
	feedlabel?: string;
	feed_type?: number;
	event_type?: number;
	image?: string;
}

export interface LocalAchievementItem {
	name: string;
	display_name: string;
	description: string;
	icon: string;
	icon_gray: string;
	hidden: boolean;
	global_percent: number;
	earned: boolean;
	earned_time: number;
	progress: number;
	max_progress: number;
}

export interface LocalAchievementData {
	found: boolean;
	appid: string;
	metadata_appid?: string;
	state_appid?: string;
	root?: string;
	path?: string;
	metadata_source?: string;
	unlocked: number;
	total: number;
	achievements: LocalAchievementItem[];
}

export type NativeGameFeatureKind =
	| 'single-player' | 'multiplayer' | 'coop' | 'achievements' | 'cloud'
	| 'controller-full' | 'controller-partial' | 'workshop' | 'remote-play'
	| 'family-sharing' | 'ps4' | 'ps5' | 'steam-input' | 'hdr' | 'vr' | 'generic';

export interface NativeGameFeature {
	key: string;
	label: string;
	kind: NativeGameFeatureKind;
	categoryId?: number;
}

export interface NativeGameInfo {
	key: string;
	title: string;
	portrait: string;
	description: string;
	developer: string;
	publisher: string;
	franchise: string;
	release: string;
	features: NativeGameFeature[];
	hasCloud: boolean;
}
