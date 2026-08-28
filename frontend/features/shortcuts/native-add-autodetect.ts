import { backendLog } from '../../api/backend';
import { getPreferences } from '../../core/preferences';
import { readShortcutOverviewField, shortcutExecutableIdentity, shortcutStableIdentity } from '../../steam/shortcuts';
import { candidateSteamDocuments, nativeAddNonSteamDialogOpen, nativeAddSelectedExecutableIdentities } from './native-add-guard';
import { isNativeAddAutoPromptSuppressed } from './auto-prompt-policy';
import { getAllShortcutRecords, shortcutAlreadyLinked, type ShortcutRecord } from './registry';
import { requestNativeAddShortcutReview } from './manual-link';

let watcherTimer: ReturnType<typeof setInterval> | null = null;
let closeEvaluationTimers: ReturnType<typeof setTimeout>[] = [];
let dialogOpen = false;
let sessionGeneration = 0;
let baselineIds = new Set<number>();
let baselineIdentities = new Set<string>();
let selectedExecutables = new Set<string>();
let handledIds = new Set<number>();
let handledIdentities = new Set<string>();
let handledExecutables = new Set<string>();
const interactionListeners = new Map<Document, EventListener>();
const documentObservers = new Map<Document, MutationObserver>();
let scheduledTick: ReturnType<typeof setTimeout> | null = null;

function nodeMayContainNativeAddUi(node: Node): boolean {
	if (node.nodeType !== Node.ELEMENT_NODE) return false;
	const element = node as Element;
	const signature = '[role="dialog"], [aria-modal="true"], [class*="Modal"], [class*="Dialog"], input[type="search"], input[type="checkbox"], [role="checkbox"]';
	try { return element.matches(signature) || Boolean(element.querySelector(signature)); }
	catch { return false; }
}

function scheduleTick(delayMs = 60): void {
	if (scheduledTick) return;
	scheduledTick = setTimeout(() => {
		scheduledTick = null;
		tick();
	}, delayMs);
}

function clearCloseEvaluationTimers(): void {
	for (const timer of closeEvaluationTimers) clearTimeout(timer);
	closeEvaluationTimers = [];
}

function recordIdentity(record: ShortcutRecord): string {
	return shortcutStableIdentity(record.app);
}

function recordExecutable(record: ShortcutRecord): string {
	return shortcutExecutableIdentity(readShortcutOverviewField(
		record.app, 'strShortcutExe', 'm_strShortcutExe', 'shortcut_exe', 'strExePath',
	));
}

function snapshotBaseline(): void {
	const records = getAllShortcutRecords();
	baselineIds = new Set(records.map(record => record.id));
	baselineIdentities = new Set(records.map(recordIdentity).filter(Boolean));
	selectedExecutables.clear();
	handledIds.clear();
	handledIdentities.clear();
	handledExecutables.clear();
}

function captureCurrentSelections(): void {
	for (const executable of nativeAddSelectedExecutableIdentities()) {
		if (executable) selectedExecutables.add(executable);
	}
}

function isSessionNewRecord(record: ShortcutRecord): boolean {
	const identity = recordIdentity(record);
	return !baselineIds.has(record.id) && !(identity && baselineIdentities.has(identity));
}

function recordWasExplicitlySelected(record: ShortcutRecord): boolean {
	const executable = recordExecutable(record);
	return Boolean(executable && selectedExecutables.has(executable));
}

function eligibleSessionRecords(): ShortcutRecord[] {
	const records = getAllShortcutRecords();
	const selectedMatches = records.filter(recordWasExplicitlySelected);
	if (selectedMatches.length > 0) {
		// Prefer records that are actually new to this picker session. If Steam
		// reused the same Shortcut AppID (common after delete + re-add), retain the
		// selected executable match as authoritative evidence of this explicit add.
		const fresh = selectedMatches.filter(isSessionNewRecord);
		return fresh.length > 0 ? fresh : selectedMatches;
	}
	// Fallback for Steam builds whose custom picker does not expose checkbox
	// state. The baseline diff remains scoped to this one detected picker session.
	return records.filter(isSessionNewRecord);
}

function evaluateCommittedNativeAdds(generation: number): void {
	if (generation !== sessionGeneration || dialogOpen || !getPreferences().autoDetectShortcuts) return;
	for (const record of eligibleSessionRecords()) {
		const identity = recordIdentity(record);
		const executable = recordExecutable(record);
		if (handledIds.has(record.id)
			|| (identity && handledIdentities.has(identity))
			|| (executable && handledExecutables.has(executable))) continue;
		handledIds.add(record.id);
		if (identity) handledIdentities.add(identity);
		if (executable) handledExecutables.add(executable);
		if (shortcutAlreadyLinked(record.id) || isNativeAddAutoPromptSuppressed(record.id)) {
			backendLog(`Native-add auto review skipped for ${record.title}: linked or permanently suppressed.`);
			continue;
		}
		if (requestNativeAddShortcutReview(record.id)) {
			backendLog(`Native-add auto review requested for ${record.title} (${record.id}).`);
		}
	}
}


