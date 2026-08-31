import type { ShortcutDetectionContext, ShortcutDetectionResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { findActiveShortcutAppId, SHORTCUT_THRESHOLD, shortcutPathBasename } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut, getAllShortcutRecords, shortcutAlreadyLinked } from './registry';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { cancelPendingLinkJobs, enqueueLinkJob, getPendingLinkJob } from './link-job-queue';
import { isShortcutIdentityMutationInProgress, linkShortcutToSteam, shouldAutoApplyNoLauncher } from './linking';
import { isShortcutDismissed, undismissShortcut } from './dismissed';
import { navigateToLibraryShortcut } from '../../steam/navigation';
// Candidate confidence is presentation-only in the manual picker.
const REVIEW_CONFIDENCE_THRESHOLD = 70;
let shortcutLinkInProgress = false;
const shortcutDetectionInFlight = new Set<number>();
const shortcutDetectionScheduled = new Set<number>();

function shortcutMutationInProgress(): boolean {
	return shortcutLinkInProgress || isShortcutIdentityMutationInProgress();
}


let activeModalEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

function manualLinkModalPresent(doc?: Document | null): boolean {
	try {
		if (doc?.getElementById('gdl-manual-link-modal')) return true;
	} catch {}
	try {
		const hostDoc = shortcutRuntimeHost().getMainWindowDoc();
		if (hostDoc?.getElementById('gdl-manual-link-modal')) return true;
	} catch {}
	try {
		return Boolean(typeof document !== 'undefined' && document.getElementById('gdl-manual-link-modal'));
	} catch { return false; }
}

