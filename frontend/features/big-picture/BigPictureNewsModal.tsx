import React, { useEffect } from 'react';
import type { NewsItem } from '../../domain/types';
import { gdlText, loc } from '../../steam/localization';
import { eventTypeLabel, formatNewsDate, isPatchNoteItem } from '../library/news';

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

function formatNewsModalBody(contents: string): string {
	if (!contents) return '';
	const formatted = contents
		.replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images/')
		.replace(/\[img\](.*?)\[\/img\]/gi, '<img class="gdl-bp-modal-news-img" src="$1" alt="" loading="lazy" style="max-width:100%;height:auto;border-radius:4px;margin:12px 0;display:block;" />')
		.replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener" class="gdl-bp-modal-news-link" style="color:var(--gp-color-blue-hi, #66c0f4);text-decoration:underline;">$2</a>')
		.replace(/\[h1\](.*?)\[\/h1\]/gi, '<h2 style="font-size:20px;font-weight:700;color:var(--gp-text-color-primary, #fff);margin:18px 0 8px;">$1</h2>')
		.replace(/\[h2\](.*?)\[\/h2\]/gi, '<h3 style="font-size:18px;font-weight:700;color:var(--gp-text-color-primary, #fff);margin:16px 0 6px;">$1</h3>')
		.replace(/\[h3\](.*?)\[\/h3\]/gi, '<h4 style="font-size:16px;font-weight:700;color:var(--gp-text-color-primary, #fff);margin:14px 0 6px;">$1</h4>')
		.replace(/\[b\](.*?)\[\/b\]/gi, '<strong>$1</strong>')
		.replace(/\[i\](.*?)\[\/i\]/gi, '<em>$1</em>')
		.replace(/\[u\](.*?)\[\/u\]/gi, '<u>$1</u>')
		.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, '<ul style="margin:10px 0 16px 20px;padding:0;">$1</ul>')
		.replace(/\[\*\](.*?)(?=\[\*\]|<\/ul>|$)/gi, '<li style="margin-bottom:6px;">$1</li>')
		.replace(/\[previewyoutube=([^;\]]+)[^\]]*\]\[\/previewyoutube\]/gi, '')
		.replace(/\[\/?(?:strike|spoiler|quote|code|table|tr|td|th)[^\]]*\]/gi, '')
		.replace(/\n\n+/g, '</p><p style="margin:0 0 14px;">')
		.replace(/\n/g, '<br/>');

	return `<p style="margin:0 0 14px;">${formatted}</p>`;
}

export interface BigPictureNewsModalProps {
	item: NewsItem;
	gameName?: string;
	gameIcon?: string;
	onClose: () => void;
}

export const BigPictureNewsModal: React.FC<BigPictureNewsModalProps> = ({
	item,
	gameName = '',
	gameIcon = '',
	onClose,
}) => {
	const eventType = Number(item.event_type || 0);
	const isPatch = eventType === 0 && isPatchNoteItem(item);
	const label = eventType > 0
		? eventTypeLabel(eventType)
		: (isPatch ? loc('AppActivity_MinorUpdate', 'ACTUALIZACIÓN MENOR / NOTAS DE PARCHE') : (item.feedlabel || gdlText('feed_news', 'NOTICIAS')));

	const bannerUrl = item.image || '';
	const dateStr = formatNewsDate(item.date);
	const bodyHtml = formatNewsModalBody(item.contents || '');

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
				className="gdl-bp-news-modal-window"
				style={{
					position: 'relative',
					width: '100%',
					maxWidth: '820px',
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
					aria-label={gdlText('close', 'Cerrar')}
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
				{bannerUrl && (
					<div style={{ width: '100%', height: '220px', flexShrink: 0, background: '#000000', overflow: 'hidden' }}>
						<img src={bannerUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
					</div>
				)}
				<div style={{ padding: '24px 32px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
						{gameIcon && <img src={gameIcon} alt="" style={{ width: '22px', height: '22px', borderRadius: '3px', objectFit: 'cover' }} />}
						<span style={{ fontSize: '13px', color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600, letterSpacing: '0.5px' }}>{gameName}</span>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontSize: '11px', textTransform: 'uppercase' }}>
						<span style={{ color: 'var(--gp-color-blue, #1a9fff)', fontWeight: 700 }}>{label.toUpperCase()}</span>
						<span style={{ color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600 }}>PUBLICADO {dateStr}</span>
					</div>
					<h1 style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1.25, color: 'var(--gp-text-color-primary, #ffffff)', margin: '0 0 18px' }}>{item.title}</h1>
					<div
						style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--gp-text-color-body, #c6d4df)' }}
						dangerouslySetInnerHTML={{ __html: bodyHtml }}
					/>
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
					{item.url && (
						<a
							className="gdl-bp-news-modal-action-btn Focusable"
							href={item.url}
							target="_blank"
							rel="noopener noreferrer"
							tabIndex={0}
							data-focusable="true"
							onClick={() => playSound(3)}
							style={{
								padding: '8px 18px',
								borderRadius: 'var(--gp-button-border-radius, 4px)',
								background: 'var(--gp-button-bg, #3d4450)',
								color: 'var(--gp-text-color-primary, #ffffff)',
								fontSize: '13.5px',
								fontWeight: 600,
								border: '1px solid transparent',
								cursor: 'pointer',
								textDecoration: 'none',
								display: 'inline-flex',
								alignItems: 'center',
								gap: '6px',
							}}
						>
							🌐 {gdlText('open_in_browser', 'Abrir en navegador')}
						</a>
					)}
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
