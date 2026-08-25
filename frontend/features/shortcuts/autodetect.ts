import type { ShortcutDetectionContext, ShortcutDetectionResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { getGameData } from '../../core/game-data';
import { mappings, findMappingForTitle, saveMappingChecked, shortcutMappingKey } from '../../core/mappings';
import { escapeHtml, normalizeTitle } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { shortcutPathBasename } from '../../steam/shortcuts';
import { clearLinkedNoteSyncState } from './linked-notes';
import { shortcutRuntimeHost } from './host';
import { findMappingForDuplicateShortcut, getAllShortcutRecords, isUnrealShippingExecutable, shortcutAlreadyLinked } from './registry';
import { buildShortcutDetectionContext, clearShortcutDetectionCache, detectShortcutCandidates } from './detection';
import {
	applyNoLauncherOption,
	hasNoLauncherOption,
	linkShortcutToSteam,
	mergeNoLauncherOption,
	shouldAutoApplyNoLauncher,
	synchronizeShortcutOfficialIdentity,
} from './linking';
import type { ShortcutIdentitySyncResult } from './linking';
import { getPreferences } from '../../core/preferences';

const DISMISSED_SHORTCUTS_STORAGE_KEY = 'gdl_dismissed_shortcuts_v1';
const KNOWN_SHORTCUTS_STORAGE_KEY = 'gdl_known_shortcuts_v1';

function readStoredNumberSet(key: string): Set<number> {
	try {
		const raw = localStorage.getItem(key);
		const parsed = raw ? JSON.parse(raw) : null;
		if (Array.isArray(parsed)) {
			return new Set(parsed.map(Number).filter(n => Number.isFinite(n) && n > 0));
		}
	} catch {}
	return new Set<number>();
}

function persistStoredNumberSet(key: string, set: Set<number>): void {
	try {
		localStorage.setItem(key, JSON.stringify(Array.from(set)));
	} catch {}
}

let shortcutAutoDetectorTimer: ReturnType<typeof setInterval> | null = null;
let shortcutAutoDetectorInitialized = false;
let shortcutAutoDetectorModalOpen = false;
let shortcutAutoDetectorStartedAt = 0;
const knownShortcutIds = readStoredNumberSet(KNOWN_SHORTCUTS_STORAGE_KEY);
const shortcutDetectionInFlight = new Set<number>();
const shortcutDetectionDismissed = readStoredNumberSet(DISMISSED_SHORTCUTS_STORAGE_KEY);
const shortcutDetectionScheduled = new Set<number>();

function dismissShortcut(shortcutAppId: number): void {
	shortcutDetectionDismissed.add(shortcutAppId);
	persistStoredNumberSet(DISMISSED_SHORTCUTS_STORAGE_KEY, shortcutDetectionDismissed);
}

function undismissShortcut(shortcutAppId: number): void {
	if (shortcutDetectionDismissed.delete(shortcutAppId)) {
		persistStoredNumberSet(DISMISSED_SHORTCUTS_STORAGE_KEY, shortcutDetectionDismissed);
	}
}

function recordKnownShortcut(shortcutAppId: number): void {
	knownShortcutIds.add(shortcutAppId);
	persistStoredNumberSet(KNOWN_SHORTCUTS_STORAGE_KEY, knownShortcutIds);
}

function closeShortcutAutoLinkModal(doc: Document, shortcutAppId: number, dismiss: boolean): void {
	doc.getElementById('gdl-auto-link-modal')?.remove();
	shortcutAutoDetectorModalOpen = false;
	if (dismiss) dismissShortcut(shortcutAppId);
}

function showShortcutAutoLinkModal(
	doc: Document,
	context: ShortcutDetectionContext,
	detection: ShortcutDetectionResult,
): void {
	if (!doc.body || shortcutAutoDetectorModalOpen || doc.getElementById('gdl-auto-link-modal')) return;
	const candidates = detection.candidates.filter(candidate => candidate.score >= 48).slice(0, 6);
	if (!candidates.length) return;
	const hasTrackingRecommendation = !!(context.bootstrapDetected && context.recommendedExePath);
	const executableSummary = hasTrackingRecommendation
		? gdlText('selected_executable', 'Selected executable: {exe}', { exe: shortcutPathBasename(context.exePath) || context.exePath })
		: gdlText('executable_preserved', 'Steam will keep launching the executable you selected: {exe}', { exe: shortcutPathBasename(context.exePath) || context.exePath });
	shortcutAutoDetectorModalOpen = true;

	const overlay = doc.createElement('div');
	overlay.id = 'gdl-auto-link-modal';
	overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:Arial,Helvetica,sans-serif;color:#dcdedf;';
	overlay.innerHTML = `
		<div role="dialog" aria-modal="true" style="width:min(590px,calc(100vw - 48px));background:#171d25;border:1px solid #3d4450;box-shadow:0 18px 60px rgba(0,0,0,.72);">
			<div style="display:flex;align-items:center;justify-content:space-between;padding:17px 20px;background:linear-gradient(90deg,#202a36,#171d25);border-bottom:1px solid rgba(255,255,255,.07);">
				<div style="font-size:20px;font-weight:500;color:#fff;">${escapeHtml(gdlText('auto_link_title', 'Steam game detected'))}</div>
				<button class="gdl-auto-link-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}" style="border:0;background:transparent;color:#8f98a0;font-size:24px;line-height:1;cursor:pointer;padding:0 3px;">×</button>
			</div>
			<div style="padding:20px;">
				<div style="font-size:13px;line-height:1.45;color:#acb2b8;margin-bottom:15px;">${escapeHtml(gdlText('auto_link_message', 'A likely Steam match was found for “{name}”. Confirm it before the plugin loads the game data.', { name: context.title }))}</div>
				<div style="display:flex;gap:15px;align-items:stretch;margin-bottom:15px;">
					<img class="gdl-auto-link-image" alt="" style="width:184px;height:86px;object-fit:cover;background:#10141a;border:1px solid rgba(255,255,255,.08);" />
					<div style="display:flex;flex:1;min-width:0;flex-direction:column;justify-content:center;gap:7px;">
						<div class="gdl-auto-link-name" style="font-size:17px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
						<div class="gdl-auto-link-id" style="font-size:12px;color:#66c0f4;"></div>
						<select class="gdl-auto-link-select" style="width:100%;padding:7px 9px;background:#20242b;border:1px solid #3d4450;border-radius:2px;color:#dcdedf;font-size:12px;"></select>
					</div>
				</div>
				<div style="padding:9px 11px;background:rgba(0,0,0,.18);color:#8f98a0;font-size:11px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(executableSummary)}</div>
				<label class="gdl-auto-link-tracking" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;padding:10px 11px;background:rgba(91,163,43,.10);border:1px solid rgba(91,163,43,.28);color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-auto-link-tracking-input" type="checkbox" checked style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('use_tracking_executable', 'Use the real game executable'))}</strong><br />${escapeHtml(gdlText('tracking_executable_help', '{bootstrap} closes after launching {game}. Use {game} so Steam keeps tracking playtime.', { bootstrap: shortcutPathBasename(context.exePath), game: shortcutPathBasename(context.recommendedExePath || '') }))}</span>
				</label>
				<label class="gdl-auto-link-launcher" style="display:none;align-items:flex-start;gap:8px;margin-top:12px;color:#acb2b8;font-size:12px;line-height:1.35;cursor:pointer;">
					<input class="gdl-auto-link-launcher-input" type="checkbox" style="margin-top:2px;" />
					<span><strong style="color:#dcdedf;font-weight:500;">${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('launcher_detected', 'This target looks like a game launcher. You may optionally add -nolauncher.'))}</span>
				</label>
				<div class="gdl-auto-link-status" style="min-height:17px;margin-top:11px;font-size:12px;color:#8f98a0;"></div>
				<div style="display:flex;justify-content:flex-end;gap:9px;margin-top:14px;">
					<button class="gdl-auto-link-cancel" style="padding:9px 17px;border:0;border-radius:2px;background:#3d4450;color:#dcdedf;cursor:pointer;">${escapeHtml(gdlText('not_now', 'Not now'))}</button>
					<button class="gdl-auto-link-confirm" style="padding:9px 18px;border:0;border-radius:2px;background:linear-gradient(90deg,#06bfff,#2d73ff);color:#fff;cursor:pointer;">${escapeHtml(gdlText('link_game', 'Link game'))}</button>
				</div>
			</div>
		</div>`;

	const select = overlay.querySelector('.gdl-auto-link-select') as HTMLSelectElement;
	const image = overlay.querySelector('.gdl-auto-link-image') as HTMLImageElement;
	const name = overlay.querySelector('.gdl-auto-link-name') as HTMLElement;
	const appId = overlay.querySelector('.gdl-auto-link-id') as HTMLElement;
	const trackingLabel = overlay.querySelector('.gdl-auto-link-tracking') as HTMLElement;
	const trackingInput = overlay.querySelector('.gdl-auto-link-tracking-input') as HTMLInputElement;
	const launcherLabel = overlay.querySelector('.gdl-auto-link-launcher') as HTMLElement;
	const launcherInput = overlay.querySelector('.gdl-auto-link-launcher-input') as HTMLInputElement;
	const status = overlay.querySelector('.gdl-auto-link-status') as HTMLElement;
	const confirm = overlay.querySelector('.gdl-auto-link-confirm') as HTMLButtonElement;
	const cancel = overlay.querySelector('.gdl-auto-link-cancel') as HTMLButtonElement;

	for (const candidate of candidates) {
		const option = doc.createElement('option');
		option.value = candidate.appid;
		option.textContent = `${candidate.name} — AppID ${candidate.appid} (${Math.round(candidate.score)}%)`;
		select.appendChild(option);
	}
	const renderCandidate = () => {
		const candidate = candidates.find(item => item.appid === select.value) || candidates[0];
		name.textContent = candidate.name;
		appId.textContent = `Steam AppID ${candidate.appid} · ${Math.round(candidate.score)}%`;
		if (candidate.image) {
			image.src = candidate.image;
			image.style.visibility = 'visible';
		} else {
			image.removeAttribute('src');
			image.style.visibility = 'hidden';
		}
	};
	select.addEventListener('change', renderCandidate);
	renderCandidate();
	if (hasTrackingRecommendation) trackingLabel.style.display = 'flex';

	const allowNoLauncher = detection.launcher_detected
		&& !detection.generic_launcher
		&& !isUnrealShippingExecutable(context.exePath);
	if (allowNoLauncher) launcherLabel.style.display = 'flex';

	const dismiss = () => closeShortcutAutoLinkModal(doc, context.shortcutAppId, true);
	overlay.querySelector('.gdl-auto-link-close')?.addEventListener('click', dismiss);
	cancel.addEventListener('click', dismiss);
	overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
	confirm.addEventListener('click', async () => {
		const selected = candidates.find(candidate => candidate.appid === select.value) || candidates[0];
		confirm.disabled = true;
		cancel.disabled = true;
		confirm.style.opacity = '.65';
		const result = await linkShortcutToSteam({
			title: context.title,
			shortcutAppId: context.shortcutAppId,
			steamAppId: selected.appid,
			skipLauncher: allowNoLauncher && launcherInput.checked,
			existingLaunchOptions: context.launchOptions,
			trackingExecutable: hasTrackingRecommendation && trackingInput.checked ? context.recommendedExePath : '',
			trackingStartDir: hasTrackingRecommendation && trackingInput.checked ? context.recommendedStartDir : '',
			onStatus: (message, color = '#8f98a0') => {
				status.textContent = message;
				status.style.color = color;
			},
		});
		if (result.ok) {
			undismissShortcut(context.shortcutAppId);
			if (result.shortcutAppId) recordKnownShortcut(result.shortcutAppId);
			setTimeout(() => closeShortcutAutoLinkModal(doc, context.shortcutAppId, false), 1100);
			return;
		}
		confirm.disabled = false;
		cancel.disabled = false;
		confirm.style.opacity = '1';
	});

	doc.body.appendChild(overlay);
}

function showShortcutTrackingRepairModal(doc: Document, context: ShortcutDetectionContext, steamAppId: string): void {
	if (!context.recommendedExePath || !doc.body || shortcutAutoDetectorModalOpen || doc.getElementById('gdl-auto-link-modal')) return;
	shortcutAutoDetectorModalOpen = true;
	const currentName = shortcutPathBasename(context.exePath) || context.exePath;
	const recommendedName = shortcutPathBasename(context.recommendedExePath) || context.recommendedExePath;
	const overlay = doc.createElement('div');
	overlay.id = 'gdl-auto-link-modal';
	overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);font-family:Arial,Helvetica,sans-serif;color:#dcdedf;';
	overlay.innerHTML = `
		<div role="dialog" aria-modal="true" style="width:min(570px,calc(100vw - 48px));background:#171d25;border:1px solid #3d4450;box-shadow:0 18px 60px rgba(0,0,0,.72);">
			<div style="display:flex;align-items:center;justify-content:space-between;padding:17px 20px;background:linear-gradient(90deg,#202a36,#171d25);border-bottom:1px solid rgba(255,255,255,.07);">
				<div style="font-size:20px;font-weight:500;color:#fff;">${escapeHtml(gdlText('tracking_repair_title', 'Fix Steam playtime tracking'))}</div>
				<button class="gdl-tracking-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}" style="border:0;background:transparent;color:#8f98a0;font-size:24px;line-height:1;cursor:pointer;padding:0 3px;">×</button>
			</div>
			<div style="padding:20px;">
				<div style="font-size:13px;line-height:1.5;color:#acb2b8;">${escapeHtml(gdlText('tracking_repair_message', '{bootstrap} closes after starting {game}, so Steam stops its timer. The plugin can make the shortcut launch {game} directly.', { bootstrap: currentName, game: recommendedName }))}</div>
				<div style="margin-top:15px;padding:11px;background:rgba(91,163,43,.10);border:1px solid rgba(91,163,43,.28);font-size:11px;line-height:1.45;color:#acb2b8;overflow-wrap:anywhere;">
					<div><span style="color:#8f98a0;">${escapeHtml(gdlText('current_executable', 'Current:'))}</span> ${escapeHtml(context.exePath)}</div>
					<div style="margin-top:5px;"><span style="color:#8f98a0;">${escapeHtml(gdlText('recommended_executable', 'Recommended:'))}</span> ${escapeHtml(context.recommendedExePath)}</div>
				</div>
				<div class="gdl-tracking-status" style="min-height:17px;margin-top:11px;font-size:12px;color:#8f98a0;"></div>
				<div style="display:flex;justify-content:flex-end;gap:9px;margin-top:14px;">
					<button class="gdl-tracking-cancel" style="padding:9px 17px;border:0;border-radius:2px;background:#3d4450;color:#dcdedf;cursor:pointer;">${escapeHtml(gdlText('not_now', 'Not now'))}</button>
					<button class="gdl-tracking-confirm" style="padding:9px 18px;border:0;border-radius:2px;background:linear-gradient(90deg,#75b022,#588a1b);color:#fff;cursor:pointer;">${escapeHtml(gdlText('use_recommended_executable', 'Use {game}', { game: recommendedName }))}</button>
				</div>
			</div>
		</div>`;

	const status = overlay.querySelector('.gdl-tracking-status') as HTMLElement;
	const confirm = overlay.querySelector('.gdl-tracking-confirm') as HTMLButtonElement;
	const cancel = overlay.querySelector('.gdl-tracking-cancel') as HTMLButtonElement;
	const dismiss = () => closeShortcutAutoLinkModal(doc, context.shortcutAppId, true);
	overlay.querySelector('.gdl-tracking-close')?.addEventListener('click', dismiss);
	cancel.addEventListener('click', dismiss);
	overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
	confirm.addEventListener('click', async () => {
		confirm.disabled = true;
		cancel.disabled = true;
		confirm.style.opacity = '.65';
		let synced: ShortcutIdentitySyncResult;
		try {
			synced = await synchronizeShortcutOfficialIdentity({
				shortcutAppId: context.shortcutAppId,
				currentTitle: context.title,
				steamAppId,
				trackingExecutable: context.recommendedExePath || '',
				trackingStartDir: context.recommendedStartDir || '',
				existingLaunchOptions: context.launchOptions,
			});
		} catch (e) {
			backendLog('Tracking repair synchronization failed: ' + e);
			status.textContent = gdlText('tracking_repair_failed', 'The shortcut target could not be updated. You can still select the recommended EXE manually in Properties.');
			status.style.color = '#ff6b6b';
			confirm.disabled = false;
			cancel.disabled = false;
			confirm.style.opacity = '1';
			return;
		}
		if (!synced.trackingApplied) {
			status.textContent = gdlText('tracking_repair_failed', 'The shortcut target could not be updated. You can still select the recommended EXE manually in Properties.');
			status.style.color = '#ff6b6b';
			confirm.disabled = false;
			cancel.disabled = false;
			confirm.style.opacity = '1';
			return;
		}
		const finalShortcutId = synced.shortcutAppId;
		recordKnownShortcut(finalShortcutId);
		dismissShortcut(context.shortcutAppId);
		status.textContent = gdlText('tracking_repair_success', '✓ The shortcut now launches the long-running game process. Steam can keep counting playtime.');
		status.style.color = '#66c0f4';
		shortcutRuntimeHost().refreshLibraryArtwork(finalShortcutId);
		setTimeout(() => closeShortcutAutoLinkModal(doc, context.shortcutAppId, false), 1400);
	});
	doc.body.appendChild(overlay);
}

