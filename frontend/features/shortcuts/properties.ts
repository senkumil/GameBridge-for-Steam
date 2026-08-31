import type { ShortcutDetectionCandidate, ShortcutDetectionContext } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { escapeHtml, templateToRegex } from '../../core/text';
import { gdlText, loc, setLocalizationDocumentProvider } from '../../steam/localization';
import { findActiveShortcutAppId, findShortcutAppIdByName, shortcutPathBasename } from '../../steam/shortcuts';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut } from './registry';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { subscribeMappings } from '../../core/mappings';
import { linkShortcutToSteam, shouldAutoApplyNoLauncher } from './linking';
import { unlinkShortcutFromSteam } from './unlinking';
import { undismissShortcut } from './dismissed';
import { rememberedShortcutSteamAppId } from './link-history';
import { bindShortcutAchievementSettings, shortcutAchievementSettingsHtml } from './achievement-properties';
import { tryInjectNativePropertiesField } from './native-properties';
import { tryInjectCustomizationArtwork } from './customization-artwork';
import { cancelPendingLinkJobs, enqueueLinkJob } from './link-job-queue';

const GDL_PROP = 'gdl-properties-injected';

const SHORTCUT_PROPERTIES_STYLE = `<style class="gdl-properties-layout-style">
	.gdl-properties-injected,
	.gdl-properties-injected * { box-sizing: border-box; }
	.gdl-properties-injected {
		--gdl-text: #dcdedf;
		--gdl-muted: #8f98a0;
		--gdl-faint: #6f7882;
		--gdl-blue: #1a9fff;
		--gdl-blue-text: #66c0f4;
		--gdl-control: #1e2837;
		--gdl-row: rgba(32, 38, 48, .78);
		--gdl-border: rgba(255, 255, 255, .08);
		color: var(--gdl-text);
	}
	.gdl-properties-injected .gdl-native-section {
		padding-top: 18px;
		border-top: 1px solid var(--gdl-border);
	}
	.gdl-properties-injected .gdl-native-section + .gdl-native-section {
		margin-top: 22px;
	}
	.gdl-properties-injected .gdl-native-section-heading {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.3;
		letter-spacing: .55px;
		text-transform: uppercase;
		color: #9aa8bb;
	}
	.gdl-properties-injected .gdl-native-section-description {
		max-width: 720px;
		margin: 7px 0 13px;
		font-size: 12px;
		line-height: 1.45;
		color: var(--gdl-muted);
	}
	.gdl-properties-injected .gdl-native-setting-row {
		display: grid;
		grid-template-columns: minmax(155px, .56fr) minmax(300px, 1fr);
		gap: 18px;
		align-items: center;
		min-height: 58px;
		padding: 11px 14px;
		background: var(--gdl-row);
		border: 1px solid rgba(255, 255, 255, .035);
		border-radius: 2px;
	}
	.gdl-properties-injected .gdl-native-setting-copy { min-width: 0; }
	.gdl-properties-injected .gdl-native-setting-title {
		font-size: 13px;
		font-weight: 400;
		line-height: 1.35;
		color: var(--gdl-text);
	}
	.gdl-properties-injected .gdl-native-setting-description {
		margin-top: 3px;
		font-size: 11px;
		line-height: 1.35;
		color: var(--gdl-muted);
	}
	.gdl-properties-injected .gdl-native-controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		min-width: 0;
	}
	.gdl-properties-injected .gdl-native-input,
	.gdl-properties-injected .gdl-native-select {
		min-width: 0;
		padding: 8px 11px;
		background: var(--gdl-control);
		border: 1px solid rgba(255, 255, 255, .12);
		border-radius: 2px;
		outline: none;
		color: var(--gdl-text);
		font: inherit;
		font-size: 13px;
	}
	.gdl-properties-injected .gdl-native-input { flex: 1 1 230px; }
	.gdl-properties-injected .gdl-native-select { width: 100%; }
	.gdl-properties-injected .gdl-native-input:focus,
	.gdl-properties-injected .gdl-native-select:focus { border-color: rgba(102, 192, 244, .72); }
	.gdl-properties-injected .gdl-native-button {
		min-height: 34px;
		padding: 7px 14px;
		border: 0;
		border-radius: 2px;
		background: #3d4450;
		color: var(--gdl-text);
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}
	.gdl-properties-injected .gdl-native-button:hover:not(:disabled) { filter: brightness(1.12); }
	.gdl-properties-injected .gdl-native-button:disabled { cursor: default; }
	.gdl-properties-injected .gdl-native-button-primary { background: var(--gdl-blue); color: #fff; }
	.gdl-properties-injected .gdl-native-status {
		min-height: 16px;
		margin-top: 8px;
		padding: 0 2px;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--gdl-muted);
	}
	.gdl-properties-injected .gdl-native-status:empty { display: none; }
	.gdl-properties-injected .gdl-native-disclosure {
		margin-top: 10px;
		background: rgba(14, 18, 24, .28);
		border: 1px solid var(--gdl-border);
		border-radius: 2px;
		overflow: hidden;
	}
	.gdl-properties-injected .gdl-auto-detect-header {
		display: flex;
		align-items: center;
		padding: 10px 13px 4px;
		color: var(--gdl-text);
		font-size: 12.5px;
		font-weight: 500;
	}
	.gdl-properties-injected .gdl-native-disclosure-body {
		padding: 4px 13px 13px;
	}
	.gdl-properties-injected .gdl-auto-detect-title {
		margin-bottom: 8px;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--gdl-muted);
	}
	.gdl-properties-injected .gdl-candidate-primary {
		display: flex;
		align-items: center;
		gap: 11px;
		min-width: 0;
		margin-top: 9px;
		padding: 9px 10px;
		background: rgba(0, 0, 0, .2);
		border: 1px solid rgba(255, 255, 255, .045);
		border-radius: 2px;
	}
	.gdl-properties-injected .gdl-candidate-primary img {
		width: 104px;
		height: 48px;
		flex: 0 0 104px;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, .1);
		border-radius: 2px;
	}
	.gdl-properties-injected .gdl-candidate-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 13px;
		font-weight: 500;
		color: var(--gdl-text);
	}
	.gdl-properties-injected .gdl-candidate-meta { margin-top: 3px; font-size: 11.5px; color: var(--gdl-blue-text); }
	.gdl-properties-injected .gdl-auto-candidate-strip {
		display: flex;
		gap: 6px;
		margin-top: 7px;
		padding: 1px 1px 4px;
		overflow-x: auto;
	}
	.gdl-properties-injected .gdl-native-option {
		display: none;
		align-items: flex-start;
		gap: 9px;
		margin-top: 8px;
		padding: 10px 12px;
		background: rgba(32, 38, 48, .62);
		border: 1px solid rgba(255, 255, 255, .045);
		color: #acb2b8;
		font-size: 11px;
		line-height: 1.4;
		cursor: pointer;
	}
	.gdl-properties-injected .gdl-native-option input { margin-top: 2px; }
	.gdl-properties-injected .gdl-native-option strong { font-weight: 500; color: var(--gdl-text); }
	.gdl-properties-injected .gdl-game-achievement-options { display: grid; gap: 8px; }
	.gdl-properties-injected .gdl-achievement-setting-row { align-items: start; }
	.gdl-properties-injected .gdl-game-achievement-online-row > .gdl-native-setting-copy { flex: .56 1 155px; }
	.gdl-properties-injected .gdl-game-achievement-online-row > .gdl-achievement-control { flex: 1 1 300px; }
	.gdl-properties-injected .gdl-achievement-control {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px 12px;
		align-items: center;
		min-width: 0;
	}
	.gdl-properties-injected .gdl-achievement-count {
		grid-column: 2;
		font-size: 12px;
		font-weight: 600;
		color: var(--gdl-blue-text);
		white-space: nowrap;
	}
	.gdl-properties-injected .gdl-game-achievement-slider {
		grid-column: 1 / -1;
		-webkit-appearance: none;
		appearance: none;
		accent-color: transparent !important;
		width: 100%;
		height: 6px;
		margin: 6px 0 3px;
		background-color: var(--gdl-control);
		background-repeat: no-repeat !important;
		border: 1px solid rgba(255, 255, 255, .08);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}
	.gdl-properties-injected .gdl-game-achievement-slider::-webkit-slider-runnable-track {
		-webkit-appearance: none;
		height: 6px;
		background: transparent !important;
		border-radius: 3px;
	}
	.gdl-properties-injected .gdl-game-achievement-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		box-sizing: border-box;
		width: 16px;
		height: 16px;
		margin-top: -5px;
		background: var(--gdl-blue);
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 1px 4px rgba(0, 0, 0, .6);
		cursor: pointer;
		transition: transform .08s ease, background .12s ease;
	}
	.gdl-properties-injected .gdl-game-achievement-slider::-webkit-slider-thumb:hover { background: #47b2ff; transform: scale(1.12); }
	.gdl-properties-injected .gdl-game-achievement-slider::-webkit-slider-thumb:active { background: #0d82d4; transform: scale(1.2); }
	.gdl-properties-injected .gdl-achievement-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.gdl-properties-injected .gdl-achievement-actions .gdl-native-status { flex: 1 1 180px; margin: 0; padding: 0; }
	.gdl-properties-injected .gdl-game-achievement-picker-btn { display: inline-flex; align-items: center; gap: 6px; }
	.gdl-properties-injected .gdl-achievement-path-controls { display: flex; align-items: center; gap: 8px; }
	.gdl-properties-injected .gdl-achievement-hint { margin-top: 7px; font-size: 11px; line-height: 1.4; color: var(--gdl-muted); }
	@media (max-width: 720px) {
		.gdl-properties-injected .gdl-native-setting-row { grid-template-columns: 1fr; gap: 9px; }
		.gdl-properties-injected .gdl-game-achievement-online-row { flex-direction: column; }
		.gdl-properties-injected .gdl-native-controls { justify-content: stretch; flex-wrap: wrap; }
		.gdl-properties-injected .gdl-native-input { flex-basis: 100%; }
		.gdl-properties-injected .gdl-achievement-path-controls { flex-wrap: wrap; }
		.gdl-properties-injected .gdl-achievement-path-controls .gdl-native-input { flex-basis: 100%; }
	}
</style>`;

