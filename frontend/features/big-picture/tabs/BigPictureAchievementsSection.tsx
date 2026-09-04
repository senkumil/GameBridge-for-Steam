import React from 'react';
import type { LocalAchievementData, LocalAchievementItem } from '../../../domain/types';
import { gdlText, loc } from '../../../steam/localization';
import { compareEarnedAchievementsForDisplay, compareLockedAchievementsForDisplay, highlightedAchievementNames } from '../../achievements/rarity';
import { completionMedalSvg } from '../news-modal';

export interface BigPictureAchievementsSectionProps {
	data?: LocalAchievementData | null;
}

export const BigPictureAchievementsSection: React.FC<BigPictureAchievementsSectionProps> = ({ data }) => {
	const title = loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements'));

	if (!data) {
		return (
			<section className="gdl-bp-section">
				<h2 className="gdl-bp-section-title">{title}</h2>
				<div className="gdl-bp-empty">{loc('Loading', 'Loading…')}</div>
			</section>
		);
	}

	if (data.total <= 0) {
		return (
			<section className="gdl-bp-section">
				<h2 className="gdl-bp-section-title">{title}</h2>
				<div className="gdl-bp-empty">{gdlText('no_achievements', 'No achievements found.')}</div>
			</section>
		);
	}

	const pct = Math.max(0, Math.min(100, Math.round((data.unlocked * 100) / Math.max(1, data.total))));
	const complete = data.unlocked >= data.total;
	const earned = data.achievements.filter(item => item.earned).sort(compareEarnedAchievementsForDisplay);
	const locked = data.achievements.filter(item => !item.earned).sort(compareLockedAchievementsForDisplay);
	const ordered = [...earned, ...locked];
	const featured = ordered[0] || null;
	const strip = ordered.slice(0, 10);
	const highlightedNames = highlightedAchievementNames(earned);
	const isHighlighted = (item: LocalAchievementItem): boolean => item.earned && highlightedNames.has(String(item.name));

	const progressLabel = complete
		? gdlText('all_achievements_unlocked', 'You have unlocked all achievements! {unlocked}/{total}', { unlocked: data.unlocked, total: data.total })
		: loc('AppDetails_PlayerUnlockedPercent', 'Has desbloqueado %1$s/%2$s logros').replace('%1$s', String(data.unlocked)).replace('%2$s', String(data.total));

	return (
		<section className="gdl-bp-section">
			<h2 className="gdl-bp-section-title">{title}</h2>
			<div className="gdl-bp-achievements-shell">
				{/* Progress Header */}
				<div className="gdl-bp-ach-progress Focusable" tabIndex={0} role="button" data-focusable="true">
					{complete ? (
						<div className="gdl-bp-medal" dangerouslySetInnerHTML={{ __html: completionMedalSvg() }} />
					) : (
						<div />
					)}
					<div className="gdl-bp-ach-progress-copy">
						<div className="gdl-bp-ach-progress-label">
							<strong>{progressLabel}</strong> <span>({pct}%)</span>
						</div>
						<div className="gdl-bp-progress-track">
							<div className="gdl-bp-progress-fill" style={{ width: `${pct}%` }} />
						</div>
					</div>
				</div>

				{/* Achievement Strip & Preview */}
				<div className="gdl-bp-ach-strip">
					{featured ? (
						<div
							id="gdl-bp-ach-featured-preview"
							className={`gdl-bp-ach-featured Focusable${isHighlighted(featured) ? ' is-rare' : ''}`}
							tabIndex={0}
							role="button"
							data-focusable="true"
						>
							<div className={`gdl-bp-ach-img-frame${isHighlighted(featured) ? ' is-rare' : ''}`}>
								<div className="gdl-bp-ach-rare-glow" />
								<img className="gdl-bp-ach-img" src={featured.earned ? featured.icon : (featured.icon_gray || featured.icon)} alt="" />
							</div>
							<div className="gdl-bp-ach-featured-info">
								<strong className="gdl-bp-ach-featured-title">{featured.display_name || featured.name}</strong>
								<p className="gdl-bp-ach-featured-desc">{featured.description || ''}</p>
								<p className="gdl-bp-ach-featured-pct">
									{Number(featured.global_percent || 0).toFixed(1)}% {gdlText('players_have_achievement', 'de los jugadores tienen este logro')}
								</p>
							</div>
						</div>
					) : (
						<div />
					)}

					<div id="gdl-bp-native-achievement-mount" className="gdl-bp-native-achievement-mount" />

					<div className="gdl-bp-ach-icons">
						{strip.map(item => (
							<div
								key={item.name}
								className={`gdl-bp-ach-icon-frame Focusable${isHighlighted(item) ? ' is-rare' : ''}`}
								tabIndex={0}
								role="button"
								data-focusable="true"
								data-ach-title={item.display_name || item.name}
								data-ach-desc={item.description || ''}
								data-ach-pct={Number(item.global_percent || 0).toFixed(1)}
								data-ach-img={item.earned ? item.icon : (item.icon_gray || item.icon)}
								title={item.display_name || item.name}
							>
								<div className="gdl-bp-ach-rare-glow" />
								<img
									className={`gdl-bp-ach-icon${!item.earned ? ' is-locked' : ''}`}
									src={item.earned ? item.icon : (item.icon_gray || item.icon)}
									alt=""
								/>
							</div>
						))}
					</div>
				</div>

				{/* Prompt bar */}
				<div className="gdl-bp-ach-footer-prompt-bar">
					<div className="gdl-bp-footer-prompt gdl-bp-open-ach-trigger Focusable" tabIndex={0} role="button" data-focusable="true">
						<span className="gdl-bp-key-badge">A</span>
						<span>{loc('AppDetails_ViewAllAchievements', 'VER TODOS MIS LOGROS').toUpperCase()}</span>
					</div>
				</div>
			</div>
		</section>
	);
};
