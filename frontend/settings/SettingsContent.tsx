import React from 'react';
import type { LocalAchievementItem } from '../domain/types';
import {
	backendLog,
	getAchievementBasePathBackend,
	parseAchievementBasePathResponse,
	setAchievementBasePathBackend,
} from '../api/backend';
import { gdlText, getSteamLanguage, loc, subscribeSteamLanguageChange } from '../steam/localization';
import { fetchLocalAchievementData } from '../features/achievements/service';
import { refreshLocalAchievementUI } from '../features/achievements/runtime';
import { clearLibraryAssetCaches } from '../features/library/artwork';
import { getPreferences, setPreferences, subscribePreferences } from '../core/preferences';
import { subscribeMappings } from '../core/mappings';
import {
	getCommittedShortcutSteamAppId,
	hasPendingLinkJob,
	getAllShortcutRecords,
	linkAllShortcutsExperimental,
	requestManualShortcutLink,
	unlinkAllShortcutsFromSteam,
	unlinkShortcutFromSteam,
} from '../features/shortcuts/runtime';
import {
	getBulkLinkState,
	setBulkLinkState,
	subscribeBulkLinkState,
} from '../features/shortcuts/bulk-link-state';
import { SteamGridDbSettings } from './SteamGridDbSettings';

const DEFAULT_ACHIEVEMENT_BASE_PATH = '%APPDATA%\\GSE Saves';

export interface SettingsContentProps {
	clearAchievementCache: () => void;
	showAchievementToast: (appid: string, achievement: LocalAchievementItem) => Promise<void>;
}

interface SettingsToggleProps {
	checked: boolean;
	disabled?: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}

/**
 * Keep global settings fully controlled by React. Steam has shipped different
 * Toggle onChange contracts across client builds, and some builds leave a
 * controlled toggle visually frozen even after its preference was persisted.
 */
const SettingsToggle = ({ checked, disabled = false, label, onChange }: SettingsToggleProps): React.ReactElement => {
	const controlRef = React.useRef<HTMLButtonElement>(null);
	const current = React.useRef({ checked, disabled, onChange });
	current.current = { checked, disabled, onChange };
	React.useEffect(() => {
		const control = controlRef.current;
		if (!control) return undefined;
		const activate = (event: Event): void => {
			if (current.current.disabled) return;
			event.preventDefault();
			event.stopPropagation();
			const next = !current.current.checked;
			// Paint immediately. The following preference update performs the
			// authoritative controlled render, but Steam cannot visually swallow
			// the interaction while that render is scheduled.
			current.current.checked = next;
			control.setAttribute('aria-checked', next ? 'true' : 'false');
			control.style.background = next ? '#1a9fff' : '#4b5869';
			const knob = control.firstElementChild as HTMLElement | null;
			if (knob) knob.style.left = next ? '21px' : '3px';
			current.current.onChange(next);
		};
		const handlePointerDown = (event: PointerEvent): void => {
			if (event.button === 0) activate(event);
		};
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Enter' || event.key === ' ') activate(event);
		};
		// Native listeners are intentional. React's delegated events can be
		// consumed by Steam's settings navigation layer before reaching plugins.
		control.addEventListener('pointerdown', handlePointerDown);
		control.addEventListener('keydown', handleKeyDown);
		return () => {
			control.removeEventListener('pointerdown', handlePointerDown);
			control.removeEventListener('keydown', handleKeyDown);
		};
	}, []);
	return (
		<button
			ref={controlRef}
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			title={label}
			disabled={disabled}
			style={{
				position: 'relative', width: '42px', height: '24px', flex: '0 0 42px', padding: 0,
				border: 0, borderRadius: '12px', background: checked ? '#1a9fff' : '#4b5869',
				cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .45 : 1, pointerEvents: 'auto',
			}}
		>
			<span aria-hidden="true" style={{
				position: 'absolute', top: '3px', left: checked ? '21px' : '3px', width: '18px', height: '18px',
				borderRadius: '50%', background: '#f1f1f1', transition: 'left .12s ease',
			}} />
		</button>
	);
};