async function inspectNewShortcut(record: { id: number; title: string }): Promise<void> {
	if (shortcutDetectionInFlight.has(record.id) || shortcutDetectionDismissed.has(record.id)) return;
	shortcutDetectionInFlight.add(record.id);
	try {
		let context: ShortcutDetectionContext | null = null;
		for (let attempt = 0; attempt < 5; attempt++) {
			context = await buildShortcutDetectionContext(null, record.title, record.id);
			if (context?.exePath) break;
			await new Promise(resolve => setTimeout(resolve, 700));
		}
		if (!context?.exePath) {
			dismissShortcut(record.id);
			backendLog(`Automatic detection could not read the executable for new shortcut ${record.title}`);
			return;
		}
		const exactLinkedSteamAppId = mappings[shortcutMappingKey(record.id)] || '';
		const duplicateLinkedSteamAppId = findMappingForDuplicateShortcut(record.id) || '';
		const linkedSteamAppId = exactLinkedSteamAppId || duplicateLinkedSteamAppId || findMappingForTitle(record.title, String(record.id));
		if (/^\d+$/.test(String(linkedSteamAppId || ''))) {
			const data = await getGameData(String(linkedSteamAppId));
			const officialName = String(data?.name || record.title).trim();
			if (data && (!exactLinkedSteamAppId || normalizeTitle(record.title) !== normalizeTitle(officialName))) {
				const synced = await synchronizeShortcutOfficialIdentity({
					shortcutAppId: record.id,
					currentTitle: record.title,
					steamAppId: String(linkedSteamAppId),
					data,
					existingLaunchOptions: context.launchOptions,
				});
				const refreshed = await buildShortcutDetectionContext(null, synced.officialName, synced.shortcutAppId);
				if (refreshed) context = refreshed;
				backendLog(`Recovered official identity for linked shortcut ${record.title} (${record.id} -> ${synced.shortcutAppId})`);
			} else if (!exactLinkedSteamAppId) {
				const exactKey = shortcutMappingKey(record.id);
				if (await saveMappingChecked(exactKey, String(linkedSteamAppId))) mappings[exactKey] = String(linkedSteamAppId);
			}
			// Repair known compatible launchers for shortcuts that were linked
			// before the automatic rule existed. This remains strictly scoped to
			// non-Steam shortcut IDs and never mutates native Steam applications.
			if (shouldAutoApplyNoLauncher(String(linkedSteamAppId))
				&& !hasNoLauncherOption(context.launchOptions)) {
				if (applyNoLauncherOption(context.shortcutAppId, context.launchOptions, true)) {
					context.launchOptions = mergeNoLauncherOption(context.launchOptions);
					backendLog(`Repaired launch options for linked shortcut ${record.title} (${context.shortcutAppId})`);
				}
			}
			if (context.bootstrapDetected && context.recommendedExePath) {
				while (shortcutAutoDetectorModalOpen && !shortcutDetectionDismissed.has(context.shortcutAppId)) {
					await new Promise(resolve => setTimeout(resolve, 900));
				}
				const doc = shortcutRuntimeHost().getMainWindowDoc();
				if (doc?.body && !shortcutDetectionDismissed.has(context.shortcutAppId)) {
					showShortcutTrackingRepairModal(doc, context, String(linkedSteamAppId));
				}
			}
			return;
		}
		if (!getPreferences().autoDetectShortcuts) {
			dismissShortcut(record.id);
			return;
		}
		const detection = await detectShortcutCandidates(context);
		const best = detection?.candidates?.[0];
		if (!detection || !best || best.score < 58) {
			dismissShortcut(record.id);
			backendLog(`Automatic detection found no reliable match for new shortcut ${record.title}`);
			return;
		}
		while (shortcutAutoDetectorModalOpen && !shortcutDetectionDismissed.has(record.id)) {
			await new Promise(resolve => setTimeout(resolve, 900));
		}
		const doc = shortcutRuntimeHost().getMainWindowDoc();
		if (!doc?.body || shortcutDetectionDismissed.has(record.id)) return;
		showShortcutAutoLinkModal(doc, context, detection);
	} catch (e) {
		backendLog(`New shortcut detection failed for ${record.title}: ${e}`);
	} finally {
		shortcutDetectionInFlight.delete(record.id);
	}
}

