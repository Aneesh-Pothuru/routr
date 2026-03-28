const DEFAULT_SHORTCUTS = {
  // Kept defaults (verified from browsing history)
  "c": { url: "https://calendar.google.com", description: "Google Calendar" },
  "m": { url: "https://mail.google.com", description: "Gmail" },
  "d": { url: "https://drive.google.com", description: "Google Drive" },
  "gh": { url: "https://github.com", description: "GitHub" },
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
  "az": { url: "https://www.amazon.com/", description: "Amazon" },
  "att": { url: "https://www.att.com/my/", description: "AT&T My Account" },
  "cos": { url: "https://www.costco.com/", description: "Costco" }
};

// --- Storage ---

async function getShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || DEFAULT_SHORTCUTS;
}

// --- DNR Rule Sync ---
// Syncs all shortcuts as declarativeNetRequest dynamic redirect rules.
// These fire BEFORE DNS resolution, so no /etc/hosts needed.

async function syncRulesToDNR() {
  const shortcuts = await getShortcuts();

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  // Build new rules — one per shortcut
  const addRules = [];
  let id = 1;

  for (const [key, value] of Object.entries(shortcuts)) {
    // Rule for http://<key>/ and http://<key>
    addRules.push({
      id: id++,
      priority: 1,
      action: { type: "redirect", redirect: { url: value.url } },
      condition: {
        urlFilter: `||${key}/`,
        resourceTypes: ["main_frame"]
      }
    });
  }

  // Add rule for r/ → extension options page
  addRules.push({
    id: id++,
    priority: 2,
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
  if (shortcuts[hostname]) {
    chrome.tabs.update(details.tabId, { url: shortcuts[hostname].url });
  }
});

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
});

// --- Storage change listener ---
// Sync DNR rules whenever shortcuts change (e.g., from another device via sync)

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcuts) {
    syncRulesToDNR();
  }
});
