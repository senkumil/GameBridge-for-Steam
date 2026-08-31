import type { ShortcutDetectionCandidate, ShortcutDetectionContext, ShortcutDetectionResult } from '../../domain/types';
import { detectGameCandidatesBackend, getShortcutDetailsBackend, backendLog } from '../../api/backend';
import { getSteamLanguage } from '../../steam/localization';
import { RetryingRequestCache } from '../../core/request-cache';
import {
	cleanShortcutPath,
	getShortcutAppById,
	readShortcutOverviewField,
	shortcutPathBasename,
	shortcutPathDirectory,
} from '../../steam/shortcuts';

const detectionCache = new RetryingRequestCache<ShortcutDetectionResult>({
	ttlMs: 5 * 60 * 1000,
	retries: 1,
	baseDelayMs: 180,
	isCacheable: (value): value is ShortcutDetectionResult => Boolean(value && !value.error && value.transient_error !== true),
});

/**
 * Windows assigns display names such as "tlou-i.exe - Acceso directo" when a
 * desktop shortcut is added through Steam's program list.  That is not the
 * game's title and weakens otherwise reliable alias/executable matching.
 * Keep the original title for UI and mappings; use this only for detection.
 */
function detectionTitleHint(title: string): string {
	let hint = String(title || '').trim();
	hint = hint.replace(/\s*[-–—]\s*(?:acceso directo|shortcut|verknüpfung|raccourci|collegamento|atalho)\s*$/i, '');
	hint = hint.replace(/\.(?:lnk|url|exe|com|bat|cmd|appimage)\s*$/i, '');
	return hint.trim() || String(title || '').trim();
}

function readShortcutPathFromProperties(doc: Document): { exePath: string; startDir: string; launchOptions: string } {
	const values = Array.from(doc.querySelectorAll('input')).map(input => (input as HTMLInputElement).value?.trim() || '');
	let exePath = '';
	let startDir = '';
	let launchOptions = '';
	for (const value of values) {
		if (!value || /^\d+$/.test(value)) continue;
		const cleaned = cleanShortcutPath(value);
		if (!exePath && (/[\\/]/.test(cleaned) || /^[a-z]:/i.test(cleaned)) && /\.(?:exe|com|bat|cmd|lnk|url|appimage)$/i.test(cleaned)) {
			exePath = cleaned;
			continue;
		}
		if (!startDir && /^[a-z]:[\\/]/i.test(cleaned) && !/\.[a-z0-9]{2,6}$/i.test(cleaned)) {
			startDir = cleaned;
			continue;
		}
		if (!launchOptions && /^[-/%]/.test(value) && !/^[a-z]:[\\/]/i.test(cleaned)) launchOptions = value;
	}
	return { exePath, startDir, launchOptions };
}

