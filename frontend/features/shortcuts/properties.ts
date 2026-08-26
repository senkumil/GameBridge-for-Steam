import type { ShortcutDetectionContext } from '../../domain/types';
import { backendLog, getGameAchievementPathBackend, setGameAchievementPathBackend } from '../../api/backend';
import { shortcutMappingKey } from '../../core/mappings';
import { escapeHtml, normalizeTitle, templateToRegex } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName, shortcutPathBasename } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut, isUnrealShippingExecutable } from './registry';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { linkShortcutToSteam } from './linking';

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

	let titleKey = normalizeTitle(gameTitle);
	const initialShortcutId = findActiveShortcutAppId(doc, gameTitle) || (findShortcutAppIdByName(gameTitle) ? String(findShortcutAppIdByName(gameTitle)) : null);
	let managedShortcutId = initialShortcutId ? Number(initialShortcutId) : null;
	const mappingAliases = new Set<string>([titleKey]);
	const currentRaw = findMappingForShortcut(initialShortcutId, gameTitle) || '';
	// Only numeric Steam AppIDs are active; old external-platform mappings stay hidden
	// until the user replaces them with a Steam link.
	const currentLinked = /^\d+$/.test(currentRaw) ? currentRaw : '';

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
			<div class="gdl-auto-detect-title" style="font-size:11px; color:#8f98a0; margin-bottom:7px;">${escapeHtml(gdlText('shortcut_suggestions_title', 'Sugerencias de Steam AppID:'))}</div>
			<select class="gdl-auto-candidates" style="width:100%; padding:7px 9px; background:#20242b; border:1px solid rgba(255,255,255,0.12); border-radius:2px; color:#dcdedf; font-size:12px;">
				<option value="">${escapeHtml(gdlText('detecting_game', 'Detectando el juego automáticamente...'))}</option>
			</select>
		</div>
		<div style="display: flex; gap: 8px; align-items: center;">
			<input class="gdl-appid-input" type="text" placeholder="${escapeHtml(gdlText('appid_placeholder', 'Steam AppID or Steam store link'))}"
				value="${escapeHtml(currentLinked)}"
				style="flex:1; padding:8px 12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); border-radius:3px; color:#dcdedf; font-size:13px; outline:none;" />
			<button class="gdl-save-btn" style="padding:8px 18px; background:#1a9fff; border:none; border-radius:3px; color:#fff; font-size:12px; font-weight:500; cursor:pointer; white-space:nowrap;">${escapeHtml(gdlText('save', 'Save'))}</button>
		</div>
		<div class="gdl-game-achievement-source" style="margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.06);">
			<div style="font-size:12px; font-weight:500; color:#8f98a0; text-transform:uppercase; letter-spacing:.5px; margin-bottom:7px;">
				${escapeHtml(gdlText('game_achievement_path_title', 'Achievement progress file'))}
			</div>
			<div style="font-size:11px; color:#6c7580; margin-bottom:9px; line-height:1.4;">
				${escapeHtml(gdlText('game_achievement_path_description', 'Optional. Paste this game\'s achievements JSON file, or a folder that contains achievements.json. This source is checked before the global AppID folders.'))}
			</div>
			<div style="display:flex; gap:8px; align-items:center;">
				<input class="gdl-game-achievement-path-input" type="text" placeholder="${escapeHtml(gdlText('game_achievement_path_placeholder', 'Example: D:\\Game\\achievements.json'))}"
					style="flex:1; min-width:0; padding:8px 12px; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.1); border-radius:3px; color:#dcdedf; font-size:12px; outline:none;" />
				<button class="gdl-game-achievement-path-save" style="padding:8px 14px; background:#1a9fff; border:0; border-radius:3px; color:#fff; font-size:12px; font-weight:500; cursor:pointer; white-space:nowrap;">${escapeHtml(gdlText('game_achievement_path_save', 'Save path'))}</button>
				<button class="gdl-game-achievement-path-clear" style="padding:8px 12px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.06); border-radius:3px; color:#8f98a0; font-size:12px; cursor:pointer; white-space:nowrap;">${escapeHtml(gdlText('game_achievement_path_clear', 'Use automatic'))}</button>
			</div>
			<div class="gdl-game-achievement-path-status" style="font-size:11px; color:#8f98a0; margin-top:7px; min-height:16px;"></div>
		</div>
		<label class="gdl-skip-launcher" style="display:none; align-items:flex-start; gap:8px; margin-top:10px; color:#acb2b8; font-size:11px; cursor:pointer;">
			<input class="gdl-skip-launcher-input" type="checkbox" style="margin-top:2px;" />
			<span><strong style="font-weight:500; color:#dcdedf;">${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('skip_launcher_help', 'Adds -nolauncher while preserving your current launch options. Enable it only if this game supports that argument.'))}</span>
		</label>
		<label class="gdl-tracking-executable" style="display:none; align-items:flex-start; gap:8px; margin-top:10px; padding:9px 10px; background:rgba(91,163,43,.10); border:1px solid rgba(91,163,43,.25); color:#acb2b8; font-size:11px; cursor:pointer;">
			<input class="gdl-tracking-executable-input" type="checkbox" checked style="margin-top:2px;" />
			<span class="gdl-tracking-executable-copy"></span>
		</label>
		<div class="gdl-status" style="font-size: 11px; color: #8f98a0; margin-top: 8px; min-height: 16px;"></div>
	`;

	container.appendChild(section);

	const input = section.querySelector('.gdl-appid-input') as HTMLInputElement;
	const saveBtn = section.querySelector('.gdl-save-btn') as HTMLButtonElement;
	const statusEl = section.querySelector('.gdl-status') as HTMLElement;
	const autoTitle = section.querySelector('.gdl-auto-detect-title') as HTMLElement;
	const autoSelect = section.querySelector('.gdl-auto-candidates') as HTMLSelectElement;
	const skipLauncherLabel = section.querySelector('.gdl-skip-launcher') as HTMLElement;
	const skipLauncherInput = section.querySelector('.gdl-skip-launcher-input') as HTMLInputElement;
	const trackingExecutableLabel = section.querySelector('.gdl-tracking-executable') as HTMLElement;
	const trackingExecutableInput = section.querySelector('.gdl-tracking-executable-input') as HTMLInputElement;
	const trackingExecutableCopy = section.querySelector('.gdl-tracking-executable-copy') as HTMLElement;
	const gameAchievementPathInput = section.querySelector('.gdl-game-achievement-path-input') as HTMLInputElement;
	const gameAchievementPathSave = section.querySelector('.gdl-game-achievement-path-save') as HTMLButtonElement;
	const gameAchievementPathClear = section.querySelector('.gdl-game-achievement-path-clear') as HTMLButtonElement;
	const gameAchievementPathStatus = section.querySelector('.gdl-game-achievement-path-status') as HTMLElement;
	let detectionContext: ShortcutDetectionContext | null = null;

	const gameAchievementPathRequest = (path?: string) => JSON.stringify({
		shortcut_app_id: managedShortcutId ? String(managedShortcutId) : '',
		steam_app_id: /^\d+$/.test(input?.value?.trim() || '') ? input.value.trim() : currentLinked,
		path: path ?? '',
	});

	if (gameAchievementPathInput && gameAchievementPathStatus) {
		gameAchievementPathInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				gameAchievementPathSave?.click();
			}
		});
		gameAchievementPathStatus.textContent = gdlText('game_achievement_path_loading', 'Loading achievement source...');
		void getGameAchievementPathBackend({ request_json: gameAchievementPathRequest() })
			.then(raw => {
				const result = JSON.parse(raw || '{}') as { ok?: boolean; configured?: boolean; path?: string; usable?: boolean; error?: string };
				if (!result.ok) {
					gameAchievementPathStatus.textContent = result.error === 'missing_game_id'
						? gdlText('game_achievement_path_link_first', 'Link this shortcut to a Steam AppID first.')
						: gdlText('game_achievement_path_failed', 'The achievement source could not be loaded.');
					gameAchievementPathStatus.style.color = '#d94126';
					return;
				}
				gameAchievementPathInput.value = result.path || '';
				gameAchievementPathStatus.textContent = result.configured
					? (result.usable
						? gdlText('game_achievement_path_ready', 'This game will use the selected achievement file.')
						: gdlText('game_achievement_path_saved_missing', 'The path is saved, but no readable achievements JSON was found there.'))
					: gdlText('game_achievement_path_automatic', 'Using automatic AppID folders from the global plugin setting.');
				gameAchievementPathStatus.style.color = result.configured && !result.usable ? '#d6b24c' : '#8f98a0';
			})
			.catch(() => {
				gameAchievementPathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be loaded.');
				gameAchievementPathStatus.style.color = '#d94126';
			});
	}

	if (gameAchievementPathSave && gameAchievementPathInput && gameAchievementPathStatus) {
		gameAchievementPathSave.addEventListener('click', async () => {
			const path = gameAchievementPathInput.value.trim();
			if (!path) {
				gameAchievementPathStatus.textContent = gdlText('game_achievement_path_enter', 'Enter a JSON file or folder path.');
				gameAchievementPathStatus.style.color = '#d6b24c';
				return;
			}
			gameAchievementPathSave.disabled = true;
			gameAchievementPathSave.style.opacity = '.65';
			try {
				const raw = await setGameAchievementPathBackend({ request_json: gameAchievementPathRequest(path) });
				const result = JSON.parse(raw || '{}') as { ok?: boolean; usable?: boolean; error?: string };
				if (!result.ok) throw new Error(result.error || 'save_failed');
				gameAchievementPathStatus.textContent = result.usable
					? gdlText('game_achievement_path_saved', 'Achievement source saved for this game.')
					: gdlText('game_achievement_path_saved_missing', 'The path is saved, but no readable achievements JSON was found there.');
				gameAchievementPathStatus.style.color = result.usable ? '#66c0f4' : '#d6b24c';
			} catch {
				gameAchievementPathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be saved.');
				gameAchievementPathStatus.style.color = '#d94126';
			} finally {
				gameAchievementPathSave.disabled = false;
				gameAchievementPathSave.style.opacity = '1';
			}
		});
	}

	if (gameAchievementPathClear && gameAchievementPathInput && gameAchievementPathStatus) {
		gameAchievementPathClear.addEventListener('click', async () => {
			try {
				const raw = await setGameAchievementPathBackend({ request_json: gameAchievementPathRequest('') });
				const result = JSON.parse(raw || '{}') as { ok?: boolean; error?: string };
				if (!result.ok) throw new Error(result.error || 'clear_failed');
				gameAchievementPathInput.value = '';
				gameAchievementPathStatus.textContent = gdlText('game_achievement_path_cleared', 'Custom source removed; automatic AppID folders will be used.');
				gameAchievementPathStatus.style.color = '#8f98a0';
			} catch {
				gameAchievementPathStatus.textContent = gdlText('game_achievement_path_failed', 'The achievement source could not be saved.');
				gameAchievementPathStatus.style.color = '#d94126';
			}
		});
	}

	if (managedShortcutId && input && statusEl && autoSelect && autoTitle) {
		statusEl.textContent = gdlText('detecting_game', 'Detectando el juego automáticamente...');
		void (async () => {
			detectionContext = await buildShortcutDetectionContext(doc, gameTitle, managedShortcutId!);
			if (!detectionContext) {
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'Sin sugerencias automáticas (introduce el AppID abajo)'))}</option>`;
				statusEl.textContent = gdlText('no_match_found', 'No se encontró una coincidencia confiable. Puedes introducir el AppID manualmente.');
				return;
			}
			const detection = await detectShortcutCandidates(detectionContext);
			const viable = detection?.candidates || [];
			if (!viable.length) {
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'Sin sugerencias automáticas (introduce el AppID abajo)'))}</option>`;
				statusEl.textContent = gdlText('no_match_found', 'No se encontró una coincidencia confiable. Puedes introducir el AppID manualmente.');
				return;
			}
			const options: HTMLOptionElement[] = [];
			if (currentLinked && !viable.some(c => c.appid === currentLinked)) {
				const currentOpt = doc.createElement('option');
				currentOpt.value = currentLinked;
				currentOpt.textContent = gdlText('current_linked_option', 'Juego vinculado actualmente (AppID {appid})', { appid: currentLinked });
				options.push(currentOpt);
			}
			for (const candidate of viable) {
				const option = doc.createElement('option');
				option.value = candidate.appid;
				const scoreText = candidate.score ? ` (${Math.round(candidate.score)}%)` : '';
				option.textContent = `${candidate.name} — AppID ${candidate.appid}${scoreText}`;
				options.push(option);
			}
			autoSelect.replaceChildren(...options);
			if (!currentLinked && viable.length > 0) {
				input.value = viable[0].appid;
				autoSelect.value = viable[0].appid;
				autoTitle.textContent = gdlText('detected_game', 'Detectado: {name}. Revisa el resultado y pulsa Guardar para vincularlo.', { name: viable[0].name });
			} else if (currentLinked) {
				autoSelect.value = currentLinked;
				const currentCandidate = viable.find(c => c.appid === currentLinked);
				autoTitle.textContent = currentCandidate
					? gdlText('detected_game', 'Detectado: {name}. Revisa el resultado y pulsa Guardar para vincularlo.', { name: currentCandidate.name })
					: gdlText('shortcut_suggestions_title', 'Sugerencias de Steam AppID:');
			}
			statusEl.textContent = viable[0]?.score >= 72
				? gdlText('detection_ready', 'La detección automática está lista para confirmar.')
				: gdlText('detection_uncertain', 'La coincidencia es incierta. Elige el resultado correcto o introduce el AppID manualmente.');
			if (detection?.launcher_detected && !detection.generic_launcher && !isUnrealShippingExecutable(detectionContext.exePath)) {
				skipLauncherLabel.style.display = 'flex';
			}
			if (detectionContext.bootstrapDetected && detectionContext.recommendedExePath) {
				const bootstrap = shortcutPathBasename(detectionContext.exePath);
				const gameExe = shortcutPathBasename(detectionContext.recommendedExePath);
				trackingExecutableCopy.innerHTML = `<strong style="font-weight:500;color:#dcdedf;">${escapeHtml(gdlText('use_tracking_executable', 'Usar el ejecutable real del juego'))}</strong><br />${escapeHtml(gdlText('tracking_executable_help', '{bootstrap} se cierra después de iniciar {game}. Usa {game} para que Steam registre tus horas de juego.', { bootstrap, game: gameExe }))}`;
				trackingExecutableLabel.style.display = 'flex';
			}
			autoSelect.addEventListener('change', () => {
				if (autoSelect.value) {
					input.value = autoSelect.value;
					const selected = viable.find(candidate => candidate.appid === autoSelect.value);
					if (selected) autoTitle.textContent = gdlText('detected_game', 'Detectado: {name}. Revisa el resultado y pulsa Guardar para vincularlo.', { name: selected.name });
				}
			});
		})().catch(e => {
			backendLog('Properties automatic detection error: ' + e);
			autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'Sin sugerencias automáticas (introduce el AppID abajo)'))}</option>`;
			statusEl.textContent = gdlText('no_match_found', 'No se encontró una coincidencia confiable. Puedes introducir el AppID manualmente.');
		});
	}

	if (saveBtn && input && statusEl) {
		saveBtn.addEventListener('click', async () => {
			let val = input.value.trim();
			if (!val) { statusEl.textContent = gdlText('enter_appid', 'Enter an AppID or store link.'); return; }
			if (managedShortcutId) mappingAliases.add(shortcutMappingKey(managedShortcutId));
			// Accept store/community links (e.g. https://store.steampowered.com/app/2947440/Name/)
			const urlMatch = val.match(/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i)
				|| val.match(/s\.team\/a\/(\d+)/i);
			if (urlMatch) {
				val = urlMatch[1];
				input.value = val;
			}
			if (!/^\d+$/.test(val)) { statusEl.textContent = gdlText('enter_numeric_appid', 'Enter a numeric AppID or a store page link.'); return; }

			saveBtn.disabled = true;
			saveBtn.style.opacity = '0.65';
			const result = await linkShortcutToSteam({
				doc,
				title: gameTitle,
				shortcutAppId: managedShortcutId,
				steamAppId: val,
				skipLauncher: !!skipLauncherInput?.checked,
				existingLaunchOptions: detectionContext?.launchOptions || '',
				trackingExecutable: trackingExecutableInput?.checked ? detectionContext?.recommendedExePath : '',
				trackingStartDir: trackingExecutableInput?.checked ? detectionContext?.recommendedStartDir : '',
				onStatus: (message, color = '#8f98a0') => {
					statusEl.textContent = message;
					statusEl.style.color = color;
				},
			});
			if (result.ok) {
				if (result.shortcutAppId) managedShortcutId = result.shortcutAppId;
				for (const alias of result.aliases || []) mappingAliases.add(alias);
				if (result.data?.name) titleKey = normalizeTitle(result.data.name);
			}
			saveBtn.disabled = false;
			saveBtn.style.opacity = '1';
		});
	}
}
