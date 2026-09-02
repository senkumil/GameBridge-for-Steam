import type { LocalAchievementItem } from '../../../domain/types';

/**
 * Prop shape expected by Steam Gamepad UI's native achievement components.
 * 
 * Evidence & Verification:
 * - strID: string (Required, VERIFIED - internal unique achievement key)
 * - strName: string (Required, VERIFIED - localized display title)
 * - strDescription: string (Optional, VERIFIED - localized description)
 * - bAchieved: boolean (Required, VERIFIED - true when unlocked)
 * - strImage: string (Required, VERIFIED - unlocked icon URL)
 * - strImageGray: string (Optional, VERIFIED - locked/grayscale icon URL)
 * - flAchievedDate: number (Optional, VERIFIED - unix timestamp of unlock)
 * - flRarity: number (Optional, VERIFIED - global percentage float 0-100)
 * - bHidden: boolean (Optional, VERIFIED - spoiler/mystery flag)
 */
export interface SteamNativeAchievementShape {
	strID: string;
	strName: string;
	strDescription: string;
	bAchieved: boolean;
	strImage: string;
	strImageGray: string;
	flAchievedDate?: number;
	flRarity?: number;
	bHidden: boolean;
	flCurrentProgress?: number;
	flMaxProgress?: number;
}

export interface SteamNativeAchievementComponentProps {
	achievement: SteamNativeAchievementShape;
	bFocusable?: boolean;
	onFocus?: () => void;
	onClick?: () => void;
}

export function toSteamAchievement(
	item: LocalAchievementItem,
	options?: { focusable?: boolean; onClick?: () => void },
): SteamNativeAchievementComponentProps {
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
		},
		bFocusable: options?.focusable ?? true,
		onClick: options?.onClick,
	};
}