export async function buildShortcutDetectionContext(
	doc: Document | null,
	title: string,
	shortcutAppId: number,
): Promise<ShortcutDetectionContext | null> {
	let validId = Number(shortcutAppId) || 0;
	if (validId < 0) validId = (validId >>> 0);
	if (validId < 2147483648) {
		let hash = 0;
		for (let i = 0; i < (title || '').length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
		validId = 2147483648 + (hash % 1000000000);
	}
	const app = getShortcutAppById(validId);
	const fromProperties = doc ? readShortcutPathFromProperties(doc) : { exePath: '', startDir: '', launchOptions: '' };
	let exePath = readShortcutOverviewField(app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath') || fromProperties.exePath;
	let startDir = readShortcutOverviewField(app, 'strShortcutStartDir', 'm_strShortcutStartDir', 'shortcut_start_dir') || fromProperties.startDir;
	let launchOptions = readShortcutOverviewField(app, 'strShortcutLaunchOptions', 'm_strShortcutLaunchOptions', 'shortcut_launch_options', 'strArguments') || fromProperties.launchOptions;
	let backendTitle = '';
	let bootstrapDetected = false;
	let recommendedExePath = '';
	let recommendedStartDir = '';

	if (!exePath || !startDir) {
		const appsApi = (window as any).SteamClient?.Apps;
		if (typeof appsApi?.GetCachedAppDetails === 'function') {
			for (const id of [shortcutAppId, shortcutAppId - 4294967296]) {
				try {
					const raw = await appsApi.GetCachedAppDetails(id);
					let details: any = raw;
					if (typeof raw === 'string') details = JSON.parse(raw);
					if (!details || typeof details !== 'object') continue;
					exePath ||= readShortcutOverviewField(details, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath');
					startDir ||= readShortcutOverviewField(details, 'strShortcutStartDir', 'm_strShortcutStartDir', 'shortcut_start_dir');
					launchOptions ||= readShortcutOverviewField(details, 'strShortcutLaunchOptions', 'm_strShortcutLaunchOptions', 'shortcut_launch_options', 'strLaunchOptions');
					if (exePath && startDir) break;
				} catch {}
			}
		}
	}

	{
		const neededPathFallback = !exePath || !startDir;
		try {
			const raw = await getShortcutDetailsBackend({ shortcut_app_id: String(shortcutAppId), title: title || '' });
			let details: any = raw;
			for (let attempt = 0; attempt < 2 && typeof details === 'string'; attempt++) details = JSON.parse(details);
			if (details && typeof details === 'object' && !details.error) {
				exePath ||= String(details.exe_path || '');
				startDir ||= String(details.start_dir || '');
				launchOptions ||= String(details.launch_options || '');
				backendTitle = String(details.title || '').trim();
				bootstrapDetected = !!details.bootstrap_detected;
				recommendedExePath = cleanShortcutPath(details.recommended_exe_path || '');
				recommendedStartDir = cleanShortcutPath(details.recommended_start_dir || '');
				if (neededPathFallback && exePath) backendLog(`Resolved shortcut executable from shortcuts.vdf for ${title || backendTitle || shortcutAppId}`);
			}
		} catch (error) {
			backendLog(`Could not read shortcut ${shortcutAppId} from shortcuts.vdf: ${error}`);
		}
	}

	exePath = cleanShortcutPath(exePath);
	if (/\.lnk$/i.test(exePath)) {
		try {
			const resolver = (window as any).SteamClient?.Apps?.GetShortcutDataForPath;
			if (typeof resolver === 'function') {
				const resolved = await resolver(exePath);
				exePath = cleanShortcutPath(resolved?.strExePath || exePath);
				launchOptions = String(resolved?.strArguments || resolved?.strCmdline || launchOptions || '').trim();
			}
		} catch (error) {
			backendLog(`Could not resolve shortcut file ${exePath}: ${error}`);
		}
	}
	if (!startDir && exePath) startDir = shortcutPathDirectory(exePath);
	const appTitle = readShortcutOverviewField(app, 'display_name', 'm_strDisplayName', 'strDisplayName', 'strAppName');
	return {
		shortcutAppId,
		title: String(title || appTitle || backendTitle || shortcutPathBasename(exePath)).trim(),
		exePath,
		startDir: cleanShortcutPath(startDir),
		launchOptions: String(launchOptions || '').trim(),
		bootstrapDetected,
		recommendedExePath,
		recommendedStartDir,
	};
}

export async function detectShortcutCandidates(context: ShortcutDetectionContext): Promise<ShortcutDetectionResult | null> {
	const language = await getSteamLanguage().catch((): string => 'english');
	const titleHint = detectionTitleHint(context.title);
	const matchingExePath = context.recommendedExePath || context.exePath;
	const matchingStartDir = context.recommendedStartDir || context.startDir;
	const cacheKey = [context.shortcutAppId, titleHint, context.exePath, context.startDir, matchingExePath, matchingStartDir, context.launchOptions, language].join('|');
	try {
		return await detectionCache.get(cacheKey, async (): Promise<ShortcutDetectionResult | null> => {
		try {
			const raw = await detectGameCandidatesBackend({
				request_json: JSON.stringify({
					title: titleHint,
					exe_path: context.exePath,
					start_dir: context.startDir,
					game_exe_path: matchingExePath,
					game_start_dir: matchingStartDir,
					launch_options: context.launchOptions,
					shortcut_app_id: String(context.shortcutAppId),
					language,
				}),
			});
			const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
			if (!parsed || typeof parsed !== 'object') return null;
			const candidates = Array.isArray((parsed as any).candidates)
				? (parsed as any).candidates
					.filter((candidate: any) => /^\d+$/.test(String(candidate?.appid || '')))
					.map((candidate: any): ShortcutDetectionCandidate => ({
						appid: String(candidate.appid),
						name: String(candidate.name || candidate.appid),
						image: String(candidate.image || ''),
						score: Math.max(0, Math.min(100, Number(candidate.score) || 0)),
						confidence: ['exact', 'high', 'medium', 'low'].includes(candidate.confidence) ? candidate.confidence : 'low',
						reasons: Array.isArray(candidate.reasons) ? candidate.reasons.map(String) : [],
						executable_match: !!candidate.executable_match,
						direct: !!candidate.direct,
					}))
				: [];
			const result: ShortcutDetectionResult = {
				candidates,
				launcher_detected: !!(parsed as any).launcher_detected,
				generic_launcher: !!(parsed as any).generic_launcher,
				executable: String((parsed as any).executable || ''),
				source: String((parsed as any).source || ''),
				error: (parsed as any).error ? String((parsed as any).error) : undefined,
				transient_error: (parsed as any).transient_error === true,
			};
			return result.transient_error && result.candidates.length === 0 ? null : result;
		} catch (error) {
			backendLog(`Automatic AppID detection failed for ${context.title}: ${error}`);
			return null;
		}
		});
	} catch (error) {
		backendLog(`Automatic AppID detection failed for ${context.title}: ${error}`);
		return null;
	}
}

export function clearShortcutDetectionCache(): void {
	detectionCache.clear();
}
