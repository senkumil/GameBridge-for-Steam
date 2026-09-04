import React from 'react';

export interface BigPicturePlaybarStatsProps {
	lastSessionText?: string;
	lastSessionLabel?: string;
	playtimeText?: string;
	playtimeLabel?: string;
	hasConnectedController?: boolean;
	controllerLabel?: string;
	controllerImageUri?: string;
	achievements?: { unlocked: number; total: number } | null;
	achievementsLabel?: string;
}

export const BigPicturePlaybarStats: React.FC<BigPicturePlaybarStatsProps> = ({
	lastSessionText,
	lastSessionLabel,
	playtimeText,
	playtimeLabel,
	hasConnectedController,
	controllerLabel,
	controllerImageUri,
	achievements,
	achievementsLabel,
}) => {
	const pct = achievements && achievements.total > 0
		? Math.max(0, Math.min(100, Math.round((achievements.unlocked * 100) / achievements.total)))
		: 0;

	return (
		<div id="gdl-bp-playbar-stats-group" style={{ display: 'contents' }}>
			{lastSessionText && (
				<div id="gdl-bp-stat-last-session" className="gdl-bp-playbar-stat">
					<div className="gdl-bp-stat-label">{lastSessionLabel}</div>
					<div className="gdl-bp-stat-value">{lastSessionText}</div>
				</div>
			)}
			{playtimeText && (
				<div id="gdl-bp-stat-playtime" className="gdl-bp-playbar-stat">
					<div className="gdl-bp-stat-label">{playtimeLabel}</div>
					<div className="gdl-bp-stat-value">{playtimeText}</div>
				</div>
			)}
			{hasConnectedController && controllerImageUri && (
				<div id="gdl-bp-stat-control" className="gdl-bp-playbar-stat">
					<div className="gdl-bp-stat-label">{controllerLabel}</div>
					<div className="gdl-bp-stat-value gdl-bp-ctrl-icons">
						<img className="gdl-bp-ctrl-img" src={controllerImageUri} alt="Control" />
					</div>
				</div>
			)}
			{achievements && achievements.total > 0 && (
				<div id="gdl-bp-stat-achievements" className="gdl-bp-playbar-stat">
					<div className="gdl-bp-stat-label">{achievementsLabel}</div>
					<div className="gdl-bp-stat-value gdl-bp-ach-value">
						<span>{achievements.unlocked}/{achievements.total}</span>
						<div className="gdl-bp-stat-progress-track">
							<div
								className="gdl-bp-stat-progress-fill"
								style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
