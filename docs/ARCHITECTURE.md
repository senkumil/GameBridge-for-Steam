# GameBridge for Steam — Architecture

This document defines the dependency and UI rules for the 2.6 refactor. The goal is not only to split files: it is to make native-Steam visual parity, global localization, and future Steam-client changes maintainable.

## Design goals

1. Linked non-Steam shortcuts should use the same semantic layout, Steam CSS modules, and Steam localization tokens as native Library pages whenever those internals are safely discoverable.
2. The plugin must behave consistently for every Steam client language. Official Steam strings are preferred; plugin-owned text falls back to English when no verified Steam token exists.
3. Native Steam games remain outside the plugin's mutation scope.
4. Development/test simulation must never be enabled implicitly in production.
5. Every observer, listener, interval, timeout, popup, and per-document runtime must have an explicit disposal path.
6. Feature modules own feature behavior; the application entry point only wires dependencies and lifecycle.

## Frontend layers

Dependency direction is intentionally one-way:

```text
frontend/runtime
      ↓
frontend/features  → frontend/settings
      ↓
frontend/steam     frontend/core     frontend/api
      ↓                 ↓                ↓
              frontend/domain
```

### `frontend/runtime/`

Composition root only. It configures feature hosts, owns plugin/window lifecycle, and reacts to Steam language/UI-mode changes. It must not contain Library feature markup.

### `frontend/features/`

User-facing capabilities grouped by domain:

- `library/` — linked-game Library rendering and native chrome.
- `achievements/` — read-only achievement state, sidebar/playbar/modal, notifications.
- `shortcuts/` — detection, linking, Properties integration, automatic repair.
- `big-picture/` — controller-mode adaptation.

Features may depend on `steam`, `core`, `api`, and `domain`, but must never import `runtime/app`.

### `frontend/steam/`

Anti-corruption layer around private/current Steam-client behavior. CSS module discovery, localization, Steam navigation, native DOM fingerprints, shortcut APIs, and social/client internals belong here. Other layers should not scatter private Steam API probing across the codebase.

### `frontend/core/`

Plugin-owned infrastructure with no visual Steam knowledge: cache policy, mappings, text utilities, preferences, disposables, and Store-data cache orchestration.

### `frontend/api/`

The only frontend layer allowed to create Millennium `callable(...)` handles. Features consume named API functions rather than knowing IPC method names.

### `frontend/domain/`

Shared data contracts only. No DOM, Steam globals, localStorage, or backend calls.

## Library UI composition

The desktop Library renderer is decomposed into independently replaceable surfaces:

```text
library/renderer.ts              orchestration only
library/layout.ts                discover live Steam columns/section shell
library/activity-view.ts         Activity header + status composer
library/sidebar-sections.ts      Friends + Achievements base order
library/optional-sections.ts     Store-capability sections
library/trading-cards.ts         cards + preview interaction
library/community-view.ts        community grid + lifecycle
library/primary-links.ts         primary navigation adapter boundary
library/achievement-chrome.ts    playbar/sidebar progress finalization
library/native-chrome.ts         Info/playbar native Steam adapter
```

A visual correction to one surface should not require editing unrelated features.

## Native Steam UI rules

### Prefer live semantics over copied pages

Allowed:

- Resolve Steam CSS modules by stable semantic keys.
- Clone a small, validated section header/shell from the current live document.
- Reuse verified Steam localization tokens.
- Use Store category IDs and client APIs for capability decisions.

Not allowed:

- Persist an entire native game region's `outerHTML` and reuse it later.
- Clone complete React subtrees from another game and assume their geometry is portable.
- Identify behavior from translated words such as "Achievements", "Cloud", or "Controller" when a language-independent ID/API exists.
- Guess a generic CSS module from a weak key such as `Link` when multiple Steam modules share it.

Plugin CSS is a fallback/bridge, not the desired source of truth for components Steam already renders natively.

## Localization contract

1. Read the language selected in Steam, not the browser/OS locale.
2. For Steam-equivalent UI text, use a specifically verified Steam localization token.
3. If no verified official token is available, use the plugin's English string.
4. Do not add Spanish (or any other language) literals as production fallbacks.
5. Do not infer icons/features from localized labels; use Store category IDs or semantic data.
6. Cache keys for localized remote data must include Steam language.
7. Changing Steam language invalidates language-sensitive memory/UI and reinjects the current linked page.

The localization module may contain multilingual fingerprints strictly for detecting Steam's own language state; those fingerprints are not plugin UI translations.

## Lifecycle contract

Every registration must have a disposer:

- `MutationObserver` / `IntersectionObserver` / `ResizeObserver`
- DOM/window event listeners
- `setInterval` / `setTimeout`
- popup/modal key handlers
- per-document navigation layers
- Steam callback registrations when the client exposes an unregister handle

Use `DisposableRegistry` for scope-owned resources. Weak collections are not a substitute for disposal when callbacks/timers retain references.

## Backend architecture

`backend/main.lua` is an IPC facade. Domain implementation belongs in `backend/lib/`:

```text
config.lua
mappings.lua
store.lua
shortcut_detection.lua
news.lua
social.lua
community.lua
artwork.lua
achievements.lua
util.lua
```

Backend modules should return structured data/errors to the facade. Mapping changes that belong to one logical link/unlink operation should be transactional whenever possible.

## Development versus production

Achievement simulation and notification test utilities are developer tooling. Production defaults are:

```text
developerMode = false
simulateAchievements = false
```

A missing achievement-state file must not be represented to end users as genuine unlocked progress.

## Source-quality gates

`scripts/check-source.mjs` enforces architectural invariants that TypeScript cannot express, including:

- no inline `onclick=`/`onerror=` handlers;
- no Millennium `callable(...)` outside `frontend/api/backend.ts`;
- no import from generated `.millennium/Dist` code;
- no known developer usernames/test identities;
- bounded orchestration/runtime file sizes;
- one-way frontend layer dependencies and an acyclic import graph;
- the backend facade remains small.

`npm run check` runs type checking plus these source checks. `npm run verify` additionally rebuilds `.millennium/Dist/index.js` and runs the cross-platform generated-bundle check.

## Release workflow

Before creating a public ZIP:

1. clean install dependencies from the lockfile;
2. `npm run check`;
3. `npm run build`;
4. `node --check .millennium/Dist/index.js`;
5. smoke-test desktop Library, Properties, achievements, language change, and Big Picture;
6. verify no native Steam game is modified;
7. package without user state (`mappings.json`, achievement path overrides), caches, `.git`, or `node_modules`.
