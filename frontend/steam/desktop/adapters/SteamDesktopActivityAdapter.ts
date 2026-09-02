import type { CommunityContentItem } from '../../../domain/types';

export interface SteamDesktopActivityShape {
	strTitle: string;
	strImageUrl?: string;
	strAuthorName?: string;
	strAuthorAvatar?: string;
	strLinkUrl?: string;
	strType?: string;
}

export function toSteamDesktopActivity(item: CommunityContentItem): SteamDesktopActivityShape {
	return {
		strTitle: item.title || item.label || '',
		strImageUrl: item.image,
		strAuthorName: item.author_name,
		strAuthorAvatar: item.author_avatar,
		strLinkUrl: item.link,
		strType: item.type,
	};
}