export function scheduleShortcutInspection(record: { id: number; title: string }, delay = 350, includeLinked = false): void {
	if (!Number.isFinite(record.id) || record.id < 2147483648 || !record.title.trim()) return;
	if (shortcutDetectionScheduled.has(record.id)
		|| shortcutDetectionInFlight.has(record.id)
		|| shortcutDetectionDismissed.has(record.id)
		|| (!includeLinked && shortcutAlreadyLinked(record.id))) return;
	shortcutDetectionScheduled.add(record.id);
	setTimeout(() => { void inspectNewShortcut(record); }, delay);
}

function scanForNewShortcuts(): void {
	const appStore = (window as any).appStore;
	if (!appStore?.m_mapApps) return;
	const records = getAllShortcutRecords();

	// Record all records currently in library as known
	for (const record of records) {
		knownShortcutIds.add(record.id);
	}
	persistStoredNumberSet(KNOWN_SHORTCUTS_STORAGE_KEY, knownShortcutIds);

	if (!shortcutAutoDetectorInitialized) {
		// Wait for Steam's app overview map to be populated before taking the
		// baseline. Otherwise every pre-existing shortcut would look newly added.
		const appCount = Number(appStore.m_mapApps?.size || 0);
		if (appCount <= 0 && Date.now() - shortcutAutoDetectorStartedAt < 8000) return;
		const linkedShortcutRepairs: Array<{ id: number; title: string }> = [];
		for (const record of records) {
			const linkedSteamAppId = findMappingForDuplicateShortcut(record.id)
				|| findMappingForTitle(record.title, String(record.id));
			if (/^\d+$/.test(String(linkedSteamAppId || ''))
				&& (!mappings[shortcutMappingKey(record.id)] || shouldAutoApplyNoLauncher(String(linkedSteamAppId)))) {
				linkedShortcutRepairs.push(record);
			}
		}
		shortcutAutoDetectorInitialized = true;
		linkedShortcutRepairs.forEach((record, index) => {
			scheduleShortcutInspection(record, 250 + index * 150, true);
		});
		backendLog(`Automatic shortcut detector ready; ${records.length} existing shortcut(s) indexed and ${linkedShortcutRepairs.length} linked shortcut repair(s) queued.`);
		return;
	}

	for (const record of records) {
		if (knownShortcutIds.has(record.id)) continue;
		recordKnownShortcut(record.id);
		if (shortcutAlreadyLinked(record.id) || shortcutDetectionDismissed.has(record.id)) continue;
		if (!getPreferences().autoDetectShortcuts) continue;
		backendLog(`New non-Steam shortcut detected: ${record.title} (${record.id})`);
		scheduleShortcutInspection(record, 1000);
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
	shortcutDetectionInFlight.clear();
	shortcutDetectionScheduled.clear();
	clearShortcutDetectionCache();
	clearLinkedNoteSyncState();
	try { shortcutRuntimeHost().getMainWindowDoc()?.getElementById('gdl-auto-link-modal')?.remove(); } catch {}
}

