import type { ShortcutDetectionCandidate, ShortcutDetectionContext, ShortcutDetectionResult } from '../../domain/types';
import { backendLog, clearArtworkBackend } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import {
	mappings,
	findMappingForTitle,
	removeMappingChecked,
	saveMappingChecked,
	shortcutMappingKey,
} from '../../core/mappings';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { getSteamAppStore, shortcutPathBasename } from '../../steam/shortcuts';
import { clearArtworkSaved } from '../library/artwork';
import { clearLinkedNoteSyncState } from './linked-notes';
import { shortcutRuntimeHost } from './host';
import { findMappingForDuplicateShortcut, findMappingForShortcut, getAllShortcutRecords, isUnrealShippingExecutable, shortcutAlreadyLinked } from './registry';
import { buildShortcutDetectionContext, clearShortcutDetectionCache, detectShortcutCandidates } from './detection';
import { hasPendingLinkJob } from './link-job-queue';
import {
	isShortcutIdentityMutationInProgress,
	linkShortcutToSteam,
	synchronizeShortcutOfficialIdentity,
} from './linking';
import { getPreferences } from '../../core/preferences';

const DISMISSED_SHORTCUTS_KEY = 'gdl_dismissed_shortcuts_v3';
// An automatic modal needs to earn the user's trust.  A manual picker can
// expose weaker search results, but background detection must never interrupt
// the user for a loose keyword hit such as "re9" -> an unrelated title.
const AUTO_LINK_MIN_CONFIDENCE = 70;
const AUTO_LINK_VERIFIED_EXECUTABLE_MIN_CONFIDENCE = 45;
const AUTO_LINK_MAINTAINED_ALIAS_MIN_CONFIDENCE = 35;

/**
 * A manually opened Properties picker may show every Store suggestion. The
 * unsolicited modal stays stricter. Verified executables are strong evidence;
 * a maintained executable alias is weaker, but is still safe to present for
 * explicit review even when the shortcut title was replaced by an arbitrary
 * label. Plain Store-search guesses do not receive this exception.
 */
function isReliableAutoLinkCandidate(candidate: ShortcutDetectionCandidate): boolean {
	const reasons = new Set(candidate.reasons || []);
	const maintainedAlias = reasons.has('franchise_alias')
		&& reasons.has('alias_requires_confirmation');
	return Boolean(candidate.direct
		|| candidate.score >= AUTO_LINK_MIN_CONFIDENCE
		|| (candidate.executable_match && candidate.score >= AUTO_LINK_VERIFIED_EXECUTABLE_MIN_CONFIDENCE)
		|| (maintainedAlias && candidate.score >= AUTO_LINK_MAINTAINED_ALIAS_MIN_CONFIDENCE));
}

function loadDismissedShortcuts(): Set<number> {
	try {
		const raw = localStorage.getItem(DISMISSED_SHORTCUTS_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return new Set(parsed.map(Number).filter(n => Number.isFinite(n)));
		}
	} catch {}
	return new Set();
}

function saveDismissedShortcuts(set: Set<number>): void {
	try {
		localStorage.setItem(DISMISSED_SHORTCUTS_KEY, JSON.stringify(Array.from(set)));
	} catch {}
}

const dismissedShortcutIds = loadDismissedShortcuts();

let shortcutAutoDetectorTimer: ReturnType<typeof setInterval> | null = null;
let shortcutAutoDetectorInitialized = false;
let shortcutAutoDetectorModalOpen = false;
let shortcutLinkInProgress = false;
let shortcutAutoDetectorStartedAt = 0;
const knownShortcutIds = new Set<number>();
const shortcutDetectionInFlight = new Set<number>();
const shortcutDetectionScheduled = new Set<number>();
const deferredShortcutInspections = new Map<number, { record: { id: number; title: string }; force: boolean; isNewlyAdded: boolean }>();

function shortcutMutationInProgress(): boolean {
	return shortcutLinkInProgress || isShortcutIdentityMutationInProgress();
}

function deferShortcutInspection(record: { id: number; title: string }, force: boolean, isNewlyAdded: boolean): void {
	deferredShortcutInspections.set(record.id, { record, force, isNewlyAdded });
}

export function dismissShortcut(shortcutAppId: number): void {
	if (!shortcutAppId) return;
	dismissedShortcutIds.add(shortcutAppId);
	saveDismissedShortcuts(dismissedShortcutIds);
	backendLog(`Shortcut ${shortcutAppId} permanently dismissed from auto-link modal.`);
}

