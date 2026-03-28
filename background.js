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
  // Personalized shortcuts (from Chrome history & Gmail analysis)
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

// Initialize default shortcuts on install
chrome.runtime.onInstalled.addListener(async () => {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  if (!shortcuts) {
    await chrome.storage.sync.set({ shortcuts: DEFAULT_SHORTCUTS });
  }
});

// Load shortcuts from storage
async function getShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || DEFAULT_SHORTCUTS;
}

// Intercept navigation to short hostnames (e.g., http://c/ → Google Calendar)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle top-level frame navigations
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }

  const hostname = url.hostname.toLowerCase();

  // Only match single-label hostnames (no dots = short hostname like "c", "gh", "docs")
  if (hostname.includes(".")) return;

  const shortcuts = await getShortcuts();

  if (shortcuts[hostname]) {
    chrome.tabs.update(details.tabId, { url: shortcuts[hostname].url });
  }
});

// Provide defaults to options page via messaging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getDefaults") {
    sendResponse(DEFAULT_SHORTCUTS);
    return true;
  }
});
