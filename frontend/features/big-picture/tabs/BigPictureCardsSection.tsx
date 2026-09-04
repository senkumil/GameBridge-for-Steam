import React from 'react';
import type { SteamCommunityItemsCatalog } from '../../../domain/types';
import { gdlText, loc } from '../../../steam/localization';

export interface BigPictureCardsSectionProps {
	catalog?: SteamCommunityItemsCatalog | null;
}

export const BigPictureCardsSection: React.FC<BigPictureCardsSectionProps> = ({ catalog }) => {
	if (!catalog?.cards?.length) return null;
	const badge = catalog.foil_badge || catalog.badges?.[0] || null;
	const cards = catalog.cards || [];
	const unlockedCount = Math.min(cards.length, Math.max(1, Math.ceil(cards.length * 0.55)));
	const unlockedCards = cards.slice(0, unlockedCount);
	const lockedCards = cards.slice(unlockedCount);

	return (
		<section className="gdl-bp-section">
			<h2 className="gdl-bp-section-title">{loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Tarjetas'))}</h2>
			<div className="gdl-bp-cards-shell">
				{/* Badge row */}
				<div className="gdl-bp-badge-row">
					{badge?.image ? (
						<img className="gdl-bp-badge-img" src={badge.image} alt="" />
					) : (
						<div className="gdl-bp-badge-img" />
					)}
					<div className="gdl-bp-badge-copy">
						<strong>{badge?.title || gdlText('trading_cards', 'Trading Cards')}</strong>
						<br />
						<span>{String((badge?.level || 1) * 100)} EXP</span>
					</div>
				</div>

				{/* Unlocked cards */}
				<div className="gdl-bp-card-row">
					{unlockedCards.map((card, idx) => (
						<div
							key={card.title || `card-unlocked-${idx}`}
							className="gdl-bp-card-item Focusable"
							tabIndex={0}
							role="button"
							data-focusable="true"
							data-gdl-card-idx={idx}
							title={card.title || ''}
						>
							<img src={card.image} alt={card.title || ''} />
						</div>
					))}
				</div>

				{/* Locked cards */}
				{lockedCards.length > 0 ? (
					<>
						<div className="gdl-bp-card-count">
							{lockedCards.length} {loc('AppDetails_CardsToCollect', 'TARJETAS POR COLECCIONAR').toUpperCase()}
						</div>
						<div className="gdl-bp-card-row gdl-bp-card-row-locked">
							{lockedCards.map((card, idx) => (
								<div
									key={card.title || `card-locked-${idx}`}
									className="gdl-bp-card-item is-locked Focusable"
									tabIndex={0}
									role="button"
									data-focusable="true"
									data-gdl-card-idx={unlockedCount + idx}
									title={card.title || ''}
								>
									<img src={card.image} alt={card.title || ''} />
								</div>
							))}
						</div>
					</>
				) : null}
			</div>
		</section>
	);
};
