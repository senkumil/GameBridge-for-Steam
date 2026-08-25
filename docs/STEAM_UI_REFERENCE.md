# Steam Desktop Library UI reference

This document records the native Steam surfaces captured for the 2.6 refactor. It is an implementation reference, not a source of hard-coded absolute positioning. Measurements are approximate and are used to validate relationships between components, while live Steam CSS modules remain authoritative whenever they can be resolved safely.

## Reference set

The capture environment is a **1920 × 1080 Windows desktop with the Steam desktop client maximized**. The user cropped only the Windows taskbar from the screenshots, so the image files are approximately `1917 x 1015–1021`; that cropped height is **not** a different display resolution or Steam viewport target.

All pixel measurements below are therefore a 1920×1080 parity baseline. Implementation must still derive geometry from Steam's live DOM/CSS so the plugin follows Steam when the client window, display resolution, DPI scaling, or language changes.

Native games represented:

- Hollow Knight: Silksong — full page, playbar, information drawer open/closed, activity, controller card, achievements, notes/cards and sticky scrolled state.
- Blasphemous — information variants and lower Library sections.
- Left 4 Dead 2 — install/sticky state, major update activity and community content; Workshop-capable title.
- Injustice 2 — install/sticky state and DLC section.
- Plants vs. Zombies: Garden Warfare 2 — additional controller/achievement/sidebar variations.

The capture archive is `/mnt/data/CAPTURAS JUEGOS .zip`; extracted analysis copies live under `/mnt/data/capturas_juegos`.

## Global layout invariants

At the captured 1917 px window width, the game content viewport starts near x=406. The native page uses one wide content canvas rather than independent synthetic cards.

For Silksong at the top of the page:

- Hero: x≈407–1674.
- In-page playbar: y≈439–507, height≈68 px.
- Quick-link row: y≈519–561, height≈42 px.
- Main activity column: x≈429–1221, width≈792 px.
- Sidebar column: x≈1267–1657, width≈390 px.
- Main/sidebar gap: ≈44–46 px.

The implementation must derive the live Steam columns from the current DOM. These measurements are acceptance references only; they must never become fixed viewport coordinates.

## Playbar

Native Silksong order:

1. Play/Install action.
2. Cloud status when supported.
3. Last session.
4. Playtime.
5. Achievements when available.
6. Right-side native buttons (settings/controller/information/favorite as applicable).

Rules:

- Added shortcut statistics must be inserted into Steam's existing `GameStatsSection`; do not create a second playbar.
- Cloud is conditional on actual support.
- Achievement progress uses Steam's mini-achievement classes and its native progress track.
- Information is a small native menu button in `AppButtonsContainer`, immediately before favorite when possible.
- A captured native control may be used only as a session-scoped, sanitized small blueprint. Never persist the entire playbar subtree.

## Game information drawer

Reference: `silksong/xxxx.png`.

The drawer opens directly below the playbar and above the quick-link row. At the reference size it is about 215–216 px tall.

Approximate content geometry:

- Outer content padding: about 10 px top/left.
- Portrait: about 120 x 178 px.
- Description begins about 18 px to the right of the portrait.
- Metadata occupies the central-right column.
- Feature list is the rightmost column.
- The quick-link row follows about 12 px below the drawer.

Native Steam game-info CSS classes are authoritative. The deterministic grid is fallback-only and must never override a successfully resolved native layout.

## Quick-link row

Reference: `silksong/Sin t#U00edtulo.png` and `silksong/xxxx.png`.

- Full width across the content canvas, including the width above both main and sidebar columns.
- Height ≈42 px.
- Gap from closed playbar to row ≈12 px.
- Gap from row to Activity/Sidebar headings ≈20–28 px depending on surrounding native wrappers.
- Items have equal distribution and vertically centered labels.

Base links observed on Silksong:

- Store page
- Community hub
- Points shop
- Discussions
- Guides
- Support

