import { ensureAchievementSidebarStyles } from './styles/sidebar';
import { ensureAchievementModalStyles } from './styles/modal';
import { ensureAchievementPlaybarStyles } from './styles/playbar';

export function ensureLocalAchievementStyles(doc: Document): void {
	ensureAchievementSidebarStyles(doc);
	ensureAchievementModalStyles(doc);
	ensureAchievementPlaybarStyles(doc);
}
