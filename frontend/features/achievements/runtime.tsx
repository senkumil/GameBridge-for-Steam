/**
 * Public achievements facade.
 *
 * Keep consumers depending on this stable surface while implementation details
 * live in focused modules. This file intentionally contains no rendering logic.
 */
export type { AchievementRuntimeHost } from './context';
export { configureAchievementRuntimeHost } from './context';
export type { AchievementProgress } from './progress';
export { achievementPercentText, getAchievementProgress, renderAchievementsPanel } from './progress';
export { deterministicTestUnlockCount, formatLocalUnlockDate, localAchievementPercent } from './format';
export { makeLinkedAchievementsClickable, focusAchievementsSection, detectLinkedSteamAppId } from './navigation';
export { registerNativeAchievementToastWindow, showAchievementToast } from './notifications';
export { renderLocalAchievementSidebarHtml, renderLocalAchievementSidebar } from './sidebar';
export { findVisibleTextElement, ensureLocalPlaybarStat } from './playbar';
export { openLocalAchievementsModal } from './modal';
export { getCachedLocalAchievements, hasCachedLocalAchievements, cacheLocalAchievements, clearLocalAchievementCache } from './cache';
export { installLocalAchievementUI, disposeLocalAchievementUI, disposeAchievementRuntime } from './lifecycle';
