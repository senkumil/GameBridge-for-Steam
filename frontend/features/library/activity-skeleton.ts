import { escapeHtml } from '../../core/text';

/** A stable approximation of Steam's activity feed. It is shared by the early
 * linked-route loading stage and the later news/social refresh, so neither
 * transition falls back to large anonymous rectangles. */
export function renderActivityFeedSkeletonHtml(activityLabel: string): string {
	return `<div class="gdl-feed-skeleton" data-gdl-feed-pending="1" aria-busy="true" aria-label="${escapeHtml(activityLabel)}">
		<div class="gdl-feed-skeleton-date" aria-hidden="true">
			<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-date-label"></div>
			<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-date-rule"></div>
		</div>
		<div class="gdl-feed-skeleton-card" aria-hidden="true">
			<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-image"></div>
			<div class="gdl-feed-skeleton-copy">
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-type"></div>
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-title"></div>
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-line is-long"></div>
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-line is-medium"></div>
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-line is-short"></div>
			</div>
		</div>
		<div class="gdl-feed-skeleton-card is-compact" aria-hidden="true">
			<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-patch-icon"></div>
			<div class="gdl-feed-skeleton-copy">
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-type"></div>
				<div class="gdl-feed-skeleton-shape gdl-feed-skeleton-title is-compact"></div>
			</div>
		</div>
	</div>`;
}
