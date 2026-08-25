/** Stable public facade for shortcut detection/linking/property integration. */
export type { ShortcutRuntimeHost } from './host';
export { configureShortcutRuntimeHost } from './host';
export { normalizedShortcutAppId } from './registry';
export { syncLinkedGameNote } from './linked-notes';
export { scheduleShortcutInspection, startShortcutAutoDetector, stopShortcutAutoDetector } from './autodetect';
export { tryInjectPropertiesField } from './properties';
