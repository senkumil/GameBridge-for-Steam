import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { LocalAchievementData } from '../../domain/types';
import { gdlText, loc } from '../../steam/localization';
import { formatLastPlayedDate, formatPlaytimeMinutes } from '../playtime/format';
import { formatLocalUnlockDate } from '../achievements/format';
import { getInstantPlaytimeStats } from '../playtime/service';
import { getShortcutAppById } from '../../steam/shortcuts';
import { completionMedal } from './achievement-cards';

export interface BigPictureAchievementsScreenProps {
	achievements: LocalAchievementData;
	gameName: string;
	portraitUrl: string;
	shortcutAppId?: number;
	backgroundUrl?: string;
	onClose: () => void;
}

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

export const BigPictureAchievementsScreen: React.FC<BigPictureAchievementsScreenProps> = ({
	achievements,
	gameName,
	portraitUrl,
	shortcutAppId,
	backgroundUrl,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<'mine' | 'global'>('mine');
	const [searchQuery, setSearchQuery] = useState('');
	const [revealedSet, setRevealedSet] = useState<Set<string>>(() => new Set());

	const total = achievements.total || 0;
	const unlocked = achievements.unlocked || 0;
	const pct = total > 0 ? Math.round((unlocked * 100) / total) : 0;
	const isAllUnlocked = unlocked >= total && total > 0;

	// Playtime stats
	const { playtimeText, lastPlayedText } = useMemo(() => {
		const instantStats = shortcutAppId ? getInstantPlaytimeStats(shortcutAppId) : null;
		const app = shortcutAppId ? getShortcutAppById(shortcutAppId) : null;
		const minutesForever = Math.max(
			0,
			Number(instantStats?.minutesForever || 0),
			Number((app as any)?.minutes_playtime_forever || 0),
		);
		const pt = minutesForever > 0 ? formatPlaytimeMinutes(minutesForever) : '';
		const lastPlayedTimestamp = Number(
			instantStats?.lastPlayedAt || (app as any)?.rt_last_time_played || 0,
		);
		const lp = lastPlayedTimestamp > 0 ? formatLastPlayedDate(lastPlayedTimestamp) : '';
		return { playtimeText: pt, lastPlayedText: lp };
	}, [shortcutAppId]);

	// Sorted & filtered achievements
	const sortedItems = useMemo(() => {
		const list = [...(achievements.achievements || [])];
		if (activeTab === 'mine') {
			return list.sort((a, b) => {
				if (a.earned && !b.earned) return -1;
				if (!a.earned && b.earned) return 1;
				return Number(b.earned_time || 0) - Number(a.earned_time || 0);
			});
		}
		return list.sort((a, b) => Number(b.global_percent || 0) - Number(a.global_percent || 0));
	}, [achievements.achievements, activeTab]);

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return sortedItems;
		const q = searchQuery.toLowerCase().trim();
		return sortedItems.filter(a => {
			const nameMatch = (a.display_name || a.name || '').toLowerCase().includes(q);
			const descMatch = (a.description || '').toLowerCase().includes(q);
			return nameMatch || descMatch;
		});
	}, [sortedItems, searchQuery]);

	// Toggle hidden achievement spoiler
	const toggleReveal = useCallback((achKey: string) => {
		playSound(3);
		setRevealedSet(prev => {
			const next = new Set(prev);
			if (next.has(achKey)) next.delete(achKey);
			else next.add(achKey);
			return next;
		});
	}, []);

	// Tab change
	const handleTabChange = useCallback((tab: 'mine' | 'global') => {
		playSound(1);
		setActiveTab(tab);
	}, []);

	// Keyboard shortcut handling
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' || e.key === 'b' || e.key === 'B' || e.key === 'Backspace' || e.keyCode === 27) {
				e.preventDefault();
				e.stopPropagation();
				playSound(4);
				onClose();
			} else if (e.key === 'PageUp' || e.key === 'q' || e.key === 'Q') {
				e.preventDefault();
				handleTabChange('mine');
			} else if (e.key === 'PageDown' || e.key === 'e' || e.key === 'E') {
				e.preventDefault();
				handleTabChange('global');
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
		};
	}, [onClose, handleTabChange]);

	return (
		<div
			className="gdl-bp-ach-screen gdl-bp-fadein"
			style={{
				position: 'fixed',
				inset: 0,
				width: '100vw',
				height: '100vh',
				zIndex: 9999999,
				background: 'var(--gp-background-dark, #0e141b)',
				overflowY: 'auto',
				overflowX: 'hidden',
				padding: 'clamp(20px, 4vw, 40px) clamp(20px, 4.5vw, 60px) clamp(24px, 4vw, 48px)',
				boxSizing: 'border-box',
				fontFamily: '"Motiva Sans", -apple-system, BlinkMacSystemFont, Arial, sans-serif',
				color: 'var(--gp-text-color-primary, #e7e8ea)',
			}}
		>
			{/* Ambient background glow */}
			{backgroundUrl && (
				<div
					className="gdl-bp-ach-screen-backdrop"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						height: '480px',
						backgroundImage: `url(${backgroundUrl})`,
						backgroundSize: 'cover',
						backgroundPosition: 'center top',
						filter: 'blur(48px) brightness(0.32)',
						opacity: 0.7,
						pointerEvents: 'none',
						zIndex: 0,
					}}
				/>
			)}

			<div
				className="gdl-bp-ach-screen-inner"
				style={{
					position: 'relative',
					zIndex: 1,
					maxWidth: '1360px',
					margin: '0 auto',
					display: 'flex',
					flexDirection: 'column',
					gap: '14px',
				}}
			>
				{/* Header */}
				<div
					className="gdl-bp-ach-screen-header"
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 'clamp(16px, 2.5vw, 28px)',
						marginBottom: '4px',
					}}
				>
					<img
						className="gdl-bp-ach-screen-portrait"
						src={portraitUrl}
						alt={gameName}
						style={{
							width: 'clamp(96px, 11vw, 136px)',
							aspectRatio: '2 / 3',
							height: 'auto',
							minWidth: '96px',
							objectFit: 'cover',
							borderRadius: 'var(--gp-card-border-radius, 4px)',
							boxShadow: '0 10px 32px rgba(0, 0, 0, 0.85)',
							flexShrink: 0,
						}}
					/>
					<div
						className="gdl-bp-ach-screen-header-info"
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							gap: '12px',
							paddingTop: '4px',
						}}
					>
						<h1
							className="gdl-bp-ach-screen-game-title"
							style={{
								fontSize: 'clamp(22px, 2.4vw, 28px)',
								fontWeight: 700,
								color: 'var(--gp-text-color-primary, #ffffff)',
								margin: '0 0 4px',
								lineHeight: 1.2,
							}}
						>
							{gameName}
						</h1>

						{/* Progress Bar & Stats */}
						<div
							className="gdl-bp-ach-screen-progress-wrap"
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: '8px',
								width: '100%',
								boxSizing: 'border-box',
							}}
						>
							<div
								className="gdl-bp-ach-screen-progress-top-row"
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: '16px',
									flexWrap: 'wrap',
									width: '100%',
								}}
							>
								<div
									className="gdl-bp-ach-screen-progress-headline"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '10px',
										fontSize: '13.5px',
										fontWeight: 700,
										color: 'var(--gp-text-color-primary, #ffffff)',
										letterSpacing: '0.5px',
										textTransform: 'uppercase',
									}}
								>
									{isAllUnlocked && (
										<span
											className="gdl-bp-ach-screen-medal"
											dangerouslySetInnerHTML={{ __html: completionMedal() }}
											style={{
												width: '26px',
												height: '32px',
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
												flexShrink: 0,
											}}
										/>
									)}
									<span>
										{loc('AppDetails_PlayerUnlockedPercent', 'Has desbloqueado %1$s/%2$s logros')
											.replace('%1$s', String(unlocked))
											.replace('%2$s', String(total))}
									</span>
									<span style={{ color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600, marginLeft: '4px' }}>({pct}%)</span>
								</div>

								{/* Stat Meta: Playtime / Last Played */}
								<div
									className="gdl-bp-ach-screen-stat-meta"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '24px',
										flexShrink: 0,
									}}
								>
									{playtimeText && (
										<div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
											<span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gp-text-color-secondary, #8f98a0)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
												{loc('AppDetails_Playtime', 'TIEMPO DE JUEGO')}
											</span>
											<span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--gp-text-color-primary, #ffffff)' }}>{playtimeText}</span>
										</div>
									)}
									{lastPlayedText && (
										<div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
											<span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gp-text-color-secondary, #8f98a0)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
												{loc('AppDetails_LastPlayed', 'ÚLTIMA SESIÓN')}
											</span>
											<span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--gp-text-color-primary, #ffffff)' }}>{lastPlayedText}</span>
										</div>
									)}
								</div>
							</div>

							{/* Progress track */}
							<div
								className="gdl-bp-ach-screen-progress-track"
								style={{
									width: '100%',
									height: '7px',
									background: 'var(--gp-progress-track, rgba(255, 255, 255, 0.14))',
									borderRadius: '4px',
									overflow: 'hidden',
									marginTop: '2px',
								}}
							>
								<div
									className="gdl-bp-ach-screen-progress-fill"
									style={{
										width: `${pct}%`,
										height: '100%',
										background: 'var(--gp-color-blue, #1a9fff)',
										borderRadius: '4px',
										transition: 'width 0.3s ease',
									}}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Tabs */}
				<div
					className="gdl-bp-ach-screen-tabs"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: '14px',
						margin: '16px 0 14px',
					}}
				>
					<button
						className={`gdl-bp-ach-tab-btn Focusable ${activeTab === 'mine' ? 'active' : ''}`}
						onClick={() => handleTabChange('mine')}
						tabIndex={0}
						role="button"
						data-focusable="true"
						style={{
							background: activeTab === 'mine' ? 'var(--gp-button-active-bg, rgba(255, 255, 255, 0.20))' : 'transparent',
							border: 'none',
							color: activeTab === 'mine' ? 'var(--gp-text-color-primary, #ffffff)' : 'var(--gp-text-color-secondary, #8f98a0)',
							fontSize: '13.5px',
							fontWeight: 800,
							letterSpacing: '0.6px',
							textTransform: 'uppercase',
							padding: '7px 22px',
							borderRadius: '20px',
							cursor: 'pointer',
							outline: 'none',
						}}
					>
						{loc('AppDetails_MyAchievements', 'MIS LOGROS')}
					</button>
					<button
						className={`gdl-bp-ach-tab-btn Focusable ${activeTab === 'global' ? 'active' : ''}`}
						onClick={() => handleTabChange('global')}
						tabIndex={0}
						role="button"
						data-focusable="true"
						style={{
							background: activeTab === 'global' ? 'var(--gp-button-active-bg, rgba(255, 255, 255, 0.20))' : 'transparent',
							border: 'none',
							color: activeTab === 'global' ? 'var(--gp-text-color-primary, #ffffff)' : 'var(--gp-text-color-secondary, #8f98a0)',
							fontSize: '13.5px',
							fontWeight: 800,
							letterSpacing: '0.6px',
							textTransform: 'uppercase',
							padding: '7px 22px',
							borderRadius: '20px',
							cursor: 'pointer',
							outline: 'none',
						}}
					>
						{loc('AppDetails_GlobalAchievements', 'LOGROS MUNDIALES')}
					</button>
				</div>

				{/* Toolbar */}
				<div
					className="gdl-bp-ach-screen-toolbar"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'flex-end',
						gap: '12px',
						marginBottom: '8px',
					}}
				>
					<div className="gdl-bp-ach-search-wrap" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
						<input
							className="gdl-bp-ach-search-input Focusable"
							type="text"
							placeholder={loc('Search', 'Buscar')}
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							tabIndex={0}
							data-focusable="true"
							style={{
								background: 'var(--gp-input-bg, rgba(0, 0, 0, 0.35))',
								border: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.12))',
								borderRadius: 'var(--gp-input-border-radius, 4px)',
								color: 'var(--gp-text-color-primary, #ffffff)',
								fontSize: '13px',
								padding: '7px 14px',
								width: '220px',
								outline: 'none',
							}}
						/>
					</div>
					<div className="gdl-bp-ach-compare-wrap">
						<button
							className="gdl-bp-ach-compare-btn Focusable"
							type="button"
							tabIndex={0}
							data-focusable="true"
							onClick={() => playSound(3)}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								background: 'var(--gp-button-bg-secondary, rgba(255, 255, 255, 0.08))',
								border: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.1))',
								borderRadius: 'var(--gp-button-border-radius, 4px)',
								color: 'var(--gp-text-color-secondary, #8f98a0)',
								fontSize: '13px',
								padding: '7px 14px',
								cursor: 'pointer',
								outline: 'none',
							}}
						>
							<span>{loc('AppDetails_CompareWith', 'Comparar con...')}</span>
							<span style={{ fontSize: '10px', color: 'var(--gp-text-color-secondary, #8f98a0)' }}>▼</span>
						</button>
					</div>
				</div>

				{/* List */}
				<div
					className="gdl-bp-ach-screen-list"
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: '6px',
					}}
				>
					{filteredItems.length === 0 ? (
						<div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gp-text-color-secondary, #8f98a0)', fontSize: '15px' }}>
							{gdlText('no_achievements_match', 'No achievements match your search.')}
						</div>
					) : (
						filteredItems.map(item => {
							const isEarned = Boolean(item.earned);
							const iconUrl = isEarned ? item.icon : (item.icon_gray || item.icon);
							const unlockDateStr =
								isEarned && item.earned_time ? formatLocalUnlockDate(item.earned_time) : '';
							const globalPct =
								typeof item.global_percent === 'number'
									? item.global_percent.toFixed(1)
									: null;
							const isHiddenLocked = Boolean(item.hidden && !isEarned);
							const isRevealed = revealedSet.has(item.name);

							const title =
								isHiddenLocked && !isRevealed
									? (item.display_name || gdlText('hidden_achievement', 'Hidden achievement'))
									: (item.display_name || item.name);

							const description =
								isHiddenLocked && !isRevealed
									? gdlText('hidden_achievement_desc', 'Sigue jugando para desbloquear este logro.')
									: (item.description || '');

							return (
								<div
									key={item.name}
									className={`gdl-bp-ach-row Focusable ${isEarned ? 'is-earned' : 'is-locked'} ${isHiddenLocked ? 'is-hidden-ach' : ''}`}
									tabIndex={0}
									role="button"
									data-focusable="true"
									onClick={() => {
										if (isHiddenLocked) toggleReveal(item.name);
									}}
									onKeyDown={e => {
										if (e.key === 'Enter' || e.key === ' ') {
											if (isHiddenLocked) {
												e.preventDefault();
												toggleReveal(item.name);
											}
										}
									}}
									style={{
										background: 'var(--gp-color-card, #1b2129)',
										border: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.04))',
										borderRadius: 'var(--gp-card-border-radius, 4px)',
										padding: '12px 18px',
										display: 'flex',
										alignItems: 'center',
										gap: '16px',
										marginBottom: '6px',
										cursor: 'pointer',
										outline: 'none',
									}}
								>
									<div
										className="gdl-bp-ach-row-icon-frame"
										style={{
											width: '58px',
											height: '58px',
											minWidth: '58px',
											flexShrink: 0,
											borderRadius: '3px',
											overflow: 'hidden',
											background: '#000000',
										}}
									>
										<img
											className={`gdl-bp-ach-row-icon ${!isEarned ? 'is-locked' : ''}`}
											src={iconUrl}
											alt=""
											style={{
												width: '100%',
												height: '100%',
												objectFit: 'cover',
												display: 'block',
												opacity: !isEarned ? 0.4 : 1,
											}}
										/>
									</div>
									<div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
										<div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--gp-text-color-primary, #ffffff)', lineHeight: 1.25 }}>{title}</div>
										<div style={{ fontSize: '13px', color: 'var(--gp-text-color-secondary, #8f98a0)', lineHeight: 1.35 }}>{description}</div>
										{globalPct && (
											<div style={{ fontSize: '11.5px', color: 'var(--gp-text-color-dim, #687380)', marginTop: '2px' }}>
												{globalPct}%{' '}
												{gdlText('players_have_achievement', 'de los jugadores tienen este logro')}
											</div>
										)}
										{isHiddenLocked && (
											<div
												className="gdl-bp-ach-reveal-action"
												style={{
													marginTop: '4px',
													fontSize: '11px',
													color: 'var(--gp-color-blue-hi, #66c0f4)',
													cursor: 'pointer',
												}}
											>
												{isRevealed
													? gdlText('hide_details', 'Ocultar detalles')
													: gdlText('show_details', 'Mostrar detalles')}
											</div>
										)}
									</div>
									<div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
										{isEarned && unlockDateStr ? (
											<>
												<div style={{ fontSize: '12px', color: 'var(--gp-text-color-secondary, #8f98a0)' }}>
													{loc('AppDetails_Achievement_UnlockedAt', 'Se desbloqueó el %1$s').replace(
														'%1$s',
														unlockDateStr,
													)}
												</div>
												<div style={{ width: '48px', height: '4px', background: 'var(--gp-color-blue, #1a9fff)', borderRadius: '2px' }} />
											</>
										) : (
											<div style={{ fontSize: '12px', color: 'var(--gp-text-color-dim, #555f6d)', fontStyle: 'italic' }}>
												{loc('AppDetails_Achievement_Locked', 'Bloqueado')}
											</div>
										)}
									</div>
								</div>
							);
						})
					)}
				</div>

				{/* Bottom prompt bar */}
				<div
					className="gdl-bp-ach-screen-footer"
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginTop: '18px',
						paddingTop: '16px',
						borderTop: '1px solid var(--gp-border-color, rgba(255, 255, 255, 0.08))',
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600 }}>
							<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }} aria-hidden="true">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.88 15.65c-.32.22-.72.35-1.15.35-.61 0-1.18-.27-1.57-.71l-1.16-1.32-1.16 1.32c-.39.44-.96.71-1.57.71-.43 0-.83-.13-1.15-.35 1.13-1.15 2.5-2.07 4.04-2.65 1.54.58 2.91 1.5 4.04 2.65zm1.75-2.82c-.89-.92-1.99-1.67-3.23-2.18 1.4-.73 2.59-1.78 3.44-3.08.31.86.48 1.79.48 2.76 0 .89-.25 1.74-.69 2.5zm-11.26 0c-.44-.76-.69-1.61-.69-2.5 0-.97.17-1.9.48-2.76.85 1.3 2.04 2.35 3.44 3.08-1.24.51-2.34 1.26-3.23 2.18zM12 11.23c-1.5 0-2.85-.68-3.76-1.76.99-1.23 2.31-2.14 3.76-2.67 1.45.53 2.77 1.44 3.76 2.67-.91 1.08-2.26 1.76-3.76 1.76z" />
								</svg>
							</span>
							<span>{loc('Button_Menu', 'MENÚ')}</span>
						</div>
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600 }}>
							<span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--gp-button-bg, #3d4450)', color: 'var(--gp-text-color-primary, #fff)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>A</span>
							<span>{loc('Button_Select', 'SELECCIONAR')}</span>
						</div>
						<div
							className="gdl-bp-ach-close-trigger Focusable"
							onClick={() => {
								playSound(4);
								onClose();
							}}
							role="button"
							tabIndex={0}
							style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--gp-text-color-secondary, #8f98a0)', fontWeight: 600, cursor: 'pointer' }}
						>
							<span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--gp-button-bg, #3d4450)', color: 'var(--gp-text-color-primary, #fff)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>B</span>
							<span>{loc('Button_Back', 'VOLVER')}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
