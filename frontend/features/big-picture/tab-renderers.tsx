import React from 'react';
import type { CommunityContentItem, FriendCategories, LocalAchievementData, NewsItem, SteamCommunityItemsCatalog, SteamGameData } from '../../domain/types';
import { renderJsxToHtml } from './jsx-serializer';
import { BigPictureActivityTab } from './tabs/BigPictureActivityTab';
import { BigPictureAchievementsSection } from './tabs/BigPictureAchievementsSection';
import { BigPictureCardsSection } from './tabs/BigPictureCardsSection';
import { BigPictureMediaNotesSection } from './tabs/BigPictureMediaNotesSection';
import { BigPictureCommunityTab, fallbackCommunity } from './tabs/BigPictureCommunityTab';
import { BigPictureInfoTab } from './tabs/BigPictureInfoTab';

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

export { fallbackCommunity };

export function renderActivity(data: BigPictureDetailData, shortcut: MappedShortcut, hydrationStarted = false): string {
	return renderJsxToHtml(
		<BigPictureActivityTab
			shortcut={shortcut}
			data={data}
			hydrationStarted={hydrationStarted}
		/>
	);
}

export function renderAchievements(data: LocalAchievementData | null): string {
	return renderJsxToHtml(
		<BigPictureAchievementsSection data={data} />
	);
}

export function renderCards(catalog: SteamCommunityItemsCatalog | null): string {
	return renderJsxToHtml(
		<BigPictureCardsSection catalog={catalog} />
	);
}

export function renderMediaAndNotes(): string {
	return renderJsxToHtml(
		<BigPictureMediaNotesSection />
	);
}

export function renderStuff(data: BigPictureDetailData): string {
	return `${renderAchievements(data.achievements)}${renderCards(data.cards)}${renderMediaAndNotes()}`;
}

export function renderCommunity(data: BigPictureDetailData): string {
	return renderJsxToHtml(
		<BigPictureCommunityTab data={data} />
	);
}

export function renderInfo(data: BigPictureDetailData, shortcut: MappedShortcut): string {
	return renderJsxToHtml(
		<BigPictureInfoTab shortcut={shortcut} data={data} />
	);
}
