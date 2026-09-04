import React from 'react';
import type { LocalAchievementData, SteamCommunityItemsCatalog } from '../../../domain/types';
import { BigPictureAchievementsSection } from './BigPictureAchievementsSection';
import { BigPictureCardsSection } from './BigPictureCardsSection';
import { BigPictureMediaNotesSection } from './BigPictureMediaNotesSection';

export interface BigPictureStuffTabProps {
	data: {
		achievements: LocalAchievementData | null;
		cards: SteamCommunityItemsCatalog | null;
	};
}

export const BigPictureStuffTab: React.FC<BigPictureStuffTabProps> = ({ data }) => {
	return (
		<>
			<BigPictureAchievementsSection data={data.achievements} />
			<BigPictureCardsSection catalog={data.cards} />
			<BigPictureMediaNotesSection />
		</>
	);
};
