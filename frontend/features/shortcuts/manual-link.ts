import type { ShortcutDetectionCandidate, ShortcutDetectionContext, ShortcutDetectionResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { shortcutPathBasename } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut, getAllShortcutRecords, isUnrealShippingExecutable, shortcutAlreadyLinked } from './registry';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { enqueueLinkJob } from './link-job-queue';
import { isShortcutIdentityMutationInProgress, linkShortcutToSteam } from './linking';
import { undismissShortcut } from './dismissed';
import { isNativeAddAutoPromptSuppressed, suppressNativeAddAutoPrompt } from './auto-prompt-policy';
// Candidate confidence is presentation-only in the manual picker.
const REVIEW_CONFIDENCE_THRESHOLD = 70;
let shortcutManualLinkModalOpen = false;
let shortcutLinkInProgress = false;
const shortcutDetectionInFlight = new Set<number>();
const shortcutDetectionScheduled = new Set<number>();

function shortcutMutationInProgress(): boolean {
	return shortcutLinkInProgress || isShortcutIdentityMutationInProgress();
}


let activeModalEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

function manualLinkModalPresent(): boolean {
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
	shortcutManualLinkModalOpen = false;
}

export type ShortcutLinkReviewSource = 'manual' | 'native-add-auto';

export function showShortcutManualLinkModal(
	doc: Document,
	context: ShortcutDetectionContext,
	detection: ShortcutDetectionResult,
	options: { source?: ShortcutLinkReviewSource } = {},
): void {
	const targetDoc = (doc && doc.body) ? doc : (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' && document.body ? document : null));
	if (!targetDoc || !targetDoc.body) return;
	if (targetDoc.getElementById('gdl-manual-link-modal')) return;
	try { targetDoc.getElementById('gdl-manual-link-modal')?.remove(); } catch {}
	const source: ShortcutLinkReviewSource = options.source || 'manual';
	const automaticNativeAddReview = source === 'native-add-auto';
	const candidates = (detection.candidates || []).slice(0, 10);
	const dialogTitle = automaticNativeAddReview
		? gdlText('auto_link_title', 'Steam game detected')
		: gdlText('link_game', 'Link game');
	const dialogMessage = automaticNativeAddReview
		? gdlText('auto_link_message', 'A likely Steam match was found for “{name}”. Confirm it before GameBridge loads the game data.', { name: context.title })
		: gdlText('detection_uncertain', 'Choose the correct result or enter the AppID manually.');
	const hasTrackingRecommendation = !!(context.bootstrapDetected && context.recommendedExePath);
	const exeName = context.exePath ? (shortcutPathBasename(context.exePath) || context.exePath) : context.title;
	const executableSummary = hasTrackingRecommendation
		? gdlText('selected_executable', 'Selected executable: {exe}', { exe: exeName })
		: gdlText('executable_preserved', 'Steam will keep launching the executable you selected: {exe}', { exe: exeName });
	shortcutManualLinkModalOpen = true;

	const overlay = targetDoc.createElement('div');
	overlay.id = 'gdl-manual-link-modal';
	overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:Arial,Helvetica,sans-serif;color:#dcdedf;pointer-events:auto;';
	overlay.innerHTML = `
		<div role="dialog" aria-modal="true" style="width:min(620px,calc(100vw - 40px));overflow:hidden;border-radius:6px;background:linear-gradient(145deg,#1b2531,#121922);border:1px solid rgba(102,192,244,.30);box-shadow:0 24px 80px rgba(0,0,0,.78);">
			<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:linear-gradient(90deg,rgba(39,65,84,.95),rgba(24,31,41,.96));border-bottom:1px solid rgba(255,255,255,.09);">
				<div><div style="font-size:20px;font-weight:600;color:#fff;">${escapeHtml(dialogTitle)}</div><div style="margin-top:4px;font-size:11px;letter-spacing:.8px;color:#66c0f4;text-transform:uppercase;">${escapeHtml(gdlText('auto_link_ready_to_review', 'Match ready for review'))}</div></div>
				<button class="gdl-manual-link-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}" style="border:0;background:transparent;color:#8f98a0;font-size:24px;line-height:1;cursor:pointer;padding:0 3px;">×</button>
			</div>
			<div style="padding:20px 22px 22px;">
				<div style="font-size:13px;line-height:1.5;color:#acb2b8;margin-bottom:17px;">${escapeHtml(dialogMessage)}</div>
				<div style="display:flex;gap:16px;align-items:stretch;margin-bottom:16px;padding:12px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.06);border-radius:4px;">
					<img class="gdl-manual-link-image" alt="" style="width:194px;height:91px;object-fit:cover;background:#10141a;border:1px solid rgba(255,255,255,.10);border-radius:2px;" />
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
				<div style="padding:9px 11px;background:rgba(0,0,0,.18);color:#8f98a0;font-size:11px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(executableSummary)}</div>
				<label class="gdl-manual-link-tracking" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 11px;background:rgba(91,163,43,.10);border:1px solid rgba(91,163,43,.28);color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-manual-link-tracking-input" type="checkbox" style="margin-top:2px;" />
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
		option.textContent = gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)');
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
			image.removeAttribute('src');
			image.style.visibility = 'hidden';
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
		image.onerror = () => { image.style.visibility = 'hidden'; };
		image.src = candidate.image || '';
		image.style.visibility = candidate.image ? 'visible' : 'hidden';
		void getGameData(candidate.appid).then(official => {
			if (requestRevision !== imageRequestRevision || select.value !== candidate.appid) return;
			const officialImage = String(official?.header_image || official?.capsule_image || official?.capsule_imagev5 || '').trim();
			if (!officialImage) return;
			candidate.image = officialImage;
			image.onerror = () => { image.style.visibility = 'hidden'; };
			if (image.src !== officialImage) image.src = officialImage;
			image.style.visibility = 'visible';
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
			image.removeAttribute('src');
			image.style.visibility = 'hidden';
			status.textContent = gdlText('manual_appid_invalid', 'Enter a numeric Steam AppID.');
			status.style.color = '#e5ad37';
			return;
		}
		const requestRevision = ++imageRequestRevision;
		name.textContent = gdlText('manual_appid_title', 'Manual Steam AppID');
		appId.textContent = `Steam AppID ${manualAppId}`;
		image.removeAttribute('src');
		image.style.visibility = 'hidden';
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
				if (officialImage) {
					image.onerror = () => { image.style.visibility = 'hidden'; };
					image.src = officialImage;
					image.style.visibility = 'visible';
				}
				status.textContent = gdlText('manual_appid_ready', 'Manual AppID selected. Review the Steam game before linking.');
				status.style.color = '#66c0f4';
			}).catch(() => {
				if (requestRevision !== imageRequestRevision || manualAppIdInput.value.trim() !== manualAppId) return;
				status.textContent = gdlText('appid_not_found', 'AppID {id} was not found on Steam.', { id: manualAppId });
				status.style.color = '#ff6b6b';
			});
		}, 250);
	};
	select.addEventListener('change', () => {
		if (manualAppIdInput.value) manualAppIdInput.value = '';
		renderCandidate();
	});
	manualAppIdInput.addEventListener('input', renderManualAppId);
	renderCandidate();
	if (hasTrackingRecommendation) trackingLabel.style.display = 'flex';

	const allowNoLauncher = detection.launcher_detected
		&& !detection.generic_launcher
		&& !isUnrealShippingExecutable(context.exePath || '');
	if (allowNoLauncher) launcherLabel.style.display = 'flex';

	let modalSubmitting = false;
	let linkSucceeded = false;
	const setProgress = (completed: number, warning = false) => {
		for (const step of Array.from(progress.querySelectorAll<HTMLElement>('[data-step]'))) {
			const index = ['link', 'identity', 'assets'].indexOf(String(step.dataset.step)) + 1;
			step.style.background = index <= completed ? (warning && index === 3 ? 'rgba(229,173,55,.18)' : 'rgba(91,163,43,.18)') : 'rgba(255,255,255,.05)';
			step.style.color = index <= completed ? (warning && index === 3 ? '#e5ad37' : '#a4d007') : '#8f98a0';
		}
	};
	const dismiss = () => {
		if (modalSubmitting) return;
		if (automaticNativeAddReview && !linkSucceeded) suppressNativeAddAutoPrompt(context.shortcutAppId, context.exePath);
		closeShortcutManualLinkModal(targetDoc, context.shortcutAppId, false);
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
		cancel.disabled = true;
		confirm.style.opacity = '.65';
		undismissShortcut(context.shortcutAppId);

		try {
			const result = await linkShortcutToSteam({
				doc: targetDoc,
				title: context.title,
				shortcutAppId: context.shortcutAppId,
				steamAppId,
				skipLauncher: allowNoLauncher && launcherInput.checked,
				existingLaunchOptions: context.launchOptions,
				trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
				trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
				shortcutExecutable: context.exePath || '',
				onStatus: (message, color = '#8f98a0') => {
					status.textContent = message;
					status.style.color = color;
					if (/actualizando nombre|updating name/i.test(message)) setProgress(2);
				},
			});
			if (result.ok) {
				linkSucceeded = true;
				const setup = result.setup;
				const complete = Boolean(setup?.nameReady && setup?.iconApplied && setup?.artworkComplete);
				setProgress(3, !complete);
				resultPanel.style.display = 'block';
				resultPanel.style.border = `1px solid ${complete ? 'rgba(91,163,43,.48)' : 'rgba(229,173,55,.48)'}`;
				resultPanel.style.background = complete ? 'rgba(91,163,43,.12)' : 'rgba(229,173,55,.10)';
				resultPanel.style.color = complete ? '#b4d99a' : '#e5c07b';
				if (complete) {
					const community = setup?.communityArtwork?.length
						? gdlText('steamgriddb_contributed', ' SteamGridDB provided: {assets}.', { assets: setup.communityArtwork.join(', ') }) : '';
					resultPanel.innerHTML = `<strong style="color:#a4d007;">${escapeHtml(gdlText('link_complete_title', '✓ Link complete.'))}</strong><br>${escapeHtml(gdlText('link_complete_body', 'The official name, icon, and four library images were applied successfully.'))}${escapeHtml(community)}`;
					status.textContent = gdlText('link_ready_library', 'The game is ready in your library.');
				} else {
					const missing = setup?.missingArtwork?.length
						? gdlText('link_warning_missing', ' Missing: {assets}.', { assets: setup.missingArtwork.join(', ') }) : '';
					const iconWarning = setup?.iconApplied ? '' : gdlText('link_warning_icon', 'The official icon could not be applied. ');
					resultPanel.innerHTML = `<strong style="color:#e5ad37;">${escapeHtml(gdlText('link_warning_title', 'Linked with warnings.'))}</strong><br>${escapeHtml(iconWarning + missing + gdlText('link_warning_fallback', 'When Steam does not publish a library asset, its available official artwork is retained as an alternative.'))}`;
					status.textContent = gdlText('link_saved_review', 'The link was saved; review the indicated artwork.');
				}
				confirm.style.display = 'none';
				cancel.textContent = gdlText('done', 'Done');
				cancel.disabled = false;
				confirm.disabled = true;
				// The completion view stays open for the user to read, but it is no
				// longer submitting. This lets both “Listo” and Escape close it.
				modalSubmitting = false;
				const liveDoc = shortcutRuntimeHost().getMainWindowDoc() || targetDoc;
				shortcutRuntimeHost().resetLibraryInjection?.(true, liveDoc);
				return;
			}
			if (!result.ok) {
				const retryable = !['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(result.error || ''));
				if (retryable) {
					enqueueLinkJob({
						title: context.title,
						shortcutAppId: result.shortcutAppId || context.shortcutAppId,
						steamAppId,
						skipLauncher: allowNoLauncher && launcherInput.checked,
						existingLaunchOptions: context.launchOptions,
						trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
						trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
						shortcutExecutable: context.exePath || '',
					});
					status.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
					status.style.color = '#66c0f4';
				}
				backendLog(`Link did not complete for ${context.title}: ${result.error || 'unknown_error'}`);
			}
		} catch (error) {
			enqueueLinkJob({
				title: context.title,
				shortcutAppId: context.shortcutAppId,
				steamAppId,
				skipLauncher: allowNoLauncher && launcherInput.checked,
				existingLaunchOptions: context.launchOptions,
				trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
				trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
				shortcutExecutable: context.exePath || '',
			});
			status.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
			status.style.color = '#66c0f4';
			backendLog(`Background link failed for ${context.title}: ${error}`);
		} finally {
			shortcutLinkInProgress = false;
			if (targetDoc.getElementById('gdl-manual-link-modal') && !linkSucceeded) {
				modalSubmitting = false;
				confirm.disabled = false;
				cancel.disabled = false;
				confirm.style.opacity = '1';
			}
		}
	});

	targetDoc.body.appendChild(overlay);
}

async function inspectShortcutReview(record: { id: number; title: string }, source: ShortcutLinkReviewSource): Promise<void> {
	if (shortcutMutationInProgress()) {
		setTimeout(() => { void inspectShortcutReview(record, source); }, 250);
		return;
	}
	if (shortcutDetectionInFlight.has(record.id)) return;
	shortcutDetectionInFlight.add(record.id);
	try {
		let context: ShortcutDetectionContext | null = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			context = await buildShortcutDetectionContext(null, record.title, record.id);
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

		const detection = await detectShortcutCandidates(context);
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

		while (shortcutManualLinkModalOpen && manualLinkModalPresent()) {
			await new Promise(resolve => setTimeout(resolve, 250));
		}
		const doc = shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' ? document : null);
		if (!doc?.body) return;
		if (shortcutMutationInProgress()) {
			setTimeout(() => { void inspectShortcutReview(record, source); }, 250);
			return;
		}
		if (source === 'native-add-auto' && isNativeAddAutoPromptSuppressed(record.id)) {
			backendLog(`Native-add link prompt suppressed for ${record.title} (${record.id}).`);
			return;
		}
		backendLog(`Showing ${source} link modal for ${record.title} with ${detection.candidates.length} candidate(s)`);
		showShortcutManualLinkModal(doc, context, detection, { source });
	} catch (error) {
		backendLog(`Manual shortcut review failed for ${record.title}: ${error}`);
	} finally {
		shortcutDetectionScheduled.delete(record.id);
		shortcutDetectionInFlight.delete(record.id);
	}
}

function scheduleShortcutReview(record: { id: number; title: string }, delay = 50, source: ShortcutLinkReviewSource = 'manual'): void {
	if (!Number.isFinite(record.id) || record.id < 2147483648 || !record.title.trim()) return;
	if (shortcutDetectionScheduled.has(record.id) || shortcutDetectionInFlight.has(record.id)) return;
	shortcutDetectionScheduled.add(record.id);
	setTimeout(() => {
		void inspectShortcutReview(record, source).finally(() => shortcutDetectionScheduled.delete(record.id));
	}, delay);
}

/** User-initiated linking. No background path calls this workflow. */
export function requestManualShortcutLink(shortcutAppId: number): boolean {
	const record = getAllShortcutRecords().find(candidate => candidate.id === shortcutAppId);
	if (!record || shortcutAlreadyLinked(record.id)) return false;
	// Explicit user actions may expose every Store candidate plus manual AppID entry.
	undismissShortcut(record.id);
	scheduleShortcutReview(record, 50, 'manual');
	return true;
}



/** Native-add-only automatic review. This function is intentionally not used by
 * startup, language changes, navigation, unlink, or ordinary shortcut scans. */
export function requestNativeAddShortcutReview(shortcutAppId: number): boolean {
	const record = getAllShortcutRecords().find(candidate => candidate.id === shortcutAppId);
	if (!record || shortcutAlreadyLinked(record.id) || isNativeAddAutoPromptSuppressed(record.id)) return false;
	scheduleShortcutReview(record, 80, 'native-add-auto');
	return true;
}

export type BulkLinkOutcomeStatus = 'linked' | 'queued' | 'skipped' | 'failed';

export interface BulkLinkGameOutcome {
	title: string;
	shortcutAppId: number;
	steamAppId?: string;
	status: BulkLinkOutcomeStatus;
	reason?: string;
}

export interface BulkLinkAllResult {
	total: number;
	matched: number;
	linked: number;
	queued: number;
	skipped: number;
	failed: number;
	outcomes: BulkLinkGameOutcome[];
}

export type BulkLinkProgressPhase = 'analyzing' | 'linking';

function reliableBulkCandidate(
	context: ShortcutDetectionContext,
	candidates: ShortcutDetectionCandidate[],
): ShortcutDetectionCandidate | null {
	const top = candidates[0];
	if (!top) return null;
	const second = candidates[1];
	const secondScore = second?.score ?? 0;
	const margin = top.score - secondScore;
	const reasons = new Set((top.reasons || []).map(String));
	const exactTitle = normalizeTitle(context.title) !== ''
		&& normalizeTitle(context.title) === normalizeTitle(top.name);
	const secondExactTitle = Boolean(second && normalizeTitle(context.title) !== ''
		&& normalizeTitle(context.title) === normalizeTitle(second.name));
	const aliasOnly = reasons.has('alias_requires_confirmation') && !top.executable_match;
	const invalidType = reasons.has('non_game_result');

	if (invalidType) return null;
	// Authoritative evidence: an AppID read from the launch arguments,
	// steam_appid.txt or appmanifest and verified against Steam appdetails.
	if (top.direct && top.score >= 80) return top;
	if (top.confidence === 'exact' && top.score >= 82) return top;

	// A unique exact official title is authoritative enough for experimental
	// bulk linking even when the candidate was originally discovered through a
	// maintained alias (wukong, rdr2, etc.).  The secondExactTitle guard keeps
	// editions that genuinely share a Store title out of silent bulk linking.
	if (exactTitle && !secondExactTitle && top.score >= 70) return top;

	// An exact game-folder match is also strong evidence for deeply nested
	// shipping executables (Game\Binaries\Win64\*-Shipping.exe).
	if (reasons.has('folder_exact') && top.score >= 80 && margin >= 5) return top;

	// A launch executable confirmed in Steam appinfo is strong evidence. Keep a
	// modest margin unless the title itself is exact, so generic game.exe names
	// cannot decide between editions or sequels on their own.
	if (top.executable_match && top.score >= 76 && (exactTitle || margin >= 8)) return top;

	// Strong non-exact candidates still need separation from the runner-up.
	if (top.confidence === 'high' && top.score >= 88 && margin >= 8) return top;
	if (top.score >= 93 && margin >= 12 && !aliasOnly) return top;
	return null;
}

/** Experimental bulk linking: detect all candidates first, then link only
 * high-confidence matches without opening per-game modals. Ambiguous games are
 * deliberately skipped so the feature can never guess through franchise names. */
export async function linkAllShortcutsExperimental(
	onProgress?: (done: number, total: number, title: string, phase: BulkLinkProgressPhase) => void,
): Promise<BulkLinkAllResult> {
	const records = getAllShortcutRecords().filter(record => !shortcutAlreadyLinked(record.id));
	const result: BulkLinkAllResult = {
		total: records.length, matched: 0, linked: 0, queued: 0, skipped: 0, failed: 0, outcomes: [],
	};
	if (!records.length) return result;

	let analyzed = 0;
	const prepared = await Promise.all(records.map(async record => {
		try {
			const context = await buildShortcutDetectionContext(null, record.title, record.id);
			if (!context) return { record, context: null, candidate: null, reason: 'context_unavailable' };
			const detection = await detectShortcutCandidates(context);
			const candidate = reliableBulkCandidate(context, detection?.candidates || []);
			return { record, context, candidate, reason: candidate ? '' : 'ambiguous_or_low_confidence' };
		} catch (error) {
			backendLog(`Bulk detection failed for ${record.title}: ${error}`);
			return { record, context: null, candidate: null, reason: 'detection_failed' };
		} finally {
			analyzed += 1;
			onProgress?.(analyzed, records.length, record.title, 'analyzing');
		}
	}));

	const actionable = prepared.filter(item => item.context && item.candidate) as Array<{
		record: { id: number; title: string };
		context: ShortcutDetectionContext;
		candidate: ShortcutDetectionCandidate;
		reason: string;
	}>;
	result.matched = actionable.length;
	for (const item of prepared) {
		if (item.context && item.candidate) continue;
		const status: BulkLinkOutcomeStatus = item.reason === 'detection_failed' ? 'failed' : 'skipped';
		if (status === 'failed') result.failed += 1;
		else result.skipped += 1;
		result.outcomes.push({
			title: item.record.title,
			shortcutAppId: item.record.id,
			status,
			reason: item.reason || 'ambiguous_or_low_confidence',
		});
	}

	let cursor = 0;
	let completed = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const index = cursor++;
			if (index >= actionable.length) return;
			const item = actionable[index];
			undismissShortcut(item.record.id);
			try {
				const linked = await linkShortcutToSteam({
					doc: null,
					title: item.context.title,
					shortcutAppId: item.record.id,
					steamAppId: item.candidate.appid,
					shortcutExecutable: item.context.exePath,
					refreshLibrary: false,
					onStatus: message => backendLog(`Bulk link ${item.record.title}: ${message}`),
				});
				if (linked.ok) {
					result.linked += 1;
					result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'linked' });
				} else if (!['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(linked.error || ''))) {
					enqueueLinkJob({
						title: item.context.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid,
						skipLauncher: false, existingLaunchOptions: item.context.launchOptions,
						trackingExecutable: '', trackingStartDir: '', shortcutExecutable: item.context.exePath,
					});
					result.queued += 1;
					result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'queued', reason: String(linked.error || 'setup_incomplete') });
				} else {
					result.failed += 1;
					result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'failed', reason: String(linked.error || 'link_failed') });
				}
			} catch (error) {
				backendLog(`Bulk link failed for ${item.record.title}: ${error}`);
				result.failed += 1;
				result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'failed', reason: 'link_failed' });
			} finally {
				completed += 1;
				onProgress?.(completed, actionable.length, item.record.title, 'linking');
			}
		}
	};

	await Promise.all([worker(), worker()]);
	shortcutRuntimeHost().resetLibraryInjection?.(true, shortcutRuntimeHost().getMainWindowDoc());
	return result;
}
