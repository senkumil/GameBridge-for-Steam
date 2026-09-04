import type { ShortcutLinkResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { linkShortcutToSteam } from './linking';
import { shortcutRuntimeHost } from './host';
import { findMappingForShortcut } from './registry';

const STORAGE_KEY = 'gdl-pending-link-jobs-v1';
const JOBS_CHANGED_EVENT = 'gdl:pending-link-jobs-changed';
// The foreground link is deliberately bounded; retry the remaining assets soon
// after a slow Steam/HTTP operation settles instead of leaving the user waiting
// fifteen seconds before the first reconciliation attempt.
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
let processing: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let processingPauseDepth = 0;

export interface PendingLinkJob {
	id: string;
	title: string;
	shortcutAppId: number | null;
	steamAppId: string;
	skipLauncher: boolean;
	existingLaunchOptions: string;
	trackingExecutable: string;
	trackingStartDir: string;
	shortcutExecutable: string;
	repairResources?: boolean;
	attempts: number;
	status: 'queued' | 'running' | 'failed';
	createdAt: number;
	lastError?: string;
	nextAttemptAt?: number;
}

function storage(): Storage | null {
	try {
		return shortcutRuntimeHost().getMainWindowDoc()?.defaultView?.localStorage
			|| (typeof localStorage !== 'undefined' ? localStorage : null);
	} catch { return null; }
}

function readJobs(): PendingLinkJob[] {
	try {
		const value = storage()?.getItem(STORAGE_KEY);
		const parsed = value ? JSON.parse(value) : [];
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((job): job is PendingLinkJob => job && /^\d+$/.test(String(job.steamAppId || '')) && typeof job.title === 'string')
			.map(job => ({
				...job,
				shortcutExecutable: String(job.shortcutExecutable || ''),
				repairResources: Boolean(job.repairResources),
				status: job.status === 'failed' ? 'failed' : 'queued',
				attempts: Number(job.attempts) || 0,
				nextAttemptAt: Number(job.nextAttemptAt) || 0,
			}));
	} catch { return []; }
}

function writeJobs(jobs: PendingLinkJob[]): void {
	try {
		storage()?.setItem(STORAGE_KEY, JSON.stringify(jobs));
		window.dispatchEvent(new CustomEvent(JOBS_CHANGED_EVENT));
	}
	catch (error) { backendLog('Could not persist background link queue: ' + String(error)); }
}

function normalizedExecutable(value: unknown): string {
	return String(value || '').trim().replace(/^"|"$/g, '').replace(/\//g, '\\').toLocaleLowerCase();
}

/** Match one physical shortcut without conflating duplicate game titles. The
 * executable identity bridges Steam's temporary AppID regeneration window. */
function sameLogicalShortcut(left: Pick<PendingLinkJob, 'shortcutAppId' | 'shortcutExecutable' | 'title'>,
	right: Pick<PendingLinkJob, 'shortcutAppId' | 'shortcutExecutable' | 'title'>): boolean {
	const leftId = Number(left.shortcutAppId || 0);
	const rightId = Number(right.shortcutAppId || 0);
	const leftHasId = Number.isFinite(leftId) && leftId >= 2147483648;
	const rightHasId = Number.isFinite(rightId) && rightId >= 2147483648;
	if (leftHasId && rightHasId && leftId === rightId) return true;
	const leftExe = normalizedExecutable(left.shortcutExecutable);
	const rightExe = normalizedExecutable(right.shortcutExecutable);
	if (leftExe && rightExe) return leftExe === rightExe;
	if (leftHasId && rightHasId) return false;
	if (leftExe || rightExe) return false;
	return String(left.title || '').trim().toLocaleLowerCase() === String(right.title || '').trim().toLocaleLowerCase();
}

/** Wake the durable queue at the earliest backoff deadline. Persisting a job
 * alone is insufficient: without this timer retries only happened after a
 * plugin reload or another unrelated user action. */
function scheduleNextRetry(jobs = readJobs()): void {
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = null;
	if (processingPauseDepth > 0) return;
	const now = Date.now();
	const next = jobs
		.filter(job => job.status === 'queued')
		.map(job => Math.max(now, Number(job.nextAttemptAt) || 0))
		.sort((a, b) => a - b)[0];
	if (!Number.isFinite(next)) return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		void processPendingLinkJobs(shortcutRuntimeHost().getMainWindowDoc());
	}, Math.max(50, next - now));
}

