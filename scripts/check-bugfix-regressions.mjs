import { readFileSync } from 'node:fs';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const remoteDetection = read('backend/lib/shortcut_detection.lua');
const localDetection = read('backend/lib/shortcut_detection_local.lua');
const aliases = read('backend/lib/shortcut_detection_aliases.lua');
const detectionTs = read('frontend/features/shortcuts/detection.ts');
const properties = read('frontend/features/shortcuts/properties.ts');
const propertiesStyle = read('frontend/features/shortcuts/properties-style.ts');
const manualLink = read('frontend/features/shortcuts/manual-link.ts');
const factoryReset = read('frontend/features/shortcuts/factory-reset.ts');
const factoryUi = read('frontend/settings/FactoryResetSection.tsx');
const unlinking = read('frontend/features/shortcuts/unlinking.ts');
const linkQueue = read('frontend/features/shortcuts/link-job-queue.ts');
const artwork = read('frontend/features/library/artwork.ts');
const logoPosition = read('frontend/features/library/artwork-logo-position.ts');
const customizationArtwork = read('frontend/features/shortcuts/customization-artwork.ts');
const achievementProperties = read('frontend/features/shortcuts/achievement-properties.ts');
const achievementSettings = read('backend/lib/achievement_settings.lua');
const achievementsLua = read('backend/lib/achievements.lua');
const runtimeApp = read('frontend/runtime/app.tsx');
const prefetch = read('frontend/features/library/prefetch.ts');
const gameData = read('frontend/core/game-data.ts');
const nativeAddDetector = read('frontend/features/shortcuts/native-add-autodetect.ts');
const newsLua = read('backend/lib/news.lua');
const newsTs = read('frontend/features/library/news.ts');
const heroResolver = read('frontend/features/library/artwork-hero.ts');
const linking = read('frontend/features/shortcuts/linking.ts');
const bulkLink = read('frontend/features/shortcuts/bulk-link.ts');
const bulkPolicy = read('frontend/features/shortcuts/bulk-policy.ts');
const linkManagement = read('frontend/settings/LinkManagementSection.tsx');

let passed = 0;
function assert(condition, message) {
	if (!condition) throw new Error(`BUGFIX regression failed: ${message}`);
	console.log(`  [PASS] ${message}`);
	passed += 1;
}

console.log('Running user-reported bug regression checks...');

// Wukong / tiny-token collision: maintained alias must remain visible while a
// coincidentally exact 1-3 char Store title cannot promote itself to certainty.
assert(aliases.includes('["b1"]') && aliases.includes('"2358720"'), 'b1 maintained alias still resolves Black Myth: Wukong');
assert(detectionTs.includes("DETECTION_MODEL_VERSION = 'v8'"), 'detection model cache bumped to v8');
assert(remoteDetection.includes('DETECTION_MODEL_VERSION = "v8"'), 'backend candidate cache is versioned with v8');
assert(remoteDetection.includes('maintained_alias_exact') && localDetection.includes('maintained_alias_exact'), 'local and remote engines preserve exact maintained-alias evidence');
assert(remoteDetection.includes('short_title_unverified') && remoteDetection.includes('short_executable_unverified'), 'tiny exact titles/executables remain provisional without independent corroboration');
assert(remoteDetection.includes('candidate.alias_primary == true'), 'primary maintained alias is tracked independently from Store title coincidence');

// Manual/property link controls must report actual transactional state, not an
// optimistic mapping written before linkShortcutToSteam has completed.
assert(properties.includes("propertyActionBusy: 'link' | 'unlink' | null"), 'Properties Link/Unlink share an explicit in-flight state');
assert(properties.includes('await linkShortcutToSteam({') && properties.includes('await unlinkShortcutFromSteam({'), 'Properties waits for Link and Unlink operations');
assert(!properties.includes('void updateMappingsChecked({ set:'), 'Properties no longer writes an optimistic mapping before linking');
assert(properties.includes('detectShortcutCandidatesLocal') && properties.includes('enrichShortcutCandidatesRemote'), 'Properties renders local suggestions before remote enrichment');
assert(propertiesStyle.includes('color-scheme: dark') && propertiesStyle.includes('.gdl-native-select option'), 'Properties suggestion dropdown keeps Steam-dark option colors');
assert(properties.includes('candidateForPreview') && properties.includes('linkedPreviewCandidate'), 'Properties preview resolves the exact selected AppID, including the currently linked entry');
assert(properties.includes('previousSelectionStillAvailable') && properties.includes('suggestionUserInteracted && previousSelectionStillAvailable'), 'async candidate enrichment preserves an explicit user dropdown selection');
assert(manualLink.includes('detectShortcutCandidatesLocal') && manualLink.includes('enrichShortcutCandidatesRemote'), 'Manual review modal also uses progressive local + remote suggestions');

