/** Stable public facade for shortcut detection/linking/property integration. */
export type { ShortcutRuntimeHost } from './host';
export { configureShortcutRuntimeHost } from './host';
export { findMappingForShortcut, normalizedShortcutAppId } from './registry';
export { syncLinkedGameNote } from './linked-notes';
export { scheduleShortcutInspection, showShortcutAutoLinkModal, startShortcutAutoDetector, stopShortcutAutoDetector, undismissShortcut, dismissShortcut, isShortcutDismissed } from './autodetect';
export { detectShortcutCandidates } from './detection';
export { tryInjectPropertiesField } from './properties';