export function tryInjectPropertiesField(doc: Document, popupTitle: string): void {
	if (!doc || !doc.body) return;
	setLocalizationDocumentProvider(() => doc);
	if (doc.querySelector(`.${GDL_PROP}`) || doc.querySelector('.gdl-native-properties-injected')) return;

	const vrPhrases = [
		loc('AppProperties_Shortcut_InVR', 'Include in VR Library').toLowerCase(),
		'include in vr library', 'incluir en la biblioteca de rv', 'incluir en la biblioteca vr',
		'in vr-bibliothek aufnehmen', 'inclure dans la bibliothèque vr', 'includi nella libreria vr',
		'включить в библиотеку vr', 'включить в библиотеку', '加入 vr 库', 'vr 라이브러리에 포함',
	];
	const targetPhrases = [
		loc('AppProperties_Shortcut_TargetExecutable', 'Target').toLowerCase(),
		loc('AppProperties_Shortcut_StartDir', 'Start In').toLowerCase(),
		'target', 'destino', 'cible', 'ziel', 'destinazione', 'объект',
		'start in', 'iniciar en', 'iniciar em', 'démarrer dans', 'ausführen in', 'inizia in', 'начать в', 'рабочая папка', 'iniciar em',
	];
	const generalPhrases = [
		loc('AppProperties_LaunchOptions', 'Launch Options').toLowerCase(),
		loc('AppProperties_LaunchOptions_Description', 'Advanced users may choose to enter modifications to their launch options.').toLowerCase(),
		loc('AppProperties_EnableOverlay', 'Enable the Steam Overlay while in-game').toLowerCase(),
		'launch options', 'configuraciones de lanzamiento', 'parámetros de lanzamiento', 'opciones de lanzamiento',
		'startoptionen', 'options de lancement', 'opzioni di avvio', 'параметры запуска',
		'steam cloud', 'habilitar la interfaz superpuesta', 'ativar a sobreposição steam', 'activer la superposition steam', 'enable the steam overlay',
	];

	const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT, null);
	let tn: Text | null;
	let anchor: Element | null = null;
	let foundShortcutOnlyField = false;
	let foundGeneralField = false;
	while ((tn = walker.nextNode() as Text | null)) {
		const txt = (tn.textContent || '').trim().toLowerCase();
		if (!txt) continue;
		if (vrPhrases.some(p => txt === p || (p.length > 5 && txt.includes(p)))) {
			foundShortcutOnlyField = true;
			if (tn.parentElement) { anchor = tn.parentElement; break; }
		} else if (targetPhrases.some(p => txt === p)) {
			foundShortcutOnlyField = true;
			if (tn.parentElement && !anchor) anchor = tn.parentElement;
		} else if (generalPhrases.some(p => txt === p || (p.length > 6 && txt.includes(p)))) {
			foundGeneralField = true;
			if (tn.parentElement && !anchor) anchor = tn.parentElement;
		}
	}

	if ((!foundShortcutOnlyField && !foundGeneralField) || !anchor) return;

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
		return t.replace(/^(?:properties|propiedades|propriedades|propriétés|eigenschaften|proprietà|свойства|属性|プロパティ|속성|właściwości|özellikler)\s*[-–—:]\s*/i, '').trim() || t;
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
			loc('AppProperties_General', 'General').toLowerCase(),
			loc('AppProperties_Compatibility', 'Compatibility').toLowerCase(),
			loc('AppProperties_Updates', 'Updates').toLowerCase(),
			loc('AppProperties_InstalledFiles', 'Installed Files').toLowerCase(),
			loc('AppProperties_Language', 'Language').toLowerCase(),
			loc('AppProperties_Betas', 'Betas').toLowerCase(),
			loc('AppProperties_Controller', 'Controller').toLowerCase(),
			loc('AppProperties_DLC', 'DLC').toLowerCase(),
			loc('AppProperties_Workshop', 'Workshop').toLowerCase(),
			loc('AppProperties_Shortcuts', 'Shortcut').toLowerCase(),
			loc('AppProperties_GameRecording', 'Game Recording').toLowerCase(),
			loc('AppProperties_Customization', 'Customization').toLowerCase(),
		];
		const ignoredLabels = new Set([
			'properties', 'propiedades', 'propriedades', 'propriétés', 'eigenschaften', 'proprietà', 'свойства', '属性', 'プロパティ', '속성',
			'target', 'start in', 'search', 'browse', 'destino', 'iniciar en', 'iniciar em', 'buscar', 'explorar', 'цель', 'поиск', 'обзор',
		]);
		const textWalker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
		let tNode: Text | null;
		while ((tNode = textWalker.nextNode() as Text | null)) {
			const t = tNode.textContent?.trim();
			if (t && t.length > 1 && !tabNames.includes(t.toLowerCase()) && !ignoredLabels.has(t.toLowerCase())) {
				const parent = tNode.parentElement;
				if (parent && (parent.closest('[class*="Title"], [class*="Header"]') || parent.tagName === 'H1' || parent.tagName === 'H2' || parent.tagName === 'B')) {
					const cleaned = t.replace(/^(?:properties|propiedades|propriedades|propriétés|eigenschaften|proprietà|свойства|属性|プロパティ|속성|właściwości|özellikler)\s*[-–—:]\s*/i, '').trim();
					if (cleaned) { gameTitle = cleaned; break; }
				}
			}
		}
	}

	if (!gameTitle) {
		const notice = shortcutRuntimeHost().findNonSteamNotice(doc);
		if (notice?.title) gameTitle = notice.title;
	}

	if (!gameTitle) return;

	if (!foundShortcutOnlyField) {
		tryInjectNativePropertiesField(doc, gameTitle, container);
		// Artwork belongs to Steam's Personalización tab, never to the native
		// General/Direct access sections injected above.
		tryInjectCustomizationArtwork(doc, popupTitle, gameTitle);
		return;
	}
	// The shortcut controls are mounted in Acceso directo. The artwork picker
	// is deliberately mounted separately by the Personalización observer.
	tryInjectCustomizationArtwork(doc, popupTitle, gameTitle);

	const initialShortcutId = findActiveShortcutAppId(doc, gameTitle) || (findShortcutAppIdByName(gameTitle) ? String(findShortcutAppIdByName(gameTitle)) : null);
	let managedShortcutId = initialShortcutId ? Number(initialShortcutId) : null;
	const currentRaw = findMappingForShortcut(initialShortcutId, gameTitle) || '';
	let currentLinked = /^\d+$/.test(currentRaw) ? currentRaw : '';
	const rememberedAppId = rememberedShortcutSteamAppId(managedShortcutId);
	const initialAppId = currentLinked || rememberedAppId;

	// Build UI section
	const section = doc.createElement('div');
	section.className = GDL_PROP;
	section.style.cssText = 'padding:0 24px 24px;margin-top:16px;font-family:inherit;';

	section.innerHTML = `
		${SHORTCUT_PROPERTIES_STYLE}
		<div class="gdl-native-section gdl-link-section">
			<div class="gdl-native-section-heading">${escapeHtml(gdlText('linked_title', 'Linked game'))}</div>
			<div class="gdl-native-section-description">${escapeHtml(gdlText('linked_description', 'Paste a Steam AppID or Steam store link to show game information on this library page.'))}</div>
			<div class="gdl-native-setting-row">
				<div class="gdl-native-setting-copy">
					<div class="gdl-native-setting-title">Steam AppID</div>
					<div class="gdl-native-setting-description">${escapeHtml(gdlText('appid_placeholder', 'Steam AppID or Steam store link'))}</div>
				</div>
				<div class="gdl-native-controls">
					<input class="gdl-appid-input gdl-native-input" type="text" placeholder="${escapeHtml(gdlText('appid_placeholder', 'Steam AppID or Steam store link'))}" value="${escapeHtml(initialAppId)}" />
					<button class="gdl-save-btn gdl-native-button gdl-native-button-primary" type="button">${escapeHtml(gdlText('link_button', 'Link'))}</button>
					<button class="gdl-unlink-btn gdl-native-button" type="button" ${currentLinked ? '' : 'disabled'} style="color:${currentLinked ? '#dcdedf' : '#68737f'};cursor:${currentLinked ? 'pointer' : 'default'};opacity:${currentLinked ? '1' : '.65'};">${escapeHtml(currentLinked ? gdlText('unlink', 'Unlink') : gdlText('game_unlinked_status', 'Unlinked'))}</button>
				</div>
			</div>
			<div class="gdl-status gdl-native-status" aria-live="polite"></div>
			<div class="gdl-auto-detect gdl-native-disclosure">
				<div class="gdl-auto-detect-header">
					<span>${escapeHtml(gdlText('shortcut_suggestions_title', 'Steam AppID suggestions:'))}</span>
				</div>
				<div class="gdl-native-disclosure-body">
					<div class="gdl-auto-detect-title" style="display:none;"></div>
					<select class="gdl-auto-candidates gdl-native-select">
						<option value="">${escapeHtml(gdlText('detecting_game', 'Detecting the game automatically...'))}</option>
					</select>
					<div class="gdl-auto-candidate-preview" style="display:none;"></div>
				</div>
			</div>
			<label class="gdl-skip-launcher gdl-native-option">
				<input class="gdl-skip-launcher-input" type="checkbox" />
				<span><strong>${escapeHtml(gdlText('skip_launcher', 'Try to skip the launcher'))}</strong><br />${escapeHtml(gdlText('skip_launcher_help', 'Adds -nolauncher while preserving your current launch options. Enable it only if this game supports that argument.'))}</span>
			</label>
			<label class="gdl-tracking-executable gdl-native-option">
				<input class="gdl-tracking-executable-input" type="checkbox" />
				<span class="gdl-tracking-executable-copy"></span>
			</label>
		</div>
		${shortcutAchievementSettingsHtml()}
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
	// A properties window stays open while several asynchronous operations finish.
	// Keep a revision for the requested target so a late status from a previous
	// AppID can never describe the AppID the user has just entered.
	let targetRevision = 0;
	const clearTargetStatus = (): void => {
		targetRevision += 1;
		statusEl.textContent = '';
		statusEl.style.color = '#8f98a0';
	};

	const updateButtonStates = (): void => {
		const val = input.value.trim();
		const isSameAppIdLinked = Boolean(currentLinked && val === currentLinked);
		if (isSameAppIdLinked) {
			saveBtn.disabled = true;
			saveBtn.textContent = gdlText('game_linked_status', 'Linked');
			saveBtn.style.background = '#3d4450';
			saveBtn.style.color = '#8f98a0';
			saveBtn.style.cursor = 'default';
			saveBtn.style.opacity = '.65';

			unlinkBtn.disabled = false;
			unlinkBtn.textContent = gdlText('unlink', 'Unlink');
			unlinkBtn.style.background = '#3d4450';
			unlinkBtn.style.color = '#dcdedf';
			unlinkBtn.style.cursor = 'pointer';
			unlinkBtn.style.opacity = '1';
		} else {
			saveBtn.disabled = false;
			saveBtn.textContent = gdlText('link_button', 'Link');
			saveBtn.style.background = '#1a9fff';
			saveBtn.style.color = '#fff';
			saveBtn.style.cursor = 'pointer';
			saveBtn.style.opacity = '1';

			if (currentLinked) {
				unlinkBtn.disabled = false;
				unlinkBtn.textContent = gdlText('unlink', 'Unlink');
				unlinkBtn.style.background = '#3d4450';
				unlinkBtn.style.color = '#dcdedf';
				unlinkBtn.style.cursor = 'pointer';
				unlinkBtn.style.opacity = '1';
			} else {
				unlinkBtn.disabled = true;
				unlinkBtn.textContent = gdlText('game_unlinked_status', 'Unlinked');
				unlinkBtn.style.background = '#3d4450';
				unlinkBtn.style.color = '#68737f';
				unlinkBtn.style.cursor = 'default';
				unlinkBtn.style.opacity = '.65';
			}
		}
	};

	updateButtonStates();
	input.addEventListener('input', () => {
		clearTargetStatus();
		updateButtonStates();
	});
	const unsubscribeMappings = subscribeMappings(() => {
		if (!section.isConnected) {
			unsubscribeMappings();
			return;
		}
		const shortcutId = managedShortcutId || Number(findActiveShortcutAppId(doc, gameTitle) || 0) || findShortcutAppIdByName(gameTitle);
		const mapped = findMappingForShortcut(shortcutId, gameTitle);
		currentLinked = (mapped && /^\d+$/.test(mapped)) ? mapped : '';
		updateButtonStates();
	});

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
			<div class="gdl-candidate-primary">
				<img class="gdl-auto-candidate-primary-image" alt="" />
				<div style="min-width:0;"><div class="gdl-candidate-name">${escapeHtml(selected.name)}</div><div class="gdl-candidate-meta">Steam AppID ${escapeHtml(selected.appid)}${selected.score ? ` · ${Math.round(selected.score)}%` : ''}</div></div>
			</div>
			<div class="gdl-auto-candidate-strip"></div>`;
		const bindImageFallback = (img: HTMLImageElement, appId: string) => {
			let attempt = 0;
			img.addEventListener('error', () => {
				attempt += 1;
				if (attempt === 1) img.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
				else if (attempt === 2) img.src = `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
				else img.style.visibility = 'hidden';
			});
		};
		const primary = candidatePreview.querySelector<HTMLImageElement>('.gdl-auto-candidate-primary-image');
		if (primary) {
			bindImageFallback(primary, selected.appid);
			primary.src = selected.image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${selected.appid}/header.jpg`;
		}
		const strip = candidatePreview.querySelector<HTMLElement>('.gdl-auto-candidate-strip');
		for (const candidate of candidates.slice(0, 6)) {
			const button = doc.createElement('button');
			button.type = 'button';
			button.title = `${candidate.name} — AppID ${candidate.appid}`;
			button.setAttribute('aria-label', button.title);
			button.style.cssText = `position:relative;width:84px;height:39px;flex:0 0 84px;padding:0;overflow:hidden;border-radius:2px;background:#10141a;border:${candidate.appid === selected.appid ? '2px solid #66c0f4' : '1px solid rgba(255,255,255,.14)'};cursor:pointer;`;
			const image = doc.createElement('img');
			image.className = '';
			image.alt = '';
			image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
			bindImageFallback(image, candidate.appid);
			image.src = candidate.image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${candidate.appid}/header.jpg`;
			button.appendChild(image);
			button.addEventListener('click', () => {
				autoSelect.value = candidate.appid;
				input.value = candidate.appid;
				clearTargetStatus();
				autoTitle.textContent = gdlText('detected_game', 'Detected: {name}. Review the result and press Link to link it.', { name: candidate.name });
				renderCandidatePreview(candidates, candidate.appid);
				updateButtonStates();
			});
			strip?.appendChild(button);
		}
	};

	bindShortcutAchievementSettings({
		section,
		shortcutAppId: () => managedShortcutId ? String(managedShortcutId) : '',
		steamAppId: () => /^\d+$/.test(input.value.trim()) ? input.value.trim() : currentLinked,
		gameTitle: () => gameTitle || '',
	});
	if (managedShortcutId && input && autoSelect && autoTitle) {
		autoTitle.style.display = 'none';
		autoTitle.textContent = '';
		if (candidatePreview) { candidatePreview.style.display = 'none'; candidatePreview.replaceChildren(); }
		void (async () => {
			detectionContext = await buildShortcutDetectionContext(doc, gameTitle, managedShortcutId!);
			if (!detectionContext) {
				if (candidatePreview) { candidatePreview.style.display = 'none'; candidatePreview.replaceChildren(); }
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
				autoTitle.style.display = 'block';
				autoTitle.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
				return;
			}
			const detection = await detectShortcutCandidates(detectionContext);
			const viable = detection?.candidates || [];
			if (!viable.length) {
				if (candidatePreview) { candidatePreview.style.display = 'none'; candidatePreview.replaceChildren(); }
				autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
				autoTitle.style.display = 'block';
				autoTitle.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
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
			autoTitle.style.display = 'none';
			autoTitle.textContent = '';
			if (!currentLinked && viable.length > 0 && !rememberedAppId) {
				input.value = viable[0].appid;
				autoSelect.value = viable[0].appid;
			} else if (currentLinked || rememberedAppId) {
				const preferredAppId = currentLinked || rememberedAppId;
				input.value = preferredAppId;
				autoSelect.value = preferredAppId;
			}
			renderCandidatePreview(viable, autoSelect.value || viable[0].appid);
			updateButtonStates();
			const selectedAppId = autoSelect.value || viable[0]?.appid || '';
			if (shouldAutoApplyNoLauncher(selectedAppId)) {
				skipLauncherLabel.style.display = 'flex';
				skipLauncherInput.checked = true;
			} else {
				skipLauncherLabel.style.display = 'none';
				skipLauncherInput.checked = false;
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
					clearTargetStatus();
					const selected = viable.find(candidate => candidate.appid === autoSelect.value);
					if (selected) {
						renderCandidatePreview(viable, selected.appid);
						if (shouldAutoApplyNoLauncher(selected.appid)) {
							skipLauncherLabel.style.display = 'flex';
							skipLauncherInput.checked = true;
						} else {
							skipLauncherLabel.style.display = 'none';
							skipLauncherInput.checked = false;
						}
					}
					updateButtonStates();
				}
			});
		})().catch(e => {
			backendLog('Properties automatic detection error: ' + e);
			if (candidatePreview) { candidatePreview.style.display = 'none'; candidatePreview.replaceChildren(); }
			autoSelect.innerHTML = `<option value="">${escapeHtml(gdlText('no_suggestions_found', 'No automatic suggestions (enter the AppID below)'))}</option>`;
			autoTitle.style.display = 'block';
			autoTitle.textContent = gdlText('no_match_found', 'No reliable match was found. You can enter the AppID manually.');
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
			try {
				const result = await unlinkShortcutFromSteam({
					doc,
					shortcutAppId: shortcutId,
					title: gameTitle,
					steamAppId: currentLinked || undefined,
					exePath: detectionContext?.exePath || '',
				});
				if (result.ok) {
					if (result.shortcutAppId) managedShortcutId = result.shortcutAppId;
					// Keep the AppID in the field after unlinking so the shortcut can be
					// linked again without requiring the user to type it a second time.
					currentLinked = '';
					statusEl.textContent = gdlText('unlink_success', 'Link removed. You can link this same shortcut again without deleting it from Steam.');
					statusEl.style.color = '#5ba32b';
				} else {
					statusEl.textContent = gdlText('unlink_failed', 'The link could not be removed.');
					statusEl.style.color = '#ff6b6b';
				}
			} catch (error) {
				backendLog('Direct properties unlink error: ' + String(error));
				statusEl.textContent = gdlText('unlink_failed', 'The link could not be removed.');
				statusEl.style.color = '#ff6b6b';
			} finally {
				updateButtonStates();
			}
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

			const shortcutId = managedShortcutId || Number(findActiveShortcutAppId(doc, gameTitle) || 0) || findShortcutAppIdByName(gameTitle);
			if (shortcutId) {
				cancelPendingLinkJobs(shortcutId, gameTitle);
				undismissShortcut(shortcutId);
			}
			const requestRevision = ++targetRevision;

			saveBtn.disabled = true;
			saveBtn.textContent = gdlText('linking_progress_button', 'Linking...');
			saveBtn.style.opacity = '.75';
			unlinkBtn.disabled = true;
			// The shortcut title can still be the title from its former mapping.
			// Until Steam verifies the target, show the requested AppID instead.
			statusEl.textContent = gdlText('bulk_link_progress', 'Linking {done}/{total}: {game}', { done: '1', total: '1', game: `AppID ${val}` });
			statusEl.style.color = '#66c0f4';
			input.disabled = true;
			autoSelect.disabled = true;

			try {
				const result = await linkShortcutToSteam({
					doc,
					title: gameTitle,
					shortcutAppId: shortcutId,
					steamAppId: val,
					skipLauncher: !!skipLauncherInput?.checked,
					existingLaunchOptions: detectionContext?.launchOptions || '',
					trackingExecutable: trackingExecutableInput?.checked ? detectionContext?.recommendedExePath || '' : '',
					trackingStartDir: trackingExecutableInput?.checked ? detectionContext?.recommendedStartDir || '' : '',
					shortcutExecutable: detectionContext?.exePath || '',
					onStatus: (message, color) => {
						if (requestRevision !== targetRevision || !section.isConnected) return;
						statusEl.textContent = message;
						statusEl.style.color = color;
					},
				});
				if (requestRevision !== targetRevision || !section.isConnected) return;
				if (result.ok) {
					if (result.shortcutAppId) managedShortcutId = result.shortcutAppId;
					currentLinked = val;
					const resourcesComplete = Boolean(result.setup?.artworkComplete && result.setup?.iconApplied);
					if (!resourcesComplete) {
						enqueueLinkJob({
							title: gameTitle, shortcutAppId: result.shortcutAppId || shortcutId || null, steamAppId: val,
							skipLauncher: !!skipLauncherInput?.checked, existingLaunchOptions: detectionContext?.launchOptions || '',
							trackingExecutable: trackingExecutableInput?.checked ? detectionContext?.recommendedExePath || '' : '',
							trackingStartDir: trackingExecutableInput?.checked ? detectionContext?.recommendedStartDir || '' : '',
							shortcutExecutable: detectionContext?.exePath || '', repairResources: true,
						});
						statusEl.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
						statusEl.style.color = '#e5ad37';
					} else {
						statusEl.textContent = gdlText('manual_link_success', 'Shortcut linked to Steam successfully.');
						statusEl.style.color = '#5ba32b';
					}
				} else {
					const retryable = !['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(result.error || ''));
					if (retryable) {
						enqueueLinkJob({
							title: gameTitle,
							shortcutAppId: result.shortcutAppId || shortcutId || null,
							steamAppId: val,
							skipLauncher: !!skipLauncherInput?.checked,
							existingLaunchOptions: detectionContext?.launchOptions || '',
							trackingExecutable: trackingExecutableInput?.checked ? detectionContext?.recommendedExePath || '' : '',
							trackingStartDir: trackingExecutableInput?.checked ? detectionContext?.recommendedStartDir || '' : '',
							shortcutExecutable: detectionContext?.exePath || '',
						});
						statusEl.textContent = gdlText('link_queued_background', 'Link queued. You can close this window; setup continues in the background.');
						statusEl.style.color = '#e5ad37';
					} else {
						statusEl.textContent = gdlText('save_failed', 'Could not complete the link.');
						statusEl.style.color = '#d94126';
					}
				}
			} catch (error) {
				if (requestRevision !== targetRevision || !section.isConnected) return;
				backendLog('Direct properties link error: ' + String(error));
				statusEl.textContent = gdlText('save_failed', 'Could not complete the link.');
				statusEl.style.color = '#d94126';
			} finally {
				if (requestRevision === targetRevision && section.isConnected) {
					input.disabled = false;
					autoSelect.disabled = false;
					updateButtonStates();
				}
			}
		});
	}
}
