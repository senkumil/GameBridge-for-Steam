# Changelog

## v2.1.0 - Achievement reliability, performance and native isolation (2026-08-28)

- Persists the last backend-confirmed playtime and full local-achievement snapshot for linked non-Steam shortcuts, paints both synchronously when Steam recreates its Library UI, and then revalidates them in the background; identical achievement results retain their existing DOM and icons to eliminate the startup flash/flicker.
- Keeps an immediate, uncached 0/N achievement box visible when no local snapshot has been warmed yet, using Store highlight icons as locked previews and counting the unseen achievements in the +N tile until the real schema and progress replace it.
- Replaces the activity feed's anonymous loading rectangles with a layout-stable Steam-like date, news-card and patch-card skeleton using a subtle shimmer animation and a reduced-motion fallback.
- Extends localized game-metadata persistence to 30 days and immediately renders an already-visible linked shortcut on startup, while retaining the strict no-intervention boundary for actual native Steam game-detail routes.
- Recovers a newly earned achievement when an emulator creates its first JSON with that achievement already unlocked before the overlay readiness delay completes, while deduplicating the recovery per running session and retaining timestamp-independent polling for normal transitions.
- Displays non-Steam playtime in Big Picture's recently-played cards by merging Steam's often-empty shortcut response with GameBridge's canonical sessions, updating lifetime and two-week fields, and forcing the native card to rerender.
- Displays the same canonical non-Steam playtime in Desktop Library Home's recently-played shelf and game-detail stat by hydrating Steam's native lifetime, two-week and last-played AppOverview fields without reducing any value Steam already knows; it invalidates stale stats after session writes, recovers history after local AppID regeneration, and avoids the global React rerender that could trigger Steam's `removeChild` rendering error.
- Prevents controller-driven Steam play-bar rebuilds from replacing the linked-game information icon with an unrelated arrow by removing positional button capture and normalizing cloned native markup to the information SVG.
- Recognizes achievement progress left under historical local Shortcut AppIDs by requiring an exact match with the linked game's official achievement-name schema and selecting the most recently modified matching JSON, without moving or rewriting user files; explicit per-game paths retain absolute priority.
- Adds global and per-game controls for simulated achievements, full simulated completion and online-only unlocks while preserving Steam's real achievement names and icon URLs; per-game overrides are stored atomically under both shortcut and official AppID keys and refresh the Library immediately.
- Treats retired or delisted Steam AppIDs with no News Hub payload as expected no-content, caching that state instead of repeatedly emitting partner-event parse warnings.
- Restores official shortcut-name updates during linking and resolves Steam's regenerated local Shortcut AppID before committing artwork and mappings, while leaving the executable and launch configuration untouched.
- Adds a per-game zero-progress override that ignores custom and global AppID achievement files while retaining Steam's real achievement list and icons at 0%.
- Replays every already-earned achievement notification once when each linked game is first launched after installing this version; later sessions notify only genuine new unlocks, and Library browsing never consumes the replay.
- Renders both earned achievements as described rows when a game has exactly two, avoiding the detached unlabeled thumbnail that appeared below the featured achievement.
- Shows the per-game online-achievement unlock toggle only when the official Steam achievement schema contains at least one online, multiplayer or cooperative achievement.
- Delays first-launch achievement replay until the game overlay exists, with a 30-second stable-running fallback for games without overlay, instead of treating Steam's early `RunningApps` launcher state as game-ready.
- Uses a five-second achievement-toast duration and cadence, enlarges only GameBridge achievement cards by matching their real icon, and retains the per-game persistent every-launch replay control.
- Replaces the version-dependent Steam toggle wrapper in global settings with controlled accessible switches using native DOM pointer/keyboard listeners and immediate visual feedback, bypassing Steam's delegated settings events before achievement defaults persist.
- Makes the global online-achievement option a true master policy, preventing older per-game `false` records from silently overriding it; individual opt-in remains available when the master is off.
- Removes global full simulated completion (it remains available per game) and lists the game name for every permanently suppressed automatic-link suggestion, including identifiable shortcuts no longer present in the Library.
- Adds a scrollable safe area below the final global achievement controls so Steam's native bottom-edge resize hit-test cannot intercept their pointer input on short or scaled windows.
- Synchronizes one-shot achievement replay consumption with open shortcut Properties so “replay on next launch” turns itself off immediately when its notifications are queued.
- Keys launch-replay preferences to the actual non-Steam shortcut instead of the AppID folder that supplied progress, and tolerates the overlay appearing one polling tick before `RunningApps`, restoring next/every-launch notifications without firing at launcher startup.
- Hides the per-game online-achievement override while the global master policy is active, and removes the redundant manual next-launch replay control while preserving automatic first-launch replay and the persistent every-launch option.
- Serializes achievement notification preparation before applying the three-second cadence, waits for Steam's overlay to settle before launch replay, and merges enabled online achievements missing from legacy progress files into that replay.
- Identifies every-launch achievement replay by each newly registered game-overlay session, so Alt+F4 followed by a rapid restart cannot remain blocked by a stale AppID-level completion flag.
- Makes simulated progress temporarily ignore existing automatic and emulator JSON state sources, allowing per-game full completion to reach the real Steam schema total without deleting the user's progress file.
- Cancels queued, asynchronously preparing and currently visible achievement replay notifications as soon as the game overlay closes, with RunningApps shutdown detection as a fallback.
- Polls real achievement JSON from the running-game watcher every two seconds regardless of Library visibility, prioritizing genuine in-game unlocks ahead of any remaining launch-replay queue and trusting observed state transitions over unreliable emulator timestamps.
- Fixes relinking an existing non-Steam shortcut after unlinking or rejecting it: an explicit Link/Save now clears the persisted dismissal state for that shortcut ID.
- Re-arms failed background link jobs when the user explicitly saves the same link again instead of leaving a stale failed job that blocks detection.
- Makes unlinking transactional across shortcut-ID, title and executable aliases, clears plugin-applied artwork, and detects linked-to-unlinked transitions without requiring the shortcut to be removed and re-added to Steam.

