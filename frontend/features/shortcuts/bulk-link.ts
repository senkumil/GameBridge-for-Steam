import type { ShortcutDetectionCandidate, ShortcutDetectionContext } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { normalizeTitle } from '../../core/text';
import { shortcutRuntimeHost } from './host';
import { buildShortcutDetectionContext, detectShortcutCandidates } from './detection';
import { cancelPendingLinkJobs, enqueueLinkJob, pausePendingLinkJobs, resumePendingLinkJobs } from './link-job-queue';
import { linkShortcutToSteam, warmShortcutLinkResources } from './linking';
import { undismissShortcut } from './dismissed';
import { rememberedShortcutSteamAppId } from './link-history';
import { findMappingForDuplicateShortcut, getAllShortcutRecords, shortcutAlreadyLinked } from './registry';
import { pauseLinkedGamePrefetch, resumeLinkedGamePrefetch } from '../library/prefetch';

const BULK_ANALYSIS_CONCURRENCY = 6;
export type BulkLinkOutcomeStatus = 'linked' | 'queued' | 'skipped' | 'failed';
export interface BulkLinkGameOutcome { title: string; shortcutAppId: number; steamAppId?: string; status: BulkLinkOutcomeStatus; reason?: string; resourceRepairQueued?: boolean; }
export interface BulkLinkAllResult { total: number; matched: number; linked: number; queued: number; skipped: number; failed: number; outcomes: BulkLinkGameOutcome[]; }
export type BulkLinkProgressPhase = 'analyzing' | 'linking';

function reliableBulkCandidate(context: ShortcutDetectionContext, candidates: ShortcutDetectionCandidate[], rememberedAppId = ''): ShortcutDetectionCandidate | null {
	const top = candidates[0];
	if (!top || (top.reasons || []).includes('non_game_result')) return null;
	const remembered = rememberedAppId && candidates.find(candidate => candidate.appid === rememberedAppId
		&& !(candidate.reasons || []).includes('non_game_result') && candidate.score >= 50);
	if (remembered) return remembered;
	const second = candidates[1];
	const margin = top.score - (second?.score ?? 0);
	const exactTitle = normalizeTitle(context.title) !== '' && normalizeTitle(context.title) === normalizeTitle(top.name);
	const secondExactTitle = Boolean(second && normalizeTitle(context.title) !== '' && normalizeTitle(context.title) === normalizeTitle(second.name));
	const reasons = new Set((top.reasons || []).map(String));
	if (top.direct && top.score >= 80) return top;
	if (top.confidence === 'exact' && top.score >= 82) return top;
	if (exactTitle && !secondExactTitle && top.score >= 70) return top;
	if (reasons.has('folder_exact') && top.score >= 80 && margin >= 5) return top;
	if (top.executable_match && top.score >= 76 && (exactTitle || margin >= 8)) return top;
	if (reasons.has('franchise_alias') && top.score >= 82 && margin >= 12) return top;
	if (top.confidence === 'high' && top.score >= 88 && margin >= 8) return top;
	return top.score >= 93 && margin >= 12 && !reasons.has('alias_requires_confirmation') ? top : null;
}

function enqueueBulkRetry(item: { record: { id: number; title: string }; context: ShortcutDetectionContext; candidate: ShortcutDetectionCandidate }, repairResources: boolean, shortcutAppId = item.record.id): void {
	enqueueLinkJob({
		title: item.context.title, shortcutAppId, steamAppId: item.candidate.appid,
		skipLauncher: false, existingLaunchOptions: item.context.launchOptions || '',
		trackingExecutable: item.context.trackingExecutableAutoApply && item.context.recommendedExePath ? item.context.recommendedExePath : '',
		trackingStartDir: item.context.trackingExecutableAutoApply && item.context.recommendedStartDir ? item.context.recommendedStartDir : '',
		shortcutExecutable: item.context.exePath || '', repairResources,
	});
}