// Factory reset and bulk unlink must be bounded. A stale bridge/network promise
// is invalidated by the reset epoch and may unwind later without pinning the UI.
assert(linkQueue.includes('pausePendingLinkJobs(waitBudgetMs = 1800)'), 'pending job pause has a bounded wait budget');
assert(factoryReset.includes('withFactoryResetBudget') && factoryReset.includes("'unlink all shortcuts'"), 'Factory Reset has bounded subsystem budgets');
assert(factoryReset.includes('unlinkAllShortcutsFromSteam(options.doc, true)'), 'Factory Reset avoids a nested queue-pause ownership leak');
assert(unlinking.includes('queuesAlreadyPaused = false'), 'bulk unlink can reuse an existing reset pause barrier');
assert(factoryUi.includes("error: 'reset_timeout'") && factoryUi.includes('22_000'), 'Factory Reset UI has a final watchdog');

// Artwork: official Steam metadata must not be replaced by SteamGridDB merely
// because CEF could not read the official URL; backend grid download gets first chance.
assert(artwork.includes("const ART_STORAGE_PREFIX = 'gdl_artwork18_';") && artwork.includes("'gdl_artwork17_'"), 'artwork policy marker bumped and prior marker retained for invalidation');
assert(artwork.includes('isAuthoritativeSteamMetadataUrl'), 'automatic artwork distinguishes authoritative Steam metadata from synthesized probes');
assert(artwork.includes('if (!item.dataUrl && isAuthoritativeSteamMetadataUrl(item.url, item.imageType)) return false;'), 'CEF failure alone cannot replace official Steam metadata artwork with community art');
assert(artwork.includes('const backendCandidates = Array.from(new Set([url, ...fallbackUrls].filter(Boolean)))'), 'backend grid fallback preserves provider priority and tries subsequent candidates');
assert(artwork.includes('heroPolicyVersion: 2'), 'new Hero provenance policy invalidates stale fallback decisions');


// Logo placement is applied once and then left to the user. MKK has a curated
// centered first position, while later Steam-native manual adjustments persist.
assert(logoPosition.includes("const STORAGE_PREFIX = 'gdl_logo_position4_';"), 'logo position marker bumped to v4');
assert(logoPosition.includes("MKK_POSITION: SteamLogoPosition = { pinnedPosition: 'CenterCenter'"), 'Mortal Kombat Komplete Edition starts with a centered logo');
assert(logoPosition.includes('markSaved(shortcutAppId, steamAppId, position, source);'), 'accepted logo position is settled even when readback is unavailable');

// Steam Personalización becomes authoritative after the user touches a native
// artwork control, preventing navigation/reconciliation from repainting it.
assert(artwork.includes("NATIVE_ARTWORK_OVERRIDE_PREFIX = 'gdl_native_artwork_override1_'"), 'native Steam artwork ownership is persisted per shortcut');
assert(artwork.includes('nativeArtworkCustomizationActive(shortcutAppId, steamAppId)'), 'automatic artwork respects Steam-native user ownership');
assert(customizationArtwork.includes('markNativeArtworkCustomization(shortcutId, steamAppId)'), 'native Personalización button clicks transfer artwork ownership to the user');
assert(customizationArtwork.includes('applyNativeArtworkChoice') && customizationArtwork.includes('readLocalArtworkImageBackend'), 'native Steam Change artwork uses a reliable local-file bridge for linked shortcuts');
assert(customizationArtwork.includes('saveShortcutArtworkBackend') && customizationArtwork.includes('stopImmediatePropagation'), 'native Change falls back to grid persistence without opening duplicate file dialogs');
assert(artwork.includes('prioritySources') && artwork.includes('secondarySources') && artwork.includes('priority_ready'), 'Hero/Logo/Portrait are applied before secondary artwork');
assert(linking.includes('Prioritize the visible identity artwork') && !linking.includes('const [artworkResult, iconResult] = await Promise.all(['), 'foreground linking waits for critical artwork before starting icon work');
assert(bulkLink.includes('Critical artwork gets the worker/network budget first'), 'bulk linking gives artwork priority over shortcut icon work');

// Factory Reset and clean installs must show 0 simulated achievements without
// stale in-memory settings resurrecting a previous slider value.
assert(achievementProperties.includes('clearShortcutAchievementSettingsCaches'), 'achievement Properties exposes an in-memory cache reset');
assert(factoryReset.includes('clearShortcutAchievementSettingsCaches()') && factoryReset.includes('clearLocalAchievementCache(true)'), 'Factory Reset clears both settings and rendered achievement caches');
assert(!achievementSettings.includes('simulate_percent = 25') && !achievementSettings.includes('or 25'), 'backend achievement settings default simulation to zero');
assert(!achievementsLua.includes('simulate_percent = 25') && !achievementsLua.includes('or 25'), 'achievement renderer defaults simulation to zero');
assert(achievementProperties.includes('simulate_percent: 0') && !achievementProperties.includes('offlineAchievementsCount * 0.25'), 'Properties slider initializes simulated progress at zero');

