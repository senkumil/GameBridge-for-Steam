import type { ShortcutDetectionCandidate, ShortcutDetectionContext } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { escapeHtml, templateToRegex } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName, shortcutPathBasename } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut, isUnrealShippingExecutable } from './registry';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { enqueueLinkJob } from './link-job-queue';
import { unlinkShortcutFromSteam } from './unlinking';
import { undismissShortcut } from './dismissed';
import { rememberedShortcutSteamAppId } from './link-history';
import { bindShortcutAchievementSettings, shortcutAchievementSettingsHtml } from './achievement-properties';

const GDL_PROP = 'gdl-properties-injected';

export function tryInjectPropertiesField(doc: Document, popupTitle: string): void {
	if (!doc || !doc.body || doc.querySelector(`.${GDL_PROP}`)) return;

	const vrPhrases = [
		loc('AppProperties_Shortcut_InVR', 'Include in VR Library').toLowerCase(),
		'include in vr library', 'incluir en la biblioteca de rv', 'incluir en la biblioteca vr',
		'in vr-bibliothek aufnehmen', 'inclure dans la bibliothèque vr', 'includi nella libreria vr',
		'включить в библиотеку vr',
	];
	const targetPhrases = [
		loc('AppProperties_Shortcut_TargetExecutable', 'Target').toLowerCase(),
		loc('AppProperties_Shortcut_StartDir', 'Start In').toLowerCase(),
		'target', 'destino', 'cible', 'ziel', 'destinazione', 'объект',
		'start in', 'iniciar en', 'démarrer dans', 'ausführen in', 'inizia in', 'рабочая папка',
	];

	const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null);
	let tn: Text | null;
	let anchor: Element | null = null;
	let foundShortcutOnlyField = false;
	while ((tn = walker.nextNode() as Text | null)) {
		const txt = (tn.textContent || '').trim().toLowerCase();
		if (!txt) continue;
		if (vrPhrases.some(p => txt === p || (p.length > 5 && txt.includes(p)))) {
			foundShortcutOnlyField = true;
			if (tn.parentElement) { anchor = tn.parentElement; break; }
		} else if (targetPhrases.some(p => txt === p)) {
			foundShortcutOnlyField = true;
			if (tn.parentElement && !anchor) anchor = tn.parentElement;
		}
	}

	// Launch options are shared by native games. Only Shortcut-only fields
	// (Target or VR library) authorize inserting this plugin's settings.
	if (!foundShortcutOnlyField || !anchor) return;

	// Walk up to the dialog's content container. Steam's current properties
	// dialog sometimes scrolls through a custom wrapper whose computed
	// overflowY is "visible", so requiring auto/scroll here makes the whole
	// panel disappear even though the Shortcut tab was detected correctly.
	// Keep the scrollable-container preference, but retain the nearest useful
	// ancestor as the backup behavior used by the original working build.
	let container: Element | null = null;
	let fallbackContainer: Element | null = anchor.parentElement;
	let cur: Element | null = anchor;
	for (let i = 0; i < 15 && cur && cur.parentElement && cur !== doc.body; i++) {
		const parent = cur.parentElement;
		if (parent === doc.body) break;
		cur = parent;
		fallbackContainer = cur;
		try {
			const style = (cur.ownerDocument?.defaultView || window).getComputedStyle(cur);
			const element = cur as HTMLElement;
			const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.clientHeight > 0;
			const isModalBody = cur.className && String(cur.className).includes('Modal');
			if (isScrollable || isModalBody) {
				container = cur;
				break;
			}
		} catch {}
	}
	if (!container) container = fallbackContainer;
	if (!container) return;

	// ── Extract game title ─────────────────────────────────────────────
	let gameTitle: string | null = null;

	// Window title template is localized, e.g. "Properties - %1$s" / "Eigenschaften: %1$s"
	const propsTitleRx = templateToRegex(loc('AppProperties_Title', 'Properties - %1$s'), true);
	const extractTitle = (raw: string | null | undefined): string | null => {
		const t = raw?.trim();
		if (!t || t === 'Steam') return null;
		const m = propsTitleRx ? t.match(propsTitleRx) : null;
		if (m && m[1]) return m[1].trim();
		if (/^properties$/i.test(t)) return null;
		return t.replace(/^properties\s*[-–—:]\s*/i, '').trim() || t;
	};

	// 1. Popup title - for Properties windows this is typically the game name
	gameTitle = extractTitle(popupTitle);

	// 2. Document title
	if (!gameTitle) gameTitle = extractTitle(doc.title);

	// 3. Look for the shortcut name text input (top input in the Shortcut tab next to game icon)
	if (!gameTitle) {
		const allInputs = Array.from(doc.querySelectorAll('input[type="text"], input:not([type])'));
		for (const inp of allInputs) {
			const val = (inp as HTMLInputElement).value?.trim();
			if (val && !val.includes(':\\') && !val.includes(':/') && !val.startsWith('-') && !val.startsWith('"') && !(inp as HTMLElement).classList.contains('gdl-appid-input')) {
				gameTitle = val;
				break;
			}
		}
	}

	// 4. Search the dialog for the game name header text
	if (!gameTitle) {
		const tabNames = [
			loc('AppProperties_ShortcutPage', 'Shortcut').toLowerCase(),
			loc('AppProperties_ControllerPage', 'Controller').toLowerCase(),
			loc('AppProperties_GameRecording', 'Game Recording').toLowerCase(),
			loc('AppProperties_Customization', 'Customization').toLowerCase(),
		];
		const ignoredLabels = new Set(['properties', 'target', 'start in', 'search', 'browse']);
		const textWalker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
		let tNode: Text | null;
		while ((tNode = textWalker.nextNode() as Text | null)) {
			const t = tNode.textContent?.trim();
			if (t && t.length > 1 && !tabNames.includes(t.toLowerCase()) && !ignoredLabels.has(t.toLowerCase())) {
				const parent = tNode.parentElement;
				if (parent && (parent.closest('[class*="Title"], [class*="Header"]') || parent.tagName === 'H1' || parent.tagName === 'H2' || parent.tagName === 'B')) {
					const cleaned = t.replace(/^properties\s*[-–—:]\s*/i, '').trim();
					if (cleaned) { gameTitle = cleaned; break; }
				}
			}
		}
	}

	if (!gameTitle) {
		const notice = shortcutRuntimeHost().findNonSteamNotice(doc);
		if (notice?.title) gameTitle = notice.title;
	}

	backendLog('Properties detected — gameTitle: ' + gameTitle + ', popupTitle: ' + popupTitle);

	if (!gameTitle) return;

	const initialShortcutId = findActiveShortcutAppId(doc, gameTitle) || (findShortcutAppIdByName(gameTitle) ? String(findShortcutAppIdByName(gameTitle)) : null);
	let managedShortcutId = initialShortcutId ? Number(initialShortcutId) : null;
	const currentRaw = findMappingForShortcut(initialShortcutId, gameTitle) || '';
	// Only numeric Steam AppIDs are active; old external-platform mappings stay hidden
	// until the user replaces them with a Steam link.
	let currentLinked = /^\d+$/.test(currentRaw) ? currentRaw : '';
	const rememberedAppId = rememberedShortcutSteamAppId(managedShortcutId);
	const initialAppId = currentLinked || rememberedAppId;

	// Build UI section
	const section = doc.createElement('div');
	section.className = GDL_PROP;
	section.style.cssText = 'padding: 20px 24px; margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);';

	section.innerHTML = `
		<div style="font-size: 12px; font-weight: 500; color: #8f98a0; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
			${escapeHtml(gdlText('linked_title', 'Linked game'))}
		</div>
		<div style="font-size: 11px; color: #6c7580; margin-bottom: 12px;">
			${escapeHtml(gdlText('linked_description', 'Paste a Steam AppID or Steam store link to show game information on this library page.'))}
		</div>
		<div class="gdl-auto-detect" style="margin-bottom:12px; padding:10px 12px; background:rgba(26,159,255,0.08); border:1px solid rgba(26,159,255,0.2); border-radius:3px;">
			<div class="gdl-auto-detect-title" style="font-size:11px; color:#8f98a0; margin-bottom:7px;">${escapeHtml(gdlText('shortcut_suggestions_title', 'Steam AppID suggestions:'))}</div>
			<select class="gdl-auto-candidates" style="width:100%; padding:7px 9px; background:#20242b; border:1px solid rgba(255,255,255,0.12); border-radius:2px; color:#dcdedf; font-size:12px;">
				<option value="">${escapeHtml(gdlText('detecting_game', 'Detecting the game automatically...'))}</option>
			</select>
			<div class="gdl-auto-candidate-preview" style="display:none; margin-top:10px;"></div>
		</div>
		<div style="display: flex; gap: 8px; align-items: center;">
			<input class="gdl-appid-input" type="text" placeholder="${escapeHtml(gdlText('appid_placeholder', 'Steam AppID or Steam store link'))}"
				value="${escapeHtml(initialAppId)}"
				style="flex:1; padding:8px 12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); border-radius:3px; color:#dcdedf; font-size:13px; outline:none;" />
			<button class="gdl-save-btn" style="padding:8px 18px; background:#1a9fff; border:none; border-radius:3px; color:#fff; font-size:12px; font-weight:500; cursor:pointer; white-space:nowrap;">${escapeHtml(gdlText('save', 'Save'))}</button>
			<button class="gdl-unlink-btn" ${currentLinked ? '' : 'disabled'} style="display:block;padding:8px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);border-radius:3px;color:${currentLinked ? '#c7d5e0' : '#68737f'};font-size:12px;cursor:${currentLinked ? 'pointer' : 'default'};white-space:nowrap;opacity:${currentLinked ? '1' : '.65'};">${escapeHtml(currentLinked ? gdlText('unlink', 'Unlink') : gdlText('game_unlinked_status', 'Unlinked'))}</button>
		</div>
		${shortcutAchievementSettingsHtml()}
		<label class="gdl-skip-launcher" style="display:none; align-items:flex-start; gap:8px; margin-top:10px; color:#acb2b8; font-size:11px; cursor:pointer;">
			<input class="gdl-skip-launcher-input" type="checkbox" style="margin-top:2px;" />
			<span><strong style="font-weight:500; color:#dcdedf;">${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('skip_launcher_help', 'Adds -nolauncher while preserving your current launch options. Enable it only if this game supports that argument.'))}</span>
		</label>
		<label class="gdl-tracking-executable" style="display:none; align-items:flex-start; gap:8px; margin-top:10px; padding:9px 10px; background:rgba(91,163,43,.10); border:1px solid rgba(91,163,43,.25); color:#acb2b8; font-size:11px; cursor:pointer;">
			<input class="gdl-tracking-executable-input" type="checkbox" style="margin-top:2px;" />
			<span class="gdl-tracking-executable-copy"></span>
		</label>
		<div class="gdl-status" style="font-size: 11px; color: #8f98a0; margin-top: 8px; min-height: 16px;"></div>
	`;

	container.appendChild(section);

	const input = section.querySelector('.gdl-appid-input') as HTMLInputElement;
	const saveBtn = section.querySelector('.gdl-save-btn') as HTMLButtonElement;
	const unlinkBtn = section.querySelector('.gdl-unlink-btn') as HTMLButtonElement;
	const statusEl = section.querySelector('.gdl-status') as HTMLElement;
	const autoTitle = section.querySelector('.gdl-auto-detect-title') as HTMLElement;
	const autoSelect = section.querySelector('.gdl-auto-candidates') as HTMLSelectElement;
	const candidatePreview = section.querySelector('.gdl-auto-candidate-preview') as HTMLElement;
	const skipLauncherLabel = section.querySelector('.gdl-skip-launcher') as HTMLElement;
	const skipLauncherInput = section.querySelector('.gdl-skip-launcher-input') as HTMLInputElement;
	const trackingExecutableLabel = section.querySelector('.gdl-tracking-executable') as HTMLElement;
	const trackingExecutableInput = section.querySelector('.gdl-tracking-executable-input') as HTMLInputElement;
	const trackingExecutableCopy = section.querySelector('.gdl-tracking-executable-copy') as HTMLElement;
	let detectionContext: ShortcutDetectionContext | null = null;

	const renderCandidatePreview = (candidates: ShortcutDetectionCandidate[], selectedAppId: string): void => {
		if (!candidatePreview || !Array.isArray(candidates)) return;
		const selected = candidates.find(candidate => candidate.appid === selectedAppId) || candidates[0];
		if (!selected) {
			candidatePreview.style.display = 'none';
			candidatePreview.replaceChildren();
			return;
		}
		candidatePreview.style.display = 'block';
		candidatePreview.innerHTML = `
			<div style="display:flex;gap:10px;align-items:center;min-width:0;padding:8px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);">
				<img class="gdl-auto-candidate-primary-image" src="${escapeHtml(selected.image || '')}" alt="" style="width:112px;height:52px;flex:0 0 112px;object-fit:cover;background:#10141a;border:1px solid rgba(255,255,255,.1);" />
				<div style="min-width:0;"><div style="color:#dcdedf;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(selected.name)}</div><div style="margin-top:3px;color:#66c0f4;font-size:11px;">Steam AppID ${escapeHtml(selected.appid)}${selected.score ? ` · ${Math.round(selected.score)}%` : ''}</div></div>
			</div>
			<div class="gdl-auto-candidate-strip" style="display:flex;gap:6px;margin-top:8px;overflow-x:auto;padding:1px 1px 4px;"></div>`;
		const primary = candidatePreview.querySelector<HTMLImageElement>('.gdl-auto-candidate-primary-image');
		primary?.addEventListener('error', () => { if (primary) primary.style.visibility = 'hidden'; }, { once: true });
		const strip = candidatePreview.querySelector<HTMLElement>('.gdl-auto-candidate-strip');
		for (const candidate of candidates.slice(0, 6)) {
			const button = doc.createElement('button');
			button.type = 'button';
			button.title = `${candidate.name} — AppID ${candidate.appid}`;
			button.setAttribute('aria-label', button.title);
			button.style.cssText = `position:relative;width:92px;height:43px;flex:0 0 92px;padding:0;overflow:hidden;background:#10141a;border:${candidate.appid === selected.appid ? '2px solid #66c0f4' : '1px solid rgba(255,255,255,.14)'};cursor:pointer;`;
			const image = doc.createElement('img');
			image.src = candidate.image || '';
			image.alt = '';
			image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;background:#10141a;';
			image.addEventListener('error', () => { image.style.visibility = 'hidden'; }, { once: true });
			button.appendChild(image);
			button.addEventListener('click', () => {
				autoSelect.value = candidate.appid;
				input.value = candidate.appid;
				autoTitle.textContent = gdlText('detected_game', 'Detected: {name}. Review the result and press Save to link it.', { name: candidate.name });
				renderCandidatePreview(candidates, candidate.appid);
			});
			strip?.appendChild(button);
		}
	};

	bindShortcutAchievementSettings({
		section,
		shortcutAppId: () => managedShortcutId ? String(managedShortcutId) : '',
		steamAppId: () => /^\d+$/.test(input.value.trim()) ? input.value.trim() : currentLinked,
	});

	if (managedShortcutId && input && statusEl && autoSelect && autoTitle) {
		statusEl.textContent = gdlText('detecting_game', 'Detecting the game automatically...');
		void (async () => {
			detectionContext = await buildShortcutDetectionContext(doc, gameTitle, managedShortcutId!);
			if (!detectionContext) {
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
				statusEl.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
				return;
			}
			const detection = await detectShortcutCandidates(detectionContext);
			const viable = detection?.candidates || [];
			if (!viable.length) {
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
				statusEl.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
				return;
			}
			const options: HTMLOptionElement[] = [];
			const preferredAppId = currentLinked || rememberedAppId;
			if (preferredAppId && !viable.some(c => c.appid === preferredAppId)) {
				const rememberedOpt = doc.createElement('option');
				rememberedOpt.value = preferredAppId;
				rememberedOpt.textContent = currentLinked
					? gdlText('current_linked_option', 'Currently linked game (AppID {appid})', { appid: preferredAppId })
					: `Steam AppID ${preferredAppId}`;
				options.push(rememberedOpt);
			}
			for (const candidate of viable) {
				const option = doc.createElement('option');
				option.value = candidate.appid;
				const scoreText = candidate.score ? ` (${Math.round(candidate.score)}%)` : '';
				option.textContent = `${candidate.name} — AppID ${candidate.appid}${scoreText}`;
				options.push(option);
			}
			autoSelect.replaceChildren(...options);
			if (!currentLinked && viable.length > 0 && !rememberedAppId) {
				input.value = viable[0].appid;
				autoSelect.value = viable[0].appid;
				autoTitle.textContent = gdlText('detected_game', 'Detected: {name}. Review the result and press Save to link it.', { name: viable[0].name });
			} else if (currentLinked || rememberedAppId) {
				const preferredAppId = currentLinked || rememberedAppId;
				input.value = preferredAppId;
				autoSelect.value = preferredAppId;
				const currentCandidate = viable.find(c => c.appid === preferredAppId);
				autoTitle.textContent = currentCandidate
					? gdlText('detected_game', 'Detected: {name}. Review the result and press Save to link it.', { name: currentCandidate.name })
					: gdlText('shortcut_suggestions_title', 'Steam AppID suggestions:');
			}
			renderCandidatePreview(viable, autoSelect.value || viable[0].appid);
			statusEl.textContent = viable[0]?.score >= 72
				? gdlText('detection_ready', 'Automatic detection is ready to confirm.')
				: gdlText('detection_uncertain', 'The match is uncertain. Choose the correct result or enter the AppID manually.');
			if (detection?.launcher_detected && !detection.generic_launcher && !isUnrealShippingExecutable(detectionContext.exePath)) {
				skipLauncherLabel.style.display = 'flex';
			}
			if (detectionContext.bootstrapDetected && detectionContext.recommendedExePath) {
				const bootstrap = shortcutPathBasename(detectionContext.exePath);
				const gameExe = shortcutPathBasename(detectionContext.recommendedExePath);
				trackingExecutableCopy.innerHTML = `<strong style="font-weight:500;color:#dcdedf;">${escapeHtml(gdlText('use_tracking_executable', 'Use the real game executable'))}</strong><br />${escapeHtml(gdlText('tracking_executable_help', '{bootstrap} closes after launching {game}. Use {game} so Steam tracks your playtime.', { bootstrap, game: gameExe }))}`;
				trackingExecutableLabel.style.display = 'flex';
			}
			autoSelect.addEventListener('change', () => {
				if (autoSelect.value) {
					input.value = autoSelect.value;
					const selected = viable.find(candidate => candidate.appid === autoSelect.value);
					if (selected) {
						autoTitle.textContent = gdlText('detected_game', 'Detected: {name}. Review the result and press Save to link it.', { name: selected.name });
						renderCandidatePreview(viable, selected.appid);
					}
				}
			});
		})().catch(e => {
			backendLog('Properties automatic detection error: ' + e);
			autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
			statusEl.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
		});
	}

	if (unlinkBtn && input && statusEl) {
		unlinkBtn.addEventListener('click', async () => {
			const shortcutId = managedShortcutId || Number(findActiveShortcutAppId(doc, gameTitle) || 0) || findShortcutAppIdByName(gameTitle);
			if (!shortcutId) {
				statusEl.textContent = gdlText('unlink_failed', 'Could not identify this shortcut to unlink it.');
				statusEl.style.color = '#ff6b6b';
				return;
			}
			unlinkBtn.disabled = true;
			saveBtn.disabled = true;
			statusEl.textContent = gdlText('unlinking', 'Removing the link and its saved artwork...');
			statusEl.style.color = '#8f98a0';
			const result = await unlinkShortcutFromSteam({
				doc,
				shortcutAppId: shortcutId,
				title: gameTitle,
				steamAppId: currentLinked || undefined,
				exePath: detectionContext?.exePath || '',
			});
			if (result.ok) {
				managedShortcutId = result.shortcutAppId || shortcutId;
				const preservedAppId = currentLinked || rememberedAppId || input.value.trim();
				if (preservedAppId) input.value = preservedAppId;
				currentLinked = '';
				unlinkBtn.disabled = true;
				unlinkBtn.textContent = gdlText('game_unlinked_status', 'Unlinked');
				unlinkBtn.style.display = 'block';
				unlinkBtn.style.color = '#68737f';
				unlinkBtn.style.cursor = 'default';
				unlinkBtn.style.opacity = '.65';
				statusEl.textContent = gdlText('unlink_success', 'Link removed. You can link this same shortcut again without deleting it from Steam.');
				statusEl.style.color = '#5ba32b';
			} else {
				statusEl.textContent = gdlText('unlink_failed', 'The link could not be removed.');
				statusEl.style.color = '#ff6b6b';
				unlinkBtn.disabled = false;
			}
			saveBtn.disabled = false;
		});
	}

	if (saveBtn && input && statusEl) {
		saveBtn.addEventListener('click', async () => {
			let val = input.value.trim();
			if (!val) { statusEl.textContent = gdlText('enter_appid', 'Enter an AppID or store link.'); return; }
			// Accept store/community links (e.g. https://store.steampowered.com/app/2947440/Name/)
			const urlMatch = val.match(/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i)
				|| val.match(/s\.team\/a\/(\d+)/i);
			if (urlMatch) {
				val = urlMatch[1];
				input.value = val;
			}
			if (!/^\d+$/.test(val)) { statusEl.textContent = gdlText('enter_numeric_appid', 'Enter a numeric AppID or a store page link.'); return; }

			if (managedShortcutId) undismissShortcut(managedShortcutId);
			enqueueLinkJob({
				title: gameTitle,
				shortcutAppId: managedShortcutId,
				steamAppId: val,
				skipLauncher: !!skipLauncherInput?.checked,
				existingLaunchOptions: detectionContext?.launchOptions || '',
				trackingExecutable: trackingExecutableInput?.checked ? detectionContext?.recommendedExePath || '' : '',
				trackingStartDir: trackingExecutableInput?.checked ? detectionContext?.recommendedStartDir || '' : '',
				shortcutExecutable: detectionContext?.exePath || '',
			});
			statusEl.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
			statusEl.style.color = '#66c0f4';
		});
	}
}
