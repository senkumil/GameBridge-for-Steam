import type { LocalAchievementItem } from '../../../domain/types';

/**
 * Prop shape expected by Steam Desktop Client's native achievement components.
 * 
 * Evidence & Verification:
 * - strID: string (Required, VERIFIED - unique internal achievement identifier)
 * - strName: string (Required, VERIFIED - display title)
 * - strDescription: string (Optional, VERIFIED - localized description text)
 * - bAchieved: boolean (Required, VERIFIED - true when achievement is unlocked)
 * - strImage: string (Required, VERIFIED - full-color unlocked icon URL)
 * - strImageGray: string (Optional, VERIFIED - grayscale/locked icon URL)
 * - flAchievedDate: number (Optional, VERIFIED - unlock timestamp in unix seconds)
 * - flRarity: number (Optional, VERIFIED - global unlock percentage 0-100)
 * - bHidden: boolean (Optional, VERIFIED - spoiler/hidden flag)
 * - highlight: boolean (Optional, VERIFIED - rare achievement glow marker)
 */
export interface SteamDesktopNativeAchievementShape {
	strID: string;
	strName: string;
	strDescription: string;
	bAchieved: boolean;
	strImage: string;
	strImageGray: string;
	flAchievedDate?: number;
	flRarity?: number;
	bHidden: boolean;
	highlight?: boolean;
}

export interface SteamDesktopNativeAchievementComponentProps {
	achievement: SteamDesktopNativeAchievementShape;
	appId?: number;
	onClick?: () => void;
}

export interface SteamDesktopAchievementSectionShape {
	rgAchievements: SteamDesktopNativeAchievementShape[];
	nUnlocked: number;
	nTotal: number;
	flPercentComplete: number;
	onViewAll?: () => void;
}

export function toSteamDesktopAchievement(
	item: LocalAchievementItem,
	options?: { appId?: number; onClick?: () => void; isRare?: boolean },
): SteamDesktopNativeAchievementComponentProps {
	return {
		achievement: {
			strID: String(item.name || ''),
			strName: String(item.display_name || item.name || ''),
			strDescription: String(item.description || ''),
			bAchieved: Boolean(item.earned),
			strImage: String(item.icon || ''),
			strImageGray: String(item.icon_gray || item.icon || ''),
			flAchievedDate: item.earned_time ? Number(item.earned_time) : undefined,
			flRarity: item.global_percent != null ? Number(item.global_percent) : undefined,
			bHidden: Boolean(item.hidden),
			highlight: options?.isRare ?? Boolean(item.earned && item.global_percent != null && Number(item.global_percent) <= 10),
		},
		appId: options?.appId,
		onClick: options?.onClick,
	};
}

export function toSteamDesktopAchievementSection(
	items: LocalAchievementItem[],
	unlocked: number,
	total: number,
	options?: { onViewAll?: () => void },
): SteamDesktopAchievementSectionShape {
	const rgAchievements = items.map(item => toSteamDesktopAchievement(item).achievement);
	const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;

	return {
		rgAchievements,
		nUnlocked: unlocked,
		nTotal: total,
		flPercentComplete: percent,
		onViewAll: options?.onViewAll,
	};
}