## v2.0.0 - Reliable Linking, Native Library Isolation & Interactive Cards

- Makes first-time linking persistent without restarting Steam by completing identity, artwork and mapping work in a background-safe queue.
- Rebuilds automatic shortcut detection around verified executable evidence, ambiguity gaps and reviewable candidates instead of treating aliases as proof.
- Adds candidate artwork to both the automatic linking modal and shortcut Properties, with localized success and missing-asset reports.
- Adds official Steam artwork recovery plus optional SteamGridDB fallback for missing library assets, with stricter provider and asset selection validation.
- Centralizes retryable frontend requests so temporary startup, Store or IPC failures are not cached until Steam restarts.
- Introduces generation-based Library navigation and complete native-style restoration to prevent flicker, stale injections and changes leaking into native Steam games.
- Improves localized activity, achievements, cloud/playtime status, community content, notes, DLC and responsive primary-link rendering.
- Adds Steam-like interactive trading cards with centered expansion, bounded 3D tilt, cursor lighting and metadata-gated foil holographic reflection.
- Adds canonical playtime session persistence, atomic achievement-path writes, faster Base64 artwork decoding and bounded backend caches.
- Expands source, localization, detection-fixture, TypeScript, Lua and generated-bundle validation under `npm run verify`.

## v1.5.0 - Stable Release & Performance / Cache Parity

- **Instant Cache Rendering (0ms):** Synchronous localized metadata retrieval without IPC delays on library navigation.
- **Cross-Game Cache Bug Fix:** Stale URL shortcut AppIDs are validated against the active document's title to prevent wrong-game metadata flashing on cold start.
- **Immediate Achievement Rendering:** Local achievements and playbar stats render immediately from cache upon navigation.
- **Parallelized Dynamic Streams:** News, friend activity, community items, and achievements load asynchronously in parallel without blocking each other.
- **Native Steam UI Parity & Bug Fixes:** Cloned native `<h2>` heading for Activity section, fixed styling for status composer and major event cards, responsive quick-link bar, and cleaned community section header.

> **Versioning note:** `v2.6.0-alpha.1` and `v2.6.0-alpha.2` below were
> internal development milestones only. They were never published or distributed
> as plugin releases. `v1.5.0` was the previous public release and `v2.0.0` is
> the current public release line.

## v2.6.0-alpha.2 — Internal, never published

- Calibrates the Steam desktop Library reference against 1920×1080 maximized-client captures; the screenshots are taskbar-cropped only and are not treated as a smaller viewport.
- Splits Library fallback CSS by visual surface so Information, primary links, Activity, community content, status posting, and trading cards can be refined independently.
- Splits achievement CSS into sidebar, playbar, and modal surfaces to prevent a sidebar parity change from altering the achievement window or top playbar.
- Removes the unsafe full-achievement-region native DOM blueprint; only small session-scoped controls such as Cloud, Information and the playbar achievement stat may be learned from native Steam pages.
- Distinguishes live Steam CSS modules from hash fallbacks, allowing native components to own geometry only when the current client module was actually resolved.
- Reworks the Information drawer so live Steam game-info classes control expansion/layout when available, while the fallback is bounded to the native portrait/drawer proportions instead of inheriting stale Steam hashes.
- Refines the achievement sidebar to the native five-slot desktop pattern with 52 px tiles, four thumbnails plus a `+N` overflow tile, native-like progress/header spacing, and a narrower responsive fallback.
- Refines the quick-link row against the native 42 px navigation surface and isolates its deterministic fallback from the Steam playbar.
- Preserves Store franchise metadata when the modern asset response does not provide a franchise value.
- Clears session native blueprints on Steam-language changes and clears both native blueprints and resolved CSS-module caches when the plugin is dismounted.
- Keeps all visible localization conservative: verified Steam token first, English fallback otherwise; no reverse/fuzzy token guessing is used in production.