/** Keep durable repairs from competing with a bulk Steam bridge transaction. */
export async function pausePendingLinkJobs(): Promise<void> {
	processingPauseDepth += 1;
	scheduleNextRetry();
	const active = processing;
	if (active) await active.catch(() => {});
}

export function resumePendingLinkJobs(): void {
	processingPauseDepth = Math.max(0, processingPauseDepth - 1);
	if (processingPauseDepth > 0) return;
	scheduleNextRetry();
	void processPendingLinkJobs(shortcutRuntimeHost().getMainWindowDoc());
}

/** Persist first, then notify the long-lived desktop runtime to process it. */
export function enqueueLinkJob(input: Omit<PendingLinkJob, 'id' | 'attempts' | 'status' | 'createdAt'>): PendingLinkJob {
	let jobs = readJobs();
	const id = `${input.shortcutAppId || input.title}|${input.steamAppId}`;
	// A newer AppID choice supersedes every queued repair for this same physical
	// shortcut. Otherwise an old repair can silently relink the previous game
	// after the user has already saved the new target.
	const obsoleteIds = new Set(jobs
		.filter(job => job.steamAppId !== input.steamAppId && sameLogicalShortcut(job, input))
		.map(job => job.id));
	if (obsoleteIds.size > 0) jobs = jobs.filter(job => !obsoleteIds.has(job.id));
	const existing = jobs.find(job => job.id === id
		|| (job.steamAppId === input.steamAppId && sameLogicalShortcut(job, input)));
	if (existing) {
		if (existing.status !== 'failed') {
			const upgradeRepair = Boolean(input.repairResources && !existing.repairResources);
			Object.assign(existing, input, { repairResources: Boolean(existing.repairResources || input.repairResources) });
			if (upgradeRepair) {
				existing.nextAttemptAt = 0;
			}
			writeJobs(jobs);
			scheduleNextRetry(jobs);
			return existing;
		}
		// Explicitly pressing Save again is a new attempt. Re-arm the existing
		// logical job instead of leaving a permanent failed record with the same
		// identity in localStorage.
		Object.assign(existing, input, { attempts: 0, status: 'queued' as const, createdAt: Date.now(), nextAttemptAt: 0 });
		delete existing.lastError;
		writeJobs(jobs);
		scheduleNextRetry(jobs);
		try { shortcutRuntimeHost().runPendingLinkJobs?.(); } catch {}
		return existing;
	}
	const job: PendingLinkJob = {
		...input,
		id,
		attempts: 0,
		status: 'queued',
		createdAt: Date.now(),
		nextAttemptAt: 0,
	};
	jobs.push(job);
	writeJobs(jobs);
	scheduleNextRetry(jobs);
	try { shortcutRuntimeHost().runPendingLinkJobs?.(); } catch {}
	return job;
}

/** Read a durable job so an open confirmation dialog can show the result of
 * its background retry instead of remaining on a stale queued message. */
export function getPendingLinkJob(id: string): PendingLinkJob | null {
	return readJobs().find(job => job.id === id) || null;
}

/** A user who pressed Link has already made a decision; the detector must not
 * reopen its confirmation modal while that work is queued or retried. */
export function hasPendingLinkJob(shortcutAppId: number | null | undefined, title = ''): boolean {
	const normalizedTitle = String(title || '').trim().toLowerCase();
	return readJobs().some(job => job.status !== 'failed'
		&& ((shortcutAppId != null && job.shortcutAppId === shortcutAppId)
			|| (!!normalizedTitle && job.title.trim().toLowerCase() === normalizedTitle)));
}

/** Fast-track a specific shortcut job to the front of the background link queue. */
export function prioritizePendingLinkJob(shortcutAppId: number | null | undefined, title = ''): boolean {
	const jobs = readJobs();
	const normalizedTitle = String(title || '').trim().toLowerCase();
	const targetIndex = jobs.findIndex(job =>
		job.status !== 'failed'
		&& ((shortcutAppId != null && job.shortcutAppId === shortcutAppId)
			|| (!!normalizedTitle && job.title.trim().toLowerCase() === normalizedTitle)));
	if (targetIndex < 0) return false;
	const [job] = jobs.splice(targetIndex, 1);
	job.nextAttemptAt = 0;
	jobs.unshift(job);
	writeJobs(jobs);
	scheduleNextRetry(jobs);
	void processPendingLinkJobs(shortcutRuntimeHost().getMainWindowDoc());
	return true;
}

