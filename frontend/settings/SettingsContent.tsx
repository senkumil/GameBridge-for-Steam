import React from 'react';
import type { LocalAchievementItem } from '../domain/types';
import {
	backendLog,
	getAchievementBasePathBackend,
	parseAchievementBasePathResponse,
	setAchievementBasePathBackend,
} from '../api/backend';
import { gdlText, subscribeSteamLanguageChange } from '../steam/localization';
import { fetchLocalAchievementData } from '../features/achievements/service';
import { getPreferences, setPreferences, subscribePreferences } from '../core/preferences';

const DEFAULT_ACHIEVEMENT_BASE_PATH = '%APPDATA%\\Goldberg SteamEmu Saves';

export interface SettingsContentProps {
	clearAchievementCache: () => void;
	showAchievementToast: (appid: string, achievement: LocalAchievementItem) => Promise<void>;
}

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
			fontSize: '13px',
			color: '#acb2b8',
			lineHeight: '1.6',
			width: '100%',
			maxWidth: '100%',
			minWidth: 0,
			boxSizing: 'border-box',
			overflowX: 'hidden',
			overflowWrap: 'anywhere',
			paddingRight: '2px',
		}}>
			<div style={{ marginBottom: '8px', fontWeight: 600, color: '#dcdedf' }}>
				{gdlText('settings_title', 'GameBridge for Steam')}
			</div>
			<div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
				{gdlText('settings_description', 'Right-click any non-Steam game → Properties → enter a linked Steam AppID. The library page will show its description, screenshots and metadata.')}
			</div>
			<div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '4px', fontWeight: 600, color: '#dcdedf' }}>
					{gdlText('achievement_path_title', 'Local achievement folder')}
				</div>
				<div style={{ marginBottom: '10px', color: '#8f98a0', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
					{gdlText('achievement_path_description', 'Choose the base folder that contains one subfolder per game: <folder>\\<Steam AppID>\\achievements.json. The official linked AppID is checked first.')}
				</div>
				<div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap', width: '100%', minWidth: 0 }}>
					<input
						value={achievementPath}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAchievementPath(event.currentTarget.value)}
						onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' && !disabled) void saveAchievementPath(achievementPath); }}
						placeholder={gdlText('achievement_path_placeholder', 'Example: %APPDATA%\\Goldberg SteamEmu Saves')}
						disabled={disabled}
						spellCheck={false}
						style={{ flex: '1 1 100%', width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 10px', color: '#dcdedf', background: '#1b2838', border: '1px solid #3d4450', borderRadius: '2px', outline: 'none' }}
					/>
					<button
						type="button"
						disabled={disabled}
						onClick={(): void => { void saveAchievementPath(achievementPath); }}
						style={{ flex: '1 1 145px', minWidth: 0, padding: '7px 13px', color: '#fff', background: disabled ? '#3d4450' : 'linear-gradient(90deg,#06bfff,#2d73ff)', border: 0, borderRadius: '2px', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'normal' }}
					>
						{loadingPath ? gdlText('achievement_path_loading', 'Loading current folder...') : gdlText('achievement_path_save', 'Save folder')}
					</button>
					<button
						type="button"
						disabled={disabled}
						onClick={(): void => { void saveAchievementPath(DEFAULT_ACHIEVEMENT_BASE_PATH); }}
						style={{ flex: '1 1 180px', minWidth: 0, padding: '7px 13px', color: '#dcdedf', background: '#3d4450', border: 0, borderRadius: '2px', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'normal' }}
					>
						{gdlText('achievement_path_reset', 'Restore default')}
					</button>
				</div>
				{pathStatus && <div style={{ marginTop: '8px', color: pathStatus.color }}>{pathStatus.text}</div>}
			</div>
			<div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '4px', fontWeight: 600, color: '#dcdedf' }}>
					{gdlText('achievement_test_title', 'Test achievement notifications')}
				</div>
				<div style={{ marginBottom: '10px', color: '#8f98a0', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
					{gdlText('achievement_test_description', 'Send a random achievement notification with sound to test that notifications are working.')}
				</div>
				<button
					type="button"
					disabled={testingAchievement}
					onClick={(): void => { void testRandomAchievement(); }}
					style={{ width: '100%', maxWidth: '290px', minWidth: 0, padding: '8px 15px', color: '#fff', background: testingAchievement ? '#3d4450' : 'linear-gradient(90deg,#06bfff,#2d73ff)', border: 0, borderRadius: '2px', cursor: testingAchievement ? 'default' : 'pointer', fontWeight: 500, whiteSpace: 'normal' }}
				>
					{testingAchievement
						? gdlText('achievement_test_loading', 'Sending test notification...')
						: gdlText('achievement_test_button', 'Test notification (with sound)')}
				</button>
				{testStatus && <div style={{ marginTop: '8px', color: testStatus.color, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{testStatus.text}</div>}
			</div>
			<div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '4px', fontWeight: 600, color: '#dcdedf' }}>
					{gdlText('auto_detect_title', 'Automatic shortcut detection')}
				</div>
				<div style={{ marginBottom: '10px', color: '#8f98a0' }}>
					{gdlText('auto_detect_description', 'Suggest linking when new non-Steam games are added to your library.')}
				</div>
				<label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}>
					<input
						type="checkbox"
						checked={preferences.autoDetectShortcuts}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => updatePreferences({ autoDetectShortcuts: event.currentTarget.checked })}
					/>
					<span>{gdlText('auto_detect_shortcuts_toggle', 'Show link suggestion prompt when adding a non-Steam game')}</span>
				</label>
			</div>
			<div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '4px', fontWeight: 600, color: '#dcdedf' }}>
					{gdlText('developer_tools_title', 'Developer tools')}
				</div>
				<div style={{ marginBottom: '10px', color: '#8f98a0' }}>
					{gdlText('developer_tools_description', 'Testing options are disabled by default for public installations.')}
				</div>
				<label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}>
					<input
						type="checkbox"
						checked={preferences.developerMode}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => updatePreferences({ developerMode: event.currentTarget.checked })}
					/>
					<span>{gdlText('developer_mode', 'Enable developer mode')}</span>
				</label>
				<label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: preferences.developerMode ? 'pointer' : 'default', opacity: preferences.developerMode ? 1 : 0.55 }}>
					<input
						type="checkbox"
						disabled={!preferences.developerMode}
						checked={preferences.simulateAchievements}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => updatePreferences({ simulateAchievements: event.currentTarget.checked })}
					/>
					<span>{gdlText('simulate_achievements', 'Show deterministic test achievements when no local progress file exists')}</span>
				</label>
			</div>
		</div>
	);
};

