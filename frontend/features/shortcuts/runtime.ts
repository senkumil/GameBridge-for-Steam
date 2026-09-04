/** Stable public facade for shortcut detection/linking/property integration. */
export type { ShortcutRuntimeHost } from './host';
export { configureShortcutRuntimeHost } from './host';
export { findMappingForShortcut, normalizedShortcutAppId, getAllShortcutRecords, shortcutAlreadyLinked, getCommittedShortcutSteamAppId } from './registry';
export { syncLinkedGameNote } from './linked-notes';
export { requestManualShortcutLink, requestNativeAddShortcutReview, linkAllShortcutsExperimental, type BulkLinkAllResult, type BulkLinkProgressPhase, type BulkLinkGameOutcome } from './manual-link';
export { startNativeAddAutoDetector, stopNativeAddAutoDetector } from './native-add-autodetect';
export { undismissShortcut, dismissShortcut, isShortcutDismissed } from './dismissed';
export { detectShortcutCandidates } from './detection';
export { tryInjectPropertiesField, mutationMayContainProperties } from './properties';
export { disposeCustomizationArtwork, tryInjectCustomizationArtwork } from './customization-artwork';
export { cleanAllArtworkAndRestoreNames, unlinkShortcutFromSteam, unlinkAllShortcutsFromSteam } from './unlinking';
export { hasPendingLinkJob } from './link-job-queue';
export { shouldAutoApplyNoLauncher, hasNoLauncherOption, mergeNoLauncherOption, getOptimalLauncherSkipArg, removeIncompatibleLauncherBypass } from './linking';

export { clearNativeAddAutoPromptSuppressions, getNativeAddAutoPromptSuppressionCount, getNativeAddAutoPromptSuppressions } from './auto-prompt-policy';
export { performFactoryReset, type FactoryResetOptions, type FactoryResetResult } from './factory-reset';
export { scheduleReconciliation, runDurableReconciliation } from './reconciler';