## v2.6.0-alpha.1 — Internal, never published

- Splits the previous frontend monolith into explicit runtime, feature, Steam-adapter, core, API, settings, and domain layers.
- Splits the backend into a thin Millennium IPC facade plus cohesive modules for mappings, Store data, shortcut detection, news, social data, community content, artwork, and achievements.
- Adds lifecycle disposal infrastructure for observers, timers, listeners, overlays, and per-document runtime state.
- Makes the frontend dependency graph acyclic and enforces layer boundaries with `scripts/check-source.mjs`.
- Adds reproducible verification with `npm run verify`: TypeScript, architecture checks, Millennium production build, and generated-bundle syntax validation.
- Keeps native Steam DOM blueprints session-scoped and restricts them to small validated components instead of persisting full game-page regions.
- Centralizes Millennium IPC in `frontend/api/backend.ts` and adds transactional mapping updates.
- Separates Library surfaces so playbar, primary links, information, achievements, activity, community content, and optional Store sections can be refined independently toward native Steam parity.
- Makes production localization conservative: only verified Steam localization tokens are used; plugin-owned or unverified text falls back to English instead of guessing a token by matching English strings.
- Keeps simulated achievements behind explicit developer settings and disabled by default.

## Historical adaptation notes

## Adaptación ES — Biblioteca más nativa
- Muestra el progreso de logros también en la barra superior; al pulsarlo desplaza hasta LOGROS y aplica un resaltado breve como Steam.
- Al guardar un AppID de Steam, renombra automáticamente el acceso directo con el título oficial y aplica su icono oficial persistente.
- Guarda los nuevos vínculos Steam por el AppID estable del acceso directo para que sigan funcionando después del cambio de nombre.
- Mantiene **NOTAS DEL PARCHE** como primer bloque con su título y coloca **ACTIVIDAD / NOTICIAS** a continuación.
- Añade el indicador visual **ESTADO DE CLOUD · Actualizado** a la barra del juego.
- Añade el botón de información y una ficha desplegable con portada, descripción, responsables, fecha y características.
- Detecta dinámicamente actualizaciones, parches y hotfixes del juego vinculado por AppID.
- Se aplica a vínculos Steam y también a los feeds combinados de Epic/Xbox.
- Amplía la lectura inicial de eventos de Steam de 10 a 20 entradas y renueva la clave de caché.

## v2.3.1 - Persistent Big Picture filtering and metadata update

- Updates the package name, documentation version and visible metadata.
- Refreshes repository configuration files for the Steam-only project and removes obsolete Epic/Xbox secret entries.
- Recognizes Steam's newer Spanish **NO DE STEAM** label in Big Picture.
- Hides the non-Steam category on every Big Picture refresh, including when Steam recreates an empty tab after shortcut changes.
- Unifica la identidad de instalación e IPC bajo `GameBridge for Steam`.

## v2.3.0 - Instant startup and native logo placement

- Restores linked non-Steam library pages immediately from a locally verified mapping snapshot while the backend starts.
- Remembers the Steam client language so localized cached game data can render on the first DOM pass.
- Revalidates mappings and language against Steam in the background without treating the cache as the source of truth.
- Applies each linked AppID's official Steam `logo_position` through Steam's native custom-logo-position API.
- Falls back to Steam's standard bottom-left 50% logo box when an AppID does not publish placement metadata.
- Restricts all logo positioning to mapped non-Steam shortcut AppIDs; native Steam games remain untouched.

## v2.2.1 - Clean plugin health reporting

- Treats unavailable Steam icon-format candidates as normal informational fallback attempts instead of plugin warnings.
- Keeps real icon write and payload validation failures visible as warnings.
- Prevents successful official PNG fallback from leaving the plugin with a misleading yellow warning state.

## v2.2.0 - Shortcut identity and localized library details

- Keeps the official Steam title after replacing a bootstrap executable with its long-running game executable.
- Processes duplicate non-Steam shortcuts independently by their local shortcut AppID.
- Requests Store metadata in the Steam client language and shows complete, unclipped game descriptions.
- Restyles simulated trading-card panels to use a compact native Steam grid.
- Validates DLC metadata before rendering and omits the section when no displayable DLC exists.
- Preserves the strict non-Steam shortcut guard so native Steam games remain untouched.