// Manual link UX has one status surface, never shows a final no-match warning
// while enrichment is still running, and updates queued completion by event.
assert(manualLink.includes('let enrichmentComplete = !loading'), 'manual link distinguishes searching from a final no-match result');
assert(manualLink.includes("enrichmentComplete ? 'warning' : 'active'"), 'searching state cannot render as a warning');
assert(!manualLink.includes('gdl-manual-link-result'), 'link result duplication removed; one status box remains');
assert(manualLink.includes('PENDING_LINK_JOBS_CHANGED_EVENT') && !manualLink.includes('setInterval(refreshQueuedState'), 'background link status updates from queue events instead of one-second polling');
assert(manualLink.includes("'2 · Prepare'") && manualLink.includes("'3 · Finish'"), 'link progress labels are simplified without duplicating Ready');
assert(manualLink.includes("gdlText('link_status_preparing', 'Preparing game…')") && manualLink.includes("gdlText('link_status_applying_resources', 'Applying resources…')"), 'active link status uses action text instead of repeating progress labels');

// Startup failures in optional subsystems cannot abort the plugin descriptor,
// and idle/background work is capped to reduce CEF CPU/memory growth.
assert(runtimeApp.includes('function safeStartup(') && runtimeApp.includes("safeStartup('native add detector'"), 'non-critical startup services are guarded independently');
assert(!runtimeApp.includes('steamComponents.prewarmComponents()'), 'Steam component prewarm no longer retains modules eagerly');
assert(!runtimeApp.includes('sweepCopiedFeedbackTooltips(popupDoc);\n\t\t}, 500)'), '500ms full-document tooltip sweep removed');
assert(nativeAddDetector.includes('}, 2000);'), 'native-add safety polling reduced to a low-frequency fallback');
assert(prefetch.includes('MAX_PREFETCH_APP_IDS = 6'), 'background linked-game prefetch is bounded');
assert(gameData.includes('MAX_GAME_DATA_CACHE_KEYS = 64'), 'in-memory game-data cache is bounded more tightly');


// Removed/delisted artwork must not pay for a long chain of speculative Steam
// CDN 404s before using a SteamGridDB recommendation that is already available.
assert(artwork.includes('legacy ? 2500 : 12000'), 'known legacy titles use a short Steam metadata wait budget');
assert(artwork.includes('legacyCommunityFirst') && artwork.includes('communityAroundProbes'), 'legacy artwork places resolved community assets before speculative CDN probes');
assert(heroResolver.includes('preferCommunityBeforeDirectProbes'), 'Hero resolver has a retired-title fast path without weakening active-game Base-first policy');

// Historical news: a single surviving announcement is not treated as a complete
// feed. English broad feeds + Steam Community archive are tried before giving up.
assert(newsLua.includes('TARGET_NEWS_ITEMS = 5') && newsLua.includes('fetch_news_json(appid, lang, false)'), 'sparse news automatically broadens beyond community-announcements feed');
assert(newsLua.includes('fetch_store_oldnews_archive') && newsLua.includes('/oldnews/?headlines=0&appids='), 'every sparse AppID can use Steam oldnews archival recovery');
assert(newsLua.includes('fetch_news_appinfo_context') && newsLua.includes('extended.listofdlc') && newsLua.includes('depot.dlcappid'), 'related DLC/news AppIDs are discovered generically from Steam AppInfo');
assert(newsLua.includes('related_appid') && newsLua.includes('Related content'), 'related official Steam items keep provenance instead of masquerading as base-AppID posts');
assert(!newsLua.includes('221445') && !newsLua.includes('221430'), 'historical news enrichment has no PES-specific AppID hardcode');
assert(newsLua.includes('fetch_community_rss') && newsLua.includes('/rss/'), 'English historical fallback checks Steam Community RSS');
assert(newsLua.includes('fetch_community_allnews') && newsLua.includes('/allnews/?l=english'), 'English historical fallback checks Steam Community all-news archive');
assert(newsLua.includes('ajaxgetadjacentpartnerevents') && newsLua.includes('event_type_filter') && newsLua.includes('12,13,14,15,28,29,30,32'), 'sparse feeds query Steam partner-event history and prioritize update/release/news event types');
assert(newsLua.includes('historical_archive_anchors') && newsLua.includes('&enddate='), 'oldnews fallback rewinds the archive around the game release period instead of only querying the current year');
assert(newsLua.includes('[NGL][News]') && newsLua.includes('items=%d source=%s'), 'news resolution logs final source and item count for runtime diagnosis');
assert(newsTs.includes('events16_removed') && newsTs.includes('events16_standard'), 'news cache separates removed-game enrichment from standard active-game feeds');
assert(newsTs.includes('SPARSE_NEWS_MIN_ITEMS = 3'), '0–2 news cards remain a non-terminal sparse snapshot and are retried');
assert(newsLua.includes('fetch_relevant_community_history'), 'sparse legacy feeds can enrich from real Steam Community history');
assert(newsLua.includes('Steam Community · Guide') && newsLua.includes('Steam Community · Discussion'), 'hybrid activity preserves truthful guide/discussion labels');
assert(newsLua.includes('steam_hybrid_historical_activity'), 'hybrid activity source is recorded for diagnostics');
assert(newsTs.includes('historicalNewsMode') && newsTs.includes('is_delisted === true') && newsTs.includes('fetchHistoricalNewsBackend'), 'historical enrichment is selected only for removed/delisted game metadata');
assert(newsLua.includes('function M.fetch_news_historical') && newsLua.includes('historical_enrichment = true'), 'backend exposes historical enrichment as a separate removed-game endpoint');
assert(newsLua.includes('historical_enrichment = false') && newsLua.includes('if #news == 0 then'), 'active Store games keep the original official-news fallback policy');
assert(newsLua.includes('local items, unavailable, transient_error = scrape_partner_events(appid, lang, 50)'), 'normal Partner Events path remains the native Steam News Hub scraper');
assert(!newsLua.includes('appid == "221430"') && !newsLua.includes("appid == '221430'"), 'hybrid news resolver is not hardcoded to PES 2013');