/** Cancel durable link work for a shortcut before an explicit unlink. */
export function cancelPendingLinkJobs(shortcutAppId?: number | null, title = ''): number {
	const jobs = readJobs();
	const normalizedTitle = String(title || '').trim().toLowerCase();
	const kept = jobs.filter(job => !(
		(shortcutAppId != null && job.shortcutAppId === shortcutAppId)
		|| (!!normalizedTitle && job.title.trim().toLowerCase() === normalizedTitle)
	));
	const removed = jobs.length - kept.length;
	if (removed > 0) { writeJobs(kept); scheduleNextRetry(kept); }
	return removed;
}

/** Cancel every queued/retrying bulk link operation. */
export function cancelAllPendingLinkJobs(): number {
	const jobs = readJobs();
	if (jobs.length > 0) { writeJobs([]); scheduleNextRetry([]); }
	return jobs.length;
}

export async function processPendingLinkJobs(targetDoc?: Document | null): Promise<void> {
	if (processingPauseDepth > 0) return;
	if (processing) return processing;
	processing = (async () => {
		let jobs = readJobs();
		for (const job of jobs) {
			if (processingPauseDepth > 0) break;
			if (job.status === 'failed') continue;
			// A previous attempt may have committed the mapping before its UI
			// request was interrupted. Retire that stale queue entry immediately
			// instead of waiting for its exponential backoff to elapse.
			if (findMappingForShortcut(job.shortcutAppId, job.title, job.shortcutExecutable) === job.steamAppId) {
				if (job.attempts >= 1 || !job.repairResources) {
					jobs = jobs.filter(candidate => candidate.id !== job.id);
					writeJobs(jobs);
					continue;
				}
			}
			if ((job.nextAttemptAt || 0) > Date.now()) continue;
			job.status = 'running';
			writeJobs(jobs);
			let result: ShortcutLinkResult | null = null;
			try {
				result = await linkShortcutToSteam({
					doc: targetDoc || shortcutRuntimeHost().getMainWindowDoc(),
					title: job.title, shortcutAppId: job.shortcutAppId, steamAppId: job.steamAppId,
					skipLauncher: job.skipLauncher, existingLaunchOptions: job.existingLaunchOptions,
					trackingExecutable: job.trackingExecutable, trackingStartDir: job.trackingStartDir,
					shortcutExecutable: job.shortcutExecutable,
					repairResources: Boolean(job.repairResources),
					assetTimeoutMs: 30_000,
					onStatus: message => backendLog(`Background link ${job.steamAppId}: ${message}`),
				});
			} catch (error) {
				result = { ok: false, error: String(error) };
			}
			jobs = readJobs();
			const current = jobs.find(candidate => candidate.id === job.id);
			if (!current) continue;
			if (result?.shortcutAppId && result.shortcutAppId !== current.shortcutAppId) {
				current.shortcutAppId = result.shortcutAppId;
			}
			const resourcesComplete = Boolean(result?.setup?.artworkComplete && result?.setup?.iconApplied);
			const isMapped = findMappingForShortcut(current.shortcutAppId, current.title, current.shortcutExecutable) === current.steamAppId;
			if (result?.ok || (isMapped && (current.attempts >= 1 || !current.repairResources || resourcesComplete))) {
				jobs = jobs.filter(candidate => candidate.id !== job.id);
				writeJobs(jobs);
				continue;
			}
			current.attempts += 1;
			current.lastError = resourcesComplete ? String(result?.error || 'link_failed') : 'resource_sync_incomplete';
			const hardFailure = current.attempts >= 2 || new Set(['invalid_appid', 'refusing_to_modify_native_steam_app']).has(current.lastError);
			if (hardFailure) {
				current.status = 'failed';
				current.nextAttemptAt = 0;
			} else {
				// Once the user explicitly confirms a link, transient Steam/client/network
				// failures must not turn it into a permanently half-finished operation.
				// Keep the job durable and retry with capped backoff until the final
				// transaction can commit name + icon + all artwork + mapping together.
				current.status = 'queued';
				const exponent = Math.min(Math.max(0, current.attempts - 1), 5);
				current.nextAttemptAt = Date.now() + Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * (2 ** exponent));
			}
			writeJobs(jobs);
		}
	})().finally(() => { processing = null; scheduleNextRetry(); });
	return processing;
}
