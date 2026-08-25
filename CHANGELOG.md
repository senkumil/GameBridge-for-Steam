# Changelog

## v2.6.0-alpha.2 - Native UI parity pass

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

## v2.6.0-alpha.1 - Architecture refactor foundation

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
- Keeps the internal plugin identifier `game-data-linker` unchanged for installation and IPC compatibility.

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

## v2.1.0 - Automatic Steam AppID detection

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
