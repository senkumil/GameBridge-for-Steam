import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const frontendRoot = path.join(root, 'frontend');
const backendRoot = path.join(root, 'backend');
const failures = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function fail(file, message) {
  failures.push(`${rel(file)}: ${message}`);
}

function parseRelativeImports(source) {
  const result = [];
  const pattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[1].startsWith('.')) result.push(match[1]);
  }
  return result;
}

async function resolveImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  for (const candidate of [
    `${base}.ts`, `${base}.tsx`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return path.normalize(candidate);
    } catch {}
  }
  return null;
}

function frontendLayer(file) {
  const relative = rel(file);
  if (relative.startsWith('frontend/runtime/')) return 'runtime';
  if (relative.startsWith('frontend/settings/')) return 'settings';
  if (relative.startsWith('frontend/features/')) return 'features';
  if (relative.startsWith('frontend/steam/')) return 'steam';
  if (relative.startsWith('frontend/core/')) return 'core';
  if (relative.startsWith('frontend/api/')) return 'api';
  if (relative.startsWith('frontend/domain/')) return 'domain';
  if (relative === 'frontend/index.tsx' || relative === 'frontend/index.ts') return 'entry';
  return 'other';
}

const sourceFiles = (await walk(frontendRoot)).filter(file => /\.tsx?$/.test(file)).map(path.normalize);
const sourceSet = new Set(sourceFiles);
const importGraph = new Map(sourceFiles.map(file => [file, []]));

for (const file of sourceFiles) {
  const source = await fs.readFile(file, 'utf8');
  const relative = rel(file);

  if (/<[^>\n]*\bon(?:click|error|load|mouseenter|mouseleave|mouseover|mouseout)\s*=/i.test(source)) {
    fail(file, 'inline DOM event handler detected; use delegated listeners or addEventListener');
  }
  if (/\.millennium\/Dist|\.millennium\\Dist/i.test(source)) {
    fail(file, 'source must not import or depend on generated .millennium/Dist output');
  }
  if (/\bcallable\s*(?:<|\()/m.test(source) && relative !== 'frontend/api/backend.ts') {
    fail(file, 'Millennium callable(...) handles belong only in frontend/api/backend.ts');
  }
  if (/\bsenkumil\b/i.test(source)) {
    fail(file, 'developer/test username leaked into production source');
  }
  if (relative === 'frontend/features/library/runtime.ts'
      && /\b(?:spoofArtwork|applyOfficialShortcutIcon|SetCustomArtworkForApp|SetShortcutIcon)\b/.test(source)) {
    fail(file, 'library navigation runtime must be read-only for artwork/icon state; visual writes belong only to explicit link/unlink workflows');
  }

  const lineCount = source.split(/\r?\n/).length;
  if (/frontend\/features\/[^/]+\/runtime\.tsx?$/.test(relative) && lineCount > 500) {
    fail(file, `feature runtime is ${lineCount} lines; keep orchestration runtimes at or below 500 lines`);
  }
  if (relative === 'frontend/runtime/app.tsx' && lineCount > 500) {
    fail(file, `application composition root is ${lineCount} lines; keep it at or below 500 lines`);
  }
  if (lineCount > 900) {
    fail(file, `module is ${lineCount} lines; split modules larger than 900 lines`);
  }

  for (const specifier of parseRelativeImports(source)) {
    const target = await resolveImport(file, specifier);
    if (!target || !sourceSet.has(target)) continue;
    importGraph.get(file).push(target);

    const sourceLayer = frontendLayer(file);
    const targetLayer = frontendLayer(target);
    if (sourceLayer !== 'runtime' && sourceLayer !== 'entry' && targetLayer === 'runtime') {
      fail(file, `dependency inversion: ${sourceLayer} code must not import runtime composition (${rel(target)})`);
    }
    if (sourceLayer === 'domain' && targetLayer !== 'domain') {
      fail(file, `domain contracts must not depend on ${targetLayer} (${rel(target)})`);
    }
    if (sourceLayer === 'steam' && targetLayer === 'features') {
      fail(file, `Steam anti-corruption layer must not depend on feature UI (${rel(target)})`);
    }
    if ((sourceLayer === 'core' || sourceLayer === 'api') && targetLayer === 'features') {
      fail(file, `${sourceLayer} infrastructure must not depend on feature UI (${rel(target)})`);
    }
  }
}

// Cycles make Steam-private adapters and feature surfaces difficult to replace
// independently. Keep the frontend graph acyclic so refactors stay local.
const visitState = new Map();
const stack = [];
const reportedCycles = new Set();
function visit(file) {
  visitState.set(file, 1);
  stack.push(file);
  for (const target of importGraph.get(file) || []) {
    if (visitState.get(target) === 1) {
      const start = stack.indexOf(target);
      const cycle = [...stack.slice(start), target].map(rel);
      const key = cycle.join(' -> ');
      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        failures.push(`frontend import cycle: ${key}`);
      }
      continue;
    }
    if (!visitState.has(target)) visit(target);
  }
  stack.pop();
  visitState.set(file, 2);
}
for (const file of sourceFiles) if (!visitState.has(file)) visit(file);