export function undismissShortcut(shortcutAppId: number): void {
	if (!shortcutAppId) return;
	if (dismissedShortcutIds.has(shortcutAppId)) {
		dismissedShortcutIds.delete(shortcutAppId);
		saveDismissedShortcuts(dismissedShortcutIds);
	}
}

export function isShortcutDismissed(shortcutAppId: number): boolean {
	return dismissedShortcutIds.has(shortcutAppId);
}

function recordKnownShortcut(shortcutAppId: number): void {
	knownShortcutIds.add(shortcutAppId);
}

let activeModalEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

function closeShortcutAutoLinkModal(doc: Document, shortcutAppId: number, dismiss: boolean): void {
	if (activeModalEscapeHandler) {
		try { doc.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
		try { document.removeEventListener('keydown', activeModalEscapeHandler); } catch {}
		activeModalEscapeHandler = null;
	}
	doc.getElementById('gdl-auto-link-modal')?.remove();
	try { document.getElementById('gdl-auto-link-modal')?.remove(); } catch {}
	shortcutAutoDetectorModalOpen = false;
	if (dismiss) {
		dismissShortcut(shortcutAppId);
		// A shared executable mapping may have been mounted before the modal was
		// shown. Restore the native page immediately when the user rejects it.
		try { shortcutRuntimeHost().resetLibraryInjection?.(false, doc); } catch {}
	}
}

export function showShortcutAutoLinkModal(
	doc: Document,
	context: ShortcutDetectionContext,
	detection: ShortcutDetectionResult,
): void {
	const targetDoc = (doc && doc.body) ? doc : (shortcutRuntimeHost().getMainWindowDoc() || (typeof document !== 'undefined' && document.body ? document : null));
	if (!targetDoc || !targetDoc.body) return;
	if (targetDoc.getElementById('gdl-auto-link-modal')) return;
	try { targetDoc.getElementById('gdl-auto-link-modal')?.remove(); } catch {}
	const candidates = (detection.candidates || [])
		.filter(isReliableAutoLinkCandidate)
		.slice(0, 6);
	if (!candidates.length) return;
	const hasTrackingRecommendation = !!(context.bootstrapDetected && context.recommendedExePath);
	const exeName = context.exePath ? (shortcutPathBasename(context.exePath) || context.exePath) : context.title;
	const executableSummary = hasTrackingRecommendation
		? gdlText('selected_executable', 'Selected executable: {exe}', { exe: exeName })
		: gdlText('executable_preserved', 'Steam will keep launching the executable you selected: {exe}', { exe: exeName });
	shortcutAutoDetectorModalOpen = true;

	const overlay = targetDoc.createElement('div');
	overlay.id = 'gdl-auto-link-modal';
	overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:Arial,Helvetica,sans-serif;color:#dcdedf;pointer-events:auto;';
	overlay.innerHTML = `
		<div role="dialog" aria-modal="true" style="width:min(620px,calc(100vw - 40px));overflow:hidden;border-radius:6px;background:linear-gradient(145deg,#1b2531,#121922);border:1px solid rgba(102,192,244,.30);box-shadow:0 24px 80px rgba(0,0,0,.78);">
			<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:linear-gradient(90deg,rgba(39,65,84,.95),rgba(24,31,41,.96));border-bottom:1px solid rgba(255,255,255,.09);">
				<div><div style="font-size:20px;font-weight:600;color:#fff;">${escapeHtml(gdlText('auto_link_title', 'Steam game detected'))}</div><div style="margin-top:4px;font-size:11px;letter-spacing:.8px;color:#66c0f4;text-transform:uppercase;">${escapeHtml(gdlText('auto_link_ready_to_review', 'Match ready for review'))}</div></div>
				<button class="gdl-auto-link-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}" style="border:0;background:transparent;color:#8f98a0;font-size:24px;line-height:1;cursor:pointer;padding:0 3px;">×</button>
			</div>
			<div style="padding:20px 22px 22px;">
				<div style="font-size:13px;line-height:1.5;color:#acb2b8;margin-bottom:17px;">${escapeHtml(gdlText('auto_link_message', 'A likely Steam match was found for “{name}”. Confirm it before the plugin loads the game data.', { name: context.title }))}</div>
				<div style="display:flex;gap:16px;align-items:stretch;margin-bottom:16px;padding:12px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.06);border-radius:4px;">
					<img class="gdl-auto-link-image" alt="" style="width:194px;height:91px;object-fit:cover;background:#10141a;border:1px solid rgba(255,255,255,.10);border-radius:2px;" />
					<div style="display:flex;flex:1;min-width:0;flex-direction:column;justify-content:center;gap:7px;">
						<div class="gdl-auto-link-name" style="font-size:17px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
						<div class="gdl-auto-link-id" style="font-size:12px;color:#66c0f4;"></div>
						<select class="gdl-auto-link-select" style="width:100%;padding:7px 9px;background:#20242b;border:1px solid #3d4450;border-radius:2px;color:#dcdedf;font-size:12px;"></select>
					</div>
				</div>
				<label style="display:block;margin:0 0 14px;font-size:11px;color:#8f98a0;">
					<span style="display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.45px;">${escapeHtml(gdlText('manual_appid_label', 'Or enter a Steam AppID manually'))}</span>
					<input class="gdl-auto-link-manual-appid" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(gdlText('manual_appid_placeholder', 'Steam AppID'))}" style="box-sizing:border-box;width:100%;padding:8px 9px;background:#101820;border:1px solid #3d4450;border-radius:2px;color:#dcdedf;font-size:12px;" />
				</label>
				<div style="padding:9px 11px;background:rgba(0,0,0,.18);color:#8f98a0;font-size:11px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(executableSummary)}</div>
				<label class="gdl-auto-link-tracking" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 11px;background:rgba(91,163,43,.10);border:1px solid rgba(91,163,43,.28);color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-auto-link-tracking-input" type="checkbox" checked style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('use_tracking_executable', 'Use the real game executable'))}</strong><br />${escapeHtml(gdlText('tracking_executable_help', '{bootstrap} closes after launching {game}. Use {game} so Steam keeps tracking playtime.', { bootstrap: shortcutPathBasename(context.exePath), game: shortcutPathBasename(context.recommendedExePath || '') }))}</span>
				</label>
				<label class="gdl-auto-link-launcher" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-auto-link-launcher-input" type="checkbox" style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('launcher_detected', 'This target looks like a game launcher. You may optionally add -nolauncher.'))}</span>
				</label>
				<div class="gdl-auto-link-progress" style="display:flex;gap:7px;margin-top:15px;color:#8f98a0;font-size:11px;"><span data-step="link" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_link', '1 · Link'))}</span><span data-step="identity" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_identity', '2 · Identity'))}</span><span data-step="assets" style="padding:5px 8px;border-radius:12px;background:rgba(255,255,255,.05);">${escapeHtml(gdlText('auto_link_step_assets', '3 · Assets'))}</span></div>
				<div class="gdl-auto-link-status" aria-live="polite" style="min-height:18px;margin-top:11px;font-size:12px;color:#8f98a0;"></div>
				<div class="gdl-auto-link-result" aria-live="polite" style="display:none;margin-top:12px;padding:11px 12px;border-radius:3px;font-size:12px;line-height:1.45;"></div>
				<div style="display:flex;justify-content:flex-end;gap:9px;margin-top:14px;">
					<button class="gdl-auto-link-cancel" style="padding:9px 17px;border:0;border-radius:2px;background:#3d4450;color:#dcdedf;cursor:pointer;">${escapeHtml(gdlText('reject_link', 'Reject'))}</button>
					<button class="gdl-auto-link-confirm" style="padding:9px 18px;border:0;border-radius:2px;background:linear-gradient(90deg,#06bfff,#2d73ff);color:#fff;cursor:pointer;">${escapeHtml(gdlText('link_game', 'Link game'))}</button>
				</div>
			</div>
		</div>`;

	const select = overlay.querySelector('.gdl-auto-link-select') as HTMLSelectElement;
	const manualAppIdInput = overlay.querySelector('.gdl-auto-link-manual-appid') as HTMLInputElement;
	const image = overlay.querySelector('.gdl-auto-link-image') as HTMLImageElement;
	const name = overlay.querySelector('.gdl-auto-link-name') as HTMLElement;
	const appId = overlay.querySelector('.gdl-auto-link-id') as HTMLElement;
	const trackingLabel = overlay.querySelector('.gdl-auto-link-tracking') as HTMLElement;
	const trackingInput = overlay.querySelector('.gdl-auto-link-tracking-input') as HTMLInputElement;
	const launcherLabel = overlay.querySelector('.gdl-auto-link-launcher') as HTMLElement;
	const launcherInput = overlay.querySelector('.gdl-auto-link-launcher-input') as HTMLInputElement;
	const status = overlay.querySelector('.gdl-auto-link-status') as HTMLElement;
	const progress = overlay.querySelector('.gdl-auto-link-progress') as HTMLElement;
	const resultPanel = overlay.querySelector('.gdl-auto-link-result') as HTMLElement;
	const confirm = overlay.querySelector('.gdl-auto-link-confirm') as HTMLButtonElement;
	const cancel = overlay.querySelector('.gdl-auto-link-cancel') as HTMLButtonElement;

	for (const candidate of candidates) {
		const option = targetDoc.createElement('option');
		option.value = candidate.appid;
		option.textContent = `${candidate.name} — AppID ${candidate.appid} (${Math.round(candidate.score)}%)`;
		select.appendChild(option);
	}
	// Steam CEF can restore the previous value of a dynamically recreated
	// <select>. Always start on the backend's highest-ranked candidate instead
	// of silently preserving an AppID selected in an earlier modal.
	select.selectedIndex = 0;
	select.value = candidates[0].appid;
	let imageRequestRevision = 0;
	let manualLookupTimer: ReturnType<typeof setTimeout> | null = null;
	const renderCandidate = () => {
		if (manualLookupTimer) {
			clearTimeout(manualLookupTimer);
			manualLookupTimer = null;
		}
		const candidate = candidates.find(item => item.appid === select.value) || candidates[0];
		const requestRevision = ++imageRequestRevision;
		name.textContent = candidate.name;
		appId.textContent = `Steam AppID ${candidate.appid} · ${Math.round(candidate.score)}%`;
		if (!candidate.direct && candidate.score < AUTO_LINK_MIN_CONFIDENCE && candidate.executable_match) {
			status.textContent = gdlText(
				'auto_link_executable_verified_review',
				'The executable matches this Steam game, but the shortcut title is uncertain. Review it before linking.',
			);
			status.style.color = '#e5ad37';
		} else if (!candidate.direct && candidate.score < AUTO_LINK_MIN_CONFIDENCE) {
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
		if (!modalSubmitting) closeShortcutAutoLinkModal(targetDoc, context.shortcutAppId, !linkSucceeded);
	};
	overlay.querySelector('.gdl-auto-link-close')?.addEventListener('click', dismiss);
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
		const steamAppId = manualAppId || selected.appid;
		modalSubmitting = true;
		shortcutLinkInProgress = true;
		setProgress(1);
		confirm.disabled = true;
		cancel.disabled = true;
		confirm.style.opacity = '.65';
		undismissShortcut(context.shortcutAppId);
		recordKnownShortcut(context.shortcutAppId);

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
				onStatus: (message, color = '#8f98a0') => {
					status.textContent = message;
					status.style.color = color;
					if (/actualizando nombre|updating name/i.test(message)) setProgress(2);
				},
			});
			if (result.ok && result.shortcutAppId) {
				recordKnownShortcut(result.shortcutAppId);
			}
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
				deferShortcutInspection({ id: context.shortcutAppId, title: context.title }, false, true);
				backendLog(`Link did not complete for ${context.title}: ${result.error || 'unknown_error'}`);
			}
		} catch (error) {
			deferShortcutInspection({ id: context.shortcutAppId, title: context.title }, false, true);
			backendLog(`Background link failed for ${context.title}: ${error}`);
		} finally {
			shortcutLinkInProgress = false;
			if (targetDoc.getElementById('gdl-auto-link-modal') && !linkSucceeded) {
				modalSubmitting = false;
				confirm.disabled = false;
				cancel.disabled = false;
				confirm.style.opacity = '1';
			}
		}
	});

	targetDoc.body.appendChild(overlay);
}

