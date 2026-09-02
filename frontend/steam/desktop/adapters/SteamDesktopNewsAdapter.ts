import type { NewsItem } from '../../../domain/types';

export interface SteamDesktopNewsShape {
	strTitle: string;
	strUrl: string;
	strAuthor: string;
	strContents: string;
	rtDate: number;
}

export function toSteamDesktopNews(item: NewsItem): SteamDesktopNewsShape {
	return {
		strTitle: item.title,
		strUrl: item.url,
		strAuthor: item.feedlabel || '',
		strContents: item.contents,
		rtDate: item.date,
	};
}
