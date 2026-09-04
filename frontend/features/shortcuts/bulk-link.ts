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
import { applyOfficialShortcutIcon, spoofArtwork } from '../library/artwork';
import { syncMissingArtworkForMappedShortcuts } from '../library/artwork-sync';
import { runDurableReconciliation } from './reconciler';
import { isPriorityShortcut } from './link-job-priority';
export { setPriorityShortcut as prioritizeBulkLinkShortcut } from './link-job-priority';

const BULK_ANALYSIS_CONCURRENCY = 6;
export type BulkLinkOutcomeStatus = 'linked' | 'queued' | 'skipped' | 'failed';
export interface BulkLinkGameOutcome {
	title: string;
	shortcutAppId: number;
	steamAppId?: string;
	status: BulkLinkOutcomeStatus;
	reason?: string;
	resourceRepairQueued?: boolean;
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
	rememberedAppId = '',
): ShortcutDetectionCandidate | null {
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
	if (top.direct && top.score >= 70) return top;
	if (top.confidence === 'exact' && top.score >= 75) return top;
	if (exactTitle && !secondExactTitle && top.score >= 65) return top;
	if (reasons.has('folder_exact') && top.score >= 75) return top;
	if (top.executable_match && top.score >= 70) return top;
	if (reasons.has('franchise_alias') && top.score >= 75) return top;
	if (top.confidence === 'high' && top.score >= 80) return top;
	if (top.score >= 84) return top;
	return top.score >= 75 && margin >= 5 && !reasons.has('alias_requires_confirmation') ? top : null;
}

function enqueueBulkRetry(
	item: { record: { id: number; title: string }; context: ShortcutDetectionContext; candidate: ShortcutDetectionCandidate },
	repairResources: boolean,
	shortcutAppId = item.record.id,
): void {
	enqueueLinkJob({
		title: item.context.title,
		shortcutAppId,
		steamAppId: item.candidate.appid,
		skipLauncher: false,
		existingLaunchOptions: item.context.launchOptions || '',
		trackingExecutable: item.context.trackingExecutableAutoApply && item.context.recommendedExePath ? item.context.recommendedExePath : '',
		trackingStartDir: item.context.trackingExecutableAutoApply && item.context.recommendedStartDir ? item.context.recommendedStartDir : '',
		shortcutExecutable: item.context.exePath || '',
		repairResources,
	});
}