function ensureInteractionListeners(): void {
	for (const doc of candidateSteamDocuments()) {
		if (interactionListeners.has(doc)) continue;
		const handler: EventListener = () => {
			// Capture selected executable paths in the event's capture phase. Steam
			// may close the popup synchronously when the final Add button handles
			// this same click, so waiting for the next polling tick can be too late.
			if (dialogOpen) captureCurrentSelections();
		};
		try {
			doc.addEventListener('click', handler, true);
			doc.addEventListener('pointerdown', handler, true);
			interactionListeners.set(doc, handler);
			const Observer = doc.defaultView?.MutationObserver;
			if (Observer && doc.body && !documentObservers.has(doc)) {
				const observer = new Observer(records => {
					if (dialogOpen || records.some(record =>
						Array.from(record.addedNodes).some(nodeMayContainNativeAddUi)
						|| Array.from(record.removedNodes).some(nodeMayContainNativeAddUi))) scheduleTick();
				});
				observer.observe(doc.body, { childList: true, subtree: true });
				documentObservers.set(doc, observer);
			}
		} catch {}
	}
	for (const [doc, observer] of Array.from(documentObservers)) {
		let alive = false;
		try { alive = Boolean(doc.body && doc.defaultView && !doc.defaultView.closed); } catch {}
		if (alive) continue;
		observer.disconnect();
		documentObservers.delete(doc);
	}
}

function clearInteractionListeners(): void {
	for (const [doc, handler] of interactionListeners) {
		try { doc.removeEventListener('click', handler, true); } catch {}
		try { doc.removeEventListener('pointerdown', handler, true); } catch {}
	}
	interactionListeners.clear();
	for (const observer of documentObservers.values()) observer.disconnect();
	documentObservers.clear();
}

function onDialogOpened(): void {
	sessionGeneration += 1;
	clearCloseEvaluationTimers();
	snapshotBaseline();
	dialogOpen = true;
	captureCurrentSelections();
	backendLog(`Native Add Non-Steam session opened with ${baselineIds.size} existing shortcut(s).`);
}

function onDialogClosed(): void {
	// Capture one final time before the popup/document disappears from Steam's
	// active window registry. This makes custom checkbox implementations much
	// more reliable when the final Add click closes the picker immediately.
	captureCurrentSelections();
	dialogOpen = false;
	const generation = sessionGeneration;
	for (const delay of [100, 250, 500, 900, 1500, 2500, 4000, 6500, 9000]) {
		closeEvaluationTimers.push(setTimeout(() => evaluateCommittedNativeAdds(generation), delay));
	}
	backendLog(`Native Add Non-Steam session closed; selected executable(s): ${selectedExecutables.size}.`);
	try { window.dispatchEvent(new Event('gdl:shortcuts-changed')); } catch {}
}

function tick(): void {
	ensureInteractionListeners();
	let open = false;
	try { open = nativeAddNonSteamDialogOpen(); } catch {}
	if (open) {
		if (!dialogOpen) onDialogOpened();
		else captureCurrentSelections();
	} else if (dialogOpen) onDialogClosed();
}

/** Start a narrowly-scoped watcher. DOM mutations open the fast path; the slow
 * watchdog only discovers newly-created Steam documents and never continuously
 * scans their complete contents while the native picker is closed.
 * It never infers new shortcuts from startup,
 * navigation or language changes. A review can only be scheduled after a real
 * open->closed lifecycle of Steam's native Add a Non-Steam Game picker. */
export function startNativeAddAutoDetector(): void {
	if (watcherTimer) return;
	dialogOpen = false;
	watcherTimer = setInterval(() => {
		const observedBefore = documentObservers.size;
		ensureInteractionListeners();
		if (dialogOpen || documentObservers.size !== observedBefore) scheduleTick(0);
	}, 3000);
	ensureInteractionListeners();
	tick();
}

export function stopNativeAddAutoDetector(): void {
	if (watcherTimer) clearInterval(watcherTimer);
	watcherTimer = null;
	if (scheduledTick) clearTimeout(scheduledTick);
	scheduledTick = null;
	clearCloseEvaluationTimers();
	dialogOpen = false;
	baselineIds.clear();
	baselineIdentities.clear();
	selectedExecutables.clear();
	handledIds.clear();
	handledIdentities.clear();
	handledExecutables.clear();
	clearInteractionListeners();
}
