const DEFAULT_SHORTCUTS = {
  // Kept defaults (verified from browsing history)
  "c": { url: "https://calendar.google.com", description: "Google Calendar" },
  "m": { url: "https://mail.google.com", description: "Gmail" },
  "d": { url: "https://drive.google.com", description: "Google Drive" },
  "gh": { url: "https://github.com/{repo}", description: "GitHub (or gh/repo for direct access)" },
  "yt": { url: "https://youtube.com", description: "YouTube" },
  "gpt": { url: "https://chat.openai.com", description: "ChatGPT" },
  "cl": { url: "https://claude.ai", description: "Claude" },
  "docs": { url: "https://docs.google.com", description: "Google Docs" },
  "li": { url: "https://linkedin.com", description: "LinkedIn" },
  "n": { url: "https://notion.so", description: "Notion" },
  // Personalized shortcuts
  "ow": { url: "https://outlook.office.com/mail/", description: "Waymo Work Email (Outlook)" },
  "rm": { url: "https://app.rocketmoney.com/", description: "Rocket Money Dashboard" },
  "oura": { url: "https://cloud.ouraring.com/", description: "Oura Ring Dashboard" },
  "hi": { url: "https://www.hellointerview.com/", description: "Hello Interview Prep" },
  "hsa": { url: "https://my.healthequity.com/", description: "HealthEquity HSA Portal" },
  "vg": { url: "https://investor.vanguard.com/investment-products/mutual-funds/profile/vffsx", description: "Vanguard VFFSX Fund" },
  "nc": { url: "https://neetcode.io/", description: "NeetCode Practice" },
  "mc": { url: "https://ucsfmychart.ucsfmedicalcenter.org/", description: "UCSF MyChart Medical Portal" },
  "gcp": { url: "https://console.cloud.google.com/", description: "Google Cloud Console" },
  "ms": { url: "https://waymo.solium.com/", description: "Morgan Stanley at Work (Waymo Equity)" },
  "rh": { url: "https://robinhood.com/", description: "Robinhood Trading" },
  "fi": { url: "https://fundresearch.fidelity.com/", description: "Fidelity Fund Research" },
  "cap": { url: "https://myaccounts.capitalone.com/", description: "Capital One (Venture X)" },
  "ch": { url: "https://secure.chase.com/", description: "Chase Banking" },
  "gem": { url: "https://gemini.google.com/", description: "Google Gemini AI" },
  "ex": { url: "https://app.excalidraw.com/", description: "Excalidraw Whiteboard" },
  "do": { url: "https://cloud.digitalocean.com/", description: "DigitalOcean Cloud" },
  "merc": { url: "https://app.mercury.com/", description: "Mercury (Bench AI Banking)" },
  "bilt": { url: "https://www.biltrewards.com/", description: "Bilt Rewards (Rent)" },
  "dd": { url: "https://www.doordash.com/", description: "DoorDash" },
  "luma": { url: "https://lu.ma/", description: "Luma Events" },
  "az": { url: "https://www.amazon.com/s?k={query}", description: "Amazon (or az/search term)" },
  "att": { url: "https://www.att.com/my/", description: "AT&T My Account" },
  "cos": { url: "https://www.costco.com/", description: "Costco" },
  "gm": { url: "https://mail.google.com/mail/u/0/#search/{query}", description: "Gmail Search (gm/search term)" }
};

// --- Storage ---

async function getShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || DEFAULT_SHORTCUTS;
}

// --- URL Template Helpers ---

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  // Strip template parameters from URL: "https://github.com/{repo}" → "https://github.com"
  return url.replace(/\/?\{[^}]+\}.*$/, "");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- DNR Rule Sync ---
// Syncs all shortcuts as declarativeNetRequest dynamic redirect rules.
// These fire BEFORE DNS resolution, so no /etc/hosts needed.

