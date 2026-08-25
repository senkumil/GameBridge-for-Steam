import { injectAchievementStyle } from './inject';

export function ensureAchievementPlaybarStyles(doc: Document): void {
	injectAchievementStyle(doc, 'gdl-achievement-playbar-style', `
		.gdl-local-playbar { cursor:pointer;transition:filter .12s ease; }
		.gdl-local-playbar:hover { filter:brightness(1.08); }
		[data-gdl-playbar-achievements="1"] .gdl-lp-fill { background:#2d73ff !important; }
	`);
}
