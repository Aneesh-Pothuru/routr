# Routr

Type `c/` in your Chrome address bar and go straight to Google Calendar. Type `gh/` for GitHub. Type `cl/` for Claude. No extra steps, no prefix keywords — just type and go.

Routr is a Chrome extension that turns short keywords into instant URL redirects, right from your address bar.

## How It Works

```
You type:    c/          →  Google Calendar
             gh/         →  GitHub
             ow/         →  Outlook (Work Email)
             r/          →  Routr Config Page
```

When you type `c/` in Chrome's address bar, Chrome interprets the trailing `/` as a URL. Routr intercepts this navigation using Chrome's `declarativeNetRequest` API and redirects to the mapped URL **before DNS even resolves**. No local servers, no `/etc/hosts` editing, no setup scripts — it just works.

## Install

1. Clone this repo:
   ```
   git clone https://github.com/Aneesh-Pothuru/routr.git
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `routr/` folder

5. Done. Type `c/` in your address bar to test it.

## Default Shortcuts

Routr ships with 34 pre-configured shortcuts:

| Shortcut | Destination | Category |
|----------|-------------|----------|
| `c/` | Google Calendar | Google |
| `m/` | Gmail | Google |
| `d/` | Google Drive | Google |
| `docs/` | Google Docs | Google |
| `gh/` | GitHub | Dev |
| `gcp/` | Google Cloud Console | Dev |
| `nc/` | NeetCode | Dev |
| `ex/` | Excalidraw | Dev |
| `do/` | DigitalOcean | Dev |
| `cl/` | Claude | AI |
| `gpt/` | ChatGPT | AI |
| `gem/` | Google Gemini | AI |
| `ow/` | Outlook (Work Email) | Work |
| `ms/` | Morgan Stanley at Work | Work |
| `rm/` | Rocket Money | Finance |
| `hsa/` | HealthEquity HSA | Finance |
| `vg/` | Vanguard VFFSX | Finance |
| `rh/` | Robinhood | Finance |
| `fi/` | Fidelity | Finance |
| `cap/` | Capital One | Finance |
| `ch/` | Chase | Finance |
| `merc/` | Mercury | Finance |
| `bilt/` | Bilt Rewards | Finance |
| `oura/` | Oura Ring | Health |
| `mc/` | UCSF MyChart | Health |
| `yt/` | YouTube | Social |
| `li/` | LinkedIn | Social |
| `luma/` | Luma Events | Social |
| `az/` | Amazon | Shopping |
| `cos/` | Costco | Shopping |
| `dd/` | DoorDash | Shopping |
| `att/` | AT&T | Other |
| `n/` | Notion | Other |
| `hi/` | Hello Interview | Other |

## Managing Shortcuts

### Config Page

Type `r/` in your address bar or right-click the Routr extension icon and select **Options** to open the config page.

From there you can:
- **Add** new shortcuts with a key, URL, and description
- **Edit** existing shortcuts inline
- **Delete** shortcuts you don't need
- **Search** and filter by keyword, URL, or description
- **Filter by category** (Work, Finance, Dev, Health, AI, Google, Shopping, Social)
- **Export** your shortcuts as a JSON file
- **Import** shortcuts from a JSON file
- **Reset** to defaults

### Quick Access Popup

Click the Routr icon in Chrome's toolbar to see a searchable list of all your shortcuts. Click any shortcut to navigate instantly.

### Auto-Propagation

When you add or edit a shortcut in the config page, the redirect rule is **automatically created** — no manual setup, no restarting Chrome. It works immediately.

## How It Works (Technical)

Routr uses three Chrome extension APIs:

1. **`declarativeNetRequest`** — The primary mechanism. Creates URL redirect rules that fire *before DNS resolution*. When you type `c/`, Chrome tries to navigate to `http://c/`. The DNR rule intercepts this and redirects to `https://calendar.google.com` seamlessly — no error page, no flicker.

2. **`webNavigation.onErrorOccurred`** — Fallback. If DNR doesn't catch a navigation (edge case), this listener detects the `ERR_NAME_NOT_RESOLVED` error and redirects via `chrome.tabs.update()`.

3. **`chrome.storage.sync`** — Stores shortcuts and syncs them across all Chrome instances signed into the same Google account.

## File Structure

```
routr/
  manifest.json     Chrome extension manifest (Manifest V3)
  background.js     Service worker: DNR rule sync, error fallback, messaging
  options.html      Landing page / config UI
  options.css       Dark theme styles
  options.js        Config page logic: CRUD, categories, search, import/export
  popup.html        Toolbar popup UI
  popup.js          Popup logic: search, navigate
  icons/
    icon16.png      Extension icon (16x16)
    icon48.png      Extension icon (48x48)
    icon128.png     Extension icon (128x128)
```

## Import/Export Format

Shortcuts are stored as JSON. You can export and share them:

```json
{
  "c": {
    "url": "https://calendar.google.com",
    "description": "Google Calendar"
  },
  "gh": {
    "url": "https://github.com",
    "description": "GitHub"
  }
}
```

## License

MIT