function closeShortcutManualLinkModal(doc: Document, _shortcutAppId: number, _dismiss: boolean): void {
	if (activeModalEscapeHandler) {
		try { doc.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
		try { document.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
		activeModalEscapeHandler = null;
	}
	doc.getElementById('gdl-manual-link-modal')?.remove();
	try { document.getElementById('gdl-manual-link-modal')?.remove(); } catch {}
}

export type ShortcutLinkReviewSource = 'manual' | 'native-add-auto';

export function showShortcutManualLinkModal(
	doc: Document,
	context: ShortcutDetectionContext,
	detection: ShortcutDetectionResult,
	options: { source?: ShortcutLinkReviewSource; loading?: boolean } = {},
): void {
	const targetDoc = (doc && doc.body) ? doc : (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' && document.body ? document : null));
	if (!targetDoc || !targetDoc.body) return;
	const existingModal = targetDoc.getElementById('gdl-manual-link-modal');
	if (existingModal) {
		existingModal.remove();
	}
	try { document?.getElementById('gdl-manual-link-modal')?.remove(); } catch {}
	const source: ShortcutLinkReviewSource = options.source || 'manual';
	const loading = options.loading === true;
	const automaticNativeAddReview = source === 'native-add-auto';
	const candidates = (detection.candidates || []).slice(0, 10);
	const hasCandidates = candidates.length > 0;
	const dialogTitle = automaticNativeAddReview
		? gdlText('auto_link_title', 'Steam game detected')
		: gdlText('link_game', 'Link game');
	const dialogMessage = loading
		? gdlText('link_searching', 'Searching for Steam matches…')
		: automaticNativeAddReview && hasCandidates
		? gdlText('auto_link_message', 'A likely Steam match was found for “{name}”. Confirm it before NativeGameLink loads the game data.', { name: context.title })
		: automaticNativeAddReview
		? gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.')
		: gdlText('detection_uncertain', 'Choose the correct result or enter the AppID manually.');
	const hasTrackingRecommendation = !!(context.bootstrapDetected && context.recommendedExePath);
	const exeName = context.exePath ? (shortcutPathBasename(context.exePath) || context.exePath) : context.title;
	const executableSummary = hasTrackingRecommendation
		? gdlText('selected_executable', 'Selected executable: {exe}', { exe: exeName })
		: gdlText('executable_preserved', 'Steam will keep launching the executable you selected: {exe}', { exe: exeName });

	const overlay = targetDoc.createElement('div');
	overlay.id = 'gdl-manual-link-modal';
	overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:Arial,Helvetica,sans-serif;color:#dcdedf;pointer-events:auto;';
	overlay.innerHTML = `
		<div role="dialog" aria-modal="true" style="width:min(620px,calc(100vw - 40px));overflow:hidden;border-radius:6px;background:linear-gradient(145deg,#1b2531,#121922);border:1px solid rgba(102,192,244,.30);box-shadow:0 24px 80px rgba(0,0,0,.78);">
			<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:linear-gradient(90deg,rgba(39,65,84,.95),rgba(24,31,41,.96));border-bottom:1px solid rgba(255,255,255,.09);">
				<div><div style="font-size:20px;font-weight:600;color:#fff;">${escapeHtml(dialogTitle)}</div><div style="margin-top:4px;font-size:11px;letter-spacing:.8px;color:#66c0f4;text-transform:uppercase;">${escapeHtml(loading ? gdlText('link_searching', 'Searching for Steam matches…') : hasCandidates ? gdlText('auto_link_ready_to_review', 'Match ready for review') : gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</div></div>
				<button class="gdl-manual-link-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}" style="border:0;background:transparent;color:#8f98a0;font-size:24px;line-height:1;cursor:pointer;padding:0 3px;">×</button>
			</div>
			<div style="padding:20px 22px 22px;">
				<div style="font-size:13px;line-height:1.5;color:#acb2b8;margin-bottom:17px;">${escapeHtml(dialogMessage)}</div>
				<div style="display:flex;gap:16px;align-items:stretch;margin-bottom:16px;padding:12px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.06);border-radius:4px;">
					<img class="gdl-manual-link-image" alt="" style="width:194px;height:91px;object-fit:cover;border:1px solid rgba(255,255,255,.10);border-radius:2px;" />
					<div style="display:flex;flex:1;min-width:0;flex-direction:column;justify-content:center;gap:7px;">
						<div class="gdl-manual-link-name" style="font-size:17px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
						<div class="gdl-manual-link-id" style="font-size:12px;color:#66c0f4;"></div>
						<select class="gdl-manual-link-select" style="width:100%;padding:7px 9px;background:#20242b;border:1px solid #3d4450;border-radius:2px;color:#dcdedf;font-size:12px;"></select>
					</div>
				</div>
				<label style="display:block;margin:0 0 14px;font-size:11px;color:#8f98a0;">
					<span style="display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.45px;">${escapeHtml(gdlText('manual_appid_label', 'Or enter a Steam AppID manually'))}</span>
					<input class="gdl-manual-link-manual-appid" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(gdlText('manual_appid_placeholder', 'Steam AppID'))}" style="box-sizing:border-box;width:100%;padding:8px 9px;background:#101820;border:1px solid #3d4450;border-radius:2px;color:#dcdedf;font-size:12px;" />
				</label>
				<div class="gdl-manual-link-exe-summary" style="padding:9px 11px;background:rgba(0,0,0,.18);color:#8f98a0;font-size:11px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(executableSummary)}</div>
				<label class="gdl-manual-link-tracking" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 11px;background:rgba(91,163,43,.10);border:1px solid rgba(91,163,43,.28);color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-manual-link-tracking-input" type="checkbox" checked style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('use_tracking_executable', 'Use the real game executable'))}</strong><br />${escapeHtml(gdlText('tracking_executable_help', '{bootstrap} closes after launching {game}. Use {game} so Steam keeps tracking playtime.', { bootstrap: shortcutPathBasename(context.exePath), game: shortcutPathBasename(context.recommendedExePath || '') }))}</span>
				</label>
				<label class="gdl-manual-link-launcher" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-manual-link-launcher-input" type="checkbox" style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('launcher_detected', 'This target looks like a game launcher. You may optionally add -nolauncher.'))}</span>
				</label>
				<div class="gdl-manual-link-progress" style="display:flex;gap:7px;margin-top:15px;color:#8f98a0;font-size:11px;"><span data-step="link" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_link', '1 · Link'))}</span><span data-step="identity" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_identity', '2 · Identity'))}</span><span data-step="assets" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_assets', '3 · Assets'))}</span></div>
				<div class="gdl-manual-link-status" aria-live="polite" style="min-height:18px;margin-top:11px;font-size:12px;color:#8f98a0;"></div>
				<div class="gdl-manual-link-result" aria-live="polite" style="display:none;margin-top:12px;padding:11px 12px;border-radius:3px;font-size:12px;line-height:1.45;"></div>
				<div style="display:flex;justify-content:flex-end;gap:9px;margin-top:14px;">
					<button class="gdl-manual-link-cancel" style="padding:9px 17px;border:0;border-radius:2px;background:#3d4450;color:#dcdedf;cursor:pointer;">${escapeHtml(automaticNativeAddReview ? gdlText('reject_link', 'Reject') : gdlText('cancel', 'Cancel'))}</button>
					<button class="gdl-manual-link-confirm" style="padding:9px 18px;border:0;border-radius:2px;background:linear-gradient(90deg,#06bfff,#2d73ff);color:#fff;cursor:pointer;">${escapeHtml(gdlText('link_game', 'Link game'))}</button>
				</div>
			</div>
		</div>`;

	const select = overlay.querySelector('.gdl-manual-link-select') as HTMLSelectElement;
	const manualAppIdInput = overlay.querySelector('.gdl-manual-link-manual-appid') as HTMLInputElement;
	const image = overlay.querySelector('.gdl-manual-link-image') as HTMLImageElement;
	const name = overlay.querySelector('.gdl-manual-link-name') as HTMLElement;
	const appId = overlay.querySelector('.gdl-manual-link-id') as HTMLElement;
	const trackingLabel = overlay.querySelector('.gdl-manual-link-tracking') as HTMLElement;
	const trackingInput = overlay.querySelector('.gdl-manual-link-tracking-input') as HTMLInputElement;
	const launcherLabel = overlay.querySelector('.gdl-manual-link-launcher') as HTMLElement;
	const launcherInput = overlay.querySelector('.gdl-manual-link-launcher-input') as HTMLInputElement;
	const status = overlay.querySelector('.gdl-manual-link-status') as HTMLElement;
	const progress = overlay.querySelector('.gdl-manual-link-progress') as HTMLElement;
	const resultPanel = overlay.querySelector('.gdl-manual-link-result') as HTMLElement;
	const confirm = overlay.querySelector('.gdl-manual-link-confirm') as HTMLButtonElement;
	const cancel = overlay.querySelector('.gdl-manual-link-cancel') as HTMLButtonElement;
	const clearCandidateImage = (): void => {
		image.onload = null;
		image.onerror = null;
		image.removeAttribute('src');
		image.style.visibility = 'hidden';
	};
	const loadCandidateImage = (source: string): void => {
		const url = source.trim();
		if (!url) {
			clearCandidateImage();
			return;
		}
		image.style.visibility = 'visible';
		const settleImage = (loaded: boolean): void => {
			image.style.visibility = loaded ? 'visible' : 'hidden';
		};
		image.onload = () => settleImage(true);
		image.onerror = () => settleImage(false);
		if (image.getAttribute('src') !== url) image.src = url;
		else if (image.complete) settleImage(image.naturalWidth > 0);
	};

	for (const candidate of candidates) {
		const option = targetDoc.createElement('option');
		option.value = candidate.appid;
		option.textContent = `${candidate.name} — AppID ${candidate.appid} (${Math.round(candidate.score)}%)`;
		select.appendChild(option);
	}
	if (candidates.length) {
		// Steam CEF can restore the previous value of a dynamically recreated
		// <select>. Always start on the backend's highest-ranked candidate instead
		// of silently preserving an AppID selected in an earlier modal.
		select.selectedIndex = 0;
		select.value = candidates[0].appid;
	} else {
		const option = targetDoc.createElement('option');
		option.value = '';
		option.textContent = loading
			? gdlText('link_searching', 'Searching for Steam matches…')
			: gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)');
		select.appendChild(option);
		select.disabled = true;
	}
	let imageRequestRevision = 0;
	let manualLookupTimer: ReturnType<typeof setTimeout> | null = null;
	const renderCandidate = () => {
		if (manualLookupTimer) {
			clearTimeout(manualLookupTimer);
			manualLookupTimer = null;
		}
		const candidate = candidates.find(item => item.appid === select.value) || candidates[0];
		const requestRevision = ++imageRequestRevision;
		if (!candidate) {
			name.textContent = context.title;
			appId.textContent = '';
			clearCandidateImage();
			status.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
			status.style.color = '#e5ad37';
			return;
		}
		name.textContent = candidate.name;
		appId.textContent = `Steam AppID ${candidate.appid} · ${Math.round(candidate.score)}%`;
		if (!candidate.direct && candidate.score < REVIEW_CONFIDENCE_THRESHOLD && candidate.executable_match) {
			status.textContent = gdlText(
				'auto_link_executable_verified_review',
				'The executable matches this Steam game, but the shortcut title is uncertain. Review it before linking.',
			);
			status.style.color = '#e5ad37';
		} else if (!candidate.direct && candidate.score < REVIEW_CONFIDENCE_THRESHOLD) {
			status.textContent = gdlText(
				'detection_uncertain',
				'The match is uncertain. Choose the correct result or enter the AppID manually.',
			);
			status.style.color = '#e5ad37';
		} else {
			status.textContent = '';
			status.style.color = '#8f98a0';
		}
		// Store-search thumbnails and guessed static CDN paths are not stable for
		// every Steam game. Show the candidate image immediately, then reconcile
		// it with the authoritative appdetails header for the selected AppID.
		loadCandidateImage(candidate.image || '');
		void getGameData(candidate.appid).then(official => {
			if (requestRevision !== imageRequestRevision || select.value !== candidate.appid) return;
			const officialImage = String(official?.header_image || official?.capsule_image || official?.capsule_imagev5 || '').trim();
			if (!officialImage) return;
			candidate.image = officialImage;
			loadCandidateImage(officialImage);
		}).catch(() => {});
	};
	const renderManualAppId = () => {
		const manualAppId = manualAppIdInput.value.trim();
		if (!manualAppId) {
			renderCandidate();
			return;
		}
		if (!/^\d+$/.test(manualAppId)) {
			imageRequestRevision += 1;
			name.textContent = gdlText('manual_appid_title', 'Manual Steam AppID');
			appId.textContent = '';
			clearCandidateImage();
			status.textContent = gdlText('manual_appid_invalid', 'Enter a numeric Steam AppID.');
			status.style.color = '#e5ad37';
			return;
		}
		const requestRevision = ++imageRequestRevision;
		name.textContent = gdlText('manual_appid_title', 'Manual Steam AppID');
		appId.textContent = `Steam AppID ${manualAppId}`;
		clearCandidateImage();
		status.textContent = gdlText('verifying_steam', 'Verifying on Steam...');
		status.style.color = '#8f98a0';
		if (manualLookupTimer) clearTimeout(manualLookupTimer);
		manualLookupTimer = setTimeout(() => {
			void getGameData(manualAppId).then(official => {
				if (requestRevision !== imageRequestRevision || manualAppIdInput.value.trim() !== manualAppId) return;
				if (!official) {
					status.textContent = gdlText('appid_not_found', 'AppID {id} was not found on Steam.', { id: manualAppId });
					status.style.color = '#ff6b6b';
					return;
				}
				name.textContent = String(official.name || gdlText('manual_appid_title', 'Manual Steam AppID'));
				const officialImage = String(official.header_image || official.capsule_image || official.capsule_imagev5 || '').trim();
				if (officialImage) loadCandidateImage(officialImage);
				status.textContent = gdlText('manual_appid_ready', 'Manual AppID selected. Review the Steam game before linking.');
				status.style.color = '#66c0f4';
			}).catch(() => {
				if (requestRevision !== imageRequestRevision || manualAppIdInput.value.trim() !== manualAppId) return;
				status.textContent = gdlText('appid_not_found', 'AppID {id} was not found on Steam.', { id: manualAppId });
				status.style.color = '#ff6b6b';
			});
		}, 250);
	};
	const updateLauncherBypass = (appId: string) => {
		const shouldBypass = shouldAutoApplyNoLauncher(appId);
		if (shouldBypass) {
			launcherLabel.style.display = 'flex';
			launcherInput.checked = true;
		} else {
			launcherLabel.style.display = 'none';
			launcherInput.checked = false;
		}
	};

	select.addEventListener('change', () => {
		if (manualAppIdInput.value) manualAppIdInput.value = '';
		renderCandidate();
		const currentSelected = candidates.find(candidate => candidate.appid === select.value) || candidates[0];
		updateLauncherBypass(currentSelected?.appid || '');
	});
	manualAppIdInput.addEventListener('input', () => {
		renderManualAppId();
		updateLauncherBypass(manualAppIdInput.value.trim());
	});
	renderCandidate();
	if (loading) {
		status.textContent = gdlText('link_searching', 'Searching for Steam matches…');
		status.style.color = '#66c0f4';
		confirm.disabled = true;
		confirm.style.opacity = '.65';
	}
	const exeSummary = overlay.querySelector('.gdl-manual-link-exe-summary') as HTMLElement;
	const updateExeSummary = () => {
		if (hasTrackingRecommendation && trackingInput.checked) {
			const recName = shortcutPathBasename(context.recommendedExePath || '') || context.recommendedExePath || '';
			exeSummary.textContent = gdlText('selected_executable', 'Selected executable: {exe}', { exe: recName });
			exeSummary.style.color = '#a4d007';
		} else {
			exeSummary.textContent = gdlText('executable_preserved', 'Steam will keep launching the executable you selected: {exe}', { exe: exeName });
			exeSummary.style.color = '#8f98a0';
		}
	};
	if (hasTrackingRecommendation) {
		trackingLabel.style.display = 'flex';
		trackingInput.checked = true;
		trackingInput.addEventListener('change', updateExeSummary);
		updateExeSummary();
	}

	updateLauncherBypass(candidates[0]?.appid || '');

	let modalSubmitting = false;
	let linkSucceeded = false;
	let successfulLinkedShortcutId: number | null = null;
	let queuedLinkWatch: ReturnType<typeof setInterval> | null = null;
	let queuedInBackground = false;
	const stopQueuedLinkWatch = (): void => {
		if (queuedLinkWatch !== null) clearInterval(queuedLinkWatch);
		queuedLinkWatch = null;
	};
	const setProgress = (completed: number, warning = false, active = 0) => {
		for (const step of Array.from(progress.querySelectorAll<HTMLElement>('[data-step]'))) {
			const index = ['link', 'identity', 'assets'].indexOf(String(step.dataset.step)) + 1;
			step.style.background = index <= completed
				? (warning && index === 3 ? 'rgba(229,173,55,.18)' : 'rgba(91,163,43,.18)')
				: index === active ? 'rgba(102,192,244,.16)' : 'rgba(255,255,255,.05)';
			step.style.color = index <= completed
				? (warning && index === 3 ? '#e5ad37' : '#a4d007')
				: index === active ? '#66c0f4' : '#8f98a0';
		}
	};
	const dismiss = () => {
		// Closing is always allowed. The link transaction continues in the
		// background and the retry queue will reconcile it if Steam is still
		// rebuilding the shortcut identity; never trap the user behind a modal.
		stopQueuedLinkWatch();
		modalSubmitting = false;
		closeShortcutManualLinkModal(targetDoc, context.shortcutAppId, false);
		if (successfulLinkedShortcutId) {
			const liveDoc = shortcutRuntimeHost().getMainWindowDoc() || targetDoc;
			navigateToLibraryShortcut(liveDoc, successfulLinkedShortcutId);
			shortcutRuntimeHost().resetLibraryInjection?.(true, liveDoc);
		}
	};
	overlay.querySelector('.gdl-manual-link-close')?.addEventListener('click', dismiss);
	cancel.addEventListener('click', dismiss);
	overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });

	if (activeModalEscapeHandler) {
		try { targetDoc.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
		try { document.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
	}
	activeModalEscapeHandler = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismiss();
		}
	};
	targetDoc.addEventListener('keydown', activeModalEscapeHandler);
	const watchQueuedLink = (jobId: string): void => {
		stopQueuedLinkWatch();
		queuedInBackground = true;
		confirm.disabled = true;
		confirm.style.opacity = '.65';
		cancel.disabled = false;
		cancel.textContent = gdlText('close', 'Close');
		const refreshQueuedState = (): void => {
			if (!targetDoc.getElementById('gdl-manual-link-modal')) {
				stopQueuedLinkWatch();
				return;
			}
			const job = getPendingLinkJob(jobId);
			if (!job) {
				stopQueuedLinkWatch();
				queuedInBackground = false;
				linkSucceeded = true;
				setProgress(3);
				status.textContent = gdlText('link_queued_complete', '✓ The background link completed. The game is ready in your library.');
				status.style.color = '#5ba32b';
				confirm.style.display = 'none';
				cancel.textContent = gdlText('done', 'Done');
				shortcutRuntimeHost().resetLibraryInjection?.(true, shortcutRuntimeHost().getMainWindowDoc() || targetDoc);
				return;
			}
			if (job.status === 'failed') {
				stopQueuedLinkWatch();
				queuedInBackground = false;
				status.textContent = gdlText('link_queued_failed', 'The background link could not be completed. You can try again.');
				status.style.color = '#ff6b6b';
				confirm.disabled = false;
				confirm.style.opacity = '1';
				return;
			}
			if (job.attempts > 0) {
				status.textContent = gdlText('link_queued_retrying', 'Retrying the link in the background (attempt {attempts}).', { attempts: job.attempts });
				status.style.color = '#e5ad37';
			}
		};
		refreshQueuedState();
		if (queuedInBackground) queuedLinkWatch = setInterval(refreshQueuedState, 1000);
	};
	const queueLinkInBackground = (steamAppId: string, shortcutAppId = context.shortcutAppId, repairResources = false): void => {
		const job = enqueueLinkJob({
			title: context.title,
			shortcutAppId,
			steamAppId,
			skipLauncher: launcherInput.checked || shouldAutoApplyNoLauncher(steamAppId),
			existingLaunchOptions: context.launchOptions,
			trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
			trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
			shortcutExecutable: context.exePath || '',
			repairResources,
		});
		status.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
		status.style.color = '#66c0f4';
		watchQueuedLink(job.id);
	};
	confirm.addEventListener('click', async () => {
		if (modalSubmitting) return;
		const manualAppId = manualAppIdInput.value.trim();
		if (manualAppId && !/^\d+$/.test(manualAppId)) {
			status.textContent = gdlText('manual_appid_invalid', 'Enter a numeric Steam AppID.');
			status.style.color = '#ff6b6b';
			return;
		}
		const selected = candidates.find(candidate => candidate.appid === select.value) || candidates[0];
		const steamAppId = manualAppId || selected?.appid || '';
		if (!steamAppId) {
			status.textContent = gdlText('enter_appid', 'Enter an AppID or store link.');
			status.style.color = '#ff6b6b';
			manualAppIdInput.focus();
			return;
		}
		modalSubmitting = true;
		shortcutLinkInProgress = true;
		setProgress(1);
		confirm.disabled = true;
		cancel.disabled = false;
		cancel.textContent = gdlText('close', 'Close');
		confirm.style.opacity = '.65';
		cancelPendingLinkJobs(context.shortcutAppId, context.title);
		undismissShortcut(context.shortcutAppId);

		try {
			const result = await linkShortcutToSteam({
				doc: targetDoc,
				title: context.title,
				shortcutAppId: context.shortcutAppId,
				steamAppId,
				skipLauncher: launcherInput.checked || shouldAutoApplyNoLauncher(steamAppId),
				existingLaunchOptions: context.launchOptions,
				trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
				trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
				shortcutExecutable: context.exePath || '',
				onStatus: (message, color = '#8f98a0') => {
					status.textContent = message;
					status.style.color = color;
				},
				onPhase: phase => {
					if (phase === 'identity') setProgress(1, false, 2);
					if (phase === 'assets') setProgress(2, false, 3);
				},
			});
			if (result.ok) {
				linkSucceeded = true;
				const setup = result.setup; setProgress(3, false);
				resultPanel.style.display = 'block';
				const resourcesComplete = Boolean(setup?.artworkComplete && setup?.iconApplied);
				Object.assign(resultPanel.style, { border: resourcesComplete ? '1px solid rgba(91,163,43,.48)' : '1px solid rgba(229,173,55,.48)', background: resourcesComplete ? 'rgba(91,163,43,.12)' : 'rgba(229,173,55,.12)', color: resourcesComplete ? '#b4d99a' : '#f0c36b' });
				const community = setup?.communityArtwork?.length
					? gdlText('steamgriddb_contributed', ' SteamGridDB provided: {assets}.', { assets: setup.communityArtwork.join(', ') }) : '';
				resultPanel.innerHTML = resourcesComplete
					? `<strong style="color:#a4d007;">${escapeHtml(gdlText('link_complete_title', '✓ Link complete.'))}</strong><br>${escapeHtml(gdlText('link_complete_body', 'The official name, icon, and four library images were applied successfully.'))}${escapeHtml(community)}`
					: `<strong>${escapeHtml(gdlText('link_complete_title', '✓ Link complete.'))}</strong><br>${escapeHtml(gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.'))}`;
				status.textContent = resourcesComplete ? gdlText('link_ready_library', 'The game is ready in your library.') : gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
				if (!resourcesComplete) queueLinkInBackground(steamAppId, result.shortcutAppId || context.shortcutAppId, true);
				confirm.style.display = 'none';
				cancel.textContent = gdlText('done', 'Done');
				cancel.disabled = false;
				confirm.disabled = true;
				// The completion view stays open for the user to read, but it is no
				// longer submitting. This lets both “Listo” and Escape close it.
				modalSubmitting = false;
				successfulLinkedShortcutId = Number(result.shortcutAppId || context.shortcutAppId) || null;
				return;
			}
			if (!result.ok) {
				const retryable = !['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(result.error || ''));
				if (retryable) {
					queueLinkInBackground(steamAppId, result.shortcutAppId || context.shortcutAppId);
				}
				backendLog(`Link did not complete for ${context.title}: ${result.error || 'unknown_error'}`);
			}
		} catch (error) {
			queueLinkInBackground(steamAppId);
			backendLog(`Background link failed for ${context.title}: ${error}`);
		} finally {
			shortcutLinkInProgress = false;
			if (targetDoc.getElementById('gdl-manual-link-modal') && !linkSucceeded) {
				modalSubmitting = false;
				cancel.disabled = false;
				if (!queuedInBackground) {
					confirm.disabled = false;
					confirm.style.opacity = '1';
				}
			}
		}
	});

	targetDoc.body.appendChild(overlay);
}

async function inspectShortcutReview(
	record: { id: number; title: string },
	source: ShortcutLinkReviewSource,
	targetDoc?: Document | null,
): Promise<void> {
	// A dismissed shortcut intentionally renders the manual-link button even if
	// an older mapping remains on disk. It must be allowed to re-open review.
	if (shortcutAlreadyLinked(record.id) && !isShortcutDismissed(record.id)) return;
	// Paint the real picker immediately. Detection continues in the background
	// and replaces this same modal once candidates are ready; there is no separate
	// loading dialog that makes the click feel delayed or disconnected.
	const immediateDoc = (targetDoc && targetDoc.body)
		? targetDoc
		: (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' ? document : null));
	const immediateContext: ShortcutDetectionContext = {
		shortcutAppId: record.id,
		title: record.title,
		exePath: '',
		startDir: '',
		launchOptions: '',
		bootstrapDetected: false,
		recommendedExePath: '',
		recommendedStartDir: '',
	};
	const loadingShown = Boolean(immediateDoc?.body && !immediateDoc.getElementById('gdl-manual-link-modal'));
	if (loadingShown) {
		showShortcutManualLinkModal(immediateDoc as Document, immediateContext, { candidates: [] }, { source, loading: true });
		immediateDoc?.getElementById('gdl-manual-link-modal')?.setAttribute('data-gdl-link-loading', '1');
	}
	// A background queue mutation must not make an explicit click look dead.
	// Wait briefly for the current mutation to settle, then continue even if a
	// stale flag survived a route/cache rebuild. Automatic prompts still yield
	// immediately while another identity operation is active.
	if (shortcutMutationInProgress() && source === 'manual') {
		let waitMs = 0;
		while (shortcutMutationInProgress() && waitMs < 8000) {
			await new Promise(resolve => setTimeout(resolve, 250));
			waitMs += 250;
		}
	}
	if (shortcutMutationInProgress() && source !== 'manual') {
		backendLog(`Ignoring automatic link review for ${record.title} while another identity operation is active.`);
		return;
	}
	if (shortcutDetectionInFlight.has(record.id)) return;
	shortcutDetectionInFlight.add(record.id);
	try {
		let context: ShortcutDetectionContext | null = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			context = await buildShortcutDetectionContext(immediateDoc, record.title, record.id);
			if (context?.exePath || context?.title) break;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		if (!context) {
			context = {
				shortcutAppId: record.id,
				title: record.title,
				exePath: '',
				startDir: '',
				launchOptions: '',
				bootstrapDetected: false,
				recommendedExePath: '',
				recommendedStartDir: '',
			};
		}
		if (!context.title && !context.exePath) {
			backendLog(`Manual link review has no title or executable for shortcut ${record.title} (${record.id})`);
			return;
		}

		let rawDetection: ShortcutDetectionResult | null = null;
		try {
			rawDetection = await detectShortcutCandidates(context);
		} catch (detectionErr) {
			backendLog(`Candidate detection error for ${record.title}: ${detectionErr}`);
		}
		const detection: ShortcutDetectionResult = rawDetection && typeof rawDetection === 'object'
			? {
				candidates: Array.isArray(rawDetection.candidates) ? rawDetection.candidates : [],
				launcher_detected: Boolean(rawDetection.launcher_detected),
				generic_launcher: Boolean(rawDetection.generic_launcher),
				executable: String(rawDetection.executable || ''),
				source: String(rawDetection.source || ''),
				error: rawDetection.error,
			}
			: {
				candidates: [],
				launcher_detected: false,
				generic_launcher: false,
				executable: '',
				source: '',
			};

		const existingMappedId = findMappingForShortcut(record.id, record.title, context.exePath);
		if (existingMappedId && /^\d+$/.test(existingMappedId)) {
			const mappedData = await getGameData(existingMappedId);
			if (mappedData) {
				const existingIndex = detection.candidates.findIndex(candidate => candidate.appid === existingMappedId);
				if (existingIndex >= 0) {
					const [item] = detection.candidates.splice(existingIndex, 1);
					item.score = 100;
					detection.candidates.unshift(item);
				} else {
					detection.candidates.unshift({
						appid: existingMappedId,
						name: mappedData.name || record.title,
						score: 100,
						direct: true,
						confidence: 'high',
						image: mappedData.header_image,
					});
				}
			}
		}

		// A route change or an explicit close can remove the immediate modal while
		// detection is running. Never resurrect it after that cancellation.
		if (loadingShown && !manualLinkModalPresent(immediateDoc)) return;
		const doc = (immediateDoc && immediateDoc.body)
			? immediateDoc
			: (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' ? document : null));
		if (!doc?.body) return;
		// The immediate picker is replaced in-place with the detected candidate
		// data. Closing it is an explicit cancellation, so stop here.
		if (loadingShown) {
			if (!doc.getElementById('gdl-manual-link-modal')) return;
			doc.getElementById('gdl-manual-link-modal')?.remove();
		}
		if (shortcutAlreadyLinked(record.id) && !isShortcutDismissed(record.id) && source !== 'manual') return;
		backendLog(`Showing ${source} link modal for ${record.title} with ${detection.candidates.length} candidate(s)`);
		showShortcutManualLinkModal(doc, context, detection, { source });
	} catch (error) {
		backendLog(`Manual shortcut review failed for ${record.title}: ${error}`);
	} finally {
		if (loadingShown) {
			const liveDoc = (immediateDoc && immediateDoc.body)
				? immediateDoc
				: (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' ? document : null));
			liveDoc?.querySelector('#gdl-manual-link-modal[data-gdl-link-loading="1"]')?.remove();
		}
		shortcutDetectionScheduled.delete(record.id);
		shortcutDetectionInFlight.delete(record.id);
	}
}

function scheduleShortcutReview(
	record: { id: number; title: string },
	delay = 50,
	source: ShortcutLinkReviewSource = 'manual',
	targetDoc?: Document | null,
): void {
	if (!Number.isFinite(record.id) || record.id < 2147483648 || !record.title.trim()) return;
	if (shortcutDetectionScheduled.has(record.id) || shortcutDetectionInFlight.has(record.id)) return;
	shortcutDetectionScheduled.add(record.id);
	setTimeout(() => {
		void inspectShortcutReview(record, source, targetDoc).finally(() => shortcutDetectionScheduled.delete(record.id));
	}, delay);
}

function resolveOrSynthesizeShortcutRecord(shortcutAppId: number, gameTitle = '', targetDoc?: Document | null): { id: number; title: string; app: any } | null {
	const numericId = Number(shortcutAppId);
	let normalizedId = Number.isFinite(numericId) && numericId < SHORTCUT_THRESHOLD ? (numericId >>> 0) : numericId;
	const records = getAllShortcutRecords();
	if (!records.some(candidate => candidate.id === normalizedId) && gameTitle.trim()) {
		try {
			const activeDoc = targetDoc || shortcutRuntimeHost().getMainWindowDoc();
			const active = findActiveShortcutAppId(activeDoc as Document, gameTitle);
			const activeId = Number(active || 0);
			if (activeId >= SHORTCUT_THRESHOLD && records.some(candidate => candidate.id === activeId)) normalizedId = activeId;
		} catch {}
	}
	const exact = normalizedId ? records.find(candidate => candidate.id === normalizedId) : undefined;
	const titleMatches = gameTitle.trim() ? records.filter(candidate => normalizeTitle(candidate.title) === normalizeTitle(gameTitle)) : [];
	const record = exact || (titleMatches.length === 1 ? titleMatches[0] : (titleMatches.find(c => !shortcutAlreadyLinked(c.id)) || titleMatches[0]));
	if (record) return record;
	const cleanTitle = gameTitle.trim();
	if (!cleanTitle && (!normalizedId || normalizedId < SHORTCUT_THRESHOLD)) return null;
	let fallbackId = normalizedId && normalizedId >= SHORTCUT_THRESHOLD ? normalizedId : 0;
	if (!fallbackId && cleanTitle) {
		let hash = 0;
		for (let i = 0; i < cleanTitle.length; i++) hash = (hash * 31 + cleanTitle.charCodeAt(i)) >>> 0;
		fallbackId = SHORTCUT_THRESHOLD + (hash % 1000000000);
	}
	return { id: fallbackId, title: cleanTitle || 'Non-Steam Game', app: null };
}

/** User-initiated linking. No background path calls this workflow. */
export function requestManualShortcutLink(shortcutAppId: number, gameTitle = '', targetDoc?: Document | null): boolean {
	const record = resolveOrSynthesizeShortcutRecord(shortcutAppId, gameTitle, targetDoc);
	if (!record) return false;
	undismissShortcut(record.id);
	scheduleShortcutReview(record, 0, 'manual', targetDoc);
	return true;
}

/** Native-add-only automatic review. */
export function requestNativeAddShortcutReview(shortcutAppId: number, gameTitle = '', targetDoc?: Document | null): boolean {
	const record = resolveOrSynthesizeShortcutRecord(shortcutAppId, gameTitle, targetDoc);
	if (!record || shortcutAlreadyLinked(record.id)) return false;
	undismissShortcut(record.id);
	scheduleShortcutReview(record, 0, 'native-add-auto', targetDoc);
	return true;
}

export { linkAllShortcutsExperimental, type BulkLinkAllResult, type BulkLinkGameOutcome, type BulkLinkOutcomeStatus, type BulkLinkProgressPhase } from './bulk-link';
