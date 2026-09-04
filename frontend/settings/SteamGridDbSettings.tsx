import React from 'react';
import { validateSteamGridDbApiKeyBackend } from '../api/backend';
import {
	defaultSteamGridDbApiKey,
	type GdlPreferences,
} from '../core/preferences';
import { gdlText } from '../steam/localization';

interface ToggleProps {
	checked: boolean;
	disabled?: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}

export interface SteamGridDbSettingsProps {
	preferences: GdlPreferences;
	onChange: (patch: Partial<GdlPreferences>) => void;
	Toggle: React.ComponentType<ToggleProps>;
}

export const SteamGridDbSettings = ({ preferences, onChange, Toggle }: SteamGridDbSettingsProps): React.ReactElement => {
	const [draft, setDraft] = React.useState(preferences.steamGridDbApiKey);
	const [saving, setSaving] = React.useState(false);
	const [status, setStatus] = React.useState<{ text: string; color: string } | null>(null);
	React.useEffect(() => setDraft(preferences.steamGridDbApiKey), [preferences.steamGridDbApiKey]);

	const saveKey = async (value: string, restoring = false): Promise<void> => {
		if (saving) return;
		const candidate = String(value || '').trim();
		if (candidate.length < 16 || candidate.length > 160) {
			setStatus({ text: gdlText('steamgriddb_api_key_required', 'Enter a valid SteamGridDB API key.'), color: '#d94126' });
			return;
		}
		setSaving(true);
		setStatus({ text: gdlText('steamgriddb_api_key_verifying', 'Verifying the key with SteamGridDB...'), color: '#8f98a0' });
		try {
			const raw = await validateSteamGridDbApiKeyBackend({ request_json: JSON.stringify({ api_key: candidate }) });
			let result: any = raw;
			for (let attempt = 0; attempt < 3 && typeof result === 'string'; attempt++) result = JSON.parse(result);
			if (!result || result.ok !== true) {
				const invalid = result?.error === 'invalid_key' || result?.error === 'invalid_key_format';
				setStatus({
					text: invalid
						? gdlText('steamgriddb_api_key_invalid', 'SteamGridDB rejected the key. The previous key remains active.')
						: gdlText('steamgriddb_api_key_unavailable', 'SteamGridDB could not be reached. The previous key remains active.'),
					color: '#d94126',
				});
				return;
			}
			onChange({ steamGridDbApiKey: candidate });
			setDraft(candidate);
			setStatus({
				text: restoring
					? gdlText('steamgriddb_api_key_restored', 'The default key was restored and verified successfully.')
					: gdlText('steamgriddb_api_key_saved', 'The SteamGridDB key was saved and verified successfully.'),
				color: '#59bf40',
			});
		} catch {
			setStatus({ text: gdlText('steamgriddb_api_key_unavailable', 'SteamGridDB could not be reached. The previous key remains active.'), color: '#d94126' });
		} finally {
			setSaving(false);
		}
	};

	return <div style={{ marginTop: '12px', padding: '10px 11px', background: 'rgba(102,192,244,.06)', border: '1px solid rgba(102,192,244,.16)', borderRadius: '3px' }}>
		<div style={{ fontWeight: 600, color: '#dcdedf', fontSize: '12px' }}>{gdlText('steamgriddb_artwork_title', 'Community artwork (SteamGridDB)')}</div>
		<div style={{ marginTop: '4px', color: '#8f98a0', fontSize: '11.5px', lineHeight: 1.4 }}>
			{gdlText('steamgriddb_artwork_description', 'It is consulted only when Steam did not publish a cover, background, logo, or capsule. It never replaces official artwork.')}
		</div>
		<div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '9px', fontSize: '12px' }}>
			<Toggle
				checked={preferences.autoCommunityArtwork}
				onChange={checked => onChange({ autoCommunityArtwork: checked })}
				label={gdlText('steamgriddb_auto_artwork', 'Automatically apply missing SteamGridDB artwork')}
			/>
			{gdlText('steamgriddb_auto_artwork', 'Automatically apply missing SteamGridDB artwork')}
		</div>
		<input
			type="password" autoComplete="off" spellCheck={false} value={draft}
			onChange={event => { setDraft(event.currentTarget.value); setStatus(null); }}
			placeholder={gdlText('steamgriddb_api_key_placeholder', 'SteamGridDB API key (stored locally only)')}
			style={{ boxSizing: 'border-box', width: '100%', marginTop: '9px', padding: '7px 9px', color: '#dcdedf', background: '#171d25', border: '1px solid #3d4450', borderRadius: '2px', fontSize: '12px' }}
		/>
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '8px' }}>
			<button
				type="button" disabled={saving}
				onClick={() => { void saveKey(draft); }}
				style={{ padding: '6px 12px', border: 0, borderRadius: '2px', background: saving ? '#303945' : '#1a9fff', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: '11.5px', fontWeight: 500 }}>
				{saving ? gdlText('steamgriddb_api_key_verifying', 'Verifying...') : gdlText('save', 'Save')}
			</button>
			<button
				type="button" disabled={saving}
				onClick={() => {
				const defaultKey = defaultSteamGridDbApiKey();
				setDraft(defaultKey);
				void saveKey(defaultKey, true);
			}} style={{ padding: '6px 12px', border: 0, borderRadius: '2px', background: '#3d4450', color: '#dcdedf', cursor: saving ? 'default' : 'pointer', fontSize: '11.5px' }}>
				{gdlText('steamgriddb_api_key_restore', 'Restore default key')}
			</button>
		</div>
		{status && <div role="status" style={{ marginTop: '7px', color: status.color, fontSize: '11px', lineHeight: 1.35 }}>{status.text}</div>}
	</div>;
};
