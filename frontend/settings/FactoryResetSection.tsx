import React from 'react';
import { gdlText } from '../steam/localization';
import { performFactoryReset } from '../features/shortcuts/runtime';

export interface FactoryResetSectionProps {
	onResetComplete?: () => void;
}

export const FactoryResetSection = ({ onResetComplete }: FactoryResetSectionProps): React.ReactElement => {
	const [showModal, setShowModal] = React.useState(false);
	const [deletePlaytime, setDeletePlaytime] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [status, setStatus] = React.useState<{ text: string; color: string } | null>(null);

	const handleReset = async (): Promise<void> => {
		if (busy) return;
		setBusy(true);
		setStatus({ text: gdlText('factory_reset_busy', 'Resetting plugin to factory state...'), color: '#8f98a0' });
		try {
			const result = await performFactoryReset({ deletePlaytime });
			if (result.ok) {
				setShowModal(false);
				setStatus({ text: gdlText('factory_reset_success', 'Plugin reset to factory state successfully.'), color: '#59bf40' });
				onResetComplete?.();
			} else {
				setStatus({ text: gdlText('factory_reset_failed', 'Failed to reset plugin to factory state.'), color: '#d94126' });
			}
		} catch (err) {
			setStatus({ text: `${gdlText('factory_reset_failed', 'Failed to reset plugin to factory state.')}: ${err}`, color: '#d94126' });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(217,65,38,.28)' }}>
			<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
				<div style={{ flex: 1, minWidth: '220px' }}>
					<div style={{ fontWeight: 600, color: '#e7b39f', fontSize: '13px' }}>
						{gdlText('factory_reset_title', 'Factory reset')}
					</div>
					<div style={{ marginTop: '4px', color: '#8f98a0', fontSize: '11.5px', lineHeight: 1.4 }}>
						{gdlText('factory_reset_description', 'Restores all plugin settings, mappings, artwork, and caches to their original factory state.')}
					</div>
				</div>
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						setDeletePlaytime(false);
						setShowModal(true);
					}}
					style={{
						padding: '8px 14px',
						color: '#fff',
						background: busy ? '#3d4450' : '#d94126',
						border: 0,
						borderRadius: '2px',
						cursor: busy ? 'default' : 'pointer',
						fontSize: '12px',
						fontWeight: 600,
						whiteSpace: 'nowrap',
						transition: 'filter .15s ease',
					}}
					onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)'; }}
					onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none'; }}
				>
					{gdlText('factory_reset_button', 'Reset everything to factory state')}
				</button>
			</div>

			{status && (
				<div style={{ marginTop: '8px', color: status.color, fontSize: '11.5px', fontWeight: 500 }}>
					{status.text}
				</div>
			)}

			{showModal && (
				<div
					role="dialog"
					aria-modal="true"
					style={{
						position: 'fixed',
						inset: 0,
						zIndex: 2147483640,
						background: 'rgba(0,0,0,0.78)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						padding: '16px',
						boxSizing: 'border-box',
					}}
				>
					<div
						style={{
							background: '#232932',
							border: '1px solid rgba(217,65,38,0.5)',
							borderRadius: '3px',
							boxShadow: '0 16px 50px rgba(0,0,0,0.85)',
							padding: '20px 22px',
							maxWidth: '460px',
							width: '100%',
							boxSizing: 'border-box',
						}}
					>
						<div style={{ fontSize: '15px', fontWeight: 600, color: '#e7b39f', marginBottom: '8px' }}>
							{gdlText('factory_reset_confirm_title', 'Reset everything to factory state?')}
						</div>
						<div style={{ fontSize: '12px', color: '#c6d4df', lineHeight: 1.45, marginBottom: '14px' }}>
							{gdlText('factory_reset_confirm_warning', 'This will unlink all non-Steam shortcuts, remove custom artwork assigned by the plugin, and return all settings to default.')}
						</div>

						<label
							style={{
								display: 'flex',
								alignItems: 'flex-start',
								gap: '9px',
								padding: '10px 12px',
								background: 'rgba(0,0,0,0.25)',
								border: '1px solid rgba(255,255,255,0.08)',
								borderRadius: '3px',
								cursor: 'pointer',
								marginBottom: '16px',
							}}
						>
							<input
								type="checkbox"
								checked={deletePlaytime}
								disabled={busy}
								onChange={e => setDeletePlaytime(e.target.checked)}
								style={{ marginTop: '2px', cursor: 'pointer' }}
							/>
							<div>
								<div style={{ color: '#dcdedf', fontSize: '12px', fontWeight: 600 }}>
									{gdlText('factory_reset_delete_playtime_label', 'Also delete recorded playtime and game sessions')}
								</div>
								<div style={{ color: '#8f98a0', fontSize: '11px', marginTop: '2px', lineHeight: 1.35 }}>
									{gdlText('factory_reset_delete_playtime_help', 'If unchecked, your recorded playtime and gameplay history will be kept completely safe.')}
								</div>
							</div>
						</label>

						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
							<button
								type="button"
								disabled={busy}
								onClick={() => setShowModal(false)}
								style={{
									padding: '7px 14px',
									color: '#dcdedf',
									background: '#3d4450',
									border: 0,
									borderRadius: '2px',
									cursor: busy ? 'default' : 'pointer',
									fontSize: '12px',
								}}
							>
								{gdlText('cancel', 'Cancel')}
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() => { void handleReset(); }}
								style={{
									padding: '7px 16px',
									color: '#fff',
									background: busy ? '#555' : '#d94126',
									border: 0,
									borderRadius: '2px',
									cursor: busy ? 'default' : 'pointer',
									fontSize: '12px',
									fontWeight: 600,
								}}
							>
								{busy ? gdlText('factory_reset_busy', 'Resetting plugin to factory state...') : gdlText('factory_reset_confirm_btn', 'Confirm & Reset')}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
