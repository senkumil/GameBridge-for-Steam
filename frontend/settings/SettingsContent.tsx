import React from 'react';
import { Toggle } from '@steambrew/client';
import type { LocalAchievementItem } from '../domain/types';
import {
	backendLog,
	getAchievementBasePathBackend,
	parseAchievementBasePathResponse,
	setAchievementBasePathBackend,
} from '../api/backend';
import { gdlText, subscribeSteamLanguageChange } from '../steam/localization';
import { fetchLocalAchievementData } from '../features/achievements/service';
import { clearLibraryAssetCaches } from '../features/library/artwork';
import { getPreferences, setPreferences, subscribePreferences } from '../core/preferences';

const DEFAULT_ACHIEVEMENT_BASE_PATH = '%APPDATA%\\GSE Saves';

export interface SettingsContentProps {
	clearAchievementCache: () => void;
	showAchievementToast: (appid: string, achievement: LocalAchievementItem) => Promise<void>;
}

interface SettingsToggleProps {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}

/** Use Steam's own control: it participates in the CEF focus/input system. */
const SettingsToggle = ({ checked, label, onChange }: SettingsToggleProps): React.ReactElement => {
	const handleChange = (value: boolean | { target?: { checked?: boolean }; currentTarget?: { checked?: boolean } }): void => {
		// Steam has shipped both Toggle(onChange: boolean) and Toggle(onChange:
		// event) implementations. Supporting both prevents an event object from
		// being sanitized to false by the preference store.
		const fromEvent = typeof value === 'object'
			? (value.currentTarget?.checked ?? value.target?.checked)
			: undefined;
		onChange(typeof value === 'boolean' ? value : (typeof fromEvent === 'boolean' ? fromEvent : !checked));
	};
	return (
		<div title={label} style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center' }}>
			<Toggle value={checked} onChange={handleChange} />
		</div>
	);
};

