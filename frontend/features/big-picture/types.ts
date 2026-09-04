import type {
	CommunityContentItem,
	FriendCategories,
	LocalAchievementData,
	NewsItem,
	SteamCommunityItemsCatalog,
	SteamGameData,
} from '../../domain/types';

export type MappedShortcut = { id: number; title: string; steamAppId: string };
export type BigPictureTab = 'activity' | 'stuff' | 'community' | 'info';

export interface BigPictureDetailData {
	game: SteamGameData | null;
	achievements: LocalAchievementData | null;
	news: NewsItem[];
	community: CommunityContentItem[];
	cards: SteamCommunityItemsCatalog | null;
	friends: FriendCategories | null;
}
