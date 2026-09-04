import React, { useEffect } from 'react';
import type { CommunityContentItem } from '../../domain/types';
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

export function extractYoutubeId(urlOrId: string): string {
	if (!urlOrId) return '';
	if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
	const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
	return match ? match[1] : '';
}

export interface BigPictureCommunityModalProps {
	item: CommunityContentItem;
	gameName?: string;
	onClose: () => void;
}

export const BigPictureCommunityModal: React.FC<BigPictureCommunityModalProps> = ({
	item,
	gameName = '',
	onClose,
}) => {
	const ytId = item.youtube_id || extractYoutubeId(item.link || '') || extractYoutubeId(item.image || '');
	const isVideo = item.type === 'video' || Boolean(ytId);

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
			className="gdl-bp-news-modal-overlay gdl-bp-fadein"
			role="dialog"
			aria-modal="true"
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 10000,
				background: 'var(--gp-modal-overlay, rgba(0, 0, 0, 0.78))',
				backdropFilter: 'blur(8px)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: '24px',
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
				className={`gdl-bp-news-modal-window gdl-bp-community-modal-window${isVideo ? ' is-video-modal' : ''}`}
				style={{
					position: 'relative',
					width: '100%',
					maxWidth: isVideo ? '960px' : '860px',
					maxHeight: '88vh',
					background: 'var(--gp-color-card, #181d24)',
					borderRadius: 'var(--gp-dialog-border-radius, 8px)',
					boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px var(--gp-border-color, rgba(255, 255, 255, 0.1))',
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					color: 'var(--gp-text-color-primary, #e7e8ea)',
				}}
			>
				<button
					className="gdl-bp-news-modal-close Focusable"
					onClick={() => {
						playSound(4);
						onClose();
					}}
					type="button"
					style={{
						position: 'absolute',
						top: '14px',
						right: '14px',
						width: '36px',
						height: '36px',
						borderRadius: '50%',
						background: 'var(--gp-close-btn-bg, rgba(0, 0, 0, 0.5))',
						border: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.15))',
						color: 'var(--gp-text-color-primary, #ffffff)',
						fontSize: '16px',
						fontWeight: 'bold',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						zIndex: 10,
					}}
				>
					✕
				</button>
				{isVideo && ytId ? (
					<div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000000' }}>
						<iframe
							src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?autoplay=1&enablejsapi=1`}
							allow="autoplay; encrypted-media; fullscreen"
							allowFullScreen
							style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
						/>
					</div>
				) : (
					<div style={{ width: '100%', maxHeight: '520px', background: 'var(--gp-media-box-bg, #0d1015)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
						<img src={item.image} alt={item.title || ''} style={{ maxWidth: '100%', maxHeight: '520px', objectFit: 'contain', display: 'block' }} />
					</div>
				)}
				<div style={{ padding: '20px 28px' }}>
					{gameName && (
						<div style={{ fontSize: '13px', color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '8px' }}>
							{gameName}
						</div>
					)}
					<h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gp-text-color-primary, #ffffff)', margin: '0 0 10px' }}>
						{item.title || item.label || ''}
					</h1>
					{item.author_name && (
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--gp-text-color-secondary, #8f98a0)' }}>
							{item.author_avatar && (
								<img src={item.author_avatar} alt="" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
							)}
							<span>{item.author_name}</span>
						</div>
					)}
				</div>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						gap: '12px',
						padding: '14px 28px',
						background: 'var(--gp-dialog-footer-bg, rgba(0, 0, 0, 0.35))',
						borderTop: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.08))',
						flexShrink: 0,
					}}
				>
					<button
						className="gdl-bp-news-modal-action-btn gdl-bp-news-modal-close-btn Focusable"
						type="button"
						tabIndex={0}
						data-focusable="true"
						onClick={() => {
							playSound(4);
							onClose();
						}}
						style={{
							padding: '8px 18px',
							borderRadius: 'var(--gp-button-border-radius, 4px)',
							background: 'var(--gp-button-bg, #3d4450)',
							color: 'var(--gp-text-color-primary, #ffffff)',
							fontSize: '13.5px',
							fontWeight: 600,
							border: '1px solid transparent',
							cursor: 'pointer',
							display: 'inline-flex',
							alignItems: 'center',
							gap: '6px',
						}}
					>
						Ⓑ {loc('Button_Back', 'VOLVER')}
					</button>
				</div>
			</div>
		</div>
	);
};
