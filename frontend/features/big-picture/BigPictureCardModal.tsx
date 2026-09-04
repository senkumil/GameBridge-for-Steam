import React, { useEffect, useState } from 'react';
import { loc } from '../../steam/localization';

function playSound(soundId: number): void {
	try {
		const win = typeof window !== 'undefined' ? (window as any) : null;
		const steamClient = win?.SteamClient;
		if (typeof steamClient?.Sounds?.PlaySoundEffect === 'function') {
			steamClient.Sounds.PlaySoundEffect(soundId);
		} else if (typeof steamClient?.Sounds?.PlaySound === 'function') {
			steamClient.Sounds.PlaySound(soundId);
		}
	} catch {}
}

export interface BigPictureCardModalInfo {
	title: string;
	image: string;
	artwork?: string;
	foil?: boolean;
	badgeTitle?: string;
	gameName?: string;
}

export interface BigPictureCardModalProps {
	card: BigPictureCardModalInfo;
	onClose: () => void;
}

export const BigPictureCardModal: React.FC<BigPictureCardModalProps> = ({
	card,
	onClose,
}) => {
	const [imgSrc, setImgSrc] = useState(card.artwork || card.image);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Backspace' || e.keyCode === 27) {
				e.preventDefault();
				e.stopPropagation();
				playSound(4);
				onClose();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
		};
	}, [onClose]);

	return (
		<div
			className="gdl-bp-fullscreen-card-modal gdl-bp-fadein Focusable"
			role="dialog"
			aria-modal="true"
			tabIndex={0}
			data-focusable="true"
			style={{
				position: 'fixed',
				inset: 0,
				width: '100vw',
				height: '100vh',
				zIndex: 999999,
				background: 'var(--gp-card-modal-bg, radial-gradient(circle at center, rgba(30, 36, 46, 0.98) 0%, rgba(12, 15, 20, 0.99) 100%))',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				boxSizing: 'border-box',
				fontFamily: '"Motiva Sans", Arial, Helvetica, sans-serif',
			}}
			onClick={e => {
				if (e.target === e.currentTarget) {
					playSound(4);
					onClose();
				}
			}}
		>
			<div
				className="gdl-bp-fullscreen-card-inner"
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					textAlign: 'center',
					gap: '20px',
					maxWidth: '90vw',
				}}
			>
				<div
					className={`gdl-bp-fullscreen-card-art-container${card.foil ? ' is-foil' : ''}`}
					style={{ position: 'relative' }}
				>
					<img
						className="gdl-bp-fullscreen-card-img"
						src={imgSrc}
						alt={card.title}
						onError={() => {
							if (card.image && imgSrc !== card.image) {
								setImgSrc(card.image);
							}
						}}
						style={{
							maxHeight: '60vh',
							maxWidth: '80vw',
							width: 'auto',
							objectFit: 'contain',
							filter: 'drop-shadow(0 20px 50px rgba(0, 0, 0, 0.9))',
							borderRadius: 'var(--gp-card-border-radius, 6px)',
						}}
					/>
				</div>
				<div
					className="gdl-bp-fullscreen-card-details"
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: '6px',
					}}
				>
					<div
						style={{
							fontSize: '13px',
							fontWeight: 700,
							letterSpacing: '1px',
							color: 'var(--gp-text-color-secondary, #8f98a0)',
							textTransform: 'uppercase',
						}}
					>
						{card.foil ? (loc('AppDetails_FoilTradingCard', 'CROMO REFLECTANTE') || 'CROMO REFLECTANTE').toUpperCase() : (loc('AppDetails_TradingCard', 'CROMO DE STEAM') || 'CROMO DE STEAM').toUpperCase()}
					</div>
					<h1
						style={{
							fontSize: '32px',
							fontWeight: 800,
							color: 'var(--gp-text-color-primary, #ffffff)',
							margin: 0,
						}}
					>
						{card.title}
					</h1>
					{card.gameName && (
						<div style={{ fontSize: '15px', color: 'var(--gp-text-color-secondary, #8f98a0)' }}>{card.gameName}</div>
					)}
					{card.badgeTitle && (
						<div style={{ fontSize: '15px', color: 'var(--gp-text-color-dim, #b8bcbf)', marginTop: '2px' }}>{card.badgeTitle}</div>
					)}
				</div>
				<div style={{ marginTop: '14px' }}>
					<button
						className="gdl-bp-news-modal-action-btn gdl-bp-fullscreen-card-close-btn Focusable"
						type="button"
						tabIndex={0}
						data-focusable="true"
						onClick={() => {
							playSound(4);
							onClose();
						}}
						style={{
							padding: '8px 24px',
							borderRadius: 'var(--gp-button-border-radius, 4px)',
							background: 'var(--gp-button-bg, #3d4450)',
							color: 'var(--gp-text-color-primary, #ffffff)',
							fontSize: '14px',
							fontWeight: 600,
							border: '1px solid transparent',
							cursor: 'pointer',
							display: 'inline-flex',
							alignItems: 'center',
							gap: '8px',
						}}
					>
						Ⓑ {loc('Button_Back', 'VOLVER')}
					</button>
				</div>
			</div>
		</div>
	);
};
