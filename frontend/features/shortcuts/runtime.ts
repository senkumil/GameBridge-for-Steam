/** Stable public facade for shortcut detection/linking/property integration. */
export type { ShortcutRuntimeHost } from './host';
export { configureShortcutRuntimeHost } from './host';
export { findMappingForShortcut, normalizedShortcutAppId, getAllShortcutRecords, shortcutAlreadyLinked, getCommittedShortcutSteamAppId } from './registry';
export { syncLinkedGameNote } from './linked-notes';
export { requestManualShortcutLink, requestNativeAddShortcutReview, linkAllShortcutsExperimental } from './manual-link';
export { startNativeAddAutoDetector, stopNativeAddAutoDetector } from './native-add-autodetect';
export { undismissShortcut, dismissShortcut, isShortcutDismissed } from './dismissed';
export { detectShortcutCandidates } from './detection';
export { tryInjectPropertiesField } from './properties';
export { unlinkShortcutFromSteam, unlinkAllShortcutsFromSteam } from './unlinking';

export { clearNativeAddAutoPromptSuppressions, getNativeAddAutoPromptSuppressionCount, getNativeAddAutoPromptSuppressions } from './auto-prompt-policy';