async function inspectNewShortcut(record: { id: number; title: string }, force = false, isNewlyAdded = false): Promise<void> {
	if (shortcutMutationInProgress()) {
		deferShortcutInspection(record, force, isNewlyAdded);
		shortcutDetectionScheduled.delete(record.id);
		return;
	}
	if (shortcutDetectionInFlight.has(record.id)) return;
	if (!force && hasPendingLinkJob(record.id, record.title)) return;
	if (!force && isShortcutDismissed(record.id)) return;
	if (!isNewlyAdded && !force) {
		// Existing shortcuts on startup or navigation only sync if already mapped
		const exactLinkedSteamAppId = mappings[shortcutMappingKey(record.id)] || '';
		const duplicateLinkedSteamAppId = findMappingForDuplicateShortcut(record.id) || '';
		const titleLinkedSteamAppId = findMappingForTitle(record.title, String(record.id));
		const linkedSteamAppId = exactLinkedSteamAppId || duplicateLinkedSteamAppId || titleLinkedSteamAppId;
		if (/^\d+$/.test(String(linkedSteamAppId || ''))) {
			const data = await getGameData(String(linkedSteamAppId));
			const officialName = String(data?.name || record.title).trim();
			if (data && (!exactLinkedSteamAppId || normalizeTitle(record.title) !== normalizeTitle(officialName))) {
				await synchronizeShortcutOfficialIdentity({
					shortcutAppId: record.id,
					currentTitle: record.title,
					steamAppId: String(linkedSteamAppId),
					data,
				});
			} else if (!exactLinkedSteamAppId) {
				const exactKey = shortcutMappingKey(record.id);
				if (await saveMappingChecked(exactKey, String(linkedSteamAppId))) mappings[exactKey] = String(linkedSteamAppId);
			}
		}
		return;
	}

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
			backendLog(`Automatic detection has no title or executable for shortcut ${record.title} (${record.id})`);
			return;
		}

		if (!getPreferences().autoDetectShortcuts) {
			return;
		}
		const detection = await detectShortcutCandidates(context);

		// If this game was previously mapped/repeated, ensure the mapped Steam AppID is included at top with score 100
		const existingMappedId = findMappingForShortcut(record.id, record.title, context.exePath);
		if (existingMappedId && /^\d+$/.test(existingMappedId)) {
			const mappedData = await getGameData(existingMappedId);
			if (mappedData) {
				const existingIndex = detection.candidates.findIndex(c => c.appid === existingMappedId);
				if (existingIndex >= 0) {
					const [item] = detection.candidates.splice(existingIndex, 1);
					item.score = 100;
					detection.candidates.unshift(item);
				} else {
					const candidate: ShortcutDetectionCandidate = {
						appid: existingMappedId,
						name: mappedData.name || record.title,
						score: 100,
						direct: true,
						confidence: 'high',
						image: mappedData.header_image,
					};
					detection.candidates.unshift(candidate);
				}
			}
		}

		const viable = (detection?.candidates || [])
			.filter(isReliableAutoLinkCandidate);
		if (!detection || !viable.length) {
			backendLog(`Automatic detection found no reliable match for shortcut ${record.title}`);
			return;
		}
		while (shortcutAutoDetectorModalOpen && document.getElementById('gdl-auto-link-modal')) {
			await new Promise(resolve => setTimeout(resolve, 300));
		}
		const host = shortcutRuntimeHost();
		const doc = host.getMainWindowDoc() || (typeof document !== 'undefined' ? document : null);
		if (!doc?.body || (!force && (isShortcutDismissed(record.id) || hasPendingLinkJob(record.id, record.title)))) {
			backendLog(`Cannot show auto link modal: document is null or shortcut is dismissed (${record.title})`);
			return;
		}

		if (shortcutMutationInProgress()) {
			deferShortcutInspection(record, force, isNewlyAdded);
			return;
		}
		backendLog(`Showing auto link modal for newly added shortcut ${record.title} with ${viable.length} candidate(s)`);
		showShortcutAutoLinkModal(doc, context, detection);
	} catch (e) {
		backendLog(`New shortcut detection failed for ${record.title}: ${e}`);
	} finally {
		shortcutDetectionScheduled.delete(record.id);
		shortcutDetectionInFlight.delete(record.id);
	}
}

