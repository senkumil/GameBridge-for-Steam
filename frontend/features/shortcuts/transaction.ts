export type ResourceSlot = 'portrait' | 'hero' | 'logo' | 'wide' | 'icon' | 'logoPosition';

export type ResourceStatus =
	| 'PENDING'
	| 'LOADING'
	| 'READY'
	| 'READY_DEGRADED'
	| 'FAILED'
	| 'UNAVAILABLE';

export interface ResourceManifestItem {
	slot: ResourceSlot;
	status: ResourceStatus;
	sourceUrl?: string;
	origin?: 'steam_cdn' | 'steamgriddb' | 'user_choice' | 'fallback';
	error?: string;
	appliedAt?: number;
	width?: number;
	height?: number;
}

export interface LinkResourceManifest {
	portrait: ResourceManifestItem;
	hero: ResourceManifestItem;
	logo: ResourceManifestItem;
	wide: ResourceManifestItem;
	icon: ResourceManifestItem;
	logoPosition: ResourceManifestItem;
}

export type LinkPhase =
	| 'idle'
	| 'resolving_identity'
	| 'validating'
	| 'mutating_identity'
	| 'committing_mapping'
	| 'applying_assets'
	| 'verifying'
	| 'completed'
	| 'failed'
	| 'aborted';

export interface LinkTransaction {
	readonly transactionId: string;
	readonly initialShortcutAppId: number;
	resolvedShortcutAppId: number;
	readonly targetSteamAppId: string;
	readonly generation: number;
	phase: LinkPhase;
	readonly startedAt: number;
	completedAt?: number;
	error?: string;
	aborted: boolean;
	abortReason?: string;
	isCurrent: () => boolean;
	abort: (reason?: string) => void;
	manifest: LinkResourceManifest;
}

const MANIFEST_STORAGE_PREFIX = 'gdl-resource-manifest-v1-';

export function readShortcutManifest(shortcutAppId: number): LinkResourceManifest | null {
	try {
		const raw = localStorage.getItem(MANIFEST_STORAGE_PREFIX + shortcutAppId);
		if (!raw) return null;
		return JSON.parse(raw) as LinkResourceManifest;
	} catch {
		return null;
	}
}

export function saveShortcutManifest(shortcutAppId: number, manifest: LinkResourceManifest): void {
	try {
		localStorage.setItem(MANIFEST_STORAGE_PREFIX + shortcutAppId, JSON.stringify(manifest));
	} catch {}
}

export function clearShortcutManifest(shortcutAppId: number): void {
	try {
		localStorage.removeItem(MANIFEST_STORAGE_PREFIX + shortcutAppId);
	} catch {}
}

const activeGenerations = new Map<number, number>();
const activeTransactions = new Map<number, LinkTransaction>();

export function getShortcutGeneration(shortcutAppId: number): number {
	return activeGenerations.get(shortcutAppId) || 0;
}

export function bumpShortcutGeneration(shortcutAppId: number): number {
	const next = (activeGenerations.get(shortcutAppId) || 0) + 1;
	activeGenerations.set(shortcutAppId, next);
	return next;
}

export function createInitialManifest(): LinkResourceManifest {
	return {
		portrait: { slot: 'portrait', status: 'PENDING' },
		hero: { slot: 'hero', status: 'PENDING' },
		logo: { slot: 'logo', status: 'PENDING' },
		wide: { slot: 'wide', status: 'PENDING' },
		icon: { slot: 'icon', status: 'PENDING' },
		logoPosition: { slot: 'logoPosition', status: 'PENDING' },
	};
}

let transactionSequence = 0;

export function createLinkTransaction(
	initialShortcutAppId: number,
	targetSteamAppId: string,
): LinkTransaction {
	// Cancel any existing transaction on this physical shortcut
	const previousTx = activeTransactions.get(initialShortcutAppId);
	if (previousTx && !previousTx.completedAt && !previousTx.aborted) {
		previousTx.abort('superseded_by_new_transaction');
	}

	const generation = bumpShortcutGeneration(initialShortcutAppId);
	transactionSequence += 1;
	const transactionId = `tx_${Date.now()}_${transactionSequence}_${initialShortcutAppId}_${targetSteamAppId}`;

	let aborted = false;

	const tx: LinkTransaction = {
		transactionId,
		initialShortcutAppId,
		resolvedShortcutAppId: initialShortcutAppId,
		targetSteamAppId,
		generation,
		phase: 'idle',
		startedAt: Date.now(),
		aborted: false,
		isCurrent(): boolean {
			if (aborted) return false;
			return activeGenerations.get(initialShortcutAppId) === generation;
		},
		abort(reason = 'aborted'): void {
			aborted = true;
			tx.aborted = true;
			tx.abortReason = reason;
			tx.phase = 'aborted';
			tx.completedAt = Date.now();
		},
		manifest: readShortcutManifest(initialShortcutAppId) || createInitialManifest(),
	};

	activeTransactions.set(initialShortcutAppId, tx);
	return tx;
}

export function getActiveTransaction(shortcutAppId: number): LinkTransaction | null {
	const tx = activeTransactions.get(shortcutAppId);
	if (tx && tx.isCurrent() && !tx.completedAt) return tx;
	return null;
}

export function clearActiveTransaction(shortcutAppId: number): void {
	const tx = activeTransactions.get(shortcutAppId);
	if (tx) {
		tx.abort('explicit_clear');
		activeTransactions.delete(shortcutAppId);
	}
}
