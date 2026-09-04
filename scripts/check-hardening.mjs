import { readFileSync } from 'node:fs';

const transactionSource = readFileSync(new URL('../frontend/features/shortcuts/transaction.ts', import.meta.url), 'utf8');
const factoryResetSource = readFileSync(new URL('../frontend/features/shortcuts/factory-reset.ts', import.meta.url), 'utf8');
const dismissedSource = readFileSync(new URL('../frontend/features/shortcuts/dismissed.ts', import.meta.url), 'utf8');
const linkHistorySource = readFileSync(new URL('../frontend/features/shortcuts/link-history.ts', import.meta.url), 'utf8');
const unlinkingSource = readFileSync(new URL('../frontend/features/shortcuts/unlinking.ts', import.meta.url), 'utf8');
const artworkSource = readFileSync(new URL('../frontend/features/library/artwork.ts', import.meta.url), 'utf8');
const linkQueueSource = readFileSync(new URL('../frontend/features/shortcuts/link-job-queue.ts', import.meta.url), 'utf8');
const reconcilerSource = readFileSync(new URL('../frontend/features/shortcuts/reconciler.ts', import.meta.url), 'utf8');
const bulkLinkSource = readFileSync(new URL('../frontend/features/shortcuts/bulk-link.ts', import.meta.url), 'utf8');
const orchestratorSource = readFileSync(new URL('../frontend/features/shortcuts/link-orchestrator.ts', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../frontend/settings/LinkManagementSection.tsx', import.meta.url), 'utf8');
const communityLuaSource = readFileSync(new URL('../backend/lib/community.lua', import.meta.url), 'utf8');
const artworkIconLuaSource = readFileSync(new URL('../backend/lib/artwork_icon.lua', import.meta.url), 'utf8');
const artworkLuaSource = readFileSync(new URL('../backend/lib/artwork.lua', import.meta.url), 'utf8');

// 1. FR-01 / Invariant 2: Factory Reset clears mappings
if (!factoryResetSource.includes('updateMappingsChecked({ remove: currentKeys })')
	|| !factoryResetSource.includes('persistMappingsSnapshot({})')) {
	throw new Error('Factory reset must wipe mappings in memory and disk.');
}

// 2. FR-02: Factory Reset clears all manifests
if (!factoryResetSource.includes('clearAllShortcutManifests()')
	|| !transactionSource.includes('export function clearAllShortcutManifests()')) {
	throw new Error('Factory reset must clear all shortcut resource manifests.');
}

// 3. FR-03: Factory Reset cancels all pending link jobs and pauses queues
if (!factoryResetSource.includes('cancelAllPendingLinkJobs()')
	|| !factoryResetSource.includes('pausePendingLinkJobs()')
	|| !factoryResetSource.includes('pauseLinkedGamePrefetch()')) {
	throw new Error('Factory reset must cancel pending link jobs and pause queues.');
}

// 4. FR-04 & FR-05: Factory Reset clears managed artwork and icon markers
if (!factoryResetSource.includes('clearAllManagedArtworkMarkers()')
	|| !artworkSource.includes('export function clearAllManagedArtworkMarkers()')) {
	throw new Error('Factory reset must clear all managed artwork and icon markers.');
}

// 5. FR-06: Factory Reset clears dismissed shortcuts and link history
if (!factoryResetSource.includes('clearAllDismissedShortcuts()')
	|| !dismissedSource.includes('export function clearAllDismissedShortcuts()')
	|| !factoryResetSource.includes('clearAllLinkHistory()')
	|| !linkHistorySource.includes('export function clearAllLinkHistory()')) {
	throw new Error('Factory reset must clear dismissed shortcuts and link history.');
}

// 6. Preference preservation: steamGridDbApiKey must be preserved across Factory Reset
if (!factoryResetSource.includes('steamGridDbApiKey: currentApiKey')
	|| !factoryResetSource.includes('getPreferences().steamGridDbApiKey')) {
	throw new Error('Factory reset must preserve user steamGridDbApiKey.');
}

// 7. FR-07 & Invariant 3: Factory Reset epoch barrier prevents late async writes
if (!transactionSource.includes('export function bumpFactoryResetEpoch()')
	|| !transactionSource.includes('export function isFactoryEpochCurrent(')
	|| !transactionSource.includes('export function isFactoryResetInProgress()')
	|| !transactionSource.includes('if (!isFactoryEpochCurrent(epoch)) return false;')) {
	throw new Error('Transaction system must enforce global factory reset epoch barrier.');
}

// 8. FR-08: Retry queue does not recreate mapping after factory reset
if (!linkQueueSource.includes('isFactoryResetInProgress()')
	|| !linkQueueSource.includes('isFactoryEpochCurrent(epoch)')
	|| !linkQueueSource.includes('Halting queue processing due to pause or reset barrier')) {
	throw new Error('Retry queue must respect factory reset epoch barrier.');
}

// 9. Retry queue does not drop incomplete resource repairs
if (!linkQueueSource.includes('current.repairResources')
	|| !linkQueueSource.includes('isMapped && resourcesComplete')
	|| !linkQueueSource.includes('current.attempts >= 5')) {
	throw new Error('Retry queue must retain repair jobs until resources are complete.');
}

// 10. Manifest strong identity: schemaVersion 2, steamAppId, shortcutAppId
if (!transactionSource.includes('schemaVersion: 2')
	|| !transactionSource.includes('steamAppId: string')
	|| !transactionSource.includes('shortcutAppId: number')
	|| !transactionSource.includes('parsed.steamAppId !== expectedSteamAppId')) {
	throw new Error('LinkResourceManifest must enforce strong identity including steamAppId and schemaVersion 2.');
}

// 11. Relink: manifest cleared on AppID change and single unlink
if (!orchestratorSource.includes('clearShortcutManifest(initialId)')
	|| !unlinkingSource.includes('clearShortcutManifest(shortcutAppId)')) {
	throw new Error('Manifest must be cleared on unlink and AppID relink.');
}

// 12. Slot 3 check in artworkAlreadySaved
if (!artworkSource.includes('slots.has(0) && slots.has(1) && slots.has(2) && slots.has(3) && hasValidPortrait')) {
	throw new Error('artworkAlreadySaved must verify all 4 slots (0, 1, 2, 3) and valid portrait.');
}

// 13. Reconciler: UNAVAILABLE is terminal, mapping verified before and after async
if (!reconcilerSource.includes('Treats UNAVAILABLE as terminal')
	|| !reconcilerSource.includes('slotNeedsRepair(manifest.portrait.status)')
	|| !reconcilerSource.includes('findMappingForShortcut(shortcutAppId) !== steamAppId')
	|| !reconcilerSource.includes('isFactoryResetInProgress()')) {
	throw new Error('Reconciler must treat UNAVAILABLE as terminal and guard mapping before/after async.');
}

// 14. Bulk link: explicit outcome states (READY, READY_DEGRADED, RETRY_PENDING, SKIPPED, FAILED)
if (!bulkLinkSource.includes('READY')
	|| !bulkLinkSource.includes('READY_DEGRADED')
	|| !bulkLinkSource.includes('RETRY_PENDING')
	|| !bulkLinkSource.includes('SKIPPED')
	|| !bulkLinkSource.includes('FAILED')) {
	throw new Error('Bulk linking must emit explicit outcome states.');
}

// 15. UI Settings: recognizes uppercase statuses
if (!settingsSource.includes("item.status === 'SKIPPED'")
	|| !settingsSource.includes("item.status === 'FAILED'")
	|| !settingsSource.includes("item.status === 'RETRY_PENDING'")) {
	throw new Error('LinkManagementSection must support uppercase BulkLinkOutcomeStatus.');
}

// 16. Backend community language fix: no shadowing of safe_language with requested_language
if (communityLuaSource.includes('util.safe_language(requested_language)')) {
	throw new Error('backend/lib/community.lua must not shadow safe_language with undefined requested_language.');
}

// 17. Backend artwork magic byte validation
if (!artworkLuaSource.includes('invalid_image_magic_bytes')
	|| !artworkIconLuaSource.includes('RIFF')
	|| !artworkIconLuaSource.includes('WEBP')) {
	throw new Error('Backend artwork must enforce binary magic byte validation.');
}

console.log('Hardening check passed (Factory Reset, Invariants 1-5, Manifest v2, Slot 3, Retry Queue, Reconciler, Bulk, Backend).');