const backendMain = path.join(root, 'backend', 'main.lua');
try {
  const lineCount = (await fs.readFile(backendMain, 'utf8')).split(/\r?\n/).length;
  if (lineCount > 250) fail(backendMain, `IPC facade is ${lineCount} lines; backend/main.lua should remain a thin facade`);
} catch (error) {
  failures.push(`backend/main.lua: unable to read (${String(error)})`);
}

// Every backend module follows the same maintenance ceiling as frontend code.
// This prevents a new monolith from bypassing the architecture check merely
// because it is unrelated to achievements.
const backendLuaFiles = (await walk(backendRoot)).filter(file => /\.lua$/.test(file));
for (const file of backendLuaFiles) {
  const source = await fs.readFile(file, 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  if (lineCount > 900) fail(file, `module is ${lineCount} lines; split modules larger than 900 lines`);
}

const achievementService = path.join(frontendRoot, 'features', 'achievements', 'service.ts');
const achievementBackend = path.join(backendRoot, 'lib', 'achievements.lua');
const achievementSettings = path.join(backendRoot, 'lib', 'achievement_settings.lua');
const achievementSources = path.join(backendRoot, 'lib', 'achievement_sources.lua');
const achievementProperties = path.join(frontendRoot, 'features', 'shortcuts', 'achievement-properties.ts');
const achievementNotifications = path.join(frontendRoot, 'features', 'achievements', 'notifications.ts');
const achievementLaunchWatcher = path.join(frontendRoot, 'features', 'achievements', 'launch-watcher.ts');
const achievementLifecycle = path.join(frontendRoot, 'features', 'achievements', 'lifecycle.ts');
const achievementSidebar = path.join(frontendRoot, 'features', 'achievements', 'sidebar.ts');
const achievementCache = path.join(frontendRoot, 'features', 'achievements', 'cache.ts');
const globalSettingsContent = path.join(frontendRoot, 'settings', 'SettingsContent.tsx');
const autoPromptPolicy = path.join(frontendRoot, 'features', 'shortcuts', 'auto-prompt-policy.ts');
const newsBackend = path.join(backendRoot, 'lib', 'news.lua');
const newsFrontend = path.join(frontendRoot, 'features', 'library', 'news.ts');
const shortcutLinking = path.join(frontendRoot, 'features', 'shortcuts', 'linking.ts');
const nativeDom = path.join(frontendRoot, 'steam', 'native-dom.ts');
const infoPanel = path.join(frontendRoot, 'features', 'library', 'info-panel.ts');
const libraryArtwork = path.join(frontendRoot, 'features', 'library', 'artwork.ts');
const bigPictureRuntime = path.join(frontendRoot, 'features', 'big-picture', 'runtime.ts');
const playtimeService = path.join(frontendRoot, 'features', 'playtime', 'service.ts');
const desktopLibraryPlaytime = path.join(frontendRoot, 'features', 'playtime', 'library-home.ts');
const desktopLibraryPlaytimeDom = path.join(frontendRoot, 'features', 'playtime', 'library-home-dom.ts');
const frontendRuntimeApp = path.join(frontendRoot, 'runtime', 'app.tsx');
const playtimeBackend = path.join(backendRoot, 'lib', 'playtime.lua');
const playtimeTracker = path.join(frontendRoot, 'features', 'playtime', 'tracker.ts');
const linkedLoadingStage = path.join(frontendRoot, 'features', 'library', 'loading-stage.ts');
const shortcutNotice = path.join(frontendRoot, 'features', 'library', 'notice.ts');
try {
	const [service, backend, settings, sources, properties, notifications, launchWatcher, lifecycle, sidebar, achievementCacheSource, globalSettings, promptPolicy, backendNews, frontendNews, linking, nativeDomSource, infoPanelSource, libraryArtworkSource, bigPictureSource, playtimeServiceSource, desktopLibraryPlaytimeSource, desktopLibraryPlaytimeDomSource, runtimeAppSource, playtimeBackendSource, playtimeTrackerSource, loadingStageSource, shortcutNoticeSource] = await Promise.all([
    fs.readFile(achievementService, 'utf8'),
    fs.readFile(achievementBackend, 'utf8'),
    fs.readFile(achievementSettings, 'utf8'),
    fs.readFile(achievementSources, 'utf8'),
    fs.readFile(achievementProperties, 'utf8'),
    fs.readFile(achievementNotifications, 'utf8'),
    fs.readFile(achievementLaunchWatcher, 'utf8'),
    fs.readFile(achievementLifecycle, 'utf8'),
    fs.readFile(achievementSidebar, 'utf8'),
    fs.readFile(achievementCache, 'utf8'),
    fs.readFile(globalSettingsContent, 'utf8'),
    fs.readFile(autoPromptPolicy, 'utf8'),
    fs.readFile(newsBackend, 'utf8'),
    fs.readFile(newsFrontend, 'utf8'),
		fs.readFile(shortcutLinking, 'utf8'),
		fs.readFile(nativeDom, 'utf8'),
		fs.readFile(infoPanel, 'utf8'),
		fs.readFile(libraryArtwork, 'utf8'),
		fs.readFile(bigPictureRuntime, 'utf8'),
		fs.readFile(playtimeService, 'utf8'),
		fs.readFile(desktopLibraryPlaytime, 'utf8'),
		fs.readFile(desktopLibraryPlaytimeDom, 'utf8'),
		fs.readFile(frontendRuntimeApp, 'utf8'),
		fs.readFile(playtimeBackend, 'utf8'),
		fs.readFile(playtimeTracker, 'utf8'),
		fs.readFile(linkedLoadingStage, 'utf8'),
		fs.readFile(shortcutNotice, 'utf8'),
	]);
  if (/syntheticAchievementItems|steam-schema/i.test(service)) {
    fail(achievementService, 'achievement requests must keep the stable backend metadata/icon route; frontend synthetic schema fallbacks are forbidden');
  }
  if (!backend.includes('icon = item.icon') || !backend.includes('icon_gray = item.icon_gray')) {
    fail(achievementBackend, 'simulated progress must preserve the real metadata icon fields');
  }
  if (!backend.includes('policy.is_online')) {
    fail(achievementBackend, 'online-only achievement policy is not applied');
  }
  if ((backend.match(/if not zero_progress and not allow_simulated then/g) || []).length < 2) {
    fail(achievementBackend, 'simulated progress must ignore both explicit and automatic JSON state sources without deleting them');
  }
	if (backend.includes('if not state and not allow_simulated and not unlock_online and not zero_progress then')
		|| !backend.includes('state_source = zero_progress and "zero_progress_override" or "metadata_only"')) {
		fail(achievementBackend, 'disabling online-only unlock without a JSON file must return an explicit 0/N metadata view instead of leaving stale progress mounted');
	}
  if (!backend.includes('zero_progress_override') || !backend.includes('not zero_progress')) {
    fail(achievementBackend, 'the per-game zero-progress override must bypass local state while preserving the metadata-only response');
  }
  if (!settings.includes('add("shortcut:"') || !settings.includes('add("appid:"')) {
    fail(achievementSettings, 'per-game achievement settings must be keyed by both shortcut ID and official Steam AppID');
  }
  if (/record\s+and\s+record\.(?:simulate|unlock_all)\s+or/.test(settings)) {
    fail(achievementSettings, 'explicit false per-game settings must not fall through to true global defaults');
  }
	if (!settings.includes('resolved.unlock_online = record.unlock_online == true')
		|| settings.includes('defaults.unlock_online == true or record.unlock_online == true')) {
		fail(achievementSettings, 'the global online-achievement switch must be an inheritable default that an explicit per-game false can override');
  }
  if (!settings.includes('write_json_atomic') || !settings.includes('write_text_atomic')) {
    fail(achievementSettings, 'achievement settings must use atomic persistence helpers');
  }
  if (!backend.includes('sources.find_matching_root_candidates')
      || !sources.includes('exact_progress_schema')
      || !sources.includes('fs.last_write_time(path)')
      || !sources.includes('historical_schema_match:')) {
    fail(achievementSources, 'historical Shortcut AppID progress must require an exact schema match and select by JSON modification time');
  }
  if (/io\.open\([^\n]+,[^\n]+["'](?:w|a)|fs\.(?:rename|remove)|os\.remove/.test(sources)) {
    fail(achievementSources, 'historical achievement source discovery must remain read-only');
  }
  if (!/role="switch"/.test(properties) || !/aria-checked/.test(properties)) {
    fail(achievementProperties, 'per-game achievement toggles must expose accessible switch semantics');
  }
  if (!service.includes('requestGeneration += 1')
      || !service.includes('generation === requestGeneration')
      || !lifecycle.includes('Targeted achievement refresh error')
		|| !lifecycle.includes('ACHIEVEMENT_REFRESH_STORAGE_KEY')
		|| !lifecycle.includes("window.addEventListener('storage'")
      || !properties.includes('refreshCurrentGame()')) {
    fail(achievementService, 'achievement policy changes must suppress stale responses and hot-refresh the edited game across Steam CEF windows');
  }
  if (!/role="switch"/.test(globalSettings) || !globalSettings.includes('current.current.onChange(next)')
      || !globalSettings.includes("addEventListener('pointerdown'")
      || !globalSettings.includes("addEventListener('keydown'")) {
    fail(globalSettingsContent, 'global settings toggles must use a controlled accessible switch independent of Steam Toggle internals');
  }
  if (!globalSettings.includes("paddingBottom: '64px'")) {
    fail(globalSettingsContent, 'the final global settings controls must remain above Steam window resize hit-testing');
  }
  if (globalSettings.includes('preferences.simulateUnlockAll')) {
    fail(globalSettingsContent, 'full simulated completion must remain a per-game option and must not be exposed globally');
  }
  if (!globalSettings.includes('suppressedAutoSuggestions.map')
      || !promptPolicy.includes('getNativeAddAutoPromptSuppressions')) {
    fail(autoPromptPolicy, 'permanently suppressed automatic suggestions must expose auditable game names instead of only a count');
  }
  if (!settings.includes('zero_progress') || !properties.includes('gdl-game-achievement-zero')) {
    fail(achievementProperties, 'the per-game zero-progress override must be persisted and exposed in shortcut Properties');
  }
	if (!backend.includes('get_game_achievement_capabilities') || !backend.includes('has_online = online_count > 0')
		|| !properties.includes("onlineRow.style.display = hasOnlineAchievements ? 'flex' : 'none'")
		|| !properties.includes('if (hasOnlineAchievements)')) {
		fail(achievementProperties, 'the per-game online-only toggle must remain interactive for capable games even while the global default is enabled');
  }
  if (!notifications.includes('FIRST_LAUNCH_REPLAY_PREFIX') || !notifications.includes('enqueueFirstLaunchAchievementToasts')) {
    fail(achievementNotifications, 'first-launch achievement replay must have its own persistent marker, independent from navigation baselines');
  }
  if (!notifications.includes('STEAM_ACHIEVEMENT_TOAST_DURATION_MS = 5000')
			|| !notifications.includes('STEAM_ACHIEVEMENT_TOAST_GAP_MS = 5000')) {
		fail(achievementNotifications, 'achievement notifications must use the requested five-second duration and cadence');
	}
	if (!notifications.includes('applyNativeAchievementToastPresentation(')
			|| !notifications.includes('NATIVE_ACHIEVEMENT_TOAST_CARD_CLASS')
			|| !notifications.includes('comparableImageUrl(source, doc) === expectedImage')) {
		fail(achievementNotifications, 'native achievement notifications must be enlarged by matching their real icon, without affecting other Steam toast types');
	}
  if (!notifications.includes('localAchievementToastProcessing')
      || !notifications.includes('await showAchievementToast(next.appid, next.achievement')) {
    fail(achievementNotifications, 'achievement notifications must drain serially and wait for asynchronous toast preparation to prevent bursts');
  }
  if (!notifications.includes('cancelQueuedAchievementToastsForShortcut')
      || !notifications.includes("cancelAllQueuedAchievementToasts('game overlay closed')")
      || !launchWatcher.includes('cancelQueuedAchievementToastsForShortcut(shortcutAppId)')) {
    fail(achievementNotifications, 'closing a game must cancel its queued, pending and visible replay notifications');
  }
  if (!notifications.includes('data.unlock_online === true && achievement.is_online === true')
      || !backend.includes('missing_online_names')) {
    fail(achievementNotifications, 'launch replay must include enabled online achievements even when an older progress file omitted their state entries');
  }
  if (!notifications.includes('ACHIEVEMENT_REPLAY_PREFERENCES_EVENT')
      || !notifications.includes('setNextLaunchAchievementReplayEnabled(')
      || !properties.includes('subscribeAchievementReplayPreferences(syncReplayPreferences)')) {
    fail(achievementNotifications, 'consuming a one-shot achievement replay must turn off an open per-game switch immediately');
  }
  if (!notifications.includes('EVERY_LAUNCH_REPLAY_PREFIX')
      || properties.includes('gdl-game-achievement-replay-next')
      || !properties.includes('gdl-game-achievement-replay-every')) {
    fail(achievementProperties, 'only the persistent every-launch replay control should remain visible; first-launch replay is automatic');
  }
  if (!notifications.includes('if (data.zero_progress === true) return 0')) {
    fail(achievementNotifications, 'zero-progress mode must not consume a pending replay of real achievement progress');
  }
  if (!launchWatcher.includes('SteamUIStore?.RunningApps') || !launchWatcher.includes('SHORTCUT_THRESHOLD')
      || !launchWatcher.includes('enqueueFirstLaunchAchievementToasts')) {
    fail(achievementLaunchWatcher, 'first-launch replay must be gated by a genuinely running non-Steam shortcut');
  }
  if (!launchWatcher.includes('latestNativeAchievementToastWindowRegistration(')
      || !launchWatcher.includes('FALLBACK_GAME_READY_DELAY_MS')
      || !launchWatcher.includes('OVERLAY_SETTLE_DELAY_MS')) {
    fail(achievementLaunchWatcher, 'RunningApps alone is too early; first-launch replay must wait for a settled overlay or a stable-running fallback');
  }
  if (!launchWatcher.includes('const sessionKey = settledOverlay ? `overlay:${overlayRegistration}`')
      || !launchWatcher.includes('completedSessions.get(shortcutAppId) !== sessionKey')) {
    fail(achievementLaunchWatcher, 'every-launch replay must identify a new overlay session even when a rapid restart hides the stopped RunningApps state');
  }
  if (!launchWatcher.includes('enqueueFirstLaunchAchievementToasts(data, shortcutAppId)')
      || !notifications.includes('replayStateAppId?: string | number')) {
    fail(achievementLaunchWatcher, 'replay preferences must use the launched shortcut identity rather than the progress-file source AppID');
  }
	if (!launchWatcher.includes('enqueueLocalAchievementToasts(data, shortcutAppId, Math.floor(firstSeenAt / 1000))')
		|| !launchWatcher.includes('POLL_INTERVAL_MS = 2000')
      || !launchWatcher.includes('data.simulation_enabled !== true')
      || lifecycle.includes('enqueueLocalAchievementToasts')) {
    fail(achievementLaunchWatcher, 'live JSON achievement notifications must be polled by the running-game watcher every two seconds, independent of Library visibility');
  }
	if (!notifications.includes('!baseline!.earned.has(String(achievement.name))')) {
		fail(achievementNotifications, 'live JSON transitions must not be suppressed by unreliable emulator timestamps');
	}
	if (!notifications.includes('localAchievementSessionToastedNames')
		|| !notifications.includes('earnedAt >= sessionStart - 5')
		|| !notifications.includes('earnedAt <= now + 300')) {
		fail(achievementNotifications, 'an achievement present in the first emulator JSON snapshot must be recovered once when its unlock time belongs to the current running session');
	}
  if (!notifications.includes('localAchievementToastQueue.unshift(...unlocked.map')) {
    fail(achievementNotifications, 'genuine in-game unlocks must take priority over remaining replay notifications');
  }
  if (!sidebar.includes('earned.length <= 2') || !sidebar.includes('renderFeaturedAchievementHtml')) {
    fail(achievementSidebar, 'one remaining earned achievement must render as a described feature instead of a detached icon row');
  }
	if (!achievementCacheSource.includes('LOCAL_ACHIEVEMENT_SNAPSHOT_STORAGE_KEY')
		|| !achievementCacheSource.includes('localAchievementDataSignature')
		|| !sidebar.includes('data-gdl-achievement-signature')
		|| !lifecycle.includes("clearLocalAchievementCache(false)")) {
		fail(achievementCache, 'achievement progress must paint from a persistent snapshot and retain identical DOM while the backend revalidates it');
	}
  if (!backendNews.includes('partner_events_unavailable') || backendNews.includes('Partner events parse failed')) {
    fail(newsBackend, 'retired AppIDs must be treated as cached no-content, without repeated partner-event parse warnings');
  }
  if (!frontendNews.includes('partnerEventsUnavailable') || !frontendNews.includes('cacheSet(cacheKey, merged)')) {
    fail(newsFrontend, 'retired-AppID news results must be cached as an expected empty state');
  }
  if (!linking.includes('SetShortcutName') || !linking.includes('resolveShortcutIdAfterRename')) {
    fail(shortcutLinking, 'linking must apply the official shortcut name and resolve Steam\'s post-rename AppID before committing mappings');
  }
  if (/const\s+nameApplied\s*=\s*false[\s\S]{0,500}const\s+nameReady\s*=\s*true/.test(linking)) {
    fail(shortcutLinking, 'linking must not report the official name ready when no rename was applied');
  }
	if (/if \(initialId\) \{[\s\S]{0,220}\bcontinue;/.test(linking)) {
		fail(shortcutLinking, 'a stale pre-rename Shortcut AppID must fall through to title/executable identity recovery');
	}
	if (nativeDomSource.includes('menus[menus.length - 1]')
		|| !nativeDomSource.includes(".SVGIcon_Information, svg[class*=\"Information\"]")) {
		fail(nativeDom, 'the game-information button blueprint must be identified semantically, never by play-bar position');
	}
	if (!infoPanelSource.includes('normalizeInformationButtonIcon(button')
		|| !infoPanelSource.includes('existing.outerHTML = informationSvg()')) {
		fail(infoPanel, 'the linked-game information button must normalize captured native SVG markup to the information icon');
	}
	if (!infoPanelSource.includes("expandedNativeGameInfoKeys.delete(panel.dataset.gameKey || '')")
		|| !infoPanelSource.includes('removeNativeInfoPanel(doc, panel.dataset.gameKey === model.key)')) {
		fail(infoPanel, 'linked-game information expansion may survive a same-route metadata rebuild, but must reset when leaving the game');
	}
	const portraitSourceBlock = libraryArtworkSource.match(/urls:\s*\[\s*modern\?\.portrait[\s\S]*?\]\s*,\s*imageType:\s*0/)?.[0] || '';
	if (!portraitSourceBlock) {
		fail(libraryArtwork, 'the portrait grid source policy could not be located');
	}
	if (portraitSourceBlock.includes('modern?.wide') || /\/header\.jpg/.test(portraitSourceBlock)) {
		fail(libraryArtwork, 'a horizontal header/wide capsule must never be accepted as a portrait grid source');
	}
	if (!bigPictureSource.includes('fetchPlaytimeStatsBatch(shortcuts.map')
		|| !bigPictureSource.includes("setBigPicturePlaytimeField(app, 'minutes_playtime_last_two_weeks', recent)")
		|| !bigPictureSource.includes('playtimeOwnDescriptors')
		|| !bigPictureSource.includes('MILLENNIUM_STEAM_FORCE_RERENDER')) {
		fail(bigPictureRuntime, 'recently-played shortcut cards must merge canonical fallback playtime, update both periods reversibly and request a native rerender');
	}
	if (!playtimeServiceSource.includes('getPlaytimeDataBackend')
		|| !playtimeServiceSource.includes('getAllPlaytimeDataBackend')
		|| !playtimeServiceSource.includes('PLAYTIME_STATS_CACHE_MS = 5000')) {
		fail(playtimeService, 'shared playtime lookup must read canonical backend sessions with a bounded refresh cache');
	}
	if (!desktopLibraryPlaytimeSource.includes('fetchPlaytimeStatsBatch(shortcuts.map')
		|| !desktopLibraryPlaytimeSource.includes('DESKTOP_PLAYTIME_SNAPSHOT_STORAGE_KEY')
		|| !desktopLibraryPlaytimeSource.includes('readDesktopPlaytimeSnapshots()')
		|| !desktopLibraryPlaytimeSource.includes('persistDesktopPlaytimeSnapshots()')
		|| !desktopLibraryPlaytimeSource.includes("setDesktopPlaytimeField(app, 'minutes_playtime_forever', forever)")
		|| !desktopLibraryPlaytimeSource.includes("setDesktopPlaytimeField(app, 'minutes_playtime_last_two_weeks', recent)")
		|| !desktopLibraryPlaytimeSource.includes("setDesktopPlaytimeField(app, 'rt_last_time_played', lastPlayedAt)")
		|| desktopLibraryPlaytimeSource.includes('MILLENNIUM_STEAM_FORCE_RERENDER')
		|| !desktopLibraryPlaytimeSource.includes('data-gdl-playtime-shortcut-id')
		|| !desktopLibraryPlaytimeDomSource.includes('APP_PORTRAIT_CLASS_MODULE')
		|| !desktopLibraryPlaytimeDomSource.includes("formatNativePlaytimeLine('Recent'")
		|| !desktopLibraryPlaytimeDomSource.includes("formatNativePlaytimeLine('Total'")
		|| !desktopLibraryPlaytimeDomSource.includes('elementsWithCssModuleClass(card, classes.PlayedTotal)')
		|| !desktopLibraryPlaytimeDomSource.includes('mutationMayContainDesktopPlaytime')
		|| !runtimeAppSource.includes('patchDesktopLibraryHomePlaytime(popupDoc)')
		|| !runtimeAppSource.includes('syncDesktopLibraryHomePlaytimeDom(popupDoc)')
		|| !runtimeAppSource.includes('linkedShortcutAlreadyVisible ? 0 : 350')) {
		fail(desktopLibraryPlaytime, 'desktop Library Home must hydrate native shortcut playtime and synchronize only the matched card/detail text leaves without forcing a global React rerender');
	}
	if (!playtimeTrackerSource.includes('clearPlaytimeCacheAfter(')
		|| !playtimeTrackerSource.includes('data-gdl-playtime-value="1"')
		|| !playtimeTrackerSource.includes('container.dataset.gdlPlaytimeShortcutId = String(shortcutAppId)')
		|| !playtimeTrackerSource.includes('isDesktopLibraryPlaytimeHydrated(app)')
		|| !playtimeTrackerSource.includes('findNativePlaytimeElements(doc)')
		|| !playtimeTrackerSource.includes('detail.textContent = playtimeFormatted')
		|| !desktopLibraryPlaytimeSource.includes('desktopPlaytimeHydratedApps.add(app)')) {
		fail(playtimeTracker, 'session writes must invalidate cached stats and synchronize exactly one native or GameBridge-owned detail value');
	}
	if (!playtimeBackendSource.includes('if direct and STORE.sessions[direct] then return direct end')
		|| !playtimeBackendSource.includes('return direct')
		|| !playtimeBackendSource.includes('function M.get_all_playtime')
		|| !playtimeBackendSource.includes('function M.flush()')) {
		fail(playtimeBackend, 'a regenerated shortcut ID without sessions must recover canonical playtime through its existing aliases');
	}
	if (!loadingStageSource.includes('loadingGenerations.get(doc) !== generation')
		|| !loadingStageSource.includes('hideNativeLibraryElement(child as HTMLElement)')
		|| !loadingStageSource.includes('LINKED_LOADING_SIDEBAR_ID')
		|| !shortcutNoticeSource.includes('mutationMayContainNonSteamNotice')
		|| !runtimeAppSource.includes('mutationMayContainNonSteamNotice(addedRoots)')
		|| !runtimeAppSource.includes("runInjection('mutation')")) {
		fail(linkedLoadingStage,
			'linked shortcuts must conceal incomplete native content in the insertion microtask and isolate loading stages by navigation generation');
	}
} catch (error) {
  failures.push(`achievement regression checks: unable to read sources (${String(error)})`);
}

try {
	const linkedSidebarSource = await fs.readFile(path.join(frontendRoot, 'features', 'library', 'sidebar-sections.ts'), 'utf8');
	const achievementSidebarSource = await fs.readFile(path.join(frontendRoot, 'features', 'achievements', 'sidebar.ts'), 'utf8');
	const achievementSidebarStyleSource = await fs.readFile(path.join(frontendRoot, 'features', 'achievements', 'styles', 'sidebar.ts'), 'utf8');
	const achievementChromeSource = await fs.readFile(path.join(frontendRoot, 'features', 'library', 'achievement-chrome.ts'), 'utf8');
	const activityViewSource = await fs.readFile(path.join(frontendRoot, 'features', 'library', 'activity-view.ts'), 'utf8');
	const activitySkeletonSource = await fs.readFile(path.join(frontendRoot, 'features', 'library', 'activity-skeleton.ts'), 'utf8');
	const activityStyleSource = await fs.readFile(path.join(frontendRoot, 'features', 'library', 'styles', 'activity.ts'), 'utf8');
	if (!linkedSidebarSource.includes("node.dataset.gdlAchievementsPending = '1'")
		|| linkedSidebarSource.includes('cacheLocalAchievements(cachedAchievements')
		|| !linkedSidebarSource.includes("metadata_source: 'store_highlights_pending'")
		|| !linkedSidebarSource.includes('Array.from({ length: missingCount }')
		|| achievementSidebarStyleSource.includes('[data-gdl-achievements-pending="1"] { visibility:hidden')
		|| !achievementSidebarSource.includes("removeAttribute('data-gdl-achievements-pending')")
		|| !achievementChromeSource.includes('revealPendingAchievementSidebar(doc)')) {
		fail(path.join(frontendRoot, 'features', 'library', 'sidebar-sections.ts'),
			'metadata-only achievement highlights must remain visible as an uncached, correctly counted provisional 0/N box until local progress resolves');
	}
	if (!activityViewSource.includes("renderActivityFeedSkeletonHtml(gdlText('activity'")
		|| !activityViewSource.includes('options.newsItems.length > 0')
		|| !activitySkeletonSource.includes('data-gdl-feed-pending="1"')
		|| !activitySkeletonSource.includes('gdl-feed-skeleton-card')
		|| !activityStyleSource.includes('@keyframes gdl-feed-skeleton-shimmer')
		|| !activityStyleSource.includes('@media (prefers-reduced-motion:reduce)')) {
		fail(path.join(frontendRoot, 'features', 'library', 'activity-view.ts'),
			'an unresolved activity stream must render a structured animated skeleton, with reduced-motion support, instead of a false no-activity result');
	}
} catch (error) {
	fail(path.join(frontendRoot, 'features', 'library', 'sidebar-sections.ts'),
		`achievement pending-state checks could not read their sources (${String(error)})`);
}

// Native Library routes belong entirely to Steam. GameBridge may retire only
// nodes it owns from the previous linked shortcut and must not inspect React,
// synchronize native DOM, capture blueprints or install a native-page guard.
try {
	const [libraryRuntimeSource, nativeRouteSource, routeExitSource, runtimeAppSource] = await Promise.all([
		fs.readFile(path.join(frontendRoot, 'features', 'library', 'runtime.ts'), 'utf8'),
		fs.readFile(path.join(frontendRoot, 'features', 'library', 'native-route.ts'), 'utf8'),
		fs.readFile(path.join(frontendRoot, 'features', 'library', 'route-exit.ts'), 'utf8'),
		fs.readFile(path.join(frontendRoot, 'runtime', 'app.tsx'), 'utf8'),
	]);
	if (/if \(!noticeInfo\)\s*\{\s*handleLibraryNavigation\(doc\)/.test(libraryRuntimeSource)) {
		fail(path.join(frontendRoot, 'features', 'library', 'runtime.ts'),
			'transient native DOM hydration must not be promoted to a new navigation generation');
	}
	if (!nativeRouteSource.includes('export function isPublicSteamLibraryRoute')
		|| !libraryRuntimeSource.includes('if (isPublicSteamLibraryRoute(doc))')
		|| !runtimeAppSource.includes('if (isPublicSteamLibraryRoute(popupDoc))')) {
		fail(path.join(frontendRoot, 'features', 'library', 'native-route.ts'),
			'native routes must cross a shared read-only ownership boundary before any GameBridge Library work');
	}
	if (!routeExitSource.includes('pendingExitGenerations')
		|| !routeExitSource.includes("visibility', 'hidden', 'important")
		|| !routeExitSource.includes('export function removeOwnedLibraryChrome')
		|| !libraryRuntimeSource.includes('cleanupOwnedLibraryChromeAfterRouteExit(doc)')) {
		fail(path.join(frontendRoot, 'features', 'library', 'route-exit.ts'),
			'route exit must conceal and remove only GameBridge-owned chrome after the Steam commit');
	}
	const nativeBoundaryBlock = runtimeAppSource.match(/if \(isPublicSteamLibraryRoute\(popupDoc\)\) \{[\s\S]*?\n\s*\}/)?.[0] || '';
	if (!nativeBoundaryBlock.includes('hasOwnedLibraryChrome(popupDoc)')
		|| !nativeBoundaryBlock.includes('tryInjectLibraryData(popupDoc)')
		|| nativeBoundaryBlock.includes('syncDesktopLibraryHomePlaytimeDom')
		|| nativeBoundaryBlock.includes('captureNativeUiBlueprints')
		|| runtimeAppSource.includes('native-info-guard')
		|| runtimeAppSource.includes('stabilizeNativeInfoPanel')
		|| libraryRuntimeSource.includes('findReactClassOwner')) {
		fail(path.join(frontendRoot, 'runtime', 'app.tsx'),
			'native Library pages must bypass every GameBridge synchronizer and must not access Steam React internals');
	}
	const ownedRouteCleanupBlock = libraryRuntimeSource.match(
		/function cleanupOwnedLibraryChromeAfterRouteExit\(doc: Document\): void \{[\s\S]*?\n\}/,
	)?.[0] || '';
	if (!libraryRuntimeSource.includes('cleanupOwnedLibraryChromeAfterRouteExit(doc);')
		|| ownedRouteCleanupBlock.includes('cleanupInjection(doc)')
		|| !ownedRouteCleanupBlock.includes('removeOwnedLibraryChrome(doc)')) {
		fail(path.join(frontendRoot, 'features', 'library', 'runtime.ts'),
			'deferred native-route retirement must never run the full Steam-DOM restoration cleanup');
	}
} catch (error) {
	fail(path.join(frontendRoot, 'features', 'library', 'route-exit.ts'),
		`native route-isolation checks could not read their sources (${String(error)})`);
}

if (failures.length) {
  console.error(`Source architecture check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Source architecture check passed (${sourceFiles.length} frontend source files, acyclic dependency graph).`);
