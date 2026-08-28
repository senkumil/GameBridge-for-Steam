import type { ShortcutLinkResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { linkShortcutToSteam } from './linking';
import { shortcutRuntimeHost } from './host';

const STORAGE_KEY = 'gdl-pending-link-jobs-v1';
const RETRY_BASE_DELAY_MS = 15_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
let processing: Promise<void> | null = null;

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
				status: job.status === 'failed' ? 'failed' : 'queued',
				attempts: Number(job.attempts) || 0,
				nextAttemptAt: Number(job.nextAttemptAt) || 0,
			}));
	} catch { return []; }
}

function writeJobs(jobs: PendingLinkJob[]): void {
	try { storage()?.setItem(STORAGE_KEY, JSON.stringify(jobs)); }
	catch (error) { backendLog('Could not persist background link queue: ' + String(error)); }
}

/** Persist first, then notify the long-lived desktop runtime to process it. */
export function enqueueLinkJob(input: Omit<PendingLinkJob, 'id' | 'attempts' | 'status' | 'createdAt'>): PendingLinkJob {
	const jobs = readJobs();
	const id = `${input.shortcutAppId || input.title}|${input.steamAppId}`;
	const existing = jobs.find(job => job.id === id);
	if (existing) {
		if (existing.status !== 'failed') return existing;
		// Explicitly pressing Save again is a new attempt. Re-arm the existing
		// logical job instead of leaving a permanent failed record with the same
		// identity in localStorage.
		Object.assign(existing, input, { attempts: 0, status: 'queued' as const, createdAt: Date.now(), nextAttemptAt: 0 });
		delete existing.lastError;
		writeJobs(jobs);
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
	try { shortcutRuntimeHost().runPendingLinkJobs?.(); } catch {}
	return job;
}

/** A user who pressed Link has already made a decision; the detector must not
 * reopen its confirmation modal while that work is queued or retried. */
export function hasPendingLinkJob(shortcutAppId: number | null | undefined, title = ''): boolean {
	const normalizedTitle = String(title || '').trim().toLowerCase();
	return readJobs().some(job => job.status !== 'failed'
		&& ((shortcutAppId != null && job.shortcutAppId === shortcutAppId)
			|| (!!normalizedTitle && job.title.trim().toLowerCase() === normalizedTitle)));
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
	if (removed > 0) writeJobs(kept);
	return removed;
}

/** Cancel every queued/retrying bulk link operation. */
export function cancelAllPendingLinkJobs(): number {
	const jobs = readJobs();
	if (jobs.length > 0) writeJobs([]);
	return jobs.length;
}

export async function processPendingLinkJobs(targetDoc?: Document | null): Promise<void> {
	if (processing) return processing;
	processing = (async () => {
		let jobs = readJobs();
		for (const job of jobs) {
			if (job.status === 'failed') continue;
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
			if (result?.ok) {
				jobs = jobs.filter(candidate => candidate.id !== job.id);
				writeJobs(jobs);
				continue;
			}
			current.attempts += 1;
			current.lastError = String(result?.error || 'link_failed');
			const hardFailure = new Set(['invalid_appid', 'refusing_to_modify_native_steam_app']).has(current.lastError);
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
	})().finally(() => { processing = null; });
	return processing;
}