export const SettingsContent = ({ clearAchievementCache, showAchievementToast }: SettingsContentProps) => {
	const [, setLanguageRevision] = React.useState(0);
	React.useEffect(() => subscribeSteamLanguageChange(() => setLanguageRevision(value => value + 1)), []);
	const [achievementPath, setAchievementPath] = React.useState(DEFAULT_ACHIEVEMENT_BASE_PATH);
	const [loadingPath, setLoadingPath] = React.useState(true);
	const [savingPath, setSavingPath] = React.useState(false);
	const [pathStatus, setPathStatus] = React.useState<{ text: string; color: string } | null>(null);
	const [preferences, setPreferencesState] = React.useState(() => getPreferences());
	React.useEffect(() => subscribePreferences(setPreferencesState), []);

	const updatePreferences = (patch: Parameters<typeof setPreferences>[0]): void => {
		const next = setPreferences(patch);
		setPreferencesState(next);
		if ('steamGridDbApiKey' in patch || 'autoCommunityArtwork' in patch) clearLibraryAssetCaches();
		clearAchievementCache();
	};

	React.useEffect(() => {
		let active = true;
		void getAchievementBasePathBackend()
			.then(raw => {
				if (!active) return;
				const result = parseAchievementBasePathResponse(raw);
				if (result?.path) setAchievementPath(result.path);
				if (result?.path && result.exists === false) {
					setPathStatus({
						text: gdlText('achievement_path_saved_missing', 'Folder saved, but it does not exist yet.'),
						color: '#d6b25e',
					});
				}
			})
			.catch(() => {
				if (active) setPathStatus({ text: gdlText('achievement_path_failed', 'The achievement folder could not be loaded.'), color: '#d94126' });
			})
			.finally(() => { if (active) setLoadingPath(false); });
		return () => { active = false; };
	}, []);

	const saveAchievementPath = async (requestedPath: string): Promise<void> => {
		const normalized = requestedPath.trim().replace(/^"(.*)"$/, '$1') || DEFAULT_ACHIEVEMENT_BASE_PATH;
		setSavingPath(true);
		setPathStatus(null);
		try {
			const saved = parseAchievementBasePathResponse(await setAchievementBasePathBackend({ path: normalized }));
			if (saved?.ok === false) throw new Error(saved.error || 'save_failed');
			// Read it back because some Millennium builds discard Lua return values.
			const verified = parseAchievementBasePathResponse(await getAchievementBasePathBackend());
			if (!verified?.path) throw new Error('verification_failed');
			setAchievementPath(verified.path);
			clearAchievementCache();
			setPathStatus({
				text: verified.exists === false
					? gdlText('achievement_path_saved_missing', 'Folder saved, but it does not exist yet.')
					: gdlText('achievement_path_saved', 'Achievement folder saved.'),
				color: verified.exists === false ? '#d6b25e' : '#59bf40',
			});
		} catch (e) {
			backendLog('Achievement base path save failed: ' + String(e));
			setPathStatus({ text: gdlText('achievement_path_failed', 'The achievement folder could not be saved.'), color: '#d94126' });
		} finally {
			setSavingPath(false);
		}
	};

	const [testStatus, setTestStatus] = React.useState<{ text: string; color: string } | null>(null);
	const [testingAchievement, setTestingAchievement] = React.useState(false);

	const testRandomAchievement = async (): Promise<void> => {
		if (testingAchievement) return;
		setTestingAchievement(true);
		setTestStatus(null);
		const games = [
			{ appid: '400', game: 'Portal', ach: 'Heartbreaker', desc: 'Complete Portal', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/400/17ee24fb705d8bc1da1231f74b439c065f49df16.jpg' },
			{ appid: '220', game: 'Half-Life 2', ach: 'Trusty Hardware', desc: 'Get the crowbar.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/220/8254c25eb4d6ad5e48398e096f4fcfffe6f50543.jpg' },
			{ appid: '730', game: 'Counter-Strike 2', ach: 'Someone Set Up Us The Bomb', desc: 'Win a round by planting a bomb.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/730/c02cfb62e4313b0c950de00570fc2de38e8ec2fb.jpg' },
			{ appid: '1086940', game: "Baldur's Gate 3", ach: 'Descent From Avernus', desc: 'Take control of the nautiloid and escape the Hells.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1086940/ca805eec0fbba34e06385aef16b67e3cefcb43a9.jpg' },
			{ appid: '413150', game: 'Stardew Valley', ach: 'Greenhorn', desc: 'Earn 15,000g.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/413150/d24492bf22bc968c92a6fdf942f2ed84501a3ea3.jpg' },
			{ appid: '1091500', game: 'Cyberpunk 2077', ach: 'The World', desc: 'Complete the main storyline.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1091500/1258671eb2a06148386121fbe61d6ec677b10287.jpg' },
			{ appid: '1245620', game: 'ELDEN RING', ach: 'Elden Lord', desc: 'Achieved the "Elden Lord" ending.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1245620/b382cf8fa83a9cefd07db7159c3a3881432f8016.jpg' },
			{ appid: '367520', game: 'Hollow Knight', ach: 'Judgment', desc: 'Defeat the Last Judge.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/367520/731ca0cb64619ad4ae94819d45e7f1ef504eb207.jpg' },
			{ appid: '1145360', game: 'Hades', ach: 'Is There No Escape?', desc: 'Clear an escape attempt.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1145360/4cbeec94e1e07b22cf3316f73db2f6f5925e01cb.jpg' },
			{ appid: '1790600', game: 'DRAGON BALL: Sparking! ZERO', ach: 'A New Legend Begins', desc: 'Completed your first battle.', icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/1790600/7a57a550fa63fe3509930fca68340d850ecf6cb9.jpg' }
		];
		const randomGame = { ...games[Math.floor(Math.random() * games.length)] };
		// Refresh the test sample from the same public achievement metadata used by
		// linked games. This avoids stale hard-coded CDN hashes rendering as a gray
		// square in Steam's native notification component.
		try {
			const metadata = await fetchLocalAchievementData(randomGame.appid, {
				stateAppId: randomGame.appid,
				allowSimulated: true,
			});
			const candidates = Array.isArray(metadata?.achievements)
				? metadata.achievements.filter(item => !!(item.icon || item.icon_gray))
				: [];
			if (candidates.length > 0) {
				const picked = candidates[Math.floor(Math.random() * candidates.length)];
				randomGame.ach = picked.display_name || picked.name;
				randomGame.desc = picked.description || randomGame.desc;
				randomGame.icon = picked.icon || picked.icon_gray || randomGame.icon;
			}
		} catch (e) {
			backendLog('Test achievement metadata refresh failed; using bundled fallback: ' + String(e));
		}
		const fakeItem: LocalAchievementItem = {
			name: 'TEST_' + Math.random().toString(36).substring(2, 7),
			display_name: randomGame.ach,
			description: randomGame.desc,
			icon: randomGame.icon,
			icon_gray: '',
			hidden: false,
			global_percent: Math.random() * 100,
			earned: true,
			earned_time: Math.floor(Date.now() / 1000),
			progress: 100,
			max_progress: 100
		};
		try {
			await showAchievementToast(randomGame.appid, fakeItem);
			setTestStatus({
				text: gdlText('achievement_test_sent', '✓ Test notification sent: {game} — {achievement}', {
					game: randomGame.game,
					achievement: randomGame.ach
				}),
				color: '#59bf40',
			});
		} catch (e) {
			backendLog('Test toast error: ' + String(e));
			setTestStatus({
				text: gdlText('achievement_test_failed', 'Could not show the test notification. Check the Millennium log.'),
				color: '#d94126',
			});
		} finally {
			setTestingAchievement(false);
		}
	};

	const disabled = loadingPath || savingPath;
	return (
		<div style={{
			fontSize: '12px',
			color: '#acb2b8',
			lineHeight: '1.45',
			width: '100%',
			maxWidth: '100%',
			minWidth: 0,
			boxSizing: 'border-box',
			overflowX: 'hidden',
			overflowWrap: 'anywhere',
			paddingRight: '2px',
		}}>
			{/* ── Tarjeta Guía Rápida Paso a Paso ──────────────────────── */}
			<div style={{
				background: 'linear-gradient(180deg, rgba(27,40,56,0.7) 0%, rgba(20,29,42,0.85) 100%)',
				border: '1px solid rgba(102, 192, 244, 0.2)',
				borderRadius: '4px',
				padding: '10px 12px',
				marginBottom: '12px'
			}}>
				<div style={{ marginBottom: '6px', fontWeight: 600, color: '#66c0f4', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
					<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
					{gdlText('settings_guide_title', 'How do I link games to Steam?')}
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: '#c6d4df', lineHeight: '1.4' }}>
					<div><b style={{ color: '#fff' }}>1.</b> {gdlText('settings_step_1', 'Add your game in Steam (+ Add a Game → Add a Non-Steam Game).')}</div>
					<div><b style={{ color: '#fff' }}>2.</b> {gdlText('settings_step_2', 'Right-click the game in your Steam library → Properties.')}</div>
					<div><b style={{ color: '#fff' }}>3.</b> {gdlText('settings_step_3', 'In the "Linked game" field, paste the Steam AppID or Store URL (for example, 1245620 for Elden Ring).')}</div>
					<div><b style={{ color: '#59bf40' }}>✓</b> {gdlText('settings_step_4', 'Done! Your game will load official artwork, news, screenshots, local achievements and Big Picture compatibility.')}</div>
				</div>
			</div>

			{/* ── Carpeta local de logros ─────────────────────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('achievement_path_title', 'Local achievement folder')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('achievement_path_description', 'Base folder with subfolders per AppID: <folder>\\<AppID>\\achievements.json.')}
				</div>
				<input
					value={achievementPath}
					onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAchievementPath(event.currentTarget.value)}
					onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' && !disabled) void saveAchievementPath(achievementPath); }}
					placeholder={gdlText('achievement_path_placeholder', 'Example: %APPDATA%\\GSE Saves')}
					disabled={disabled}
					spellCheck={false}
					style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '6px 9px', color: '#dcdedf', background: '#1b2838', border: '1px solid #3d4450', borderRadius: '2px', outline: 'none', fontSize: '12px', marginBottom: '6px' }}
				/>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
					<button
						type="button"
						disabled={disabled}
						onClick={(): void => { void saveAchievementPath(achievementPath); }}
						style={{ padding: '6px 9px', color: '#fff', background: disabled ? '#3d4450' : 'linear-gradient(90deg,#06bfff,#2d73ff)', border: 0, borderRadius: '2px', cursor: disabled ? 'default' : 'pointer', fontSize: '12px', fontWeight: 500 }}
					>
						{loadingPath ? gdlText('achievement_path_loading', 'Loading...') : gdlText('achievement_path_save', 'Save')}
					</button>
					<button
						type="button"
						disabled={disabled}
						onClick={(): void => { void saveAchievementPath(DEFAULT_ACHIEVEMENT_BASE_PATH); }}
						style={{ padding: '6px 9px', color: '#dcdedf', background: '#3d4450', border: 0, borderRadius: '2px', cursor: disabled ? 'default' : 'pointer', fontSize: '12px' }}
					>
						{gdlText('achievement_path_reset', 'Default')}
					</button>
				</div>
				{pathStatus && <div style={{ marginTop: '6px', color: pathStatus.color, fontSize: '11.5px' }}>{pathStatus.text}</div>}
				<div style={{
					marginTop: '8px',
					padding: '8px 10px',
					background: 'rgba(45, 115, 255, 0.08)',
					border: '1px solid rgba(45, 115, 255, 0.25)',
					borderRadius: '3px',
					fontSize: '11.5px',
					lineHeight: '1.4',
					color: '#a8c0d6'
				}}>
					<div style={{ fontWeight: 600, color: '#66c0f4', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
						</svg>
						{gdlText('achievement_autocrack_title', 'Achievement generation for external games')}
					</div>
					<div style={{ marginBottom: '6px' }}>
						{gdlText('achievement_autocrack_note', 'For unofficial games to record achievements in real time, they must use an emulator such as SteamAutoCrack (Goldberg Emulator). The emulator automatically generates the folders and achievements.json file as you play and earn achievements.')}
					</div>
					<div>
						<span
							role="button"
							tabIndex={0}
							onClick={(event: React.MouseEvent<HTMLSpanElement>) => {
								event.preventDefault();
								event.stopPropagation();
								const url = 'https://github.com/SteamAutoCracks/Steam-auto-crack/releases';
								const sc = (window as any).SteamClient;
								if (typeof sc?.System?.OpenInSystemBrowser === 'function') {
									try {
										sc.System.OpenInSystemBrowser(url);
										return;
									} catch {}
								}
								window.open(url, '_blank', 'noopener,noreferrer');
							}}
							onKeyDown={(event: React.KeyboardEvent<HTMLSpanElement>) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									const url = 'https://github.com/SteamAutoCracks/Steam-auto-crack/releases';
									const sc = (window as any).SteamClient;
									if (typeof sc?.System?.OpenInSystemBrowser === 'function') {
										try {
											sc.System.OpenInSystemBrowser(url);
											return;
										} catch {}
									}
									window.open(url, '_blank', 'noopener,noreferrer');
								}
							}}
							style={{
								color: '#66c0f4',
								textDecoration: 'underline',
								fontWeight: 500,
								cursor: 'pointer',
								display: 'inline-flex',
								alignItems: 'center',
								gap: '4px',
							}}
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
								<path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
							</svg>
							{gdlText('achievement_autocrack_download_link', 'Download SteamAutoCrack from GitHub (Releases)')}
						</span>
					</div>
				</div>
			</div>

			{/* ── Probar notificaciones ────────────────────────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('achievement_test_title', 'Test achievement notifications')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('achievement_test_description', 'Send a random achievement notification to check that notifications work.')}
				</div>
				<button
					type="button"
					disabled={testingAchievement}
					onClick={(): void => { void testRandomAchievement(); }}
					style={{ width: '100%', maxWidth: '280px', minWidth: 0, padding: '7px 12px', color: '#fff', background: testingAchievement ? '#3d4450' : 'linear-gradient(90deg,#06bfff,#2d73ff)', border: 0, borderRadius: '2px', cursor: testingAchievement ? 'default' : 'pointer', fontWeight: 500, fontSize: '12px' }}
				>
					{testingAchievement
						? gdlText('achievement_test_loading', 'Sending test notification...')
						: gdlText('achievement_test_button', 'Test notification')}
				</button>
				{testStatus && <div style={{ marginTop: '6px', color: testStatus.color, fontSize: '11.5px' }}>{testStatus.text}</div>}
			</div>

			{/* ── Detección automática de accesos directos ─────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('auto_detect_title', 'Automatic shortcut detection')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('auto_detect_description', 'Suggests a link when new non-Steam games are added to your library.')}
				</div>
				<div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
					<SettingsToggle checked={preferences.autoDetectShortcuts} onChange={checked => updatePreferences({ autoDetectShortcuts: checked })} label={gdlText('auto_detect_shortcuts_toggle', 'Show a linking suggestion when adding a non-Steam game')} />
					<span style={{ fontSize: '12px' }}>{gdlText('auto_detect_shortcuts_toggle', 'Show a linking suggestion when adding a non-Steam game')}</span>
				</div>
				<div style={{ marginTop: '12px', padding: '10px 11px', background: 'rgba(102,192,244,.06)', border: '1px solid rgba(102,192,244,.16)', borderRadius: '3px' }}>
					<div style={{ fontWeight: 600, color: '#dcdedf', fontSize: '12px' }}>{gdlText('steamgriddb_artwork_title', 'Community artwork (SteamGridDB)')}</div>
					<div style={{ marginTop: '4px', color: '#8f98a0', fontSize: '11.5px', lineHeight: 1.4 }}>
						{gdlText('steamgriddb_artwork_description', 'It is consulted only when Steam did not publish a cover, background, logo, or capsule. It never replaces official artwork.')}
					</div>
					<div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '9px', fontSize: '12px' }}>
						<SettingsToggle checked={preferences.autoCommunityArtwork} onChange={checked => updatePreferences({ autoCommunityArtwork: checked })} label={gdlText('steamgriddb_auto_artwork', 'Automatically apply missing SteamGridDB artwork')} />
						{gdlText('steamgriddb_auto_artwork', 'Automatically apply missing SteamGridDB artwork')}
					</div>
					<input
						type="password"
						autoComplete="off"
						spellCheck={false}
						value={preferences.steamGridDbApiKey}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => updatePreferences({ steamGridDbApiKey: event.currentTarget.value })}
						placeholder={gdlText('steamgriddb_api_key_placeholder', 'SteamGridDB API key (stored locally only)')}
						style={{ boxSizing: 'border-box', width: '100%', marginTop: '9px', padding: '7px 9px', color: '#dcdedf', background: '#171d25', border: '1px solid #3d4450', borderRadius: '2px', fontSize: '12px' }}
					/>
				</div>
			</div>

			{/* ── Seguimiento de tiempo de juego (Fallback) ───────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('playtime_tracking_title', 'Playtime tracking (Fallback)')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('playtime_tracking_description', 'Tracks and displays hours played for non-Steam games if your Steam client does not include native tracking.')}
				</div>
				<div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
					<SettingsToggle checked={preferences.trackNonSteamPlaytime} onChange={checked => updatePreferences({ trackNonSteamPlaytime: checked })} label={gdlText('playtime_tracking_toggle', 'Enable playtime tracking and statistics for external games')} />
					<span style={{ fontSize: '12px' }}>{gdlText('playtime_tracking_toggle', 'Enable playtime tracking and statistics for external games')}</span>
				</div>
			</div>

			{/* ── Logros de prueba ───────────────────────────────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('simulated_achievements_title', 'Test achievements')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('simulated_achievements_description', 'Use only to preview the interface when the game does not have a local progress file.')}
				</div>
				<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
					<SettingsToggle checked={preferences.simulateAchievements} onChange={checked => updatePreferences({ simulateAchievements: checked })} label={gdlText('simulate_achievements', 'Show deterministic test achievements when no local progress file exists')} />
					<span style={{ fontSize: '12px' }}>{gdlText('simulate_achievements', 'Show deterministic test achievements when no local progress file exists')}</span>
				</div>
			</div>
		</div>
	);
};
