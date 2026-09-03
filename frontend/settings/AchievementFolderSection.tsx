import React from 'react';
import { gdlText } from '../steam/localization';
import {
	getAchievementBasePathBackend,
	parseAchievementBasePathResponse,
	setAchievementBasePathBackend,
} from '../api/backend';

const DEFAULT_ACHIEVEMENT_BASE_PATH = '%APPDATA%\\SteamAchievements';

export const AchievementFolderSection: React.FC = () => {
	const [achievementPath, setAchievementPath] = React.useState(DEFAULT_ACHIEVEMENT_BASE_PATH);
	const [loadingPath, setLoadingPath] = React.useState(true);
	const [savingPath, setSavingPath] = React.useState(false);
	const [pathStatus, setPathStatus] = React.useState<{ text: string; color: string } | null>(null);

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
			const raw = await setAchievementBasePathBackend({ path: normalized });
			const result = parseAchievementBasePathResponse(raw);
			if (result?.path) setAchievementPath(result.path);
			if (result?.ok) {
				setPathStatus({
					text: result.exists === false
						? gdlText('achievement_path_saved_missing', 'Folder saved, but it does not exist yet.')
						: gdlText('achievement_path_saved', 'Achievement folder saved.'),
					color: result.exists === false ? '#d6b25e' : '#59bf40',
				});
			} else {
				setPathStatus({ text: gdlText('achievement_path_failed', 'The achievement folder could not be saved.'), color: '#d94126' });
			}
		} catch {
			setPathStatus({ text: gdlText('achievement_path_failed', 'The achievement folder could not be saved.'), color: '#d94126' });
		} finally {
			setSavingPath(false);
		}
	};

	const disabled = loadingPath || savingPath;

	return (
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
				placeholder={gdlText('achievement_path_placeholder', 'Example: %APPDATA%\\SteamAchievements')}
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
		</div>
	);
};