export async function linkAllShortcutsExperimental(
	onProgress?: (done: number, total: number, title: string, phase: BulkLinkProgressPhase) => void,
	signal?: AbortSignal,
): Promise<BulkLinkAllResult> {
	pauseLinkedGamePrefetch();
	await pausePendingLinkJobs();
	try {
		const records = getAllShortcutRecords().filter(record => !shortcutAlreadyLinked(record.id));
		const result: BulkLinkAllResult = {
			total: records.length,
			matched: 0,
			linked: 0,
			queued: 0,
			skipped: 0,
			failed: 0,
			outcomes: [],
		};
		if (!records.length || signal?.aborted) return result;

		type Item = {
			record: { id: number; title: string };
			context: ShortcutDetectionContext;
			candidate: ShortcutDetectionCandidate;
			index: number;
		};
		let analyzed = 0;
		let nextRecord = 0;
		const matchedItems: Item[] = [];

		// Stage 1: Fast concurrent detection across all unlinked records
		const analyzeRecord = async (record: { id: number; title: string }, index: number): Promise<void> => {
			let context: ShortcutDetectionContext | null = null;
			let candidate: ShortcutDetectionCandidate | null = null;
			let reason = 'ambiguous_or_low_confidence';
			try {
				context = await buildShortcutDetectionContext(null, record.title, record.id);
				if (!context) {
					reason = 'context_unavailable';
				} else {
					const duplicateAppId = findMappingForDuplicateShortcut(record.id);
					if (duplicateAppId) {
						candidate = {
							appid: duplicateAppId,
							name: context.title,
							image: '',
							score: 100,
							confidence: 'exact',
							reasons: ['duplicate_launch_identity'],
							executable_match: true,
							direct: true,
						};
					} else {
						for (let attempt = 0; attempt < 3 && !signal?.aborted; attempt += 1) {
							const detected = await detectShortcutCandidates(context);
							candidate = reliableBulkCandidate(context, detected?.candidates || [], rememberedShortcutSteamAppId(record.id));
							if (candidate || (detected && detected.transient_error !== true)) break;
							if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)));
						}
					}
				}
			} catch (error) {
				reason = 'detection_failed';
				backendLog(`Bulk detection failed for ${record.title}: ${error}`);
			} finally {
				analyzed += 1;
				if (!signal?.aborted) onProgress?.(analyzed, records.length, record.title, 'analyzing');
			}

			if (signal?.aborted) return;
			if (context && candidate) {
				result.matched += 1;
				matchedItems.push({ record, context, candidate, index });
			} else {
				const status: BulkLinkOutcomeStatus = reason === 'detection_failed' ? 'failed' : 'skipped';
				if (status === 'failed') result.failed += 1;
				else result.skipped += 1;
				result.outcomes.push({ title: record.title, shortcutAppId: record.id, status, reason });
			}
		};

		const workers = Array.from({ length: Math.min(BULK_ANALYSIS_CONCURRENCY, records.length) }, async () => {
			while (!signal?.aborted) {
				const index = nextRecord++;
				const record = records[index];
				if (!record) return;
				await analyzeRecord(record, index);
			}
		});
		await Promise.all(workers);

		matchedItems.sort((left, right) => {
			const isLeftPriority = isPriorityShortcut(left.record.id, left.record.title) || isPriorityShortcut(Number(left.candidate.appid));
			const isRightPriority = isPriorityShortcut(right.record.id, right.record.title) || isPriorityShortcut(Number(right.candidate.appid));
			if (isLeftPriority && !isRightPriority) return -1;
			if (!isLeftPriority && isRightPriority) return 1;
			return left.index - right.index;
		});

		// Stage 2: Transactional identity commit across all matched shortcuts
		interface SuccessfullyLinkedItem {
			sid: number;
			steamAppId: string;
			title: string;
			recordId: number;
		}
		const successfullyLinked: SuccessfullyLinkedItem[] = [];
		const remainingToLink = [...matchedItems];
		let linkedCount = 0;

		while (remainingToLink.length > 0 && !signal?.aborted) {
			const priorityIdx = remainingToLink.findIndex(item =>
				isPriorityShortcut(item.record.id, item.record.title) || isPriorityShortcut(Number(item.candidate.appid)));
			const item = priorityIdx >= 0 ? remainingToLink.splice(priorityIdx, 1)[0] : remainingToLink.shift()!;

			onProgress?.(linkedCount, result.matched, item.record.title, 'linking');
			cancelPendingLinkJobs(item.record.id, item.context.title);
			undismissShortcut(item.record.id);

			try {
				const linked = await linkShortcutToSteam({
					doc: null,
					title: item.context.title,
					shortcutAppId: item.record.id,
					steamAppId: item.candidate.appid,
					shortcutExecutable: item.context.exePath,
					trackingExecutable: item.context.trackingExecutableAutoApply && item.context.recommendedExePath ? item.context.recommendedExePath : '',
					trackingStartDir: item.context.trackingExecutableAutoApply && item.context.recommendedStartDir ? item.context.recommendedStartDir : '',
					refreshLibrary: false,
					assetTimeoutMs: 30_000,
					deferAssetSync: true,
					metadataTimeoutMs: 1_200,
					canonicalNameHint: item.candidate.name,
					onStatus: message => backendLog(`Bulk link ${item.record.title}: ${message}`),
				});

				const resolvedShortcutId = Number(linked.shortcutAppId || item.record.id);

				if (linked.ok) {
					result.linked += 1;
					cancelPendingLinkJobs(item.record.id, item.context.title);
					result.outcomes.push({
						title: item.record.title,
						shortcutAppId: resolvedShortcutId,
						steamAppId: item.candidate.appid,
						status: 'linked',
						resourceRepairQueued: false,
					});
					successfullyLinked.push({
						sid: resolvedShortcutId || item.record.id,
						steamAppId: item.candidate.appid,
						title: item.candidate.name || item.record.title,
						recordId: item.record.id,
					});
				} else if (!['invalid_appid', 'refusing_to_modify_native_steam_app'].includes(String(linked.error || ''))) {
					enqueueBulkRetry(item, false, resolvedShortcutId);
					result.queued += 1;
					result.outcomes.push({
						title: item.record.title,
						shortcutAppId: item.record.id,
						steamAppId: item.candidate.appid,
						status: 'queued',
						reason: String(linked.error || 'setup_incomplete'),
					});
				} else {
					result.failed += 1;
					cancelPendingLinkJobs(item.record.id, item.context.title);
					result.outcomes.push({
						title: item.record.title,
						shortcutAppId: item.record.id,
						steamAppId: item.candidate.appid,
						status: 'failed',
						reason: String(linked.error || 'link_failed'),
					});
				}
			} catch (error) {
				backendLog(`Bulk link failed for ${item.record.title}: ${error}`);
				enqueueBulkRetry(item, false);
				result.queued += 1;
				result.outcomes.push({
					title: item.record.title,
					shortcutAppId: item.record.id,
					steamAppId: item.candidate.appid,
					status: 'queued',
					reason: 'link_failed',
				});
			} finally {
				linkedCount += 1;
				if (!signal?.aborted) onProgress?.(linkedCount, result.matched, item.record.title, 'linking');
			}
		}

		// Stage 3: Fast concurrent artwork and icon sync (Slot 0 Portrait applies first)
		if (successfullyLinked.length > 0 && !signal?.aborted) {
			const BULK_ARTWORK_CONCURRENCY = 3;
			const remainingArt = [...successfullyLinked];
			let artDone = 0;
			const artWorkers = Array.from({ length: Math.min(BULK_ARTWORK_CONCURRENCY, remainingArt.length) }, async () => {
				while (!signal?.aborted && remainingArt.length > 0) {
					const priorityIdx = remainingArt.findIndex(target =>
						isPriorityShortcut(target.recordId, target.title) || isPriorityShortcut(Number(target.steamAppId)));
					const target = priorityIdx >= 0 ? remainingArt.splice(priorityIdx, 1)[0] : remainingArt.shift();
					if (!target) return;

					onProgress?.(artDone, successfullyLinked.length, target.title, 'linking');

					const artPromise = spoofArtwork(target.sid, target.steamAppId, target.title, false)
						.catch(error => backendLog(`Bulk artwork failed for ${target.sid}: ${error}`));
					const iconPromise = applyOfficialShortcutIcon(target.sid, target.steamAppId, false)
						.catch(error => backendLog(`Bulk icon failed for ${target.sid}: ${error}`));

					// Bounded timeout per game (max 10s) so slow downloads never block the worker pool
					await Promise.race([
						Promise.allSettled([artPromise, iconPromise]),
						new Promise(resolve => setTimeout(resolve, 10_000)),
					]);

					artDone += 1;
					if (!signal?.aborted) {
						onProgress?.(artDone, successfullyLinked.length, target.title, 'linking');
					}
				}
			});
			await Promise.all(artWorkers);
		}

		// Stage 4: Background warmup, reconciliation and finalize
		for (const item of matchedItems) {
			const steamAppId = item.candidate.appid;
			void warmShortcutLinkResources(steamAppId).catch(error => backendLog(`Bulk warm-up failed for ${steamAppId}: ${error}`));
		}
		void syncMissingArtworkForMappedShortcuts();
		void runDurableReconciliation().catch(error => backendLog(`Bulk reconciler pass: ${error}`));

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
