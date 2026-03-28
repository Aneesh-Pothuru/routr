const DEFAULT_SHORTCUTS = {
  "c": { url: "https://calendar.google.com", description: "Google Calendar" },
  "m": { url: "https://mail.google.com", description: "Gmail" },
  "d": { url: "https://drive.google.com", description: "Google Drive" },
  "gh": { url: "https://github.com", description: "GitHub" },
  "yt": { url: "https://youtube.com", description: "YouTube" },
  "r": { url: "https://reddit.com", description: "Reddit" },
  "gpt": { url: "https://chat.openai.com", description: "ChatGPT" },
  "cl": { url: "https://claude.ai", description: "Claude" },
  "docs": { url: "https://docs.google.com", description: "Google Docs" },
  "sheets": { url: "https://sheets.google.com", description: "Google Sheets" },
  "slides": { url: "https://slides.google.com", description: "Google Slides" },
  "li": { url: "https://linkedin.com", description: "LinkedIn" },
  "maps": { url: "https://maps.google.com", description: "Google Maps" },
  "n": { url: "https://notion.so", description: "Notion" }
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