function bulkLinkReasonLabel(reason: string | undefined): string {
	switch (String(reason || '')) {
		case 'ambiguous_or_low_confidence':
			return gdlText('bulk_link_reason_ambiguous', 'No sufficiently reliable match was found.');
		case 'context_unavailable':
			return gdlText('bulk_link_reason_context', 'The shortcut information could not be read.');
		case 'detection_failed':
			return gdlText('bulk_link_reason_detection', 'Candidate detection failed.');
		case 'invalid_appid':
			return gdlText('bulk_link_reason_invalid_appid', 'The detected Steam AppID was invalid.');
		case 'refusing_to_modify_native_steam_app':
			return gdlText('bulk_link_reason_native', 'The entry was not recognized as a non-Steam shortcut.');
		case 'canonical_data_unavailable':
		case 'setup_incomplete':
			return gdlText('bulk_link_reason_incomplete', 'The link could not finish all required resources.');
		default:
			return gdlText('bulk_link_reason_failed', 'The link could not be completed.');
	}
}

export const SettingsContent = ({ clearAchievementCache, showAchievementToast }: SettingsContentProps) => {
	const [, setLanguageRevision] = React.useState(0);
	React.useEffect(() => {
		let active = true;
		void getSteamLanguage(true).then(() => {
			if (active) setLanguageRevision(value => value + 1);
		}).catch(() => {});
		const unsubscribe = subscribeSteamLanguageChange(() => {
			if (active) setLanguageRevision(value => value + 1);
		});
		const onFocus = (): void => {
			void getSteamLanguage(true).then(() => {
				if (active) setLanguageRevision(value => value + 1);
			}).catch(() => {});
		};
		window.addEventListener('focus', onFocus);
		return () => {
			active = false;
			unsubscribe();
			window.removeEventListener('focus', onFocus);
		};
	}, []);
	const [achievementPath, setAchievementPath] = React.useState(DEFAULT_ACHIEVEMENT_BASE_PATH);
	const [loadingPath, setLoadingPath] = React.useState(true);
	const [savingPath, setSavingPath] = React.useState(false);
	const [pathStatus, setPathStatus] = React.useState<{ text: string; color: string } | null>(null);
	const [preferences, setPreferencesState] = React.useState(() => getPreferences());
	React.useEffect(() => subscribePreferences(setPreferencesState), []);
	const [shortcutRevision, setShortcutRevision] = React.useState(0);
	const [shortcutActionStatus, setShortcutActionStatus] = React.useState<{ text: string; color: string } | null>(null);
	const [bulkLinkGlobal, setBulkLinkGlobal] = React.useState(() => getBulkLinkState());
	React.useEffect(() => subscribeBulkLinkState(setBulkLinkGlobal), []);

	const shortcutActionBusy = bulkLinkGlobal.busy;
	const bulkLinkProgress = bulkLinkGlobal.progress;
	const bulkLinkReport = bulkLinkGlobal.report;
	React.useEffect(() => {
		const refresh = (): void => setShortcutRevision(value => value + 1);
		const unsubscribeMappings = subscribeMappings(refresh);
		const onVisible = (): void => { if (!document.hidden) refresh(); };
		window.addEventListener('gdl:shortcuts-changed', refresh);
		window.addEventListener('gdl:pending-link-jobs-changed', refresh);
		window.addEventListener('focus', refresh);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			unsubscribeMappings();
			window.removeEventListener('gdl:shortcuts-changed', refresh);
			window.removeEventListener('gdl:pending-link-jobs-changed', refresh);
			window.removeEventListener('focus', refresh);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, []);
	const shortcutRows = React.useMemo(() => getAllShortcutRecords()
		.map(record => ({
			id: record.id,
			title: record.title,
			steamAppId: String(getCommittedShortcutSteamAppId(record.id) || ''),
		}))
		.sort((a, b) => a.title.localeCompare(b.title)), [shortcutRevision]);
	const linkedShortcutCount = shortcutRows.filter(row => /^\d+$/.test(row.steamAppId)).length;
	const bulkNotLinked = bulkLinkReport?.outcomes.filter(item => item.status === 'skipped' || item.status === 'failed') || [];
	const bulkQueued = bulkLinkReport?.outcomes.filter(item => (item.status === 'queued' || item.resourceRepairQueued)
		&& hasPendingLinkJob(item.shortcutAppId, item.title)) || [];

	const dynamicBulkLinkStatus = React.useMemo(() => {
		if (!bulkLinkGlobal.status) return null;
		if (bulkLinkGlobal.busy === 'bulk-link') return bulkLinkGlobal.status;
		if (!bulkLinkReport) return bulkLinkGlobal.status;
		if (bulkLinkReport.total === 0) {
			return { text: gdlText('bulk_link_none', 'There are no unlinked games to review.'), color: '#8f98a0' };
		}
		const pendingCount = bulkQueued.length;
		const notLinkedCount = bulkNotLinked.length;
		const totalConsidered = bulkLinkReport.total;
		const successfullyLinkedCount = Math.max(0, totalConsidered - notLinkedCount);

		if (notLinkedCount === 0) {
			if (pendingCount > 0) {
				return {
					text: gdlText('bulk_link_success_pending', 'Bulk linking completed: {linked} of {total} linked ({pending} downloading artwork in background).', {
						linked: String(successfullyLinkedCount),
						total: String(totalConsidered),
						pending: String(pendingCount),
					}),
					color: '#59bf40',
				};
			}
			return {
				text: gdlText('bulk_link_all_success', 'Bulk linking completed: all {total} game(s) linked successfully.', {
					total: String(totalConsidered),
				}),
				color: '#59bf40',
			};
		}
		return {
			text: gdlText('bulk_link_result', 'Bulk link completed: {linked} linked, {queued} in background, {skipped} ambiguous skipped, {failed} failed.', {
				linked: String(successfullyLinkedCount - pendingCount),
				queued: String(pendingCount),
				skipped: String(bulkLinkReport.skipped),
				failed: String(bulkLinkReport.failed),
			}),
			color: '#d6b25e',
		};
	}, [bulkLinkGlobal.status, bulkLinkGlobal.busy, bulkLinkReport, bulkQueued.length, bulkNotLinked.length]);

	const updatePreferences = (patch: Parameters<typeof setPreferences>[0]): void => {
		const next = setPreferences(patch);
		setPreferencesState(next);
		if ('steamGridDbApiKey' in patch || 'autoCommunityArtwork' in patch) clearLibraryAssetCaches();
		clearAchievementCache();
		if ('simulateAchievements' in patch || 'unlockOnlineAchievements' in patch) {
			refreshLocalAchievementUI();
		}
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

	const cancelBulkLink = (): void => {
		const current = getBulkLinkState();
		if (current.abortController) {
			current.abortController.abort();
		}
		setBulkLinkState({
			busy: '',
			abortController: null,
			progress: null,
			status: {
				text: gdlText('bulk_link_cancelled', 'Bulk linking cancelled.'),
				color: '#8f98a0',
			},
		});
		setShortcutRevision(value => value + 1);
	};

	const linkAllShortcuts = async (): Promise<void> => {
		if (shortcutActionBusy) return;
		const abortController = new AbortController();
		setBulkLinkState({
			busy: 'bulk-link',
			abortController,
			report: null,
			progress: null,
			status: { text: gdlText('bulk_link_running', 'Analyzing and linking high-confidence matches...'), color: '#66c0f4' },
		});
		setShortcutActionStatus(null);
		try {
			const result = await linkAllShortcutsExperimental((done, total, title, phase) => {
				if (abortController.signal.aborted) return;
				setBulkLinkState({
					progress: { phase, done, total, title },
					status: {
						text: phase === 'analyzing'
							? gdlText('bulk_link_analyzing_progress', 'Analyzing {done}/{total}: {game}', { done: String(done), total: String(total), game: title })
							: gdlText('bulk_link_progress', 'Linking {done}/{total}: {game}', { done: String(done), total: String(total), game: title }),
						color: '#66c0f4',
					},
				});
			}, abortController.signal);
			if (abortController.signal.aborted) return;
			setShortcutRevision(value => value + 1);
			const finishedStatus = result.total === 0
				? { text: gdlText('bulk_link_none', 'There are no unlinked games to review.'), color: '#8f98a0' }
				: {
					text: gdlText('bulk_link_result', 'Bulk link finished: {linked} linked, {queued} in background, {skipped} ambiguous skipped, {failed} failed.', {
						linked: String(result.linked), queued: String(result.queued), skipped: String(result.skipped), failed: String(result.failed),
					}),
					color: result.failed > 0 || result.skipped > 0 ? '#d6b25e' : '#59bf40',
				};
			setBulkLinkState({
				busy: '',
				abortController: null,
				progress: null,
				report: result,
				status: finishedStatus,
			});
		} catch (error) {
			if (abortController.signal.aborted) return;
			backendLog('Experimental bulk link failed: ' + String(error));
			setBulkLinkState({
				busy: '',
				abortController: null,
				progress: null,
				status: { text: gdlText('bulk_link_failed', 'Bulk linking could not be completed.'), color: '#d94126' },
			});
		} finally {
			if (getBulkLinkState().abortController === abortController) {
				setBulkLinkState({ busy: '', abortController: null });
			}
		}
	};

	const unlinkAllShortcuts = async (): Promise<void> => {
		if (shortcutActionBusy) return;
		setBulkLinkState({ progress: null, status: null, report: null });
		setShortcutActionStatus({
			text: gdlText('bulk_unlink_success', 'All linked games were unlinked. Automatic prompts remain suppressed until you explicitly link again.'),
			color: '#59bf40',
		});
		setShortcutRevision(value => value + 1);

		void (async () => {
			try {
				const result = await unlinkAllShortcutsFromSteam();
				setShortcutRevision(value => value + 1);
				if (!result.ok) {
					setShortcutActionStatus({
						text: gdlText('bulk_unlink_partial', 'Some games could not be unlinked ({failed} failed).', { failed: String(result.failed) }),
						color: '#d6b25e',
					});
				}
			} catch (error) {
				backendLog('Bulk unlink failed: ' + String(error));
				setShortcutActionStatus({ text: gdlText('bulk_unlink_failed', 'Could not unlink all games.'), color: '#d94126' });
			}
		})();
	};

	const unlinkOneShortcut = async (row: { id: number; title: string; steamAppId: string }): Promise<void> => {
		if (shortcutActionBusy) return;
		setShortcutRevision(value => value + 1);
		setShortcutActionStatus({
			text: gdlText('settings_unlink_one_success', 'Unlinked: {game}', { game: row.title }),
			color: '#59bf40',
		});
		void (async () => {
			try {
				const result = await unlinkShortcutFromSteam({ shortcutAppId: row.id, title: row.title, steamAppId: row.steamAppId || undefined });
				setShortcutRevision(value => value + 1);
				if (!result.ok) {
					setShortcutActionStatus({
						text: gdlText('settings_unlink_one_failed', 'Could not unlink: {game}', { game: row.title }),
						color: '#d94126',
					});
				}
			} catch (error) {
				backendLog('Single unlink failed: ' + String(error));
			}
		})();
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
			// Steam reserves the bottom edge of this sidebar window for native
			// resize gestures. Extra scrollable space keeps the final controls out
			// of that hit-test area at every UI scale and window size.
			paddingBottom: '64px',
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

			{/* ── Gestión de vinculaciones (Experimental) ──────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ padding: '11px 12px', background: 'rgba(229,173,55,.07)', border: '1px solid rgba(229,173,55,.28)', borderRadius: '4px' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
						<div style={{ fontWeight: 600, color: '#e5c07b', fontSize: '13px' }}>
							{gdlText('link_management_title', 'Game link management')}
						</div>
						<span style={{ padding: '1px 6px', fontSize: '10px', fontWeight: 700, borderRadius: '3px', background: 'rgba(229,173,55,0.2)', color: '#e5c07b', letterSpacing: '0.5px' }}>
							{gdlText('experimental_badge', 'EXPERIMENTAL')}
						</span>
					</div>
					<div style={{ color: '#9da4ab', fontSize: '11.3px', lineHeight: 1.45 }}>
						{gdlText('experimental_description', 'These tools prioritize safety: bulk linking skips ambiguous matches, and automatic review can only run after Steam’s native Add a Non-Steam Game dialog closes.')}
					</div>

					<div style={{ marginTop: '10px', padding: '10px 11px', background: 'rgba(20,29,42,.75)', border: '1px solid rgba(255,255,255,.08)', borderRadius: '3px' }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
							<div>
								<div style={{ color: '#8f98a0', fontSize: '11.5px' }}>
									{gdlText('link_management_summary', '{linked} of {total} non-Steam game(s) are linked.', { linked: String(linkedShortcutCount), total: String(shortcutRows.length) })}
								</div>
							</div>
							<div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
								{shortcutActionBusy === 'bulk-link' ? (
									<button
										type="button"
										onClick={(): void => { cancelBulkLink(); }}
										style={{
											padding: '6px 12px',
											color: '#fff',
											background: '#d94126',
											border: 0,
											borderRadius: '2px',
											cursor: 'pointer',
											fontSize: '11.5px',
											fontWeight: 600,
										}}
									>
										{gdlText('cancel', loc('Button_Cancel', 'Cancel'))}
									</button>
								) : (
									<>
										<button
											type="button"
											disabled={Boolean(shortcutActionBusy) || shortcutRows.length === 0 || shortcutRows.length === linkedShortcutCount}
											onClick={(): void => { void linkAllShortcuts(); }}
											style={{
												padding: '6px 10px',
												color: '#fff',
												background: (shortcutActionBusy || shortcutRows.length === 0 || shortcutRows.length === linkedShortcutCount)
													? '#3d4450'
													: 'linear-gradient(90deg,#06bfff,#2d73ff)',
												border: 0,
												borderRadius: '2px',
												cursor: (shortcutActionBusy || shortcutRows.length === 0 || shortcutRows.length === linkedShortcutCount) ? 'default' : 'pointer',
												fontSize: '11.5px',
												fontWeight: 500,
											}}
										>
											{gdlText('link_all_button', 'Link all')}
										</button>
										<button
											type="button"
											disabled={Boolean(shortcutActionBusy) || shortcutRows.length === 0 || linkedShortcutCount === 0}
											onClick={(): void => { void unlinkAllShortcuts(); }}
											style={{
												padding: '6px 10px',
												color: '#dcdedf',
												background: '#3d4450',
												border: 0,
												borderRadius: '2px',
												cursor: (shortcutActionBusy || shortcutRows.length === 0 || linkedShortcutCount === 0) ? 'default' : 'pointer',
												fontSize: '11.5px',
											}}
										>
											{shortcutActionBusy === 'all' ? gdlText('bulk_unlinking_short', 'Unlinking...') : gdlText('unlink_all_button', 'Unlink all')}
										</button>
									</>
								)}
							</div>
						</div>
						{shortcutActionStatus && <div style={{ marginTop: '8px', color: shortcutActionStatus.color, fontSize: '11.5px' }}>{shortcutActionStatus.text}</div>}
						{dynamicBulkLinkStatus && <div style={{ marginTop: '8px', color: dynamicBulkLinkStatus.color, fontSize: '11.5px', lineHeight: 1.4 }}>{dynamicBulkLinkStatus.text}</div>}
						{bulkLinkProgress && shortcutActionBusy === 'bulk-link' && (
							<div style={{ marginTop: '9px' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: '#c6d4df', fontSize: '11px' }}>
									<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
										{bulkLinkProgress.phase === 'analyzing'
											? gdlText('bulk_link_analyzing_game', 'Analyzing: {game}', { game: bulkLinkProgress.title })
											: gdlText('bulk_link_linking_game', 'Linking: {game}', { game: bulkLinkProgress.title })}
									</span>
									<strong style={{ flex: '0 0 auto', color: '#66c0f4' }}>{bulkLinkProgress.done}/{bulkLinkProgress.total}</strong>
								</div>
								<div style={{ height: '4px', marginTop: '6px', background: 'rgba(255,255,255,.08)', borderRadius: '2px', overflow: 'hidden' }}>
									<div style={{ height: '100%', width: `${bulkLinkProgress.total > 0 ? Math.min(100, (bulkLinkProgress.done / bulkLinkProgress.total) * 100) : 0}%`, background: '#1a9fff', transition: 'width .18s ease' }} />
								</div>
							</div>
						)}
						{bulkNotLinked.length > 0 && (
							<div style={{ marginTop: '9px', padding: '8px 9px', background: 'rgba(217,65,38,.07)', border: '1px solid rgba(217,65,38,.18)', borderRadius: '2px' }}>
								<div style={{ color: '#e7b39f', fontWeight: 600, fontSize: '11px' }}>
									{gdlText('bulk_link_not_linked_title', 'Could not be linked ({count})', { count: String(bulkNotLinked.length) })}
								</div>
								<div style={{ marginTop: '5px', maxHeight: '130px', overflowY: 'auto' }}>
									{bulkNotLinked.map(item => (
										<div key={`${item.shortcutAppId}:${item.status}`} style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,.045)' }}>
											<div style={{ color: '#dcdedf', fontSize: '10.8px' }}>{item.title}</div>
											<div style={{ marginTop: '1px', color: '#8f98a0', fontSize: '10.2px' }}>{bulkLinkReasonLabel(item.reason)}</div>
										</div>
									))}
								</div>
							</div>
						)}
						{bulkQueued.length > 0 && (
							<div style={{ marginTop: '7px', color: '#d6b25e', fontSize: '10.8px', lineHeight: 1.4 }}>
								{gdlText('bulk_link_retrying_games', 'Still completing in the background ({count}): {games}', {
									count: String(bulkQueued.length), games: bulkQueued.map(item => item.title).join(', '),
								})}
							</div>
						)}
						<div style={{ marginTop: '9px', maxHeight: '250px', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,.07)' }}>
							{shortcutRows.length === 0 ? (
								<div style={{ padding: '9px 0 2px', color: '#8f98a0', fontSize: '11.5px' }}>{gdlText('link_management_empty', 'No non-Steam games are currently available.')}</div>
							) : shortcutRows.map(row => {
								const linked = /^\d+$/.test(row.steamAppId);
								const busy = shortcutActionBusy === String(row.id);
								return (
									<div key={row.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.055)' }}>
										<div style={{ minWidth: 0, flex: 1 }}>
											<div title={row.title} style={{ color: '#dcdedf', fontSize: '11.8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
											<div style={{ marginTop: '2px', color: linked ? '#59bf40' : '#8f98a0', fontSize: '10.8px' }}>
												{linked ? gdlText('game_linked_appid', 'Linked · Steam AppID {appid}', { appid: row.steamAppId }) : gdlText('game_unlinked_status', 'Unlinked')}
											</div>
										</div>
										{linked ? (
											<button
												type="button"
												disabled={Boolean(shortcutActionBusy)}
												onClick={(): void => { void unlinkOneShortcut(row); }}
												style={{ flex: '0 0 auto', padding: '5px 9px', color: '#dcdedf', background: '#3d4450', border: 0, borderRadius: '2px', cursor: shortcutActionBusy ? 'default' : 'pointer', fontSize: '11px' }}
											>
												{busy ? gdlText('bulk_unlinking_short', 'Unlinking...') : gdlText('unlink', 'Unlink')}
											</button>
										) : (
											<button
												type="button"
												disabled={Boolean(shortcutActionBusy)}
												onClick={(): void => {
													const opened = requestManualShortcutLink(row.id, row.title);
													setShortcutActionStatus({
														text: opened ? gdlText('manual_link_review_started', 'Link review opened for {game}.', { game: row.title }) : gdlText('manual_link_review_failed', 'Could not start link review for {game}.', { game: row.title }),
														color: opened ? '#66c0f4' : '#d94126',
													});
												}}
												style={{ flex: '0 0 auto', padding: '5px 9px', color: '#fff', background: 'linear-gradient(90deg,#06bfff,#2d73ff)', border: 0, borderRadius: '2px', cursor: shortcutActionBusy ? 'default' : 'pointer', fontSize: '11px' }}
											>
												{gdlText('link_button', 'Link')}
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>

					<div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid rgba(229,173,55,.18)' }}>
						<div style={{ fontWeight: 600, color: '#dcdedf', fontSize: '11.8px' }}>{gdlText('auto_detect_title', 'Native add-game detection')}</div>
						<div style={{ marginTop: '3px', color: '#8f98a0', fontSize: '11px', lineHeight: 1.4 }}>{gdlText('auto_detect_native_add_description', 'Only watches the session created by Steam’s Add a Non-Steam Game dialog. Startup, navigation, language changes and unlinking can never trigger this prompt.')}</div>
						<div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
							<SettingsToggle checked={preferences.autoDetectShortcuts} onChange={checked => updatePreferences({ autoDetectShortcuts: checked })} label={gdlText('auto_detect_shortcuts_toggle', 'Suggest linking only after adding a game through Steam’s native Add a Non-Steam Game dialog')} />
							<span style={{ fontSize: '11.5px', color: '#c6d4df' }}>{gdlText('auto_detect_shortcuts_toggle', 'Suggest linking only after adding a game through Steam’s native Add a Non-Steam Game dialog')}</span>
						</div>
					</div>
				</div>

				<SteamGridDbSettings preferences={preferences} onChange={updatePreferences} Toggle={SettingsToggle} />
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

			{/* ── Política global de logros simulados ─────────────────────── */}
			<div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
				<div style={{ marginBottom: '3px', fontWeight: 600, color: '#dcdedf', fontSize: '13px' }}>
					{gdlText('simulated_achievements_title', 'Simulated achievements')}
				</div>
				<div style={{ marginBottom: '6px', color: '#8f98a0', fontSize: '11.5px' }}>
					{gdlText('simulated_achievements_description', 'Global defaults for linked games. Per-game settings can override these values.')}
				</div>
				<div style={{ display: 'grid', gap: '8px' }}>
					<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
						<SettingsToggle checked={preferences.simulateAchievements} onChange={checked => updatePreferences({ simulateAchievements: checked })} label={gdlText('simulate_achievements', 'Enable simulated achievements when no local progress file exists')} />
						<span style={{ fontSize: '12px' }}>{gdlText('simulate_achievements', 'Enable simulated achievements when no local progress file exists')}</span>
					</div>
					<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
						<SettingsToggle checked={preferences.unlockOnlineAchievements} onChange={checked => updatePreferences({ unlockOnlineAchievements: checked })} label={gdlText('unlock_online_achievements_toggle', 'Unlock only achievements identified as online or multiplayer')} />
						<span style={{ fontSize: '12px' }}>{gdlText('unlock_online_achievements_toggle', 'Unlock only achievements identified as online or multiplayer')}</span>
					</div>
				</div>
			</div>
		</div>
	);
};