// Foreground link intent is persisted before Steam identity/resources mutate. Closing
// only the modal leaves the Promise running; terminating Steam promotes a staged
// intent into the normal retry queue on the next CEF session.
assert(linkQueue.includes("status: 'staged' | 'queued' | 'running' | 'failed'") && linkQueue.includes('SESSION_ID'), 'durable link queue distinguishes same-session staged intents from resumable queued jobs');
assert(linkQueue.includes('stageLinkJobForRecovery') && linkQueue.includes("sameSessionStage ? 'staged' : 'queued'"), 'interrupted staged links are promoted to queued on the next Steam session');
assert(manualLink.includes('stageLinkJobForRecovery({'), 'manual linking stages recovery before starting the foreground transaction');
assert(properties.includes('stageLinkJobForRecovery({'), 'Properties linking stages recovery before starting the foreground transaction');
assert(bulkLink.includes('stageLinkJobForRecovery({'), 'bulk linking stages each selected target before its identity mutation');


// Bulk linking must not produce weaker decisions than the manual modal merely
// because several remote validations ran at once. First-pass skips get one
// fresh low-concurrency review and the UI preserves the actual policy reason.
assert(bulkLink.includes('const BULK_ANALYSIS_CONCURRENCY = 2') && bulkLink.includes('const BULK_REVIEW_CONCURRENCY = 1'), 'bulk detector limits remote concurrency before identity validation');
assert(bulkLink.includes('Stage 1.5: Fresh low-concurrency review') && bulkLink.includes('detectShortcutCandidatesLocal(item.context)') && bulkLink.includes('enrichShortcutCandidatesRemote(item.context'), 'bulk first-pass skips receive a fresh manual-equivalent validation pass');
assert(bulkLink.includes('decisionReason = decision.reason') && linkManagement.includes("case 'ambiguous_close_runner_up':") && linkManagement.includes("case 'insufficient_confidence':"), 'bulk report preserves the real skip reason instead of labeling every skip ambiguous');
assert(remoteDetection.includes('maintained_alias_unique') && localDetection.includes('maintained_alias_unique'), 'single-AppID maintained aliases carry explicit uniqueness evidence');
assert(bulkPolicy.includes('BULK_TOP_SCORE_THRESHOLD = 58'), 'bulk max-recall threshold is explicitly 58 percent');
assert(bulkPolicy.includes("reason: 'top_score_threshold'"), 'bulk chooses the highest eligible candidate once it reaches the threshold');
assert(!bulkPolicy.includes('unresolved_identity_collision') && !bulkPolicy.includes('alias_requires_confirmation'), 'bulk no longer requires extra identity/collision corroboration above the requested score floor');
assert(remoteDetection.includes('maintained_alias_auto') && localDetection.includes('maintained_alias_auto'), 'curated auto_appid aliases carry explicit bulk recovery provenance');
assert(bulkLink.includes('Stage 1.75: final SERIAL rescue') && bulkLink.includes('attempt < 3') && detectionTs.includes('recoveryMode = false') && detectionTs.includes('recovery_mode: recoveryMode'), 'bulk unresolved titles receive an isolated aggressive serial recovery pass');
console.log(`All ${passed} user-reported bug regression checks passed.`);
