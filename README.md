# NativeGameLink for Steam

**English** · [Español](README_ES.md)

**Bring the complete Steam Library experience to your non-Steam games.**

NativeGameLink for Steam is a [Millennium](https://steambrew.app/) plugin that links a non-Steam shortcut to its real Steam AppID and rebuilds its Library page with official metadata, artwork, activity, achievements, community content, playtime, and native-style controls.

Once linked, an external game no longer feels like an empty shortcut: it receives the identity and presentation of its Steam release while continuing to launch the executable you originally added.

> NativeGameLink changes the local presentation of linked shortcuts. It does not grant Steam ownership, licenses, inventory items, Steam Cloud storage, or official profile achievements.

---

## ✨ Highlights & What's New in v3.0.0

- **Delisted & Removed Steam Games Support:** Full support for delisted, retired, or unlisted Steam games (e.g. *Mortal Kombat Komplete Edition*, *Pro Evolution Soccer 2013*) with resilient metadata and official artwork resolution.
- **Direct Artwork Management in Game Properties:** Choose, preview, and apply custom hero backgrounds, logos, capsules, and icons directly from the *Customization* tab in Properties.
- **Steam Achievement Manager (SAM) Integration:** Inspect, unlock, lock, or modify achievement progress for your official Steam games directly from your library interface.
- **Steam Trading Card Farming & Simulation:** Interactive trading card showcase with 3D animated cards, foil holographic reflection, badge level progression, and remaining card tracking.
- **Simplified Non-Steam Achievement Simulation:** Easily configure achievement simulation per-game (100% instant completion, progressive simulation, or manual tracking) with emulator and launcher compatibility.
- **Big Picture & Steam Deck UI Integration:** Renders official hero backgrounds, logos, and synced playtime natively in Big Picture mode.

---

## 🎮 A Native-Style Steam Library Experience

NativeGameLink reconstructs the useful surfaces normally missing from a non-Steam shortcut:

- **Steam-style play bar** with Play, Cloud status presentation, last session, total playtime, achievement progress, game information, controller, and favorite controls.
- **Official navigation links** for the Store page, DLC, Community Hub, Points Shop, Discussions, Guides, Workshop, and Support when available.
- **Game information drawer** with cover art, description, developer, publisher, franchise, release date, player modes, controller support, family sharing, Steam Cloud capability, and other Store features.
- **Activity and news feed** combining Steam partner events, announcements, major updates, patch notes, hotfixes, offers, events, DLC releases, and community posts in chronological order.
- **Status composer** with emoticons and a shortcut-specific activity history.
- **Friends who play** with Steam personas, avatars, recent playtime, reviews, screenshots, videos, and related activity when Steam exposes the information.
- **Community Content** with screenshots, artwork, and guides loaded progressively for faster initial rendering.
- **Achievement sidebar and modal** with unlocked/locked groups, progress, descriptions, dates, global percentages, and native-style artwork.
- **Trading-card presentation** using official Steam Community/Market artwork, badge information, card collection layout, centered 3D interaction, cursor lighting, and subtle foil reflection when foil metadata is available.
- **Optional DLC and Workshop sections** validated against the linked Steam AppID.
- **Steam Notes and media areas remain available** alongside the injected content.

The page renders cached core information immediately and hydrates network-backed sections independently, so a temporary Store, Community, or IPC failure does not permanently leave the game empty until Steam restarts.

---

## 📸 Screenshots

These captures show the visual difference between an unlinked shortcut and a linked game, plus the achievement/feed surfaces and Big Picture integration.

### 1. Before linking — original non-Steam shortcut

<img width="1917" height="928" alt="Captura de pantalla 2026-08-26 163249" src="https://github.com/user-attachments/assets/e6e6de91-6ab3-4b21-9aaa-3d1f8e709394" />

### 2. After linking — NativeGameLink Library integration

<img width="1917" height="974" alt="Captura de pantalla 2026-08-26 164536 pFDFDFng" src="https://github.com/user-attachments/assets/1dc423ff-04dc-496c-89a1-51a594c2fdc9" />

### 3. Achievements / activity / game information

<img width="1917" height="1015" alt="image" src="https://github.com/user-attachments/assets/5abb8961-6936-46f3-897b-6fede3df0c34" />


<img width="1917" height="1015" alt="image" src="https://github.com/user-attachments/assets/e7e839a8-a73d-4b70-b93d-2ea97ca32847" />


<img width="1917" height="907" alt="image" src="https://github.com/user-attachments/assets/883df422-cca0-4022-8076-1d830af6e92e" />


<img width="1917" height="1016" alt="image" src="https://github.com/user-attachments/assets/36998798-fb85-4e07-8e4b-2b0ae7c09ac2" />


<img width="1917" height="1016" alt="image" src="https://github.com/user-attachments/assets/3e9913ae-0d2e-47c2-a99f-f284aa4cf290" />


<img width="1917" height="1015" alt="image" src="https://github.com/user-attachments/assets/be7e3a13-1405-4b7b-b708-bdb45de6b14f" />


### 4. Artwork customization / Properties integration

<img width="1917" height="1020" alt="image" src="https://github.com/user-attachments/assets/763d36c1-8f60-4bd2-9901-4a1da09cd12a" />


<img width="1917" height="1015" alt="image" src="https://github.com/user-attachments/assets/f4e460c7-d7df-46f6-ac8d-645aeae06ccd" />


### 5. Big Picture integration

<img width="1917" height="1077" alt="aa" src="https://github.com/user-attachments/assets/55e55988-6749-4673-ab26-7efb3003fb3e" />


<img width="1917" height="1077" alt="ASDADASD" src="https://github.com/user-attachments/assets/3808bca5-ef79-4d78-9c1f-1fca03857067" />

### 6. AppID linking / automatic detection

<img width="1917" height="1015" alt="image" src="https://github.com/user-attachments/assets/bb057d46-3946-4b83-842c-0f7171bf9fc2" />

### 7. Integration with SAM

<img width="2558" height="1354" alt="image" src="https://github.com/user-attachments/assets/2c0eb58e-d0c2-4f8c-addb-c7a7194ea624" />

---

## 🔍 Smart Automatic Detection and Linking

When a newly added non-Steam shortcut is opened, NativeGameLink can suggest the most likely Steam release automatically.

The detector evaluates multiple signals instead of trusting the shortcut name alone:

- Executable name and full executable path.
- Parent folders and install-directory identity.
- `steam_appid.txt`, launch arguments, manifests, and other direct Steam evidence.
- Known official executable names and verified aliases.
- Unreal Engine targets such as `Win64-Shipping.exe`.
- Generic launchers and bootstrap executables, which are treated more cautiously.
- Store candidates and edition differences, with an ambiguity gap between results.

The confirmation window displays candidate names, Steam AppIDs, confidence values, and covers before anything is changed. You can select another candidate, reject the suggestion, or enter an AppID manually from the shortcut's **Properties** window.

After confirmation, NativeGameLink:

1. Saves a stable mapping for the shortcut.
2. Renames it to the official Steam title.
3. Applies the official icon and Library artwork.
4. Preserves the original launch target.
5. Can replace a short-lived launcher with the detected long-running game executable so playtime remains accurate.
6. Finishes the identity and artwork work safely in the background even if the Properties window is closed.

---

## 🖼️ Automatic Artwork and Correct Native Placement

NativeGameLink prioritizes resources published by Steam and applies them using Steam's expected Library slots and proportions:

- **Portrait grid** (`600 × 900`) for collections and shelves.
- **Hero background** (`1920 × 620`) for the Library details header.
- **Transparent logo**, including Steam's official logo-position metadata when published.
- **Wide capsule** (`920 × 430`) for recent games and carousel surfaces.
- **Official shortcut icon** resolved from current and legacy Steam asset sources.

The artwork process reports whether every resource was applied successfully and identifies missing assets. Official Steam artwork is never replaced automatically by community artwork.

### SteamGridDB fallback

If Steam does not publish a particular portrait, hero, logo, or capsule, NativeGameLink can request only that missing resource from [SteamGridDB](https://www.steamgriddb.com/). Selection prefers the correct Steam AppID, asset type, dimensions, transparency, language, and appropriate visual style while rejecting unsafe provider domains.

Enter your own SteamGridDB API key in NativeGameLink settings and enable the automatic fallback. The key is stored only in the local Steam/Millennium browser context; it is not bundled with the plugin or sent to NativeGameLink servers. Other injected code sharing that browser context may be able to access local storage, so never publish a shared key.

---

## 🖥️ Big Picture Integration

For linked shortcuts, NativeGameLink adapts the local Big Picture data model so the games are presented like regular Steam Library entries:

- Linked games are no longer separated into a **Non-Steam**, **Outside Steam**, or equivalent localized category.
- The redundant non-Steam category is hidden when it becomes empty.
- Installed state, controller presentation, compatibility fields, and playtime are exposed to the Big Picture interface.
- The behavior is limited to mapped shortcuts and is restored when the plugin or Big Picture integration is unloaded.

This is a local UI integration. It does not convert the shortcut into an owned Steam license or bypass Steam ownership checks.

---

## 🏆 Non-Steam Achievements and Native Notifications

NativeGameLink brings a full achievement experience to your linked non-Steam games by combining official Steam achievement metadata and icons with a local achievement file or simulated progression.

Available achievement features include:

- Total and unlocked counters in the play bar and sidebar.
- Progress bars, unlocked and locked groups, icons, descriptions, and unlock dates.
- Full achievement modal with native-style filtering and global unlock percentages when available.
- Live monitoring of local progress files.
- Achievement unlock toast and sound using Steam's native notification system.
- A settings button for testing achievement notifications.
- Optional deterministic test achievements for interface testing when no progress file exists; disabled by default.

### 💡 How Non-Steam Achievements Work (Achievement Watcher Style)

Basically, the plugin **only reads achievement JSON files that have already been generated**, similar to how *Achievement Watcher* works. The main difference is that with NativeGameLink for Steam, the achievement system is **integrated directly into Steam's interface** and displays **Steam's native achievement notifications with sound**.

> [!IMPORTANT]
> **Complete Independence from SteamAutoCrack and External Generators:**
> - **Generating achievement JSON files is completely separate from the plugin.**
> - If a user wants to generate them using [SteamAutoCrack](https://github.com/SteamAutoCracks/Steam-auto-crack/releases) or Goldberg Emulator, SteamAutoCrack must be installed and used **independently**.
> - SteamAutoCrack is **not** included, bundled, called, executed, or integrated in any way by NativeGameLink for Steam.
> - **In short:** NativeGameLink for Steam does **not** depend on SteamAutoCrack and has **no integration** with it. The plugin can only read compatible achievement JSON files if the user already has them, regardless of how those files were generated.

### ⚙️ Externally Generated Files Are 100% Optional (Simulated Achievements)

Using externally generated achievement JSON files is **entirely optional**. Users can link their non-Steam games without any external files and use the plugin's **built-in simulated achievement system** instead:

- **Instant 100% Completion:** Mark all achievements as unlocked immediately.
- **Progressive Simulation:** Simulate earning achievements gradually over time.
- **Manual Tracking:** Adjust achievement progress and counts manually via sliders in Game Properties.

## 🎖️ Steam Achievement Manager (SAM) for Official Steam Games

What **is** integrated directly into the plugin is **Steam Achievement Manager (SAM)** functionality for managing achievements of **legitimately owned Steam games**:

- **Direct In-Client Management:** Inspect, unlock, lock, or modify achievement progress for your official Steam games directly from your Steam Library interface.
- **No External Standalone Tools:** No need to download, configure, or run separate standalone SAM applications (`SAM.exe`).
- **Instant Synchronization:** Changes synchronize immediately with Steam's backend and reflect live across your Steam client UI.

---

## ⏱️ Playtime and Session Tracking

### Steam Beta or the NativeGameLink fallback?

Steam Beta builds that include native non-Steam playtime tracking are recommended if you want Steam itself to measure and display the shortcut's local playtime. You can opt in from **Steam → Settings → Interface → Client Beta Participation → Steam Beta Update**.

NativeGameLink checks whether the current Steam client already exposes native playtime for each linked shortcut. When it does, the plugin uses Steam's value and does not create a duplicate counter. When it does not, NativeGameLink automatically activates its own local fallback tracker. The fallback is enabled by default and can be disabled in NativeGameLink settings.

The canonical local-tracking history is stored outside the plugin directory at `%APPDATA%\\NativeGameLinkForSteam\\playtime_sessions.json`. When the plugin is updated or reinstalled, the old file is migrated automatically and three recovery copies are retained. You should still export or copy that directory periodically if you also want protection against deleting the entire Windows profile or losing the disk.

The fallback can:

- Detect when a linked external game starts and stops.
- Persist sessions across shortcut title changes and regenerated shortcut IDs.
- Display lifetime playtime in the desktop Library and Big Picture.
- Keep aliases and canonical shortcut identity synchronized.
- Recover cleanly from overlapping or interrupted sessions.

### ⚠️ Critical Requirement: Main Game Executable vs. Launchers

> [!IMPORTANT]
> **Point directly to the original game executable:**
> For playtime tracking and session detection to function accurately (both via Steam's native tracker and through the NativeGameLink fallback), the Steam shortcut must target the **original, main game executable**—the `.exe` binary that stays open and actively running throughout your entire play session.
> 
> **Why doesn't it work with launchers or intermediary executables?**
> If you add an external launcher, bootstrap tool, script, or intermediary wrapper `.exe` that merely boots up the actual game and then immediately exits, Steam and the process monitor will assume the session finished in a few seconds, prematurely stopping the timer and leaving playtime unrecorded.
> 
> If a game uses a separate launcher, locate the actual long-running game executable inside the installation directory (for example, Unreal Engine titles typically place it under `Binaries/Win64/...-Shipping.exe`) and set it as the shortcut target in Steam. During the linking workflow, NativeGameLink will also attempt to identify and suggest this real executable automatically.

---

## 🎴 Trading Cards, Badges, DLC, and Workshop

When the Steam release exposes the corresponding data, NativeGameLink adds optional native-style sidebar sections:

- Official trading-card artwork sourced from Steam Community and the Community Market.
- Badge artwork, experience presentation, collected/remaining counts, and a responsive card grid.
- Interactive card enlargement with bounded 3D tilt, directional brightness, cursor glow, and foil-only holographic reflection.
- Validated DLC covers and Store links.
- Workshop preview and navigation when the title supports Steam Workshop.

These sections recreate the Library presentation only. NativeGameLink does not award cards, badges, XP, DLC ownership, or Steam inventory items.

---

## 🌐 Multilingual Interface

NativeGameLink automatically detects the active Steam client language and localizes the injected interface to match it. Library headings, navigation links, achievements, activity labels, community sections, game information, tooltips, and native controls reuse Steam's official localization tokens whenever they are available.

Plugin-specific windows, detection messages, settings, and linking results use NativeGameLink's localization catalog. Spanish is included directly, while English provides the safe fallback for text that Steam does not translate. Changing the Steam client language refreshes the localized data and interface without requiring a separate plugin edition.

---

## 📥 Installation

1. Install [Millennium](https://steambrew.app/) for Steam.
2. Download the latest `NativeGameLink-for-Steam.zip` release.
3. Extract the archive and place the `NativeGameLink for Steam` folder into your Millennium plugins directory:

   - **Windows:**
     ```text
     C:\Program Files (x86)\Steam\millennium\plugins\
     ```
4. Restart Steam.
5. Enable **NativeGameLink for Steam** in Millennium's Plugins page.

---

## 🚀 Quick Start

1. In Steam, choose **Games → Add a Non-Steam Game to My Library...** and add the **main game executable** (avoid selecting launchers or intermediary executables to ensure accurate playtime tracking).
2. Open the new shortcut in your Library.
3. Review the automatic detection modal and choose **Link game**.
4. Wait for the success report confirming the title, icon, and artwork that were applied.
5. The linked Library page will populate with the available Steam information and optional sections.

If automatic detection is uncertain or unavailable:

1. Right-click the shortcut and open **Properties**.
2. Under **Linked Game**, review the visual candidates or paste a Steam AppID/Store URL.
3. Choose the correct release and press **Save**.

---

## 🛠️ Building from Source

The repository includes the production bundle at `.millennium/Dist/index.js`.

```bash
# Install dependencies
npm install

# Run TypeScript, architecture, localization, detection, and Lua checks
npm run check

# Build the production bundle
npm run build

# Run every check and validate the generated bundle
npm run verify
```

Backend changes under `backend/` take effect after restarting Steam.

---

## ☕ Support the Project

If NativeGameLink for Steam has improved your library, you can support its continued development, testing, localization, and maintenance on [Ko-fi](https://ko-fi.com/senkumil). Every contribution is appreciated and helps keep the project moving forward.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