export function scheduleShortcutInspection(
	record: { id: number; title: string },
	delay = 350,
	includeLinked = false,
	force = false,
	isNewlyAdded = false,
): void {
	if (!Number.isFinite(record.id) || record.id < 2147483648 || !record.title.trim()) return;
	if (shortcutMutationInProgress()) {
		deferShortcutInspection(record, force, isNewlyAdded);
		return;
	}
	if (shortcutDetectionScheduled.has(record.id) || shortcutDetectionInFlight.has(record.id)) return;
	if (!force && hasPendingLinkJob(record.id, record.title)) return;
	if (!force && isShortcutDismissed(record.id)) return;
	if (!includeLinked && !isNewlyAdded && shortcutAlreadyLinked(record.id)) return;
	shortcutDetectionScheduled.add(record.id);
	setTimeout(() => {
		void inspectNewShortcut(record, force, isNewlyAdded)
			.catch(error => backendLog(`Scheduled shortcut inspection failed for ${record.title}: ${error}`))
			.finally(() => shortcutDetectionScheduled.delete(record.id));
	}, delay);
}

function scanForNewShortcuts(): void {
	if (shortcutMutationInProgress()) return;
	for (const pending of Array.from(deferredShortcutInspections.values())) {
		deferredShortcutInspections.delete(pending.record.id);
		const liveRecord = getAllShortcutRecords().find(record => record.id === pending.record.id);
		if (liveRecord && !shortcutAlreadyLinked(liveRecord.id)) {
			scheduleShortcutInspection(liveRecord, 100, true, pending.force, pending.isNewlyAdded);
		}
	}
	const appStore = getSteamAppStore();
	if (!appStore?.m_mapApps) return;
	const records = getAllShortcutRecords();
	const currentIds = new Set(records.map(r => r.id));

	if (!shortcutAutoDetectorInitialized) {
		const appCount = Number(appStore.m_mapApps?.size || 0);
		if (appCount <= 0 && Date.now() - shortcutAutoDetectorStartedAt < 8000) return;
		if (Date.now() - shortcutAutoDetectorStartedAt < 1500) return;
		shortcutAutoDetectorInitialized = true;
		for (const record of records) {
			knownShortcutIds.add(record.id);
			if (!shortcutAlreadyLinked(record.id) && !isShortcutDismissed(record.id) && !hasPendingLinkJob(record.id, record.title)) {
				backendLog(`Startup unlinked shortcut found: ${record.title} (${record.id})`);
				scheduleShortcutInspection(record, 500, true, false, true);
			}
		}

		backendLog(`Automatic shortcut detector ready; ${records.length} existing shortcut(s) indexed.`);
		return;
	}

	// Detect deleted shortcuts in real-time
	const deletedShortcutIds = new Set<number>();
	for (const knownId of Array.from(knownShortcutIds)) {
		if (!currentIds.has(knownId)) {
			deletedShortcutIds.add(knownId);
			knownShortcutIds.delete(knownId);
		}
	}

	for (const deletedId of Array.from(deletedShortcutIds)) {
		clearArtworkSaved(deletedId);
		undismissShortcut(deletedId);
		const exactKey = shortcutMappingKey(deletedId);
		if (mappings[exactKey]) {
			delete mappings[exactKey];
			void removeMappingChecked(exactKey);
		}
		try {
			const apps = (window as any).SteamClient?.Apps;
			if (typeof apps?.ClearCustomArtworkForApp === 'function') {
				for (let t = 0; t < 5; t++) apps.ClearCustomArtworkForApp(deletedId, t);
			}
			if (typeof apps?.SetShortcutIcon === 'function') {
				try { apps.SetShortcutIcon(deletedId, ''); } catch {}
			}
			void clearArtworkBackend({ shortcut_app_id: String(deletedId) });
		} catch {}
	}

	for (const record of records) {
		if (knownShortcutIds.has(record.id)) continue;
		recordKnownShortcut(record.id);
		if (!shortcutAlreadyLinked(record.id) && !isShortcutDismissed(record.id) && !hasPendingLinkJob(record.id, record.title)) {
			backendLog(`New shortcut added: ${record.title} (${record.id})`);
			scheduleShortcutInspection(record, 300, true, false, true);
		}
	}
}

export function startShortcutAutoDetector(): void {
	if (shortcutAutoDetectorTimer) return;
	shortcutAutoDetectorStartedAt = Date.now();
	shortcutAutoDetectorTimer = setInterval(scanForNewShortcuts, 1600);
	scanForNewShortcuts();
}

export function stopShortcutAutoDetector(): void {
	if (shortcutAutoDetectorTimer) clearInterval(shortcutAutoDetectorTimer);
	shortcutAutoDetectorTimer = null;
	shortcutAutoDetectorInitialized = false;
	shortcutAutoDetectorModalOpen = false;
	shortcutLinkInProgress = false;
	shortcutDetectionInFlight.clear();
	shortcutDetectionScheduled.clear();
	deferredShortcutInspections.clear();
	clearShortcutDetectionCache();
	clearLinkedNoteSyncState();
	try { shortcutRuntimeHost().getMainWindowDoc()?.getElementById('gdl-auto-link-modal')?.remove(); } catch {}
}
