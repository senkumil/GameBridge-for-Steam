# GameBridge for Steam

A powerful [Millennium](https://steambrew.app/) plugin designed to seamlessly bridge non-Steam shortcuts with official Steam metadata, delivering a rich, authentic Steam Library and Big Picture experience.

Link any external game or shortcut to an official **Steam AppID or Store link** to display its real Steam artwork, news, friend activity, community hub content, achievements, and game details directly within your Steam client.

---

## ✨ Features

- **Automatic Artwork Integration**: Fetches official Steam CDN assets (Hero banner, Logo, vertical Portrait Grid, and wide Capsule) and applies them directly to your shortcut with official logo sizing and positioning.
- **Smart AppID Detection**: Automatically suggests and matches external executables using local Steam evidence, folder names, executable signatures (such as Unreal Engine `Win64-Shipping` targets), and official launch parameters.
- **Native-Parity Library Details**: Renders localized game descriptions, developer, publisher, release date, and feature tags following your active Steam language without truncation.
- **Activity & News Feed**: Chronological feed displaying real partner events, major updates, patch notes, and DLC announcements with localized text and event covers.
- **Social & Friend Activity**: View which friends play or own the linked game, friend achievements, shared screenshots/reviews, and post status updates directly to your feed.
- **Achievements Integration**: 
  - Real unlock counts and progress for games you own.
  - Optional local achievements integration reading from `C:\Steam Auto\<AppID>\achievements.json` with a native-style progress bar, sidebar panel, and interactive achievements modal.
- **Community Hub Content**: Top community screenshots, artwork, and guides loaded progressively as you scroll.
- **Optional Sections**: Simulated trading card badges, validated DLC links, and Workshop shortcuts when supported by the linked AppID.
- **Seamless Big Picture Support**: Playtime tracking and controller-compatible presentation while cleanly hiding redundant non-Steam categories.
- **Non-Invasive Scope**: Native Steam games and unlinked shortcuts remain 100% untouched.

---

## 📥 Installation

1. Install [Millennium](https://steambrew.app/) for Steam.
2. Download or clone this repository into your Millennium plugins directory:
   ```text
   <Steam>\millennium\plugins\GameBridge for Steam
   ```
3. Restart Steam.
4. Enable **GameBridge for Steam** in Millennium Settings (**Steam → Settings → Millennium → Plugins**).

---

## 🎮 Usage

1. Add your non-Steam game to Steam as usual (**Games → Add a Non-Steam Game to My Library...**).
2. When the plugin detects a matching Steam game, review the confirmation prompt and click **Link game**.
3. *Manual linking*: If auto-detection is skipped, right-click the shortcut in your Library → **Properties** → under **Linked Game**, search or paste a Steam AppID / store URL, and click **Save**.
4. Open the game's Library page; artwork and Steam metadata will apply automatically.

---

## 🏆 Local Achievements Configuration (Optional)

The plugin can display local achievement progress from a JSON file (read-only; does not modify Steam servers or inventory).

- **Default path**:
  ```text
  C:\Steam Auto\<AppID>\achievements.json
  ```
- **Custom base folder**: Change the global base path in **Millennium → Plugins → GameBridge for Steam** (persisted in `achievement_base_path.txt`).
- **Per-game override**: Open the shortcut's **Properties → Linked Game → Achievement progress file** and specify an exact `.json` path or folder.

---

## 🛠️ Building from Source

The repository comes pre-bundled in `.millennium/Dist/index.js`. If you wish to modify the source code:

```bash
# Install dependencies
npm install

# Run source architecture & type checks
npm run check

# Build production bundle
npm run build

# Verify build and dist bundle integrity
npm run verify
```

Backend changes (`backend/main.lua` and `backend/lib/`) take effect immediately upon restarting Steam.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

Developed by **David Miranda ([Davidjarod11](https://github.com/Davidjarod11))**.