Optional destinations such as Workshop are capability-driven and must not leave empty slots when absent.

The row is intentionally a deterministic shell until a safe current-client native component adapter is identified. Do not clone a page-specific React navigation subtree.

## Achievement sidebar

Reference: `silksong/Sin t#U00edtulo.pngsdsdd.png`.

Native structure:

1. Section heading (`ACHIEVEMENTS` in the Steam client language).
2. Progress header with localized `unlocked/total` text and percentage.
3. Progress track.
4. Most recent unlocked achievement: 52 x 52 icon plus title and description.
5. Unlocked thumbnail row.
6. Divider.
7. Locked-achievement label.
8. Locked thumbnail row.
9. Bottom-right `View all my achievements` action.

At the reference sidebar width, each thumbnail row contains exactly five 52 px slots with about 8 px spacing. When there are more achievements, Steam effectively presents four icon slots plus a fifth `+N` slot. The GDL fallback follows the same five-slot rule and may reduce the slot count only at narrower live sidebar widths.

The outer region/body shell comes from a live native sidebar section (Notes/Media). The achievement progress and featured-item typography use current Steam achievement CSS modules. GDL-specific CSS must not create a second rounded card or extra shadow inside that native shell.

## Activity/news

Observed patterns:

- `ACTIVITY` heading uses Steam's native section heading when available.
- Status composer is directly below the heading.
- Day/date heading uses uppercase localized date text and a horizontal rule.
- Minor patch notes are compact rows with the wrench/tools glyph.
- Normal news uses image-left/text-right cards.
- Major updates have a distinct blue-accented presentation.
- `Load more activity` is centered after the current chronology.

The feed renderer may provide data/markup, but current Steam CSS modules should own native event typography and structural styling where resolved.

## Sidebar ordering and conditional sections

Observed across the capture set:

- Controller compatibility can appear above Achievements.
- Achievements appear before Notes/Cards in the native sidebar.
- DLC appears as its own sidebar section for Injustice 2.
- Trading cards/Notes appear only when applicable.
- A title without one capability does not reserve blank vertical space for it.

GDL must therefore render sections from capabilities/data, not from a fixed universal stack.

## DLC

Reference: `injustice 2/DLCS.png`.

Native DLC surface is a sidebar region with a two-column capsule grid and footer actions. It uses the same sidebar section family as the rest of Steam's details page. A linked game should omit the entire section when no valid DLC cards are available.

## Community content

Reference: `LEF 4 DEADD 2/LEF 2 DSDSD.png`.

Community content is a wide main-column/canvas section with a Steam-style blue top accent and responsive tile grid. This is not a sidebar card. Progressive loading must preserve the native page's scroll flow and dispose observers when the page changes.

## Install/sticky state

Several captures show the scrolled sticky header with Install/Play and the game icon/title. GDL should not synthesize this header. It belongs to Steam's own page and should continue working because the linked shortcut remains inside Steam's native Library detail route.

## Localization rule

Visible text follows this precedence:

1. Explicitly verified Steam localization token.
2. Plugin English fallback when no verified Steam token exists or Steam has no localized value.

Production code never discovers tokens by fuzzy or reverse English-text matching. Structural decisions never depend on localized words; they use Store category IDs, AppIDs, DOM topology, roles, and Steam CSS-module semantics.

## Parity acceptance sequence

Each external linked game should be compared against a native game at the same Steam window dimensions in this order:

1. Playbar and right-side buttons.
2. Information drawer closed/open.
3. Quick-link row.
4. Main/sidebar column geometry.
5. Achievement sidebar.
6. Activity composer/date/news cards.
7. Conditional sections (controller, DLC, Workshop, cards, community).
8. Sticky scrolled state.
9. Language switch and long-text behavior.

A change to one surface must not require editing unrelated surfaces. If it does, the architecture boundary is wrong and should be corrected before adding more CSS.
