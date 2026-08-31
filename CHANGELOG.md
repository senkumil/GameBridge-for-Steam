## v3.0.0 - Major Release: Delisted Games Support, Direct Artwork Management, SAM & Trading Card Farming (2026-08-31)

- **Soporte Completo para Juegos Eliminados y Deslistados de Steam**:
  - Vinculación instantánea y resiliente para juegos descatalogados o sin página de tienda activa en Steam (como *Mortal Kombat Komplete Edition*, *Transformers: Devastation*, etc.).
  - Resuelve metadatos, logros e ilustraciones oficiales sin quedarse atascado en colas en segundo plano por recursos opcionales faltantes.

- **Gestión y Cambio de Artworks Directamente desde Propiedades del Juego**:
  - Selector de ilustraciones integrado y seguro dentro de la pestaña *Personalización* en Propiedades del juego.
  - Permite previsualizar, seleccionar y aplicar fondos hero, logos verticales/horizontales, cápsulas e iconos en tiempo real.
  - Aislamiento estricto: el selector se oculta automáticamente en pestañas ajenas (*Acceso directo*, *General*) y el restablecimiento respeta las carátulas nativas de Steam sin alterarlas.

- **Modificación y Gestión de Logros en Juegos Originales de Steam (SAM Integrado)**:
  - Integración nativa para consultar, desbloquear, bloquear o restablecer logros en juegos oficiales de Steam directamente desde la biblioteca.
  - Sincronización inmediata con la interfaz de usuario sin requerir herramientas externas.

- **Farmeo y Simulación de Cromos / Tarjetas Coleccionables (Steam Trading Cards)**:
  - Sección interactiva de cromos con tarjetas 3D animadas, efecto holográfico para cromos reflectantes (Foil) e inspección centrada en pantalla.
  - Sistema de seguimiento de cromos restantes, cálculo de nivel de insignia e integración de acceso directo a la comunidad de Steam.

- **Simulador de Logros Simplificado para Juegos No-Steam**:
  - Configuración ultra accesible por juego: desbloqueo completo (100%), progreso simulado progresivo o modo manual.
  - Compatibilidad directa con archivos JSON generados por emuladores y lanzadores externos.
  - Reconocimiento de esquemas oficiales con iconos en alta resolución y notificaciones de logros en juego (toasts) fluidas.

- **Aislamiento Nativo Total y Rendimiento Instantáneo**:
  - Cero ventanas emergentes intrusivas al iniciar Steam; la detección se activa únicamente al abrir el diálogo oficial *"Añadir un producto que no es de Steam"*.
  - Eliminación de micro-parpadeos al cargar carátulas en el panel de Información gracias a decodificación asíncrona.
  - Vinculación fluida de accesos directos repetidos/duplicados y navegación instantánea mediante snapshots de memoria locales.


## v2.1.0 - Achievement reliability, performance and native isolation (2026-08-28)

- Persists the last backend-confirmed playtime and full local-achievement snapshot for linked non-Steam shortcuts, paints both synchronously when Steam recreates its Library UI, and then revalidates them in the background; identical achievement results retain their existing DOM and icons to eliminate the startup flash/flicker.
- Keeps an immediate, uncached 0/N achievement box visible when no local snapshot has been warmed yet, using Store highlight icons as locked previews and counting the unseen achievements in the +N tile until the real schema and progress replace it.
- Replaces the activity feed's anonymous loading rectangles with a layout-stable Steam-like date, news-card and patch-card skeleton using a subtle shimmer animation and a reduced-motion fallback.
- Extends localized game-metadata persistence to 30 days and immediately renders an already-visible linked shortcut on startup, while retaining the strict no-intervention boundary for actual native Steam game-detail routes.
- Recovers a newly earned achievement when an emulator creates its first JSON with that achievement already unlocked before the overlay readiness delay completes, while deduplicating the recovery per running session and retaining timestamp-independent polling for normal transitions.
- Displays non-Steam playtime in Big Picture's recently-played cards by merging Steam's often-empty shortcut response with NativeGameLink's canonical sessions, updating lifetime and two-week fields, and forcing the native card to rerender.
- Displays the same canonical non-Steam playtime in Desktop Library Home's recently-played shelf and game-detail stat by hydrating Steam's native lifetime, two-week and last-played AppOverview fields without reducing any value Steam already knows; it invalidates stale stats after session writes, recovers history after local AppID regeneration, and avoids the global React rerender that could trigger Steam's `removeChild` rendering error.
- Prevents controller-driven Steam play-bar rebuilds from replacing the linked-game information icon with an unrelated arrow by removing positional button capture and normalizing cloned native markup to the information SVG.
- Recognizes achievement progress left under historical local Shortcut AppIDs by requiring an exact match with the linked game's official achievement-name schema and selecting the most recently modified matching JSON, without moving or rewriting user files; explicit per-game paths retain absolute priority.
- Adds global and per-game controls for simulated achievements, full simulated completion and online-only unlocks while preserving Steam's real achievement names and icon URLs; per-game overrides are stored atomically under both shortcut and official AppID keys and refresh the Library immediately.
- Treats retired or delisted Steam AppIDs with no News Hub payload as expected no-content, caching that state instead of repeatedly emitting partner-event parse warnings.
- Restores official shortcut-name updates during linking and resolves Steam's regenerated local Shortcut AppID before committing artwork and mappings, while leaving the executable and launch configuration untouched.
- Adds a per-game zero-progress override that ignores custom and global AppID achievement files while retaining Steam's real achievement list and icons at 0%.
- Replays every already-earned achievement notification once when each linked game is first launched after installing this version; later sessions notify only genuine new unlocks, and Library browsing never consumes the replay.


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