## v2.1.1 - Automatic launcher bypass for verified games

- Automatically preserves and appends `-nolauncher` for verified compatible non-Steam links, starting with Marvel's Spider-Man Remastered (AppID 1817070).
- Repairs already-linked compatible shortcuts when their library page is opened.
- Keeps unverified launchers opt-in and never changes native Steam games or generic third-party launchers.

### Historical milestone — Automatic Steam AppID detection

- Detects newly added non-Steam executables and proposes likely Steam AppIDs for confirmation.
- Uses direct local evidence first, then scores Store candidates from the shortcut title, executable and nearby folder names.
- Keeps the manual AppID/store-link field as a fallback in shortcut Properties.
- Preserves the executable selected by the user, including Unreal Engine `*-Win64-Shipping.exe` targets used for reliable playtime tracking.
- Offers `-nolauncher` only as an explicit option for detected game-specific launchers and preserves existing launch parameters.
- Restricts the detector and all linking changes to non-Steam shortcut AppIDs; native Steam games remain untouched.

## Steam-only focus

- Removed the Epic Games, Xbox, Microsoft authentication, cross-platform patch-note, and SteamGridDB routes.
- Steam AppID mappings, artwork, news, activity, community content, achievements, cloud indicator, and multilingual UI remain active.

## v1.0.1 - Epic Games and Xbox support

GameBridge for Steam works with linked Steam games and external shortcuts. Paste a Steam store link or AppID into a non-Steam shortcut and its library page fills in with official Steam metadata.

### Added

- Epic Games Store support. Paste an Epic store link to link a shortcut. Sign in with your Epic account to show friends who play. Metadata, achievements, artwork, screenshots, and news load into the library page in Steam's style.
- Xbox support. Paste an Xbox store link to link a shortcut. Sign in with your Microsoft or Xbox account through a device-code flow to show your real friends (with avatars and gamertags) and your actual achievement progress. Metadata, artwork, and screenshots apply automatically.
- Patch notes for Epic and Xbox games, shown as update cards in Steam's format, matched from the game's Steam listing when available.
- Clean transparent logos from SteamGridDB, so games without a built-in logo still get one. Linking your first Xbox game asks once for a free SteamGridDB API key.

### Fixed

- Better game matching for lesser-known Epic titles (handles the extra ID suffix in store links).
- Artwork refreshes right after linking, instead of only after leaving the page and returning.
- Logos apply for games whose store listing has no clean logo.

### Notes

- Epic does not provide profile pictures or your personal achievement unlock state, so Epic friends show initials and achievements show global rarity instead of your progress. Xbox provides both.
- Not every game is in every catalog. When a source does not have a game, that section is skipped.

## v1.0.1

- Detect Steam UI language reliably and cache news per language.
- Fix community content cards and links; invalidate stale cached entries.
- Fix backend argument order on Linux and open links inside the Steam client.

## v1.0.0

- Initial release: link non-Steam shortcuts to a Steam AppID to show real artwork, news, friend activity, achievements, and community content in the library.

## Adaptación ES - navegación dinámica de logros vinculados
- El panel lateral **LOGROS** ahora abre los logros reales del AppID de Steam vinculado al juego actual.
- El AppID se toma dinámicamente del mapeo del juego; no está fijado a DRAGON BALL: Sparking! ZERO.
- La barra superior de **LOGROS** usa la misma ruta dinámica.
- Se usa la página pública `steamcommunity.com/stats/<AppID>/achievements`, que funciona aunque el acceso directo no posea la licencia Steam.
- Se conserva el idioma detectado por Steam al abrir la página de logros.

## Adaptación ES - notas de parche externas
- NOTAS DEL PARCHE ya no clasifica los lanzamientos de contenido/DLC (event_type 30) como parches.
- Añade las actualizaciones oficiales de DRAGON BALL: Sparking! ZERO del 29/07/2026 y 07/08/2026, ausentes del feed de anuncios de Steam.
- Fusiona y ordena las notas por fecha sin duplicarlas; el DLC permanece en ACTIVIDAD.

## Local achievements Steam UI
- Lee dinámicamente `C:\Steam Auto\<AppID>\achievements.json` para el AppID vinculado.
- Añade progreso local real a la barra superior de LOGROS.
- Sustituye el panel lateral simple por una vista estilo Steam con logros desbloqueados/bloqueados.
- Añade modal estilo Steam con MIS LOGROS / LOGROS GLOBALES, búsqueda, fechas y progreso parcial.
- Obtiene metadatos localizados desde Steam y soporta definiciones locales para asociación exacta.
- No modifica archivos de progreso ni datos de la cuenta Steam.