async function syncRulesToDNR() {
  const shortcuts = await getShortcuts();

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  // Build new rules
  const addRules = [];
  let id = 1;

  for (const [key, value] of Object.entries(shortcuts)) {
    // Collect all keys (primary + aliases)
    const allKeys = [key];
    if (value.aliases && Array.isArray(value.aliases)) {
      allKeys.push(...value.aliases);
    }

    for (const k of allKeys) {
      if (isTemplateUrl(value.url)) {
        // Template shortcut: use regexFilter to capture path after key
        // e.g. gh/{repo} → regex captures everything after "gh/"
        // Rule 1: with parameter — gh/something → redirect with substitution
        const templateUrl = value.url;
        // Build regexSubstitution: replace {param} with \1
        const regexSub = templateUrl.replace(/\{[^}]+\}/, "\\1");
        addRules.push({
          id: id++,
          priority: 2,
          action: {
            type: "redirect",
            redirect: { regexSubstitution: regexSub }
          },
          condition: {
            regexFilter: `^https?://${escapeRegex(k)}/(.+)$`,
            resourceTypes: ["main_frame"]
          }
        });

        // Rule 2: without parameter — just "gh/" → go to base URL (lower priority)
        const baseUrl = getBaseUrl(value.url);
        if (baseUrl) {
          addRules.push({
            id: id++,
            priority: 1,
            action: { type: "redirect", redirect: { url: baseUrl } },
            condition: {
              urlFilter: `||${k}/`,
              resourceTypes: ["main_frame"]
            }
          });
        }
      } else {
        // Static shortcut: simple urlFilter redirect
        addRules.push({
          id: id++,
          priority: 1,
          action: { type: "redirect", redirect: { url: value.url } },
          condition: {
            urlFilter: `||${k}/`,
            resourceTypes: ["main_frame"]
          }
        });
      }
    }
  }

  // Add rule for r/ → extension options page
  addRules.push({
    id: id++,
    priority: 3,
    action: { type: "redirect", redirect: { extensionPath: "/options.html" } },
    condition: {
      urlFilter: "||r/",
      resourceTypes: ["main_frame"]
    }
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules
  });
}

// --- Recently Used Tracking ---

async function trackRecentUsage(key) {
  const { recentlyUsed } = await chrome.storage.local.get("recentlyUsed");
  let recent = recentlyUsed || [];
  // Remove if already present, then prepend
  recent = recent.filter(k => k !== key);
  recent.unshift(key);
  // Keep only last 5
  recent = recent.slice(0, 5);
  await chrome.storage.local.set({ recentlyUsed: recent });
}

// --- Install ---

chrome.runtime.onInstalled.addListener(async () => {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  if (!shortcuts) {
    await chrome.storage.sync.set({ shortcuts: DEFAULT_SHORTCUTS });
  }
  await syncRulesToDNR();
});

// --- Fallback: catch failed navigations for short hostnames ---

chrome.webNavigation.onErrorOccurred.addListener(async (details) => {
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.includes(".")) return;

  const shortcuts = await getShortcuts();
  const pathAfterSlash = url.pathname.replace(/^\/+/, "");

  // Find matching shortcut (check primary key + aliases)
  let matchKey = null;
  let matchValue = null;
  for (const [key, value] of Object.entries(shortcuts)) {
    if (key === hostname) {
      matchKey = key;
      matchValue = value;
      break;
    }
    if (value.aliases && value.aliases.includes(hostname)) {
      matchKey = key;
      matchValue = value;
      break;
    }
  }

  if (matchValue) {
    let targetUrl;
    if (pathAfterSlash && isTemplateUrl(matchValue.url)) {
      // Replace template parameter with the path
      targetUrl = matchValue.url.replace(/\{[^}]+\}/, pathAfterSlash);
    } else if (isTemplateUrl(matchValue.url)) {
      targetUrl = getBaseUrl(matchValue.url);
    } else {
      targetUrl = matchValue.url;
    }
    chrome.tabs.update(details.tabId, { url: targetUrl });
    trackRecentUsage(matchKey);
  }
});

// --- Track DNR redirects via onBeforeNavigate ---
// DNR fires before this, so if we see a navigation to a shortcut's target URL, log it.

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0 || details.transitionType !== "typed") return;
  // Check if the committed URL matches any shortcut target
  const shortcuts = await getShortcuts();
  for (const [key, value] of Object.entries(shortcuts)) {
    if (details.url === value.url || details.url.startsWith(value.url)) {
      trackRecentUsage(key);
      break;
    }
  }
});

// --- Broken Link Detection ---
// Runs on service worker startup, checks each shortcut URL in the background.

async function checkBrokenLinks() {
  const shortcuts = await getShortcuts();
  const broken = [];

  for (const [key, value] of Object.entries(shortcuts)) {
    const checkUrl = isTemplateUrl(value.url) ? getBaseUrl(value.url) : value.url;
    if (!checkUrl) continue;
    try {
      const resp = await fetch(checkUrl, { method: "HEAD", mode: "no-cors" });
      // no-cors returns opaque responses (status 0), so we can only catch network errors
    } catch {
      broken.push(key);
    }
  }

  await chrome.storage.local.set({ brokenLinks: broken, brokenLinksCheckedAt: Date.now() });
}

// Run broken link check on startup, but don't block anything
checkBrokenLinks();

// --- Message handler ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "updateRules") {
    syncRulesToDNR().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "getDefaults") {
    sendResponse(DEFAULT_SHORTCUTS);
    return true;
  }
  if (msg.type === "getBrokenLinks") {
    chrome.storage.local.get(["brokenLinks", "brokenLinksCheckedAt"]).then(sendResponse);
    return true;
  }
  if (msg.type === "recheckBrokenLinks") {
    checkBrokenLinks().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// --- Storage change listener ---
// Sync DNR rules whenever shortcuts change (e.g., from another device via sync)

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcuts) {
    syncRulesToDNR();
  }
});