/** Analyze independently, then serialize the Steam bridge mutations. */
export async function linkAllShortcutsExperimental(
	onProgress?: (done: number, total: number, title: string, phase: BulkLinkProgressPhase) => void,
	signal?: AbortSignal,
): Promise<BulkLinkAllResult> {
	pauseLinkedGamePrefetch();
	await pausePendingLinkJobs();
	try {
	const records = getAllShortcutRecords().filter(record => !shortcutAlreadyLinked(record.id));
	const result: BulkLinkAllResult = { total: records.length, matched: 0, linked: 0, queued: 0, skipped: 0, failed: 0, outcomes: [] };
	if (!records.length || signal?.aborted) return result;
	type Item = { record: { id: number; title: string }; context: ShortcutDetectionContext; candidate: ShortcutDetectionCandidate; index: number };
	let analyzed = 0, completed = 0, nextRecord = 0;
	const matchedItems: Item[] = [];
	const linkItem = async (item: Item): Promise<void> => {
		if (signal?.aborted) { cancelPendingLinkJobs(item.record.id, item.context.title); return; }
		onProgress?.(completed, result.matched, item.record.title, 'linking');
		cancelPendingLinkJobs(item.record.id, item.context.title);
		undismissShortcut(item.record.id);
		try {
			// Do not race this promise with a timer: an unfinished Steam mutation must
			// settle before a different shortcut starts changing identity/artwork.
			const linked = await linkShortcutToSteam({
				doc: null, title: item.context.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid,
				shortcutExecutable: item.context.exePath,
				trackingExecutable: item.context.trackingExecutableAutoApply && item.context.recommendedExePath ? item.context.recommendedExePath : '',
				trackingStartDir: item.context.trackingExecutableAutoApply && item.context.recommendedStartDir ? item.context.recommendedStartDir : '',
				refreshLibrary: false, assetTimeoutMs: 30_000,
				deferAssetSync: true, metadataTimeoutMs: 1_200, canonicalNameHint: item.candidate.name,
				onStatus: message => backendLog(`Bulk link ${item.record.title}: ${message}`),
			});
			const resourcesComplete = Boolean(linked.setup?.artworkComplete && linked.setup?.iconApplied);
			const resolvedShortcutId = Number(linked.shortcutAppId || item.record.id);
			if (linked.ok) {
				result.linked += 1; cancelPendingLinkJobs(item.record.id, item.context.title);
				if (!resourcesComplete) enqueueBulkRetry(item, true, resolvedShortcutId);
				result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'linked', resourceRepairQueued: !resourcesComplete });
			} else if (!['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(linked.error || ''))) {
				enqueueBulkRetry(item, false, resolvedShortcutId); result.queued += 1;
				result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'queued', reason: String(linked.error || 'setup_incomplete') });
			} else {
				result.failed += 1; cancelPendingLinkJobs(item.record.id, item.context.title);
				result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'failed', reason: String(linked.error || 'link_failed') });
			}
		} catch (error) {
			backendLog(`Bulk link failed for ${item.record.title}: ${error}`);
			enqueueBulkRetry(item, false); result.queued += 1;
			result.outcomes.push({ title: item.record.title, shortcutAppId: item.record.id, steamAppId: item.candidate.appid, status: 'queued', reason: 'link_failed' });
		} finally {
			completed += 1;
			if (!signal?.aborted) onProgress?.(completed, result.matched, item.record.title, 'linking');
		}
	};
	const analyzeRecord = async (record: { id: number; title: string }, index: number): Promise<void> => {
		let context: ShortcutDetectionContext | null = null, candidate: ShortcutDetectionCandidate | null = null, reason = 'ambiguous_or_low_confidence';
		try {
			context = await buildShortcutDetectionContext(null, record.title, record.id);
			if (!context) reason = 'context_unavailable';
			else {
				const duplicateAppId = findMappingForDuplicateShortcut(record.id);
				if (duplicateAppId) {
					candidate = { appid: duplicateAppId, name: context.title, image: '', score: 100, confidence: 'exact', reasons: ['duplicate_launch_identity'], executable_match: true, direct: true };
				} else {
					for (let attempt = 0; attempt < 3 && !signal?.aborted; attempt += 1) {
						const detected = await detectShortcutCandidates(context);
						candidate = reliableBulkCandidate(context, detected?.candidates || [], rememberedShortcutSteamAppId(record.id));
						if (candidate || (detected && detected.transient_error !== true)) break;
						if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)));
					}
				}
			}
		} catch (error) { reason = 'detection_failed'; backendLog(`Bulk detection failed for ${record.title}: ${error}`); }
		finally { analyzed += 1; if (!signal?.aborted) onProgress?.(analyzed, records.length, record.title, 'analyzing'); }
		if (signal?.aborted) return;
		if (context && candidate) {
			result.matched += 1;
			matchedItems.push({ record, context, candidate, index });
		} else {
			const status: BulkLinkOutcomeStatus = reason === 'detection_failed' ? 'failed' : 'skipped';
			if (status === 'failed') result.failed += 1; else result.skipped += 1;
			result.outcomes.push({ title: record.title, shortcutAppId: record.id, status, reason });
		}
	};
	const workers = Array.from({ length: Math.min(BULK_ANALYSIS_CONCURRENCY, records.length) }, async () => {
		while (!signal?.aborted) { const index = nextRecord++; const record = records[index]; if (!record) return; await analyzeRecord(record, index); }
	});
	await Promise.all(workers);
	for (const item of matchedItems.sort((left, right) => left.index - right.index)) {
		if (signal?.aborted) break;
		await linkItem(item);
	}
	// Resource traffic starts only after every mapping has committed, so slow
	// artwork providers cannot delay detection or the remaining identity writes.
	for (const item of matchedItems) {
		const steamAppId = item.candidate.appid;
		void warmShortcutLinkResources(steamAppId).catch(error => backendLog(`Bulk warm-up failed for ${steamAppId}: ${error}`));
	}
	const recordOrder = new Map(records.map((record, index) => [record.id, index]));
	result.outcomes.sort((left, right) => (recordOrder.get(left.shortcutAppId) ?? Number.MAX_SAFE_INTEGER)
		- (recordOrder.get(right.shortcutAppId) ?? Number.MAX_SAFE_INTEGER));
	shortcutRuntimeHost().resetLibraryInjection?.(true, shortcutRuntimeHost().getMainWindowDoc());
	return result;
	} finally {
		resumePendingLinkJobs();
		resumeLinkedGamePrefetch();
	}
}
