import type { ShortcutLinkResult } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { linkShortcutToSteam } from './linking';
import { shortcutRuntimeHost } from './host';

const STORAGE_KEY = 'gdl-pending-link-jobs-v1';
const MAX_ATTEMPTS = 3;
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
	attempts: number;
	status: 'queued' | 'running' | 'failed';
	createdAt: number;
	lastError?: string;
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
			.map(job => ({ ...job, status: job.status === 'failed' ? 'failed' : 'queued', attempts: Number(job.attempts) || 0 }));
	} catch { return []; }
}

function writeJobs(jobs: PendingLinkJob[]): void {
	try { storage()?.setItem(STORAGE_KEY, JSON.stringify(jobs)); }
	catch (error) { backendLog('Could not persist background link queue: ' + String(error)); }
}

/** Persist first, then notify the long-lived desktop runtime to process it. */
export function enqueueLinkJob(input: Omit<PendingLinkJob, 'id' | 'attempts' | 'status' | 'createdAt'>): PendingLinkJob {
	const jobs = readJobs();
	const existing = jobs.find(job => job.shortcutAppId === input.shortcutAppId && job.steamAppId === input.steamAppId && job.status !== 'failed');
	if (existing) return existing;
	const job: PendingLinkJob = {
		...input,
		id: `${input.shortcutAppId || input.title}|${input.steamAppId}`,
		attempts: 0,
		status: 'queued',
		createdAt: Date.now(),
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
	return readJobs().some(job => (shortcutAppId != null && job.shortcutAppId === shortcutAppId)
		|| (!!normalizedTitle && job.title.trim().toLowerCase() === normalizedTitle));
}

export async function processPendingLinkJobs(targetDoc?: Document | null): Promise<void> {
	if (processing) return processing;
	processing = (async () => {
		let jobs = readJobs();
		for (const job of jobs) {
			if (job.status === 'failed' || job.attempts >= MAX_ATTEMPTS) continue;
			job.status = 'running';
			writeJobs(jobs);
			let result: ShortcutLinkResult | null = null;
			try {
				result = await linkShortcutToSteam({
					doc: targetDoc || shortcutRuntimeHost().getMainWindowDoc(),
					title: job.title, shortcutAppId: job.shortcutAppId, steamAppId: job.steamAppId,
					skipLauncher: job.skipLauncher, existingLaunchOptions: job.existingLaunchOptions,
					trackingExecutable: job.trackingExecutable, trackingStartDir: job.trackingStartDir,
					onStatus: message => backendLog(`Background link ${job.steamAppId}: ${message}`),
				});
			} catch (error) {
				result = { ok: false, error: String(error) };
			}
			jobs = readJobs();
			const current = jobs.find(candidate => candidate.id === job.id);
			if (!current) continue;
			if (result?.ok) {
				jobs = jobs.filter(candidate => candidate.id !== job.id);
				writeJobs(jobs);
				continue;
			}
			current.attempts += 1;
			current.lastError = String(result?.error || 'link_failed');
			current.status = current.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
			writeJobs(jobs);
		}
	})().finally(() => { processing = null; });
	return processing;
}
