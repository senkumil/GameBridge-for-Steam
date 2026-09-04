import type { BulkLinkAllResult, BulkLinkProgressPhase } from './manual-link';

export interface BulkLinkProgressState {
	phase: BulkLinkProgressPhase;
	done: number;
	total: number;
	title: string;
}

export interface BulkLinkGlobalState {
	busy: string;
	progress: BulkLinkProgressState | null;
	status: { text: string; color: string } | null;
	report: BulkLinkAllResult | null;
	abortController: AbortController | null;
}

const state: BulkLinkGlobalState = {
	busy: '',
	progress: null,
	status: null,
	report: null,
	abortController: null,
};

const listeners = new Set<(current: BulkLinkGlobalState) => void>();

function notify(): void {
	const snapshot = { ...state };
	for (const listener of listeners) {
		try { listener(snapshot); } catch {}
	}
}

export function getBulkLinkState(): BulkLinkGlobalState {
	return { ...state };
}

export function setBulkLinkState(patch: Partial<BulkLinkGlobalState>): void {
	Object.assign(state, patch);
	notify();
}

export function subscribeBulkLinkState(listener: (current: BulkLinkGlobalState) => void): () => void {
	listeners.add(listener);
	listener({ ...state });
	return () => {
		listeners.delete(listener);
	};
}
