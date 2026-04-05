const DEFAULT_SHORTCUTS = {
  // Kept defaults (verified from browsing history)
  "c": { url: "https://calendar.google.com", description: "Google Calendar" },
  "m": { url: "https://mail.google.com", description: "Gmail" },
  "d": { url: "https://drive.google.com", description: "Google Drive" },
  "gh": { url: "https://github.com/{repo}", description: "GitHub (or gh/repo for direct access)" },
  "yt": { url: "https://youtube.com", description: "YouTube" },
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

const DEFAULT_GROUPS = {
  "morning": {
    description: "Morning Comms",
    shortcuts: ["m", "ow", "c"]
  },
  "fin": {
    description: "Finance Check",
    shortcuts: ["rh", "vg", "rm", "ch", "cap"]
  },
  "dev": {
    description: "Dev Session",
    shortcuts: ["gh", "gcp", "cl", "ex"]
  }
};

// --- Storage ---

async function getShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || DEFAULT_SHORTCUTS;
}

async function getShortcutGroups() {
  const { shortcutGroups } = await chrome.storage.sync.get("shortcutGroups");
  return shortcutGroups || DEFAULT_GROUPS;
}

// --- URL Template Helpers ---

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  return url.replace(/\/?\{[^}]+\}.*$/, "");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- DNR Rule Sync ---

async function syncRulesToDNR() {
  const shortcuts = await getShortcuts();

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  const addRules = [];
  let id = 1;

  for (const [key, value] of Object.entries(shortcuts)) {
    const allKeys = [key];
    if (value.aliases && Array.isArray(value.aliases)) {
      allKeys.push(...value.aliases);
    }

    for (const k of allKeys) {
      if (isTemplateUrl(value.url)) {
        const regexSub = value.url.replace(/\{[^}]+\}/, "\\1");
        addRules.push({
          id: id++,
          priority: 2,
          action: { type: "redirect", redirect: { regexSubstitution: regexSub } },
          condition: {
            regexFilter: `^https?://${escapeRegex(k)}/(.+)$`,
            resourceTypes: ["main_frame"]
          }
        });

        const baseUrl = getBaseUrl(value.url);
        if (baseUrl) {
          addRules.push({
            id: id++,
            priority: 1,
            action: { type: "redirect", redirect: { url: baseUrl } },
            condition: { urlFilter: `||${k}/`, resourceTypes: ["main_frame"] }
          });
        }
      } else {
        addRules.push({
          id: id++,
          priority: 1,
          action: { type: "redirect", redirect: { url: value.url } },
          condition: { urlFilter: `||${k}/`, resourceTypes: ["main_frame"] }
        });
      }
    }
  }

  // r/ → extension options page
  addRules.push({
    id: id++,
    priority: 3,
    action: { type: "redirect", redirect: { extensionPath: "/options.html" } },
    condition: { urlFilter: "||r/", resourceTypes: ["main_frame"] }
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: addRules
  });
}

// --- Usage Tracking ---

async function trackRecentUsage(key) {
  const { recentlyUsed } = await chrome.storage.local.get("recentlyUsed");
  let recent = recentlyUsed || [];
  recent = recent.filter(k => k !== key);
  recent.unshift(key);
  recent = recent.slice(0, 5);
  await chrome.storage.local.set({ recentlyUsed: recent });
}

async function trackUsage(key, type = "shortcut") {
  const { usageLog } = await chrome.storage.local.get("usageLog");
  let log = usageLog || [];
  const entry = { key, ts: Date.now() };
  if (type !== "shortcut") entry.type = type;
  log.push(entry);
  // Prune entries older than 90 days
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  log = log.filter(e => e.ts > cutoff);
  await chrome.storage.local.set({ usageLog: log });
}

function computeUsageSummary(log, shortcuts) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const summary = {};

  // Initialize all shortcuts with zero counts
  for (const key of Object.keys(shortcuts)) {
    summary[key] = { count: 0, weekCount: 0, lastUsed: 0 };
  }

  for (const entry of log) {
    if (!summary[entry.key]) {
      summary[entry.key] = { count: 0, weekCount: 0, lastUsed: 0 };
    }
    summary[entry.key].count++;
    if (entry.ts > weekAgo) summary[entry.key].weekCount++;
    if (entry.ts > summary[entry.key].lastUsed) summary[entry.key].lastUsed = entry.ts;
  }

  return summary;
}

// --- Install ---

chrome.runtime.onInstalled.addListener(async () => {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  if (!shortcuts) {
    await chrome.storage.sync.set({ shortcuts: DEFAULT_SHORTCUTS });
  }
  const { shortcutGroups } = await chrome.storage.sync.get("shortcutGroups");
  if (!shortcutGroups) {
    await chrome.storage.sync.set({ shortcutGroups: DEFAULT_GROUPS });
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

  // Check groups first — groups take priority over individual shortcuts
  const groups = await getShortcutGroups();
  if (groups[hostname]) {
    const group = groups[hostname];
    const shortcuts = await getShortcuts();
    const urls = group.shortcuts
      .map(k => {
        const s = shortcuts[k];
        if (!s) return null;
        return isTemplateUrl(s.url) ? getBaseUrl(s.url) : s.url;
      })
      .filter(Boolean);

    for (let i = 0; i < urls.length; i++) {
      await chrome.tabs.create({ url: urls[i], active: i === urls.length - 1 });
    }
    // Close the trigger tab
    chrome.tabs.remove(details.tabId);
    trackRecentUsage(hostname);
    trackUsage(hostname, "group");
    return;
  }

  // Then check individual shortcuts
  const shortcuts = await getShortcuts();
  const pathAfterSlash = url.pathname.replace(/^\/+/, "");

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
      targetUrl = matchValue.url.replace(/\{[^}]+\}/, pathAfterSlash);
    } else if (isTemplateUrl(matchValue.url)) {
      targetUrl = getBaseUrl(matchValue.url);
    } else {
      targetUrl = matchValue.url;
    }
    chrome.tabs.update(details.tabId, { url: targetUrl });
    trackRecentUsage(matchKey);
    trackUsage(matchKey);
  }
});

// --- Track DNR redirects ---

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0 || details.transitionType !== "typed") return;
  const shortcuts = await getShortcuts();
  for (const [key, value] of Object.entries(shortcuts)) {
    const checkUrl = isTemplateUrl(value.url) ? getBaseUrl(value.url) : value.url;
    if (details.url === checkUrl || details.url.startsWith(checkUrl)) {
      trackRecentUsage(key);
      trackUsage(key);
      break;
    }
  }
});

// --- Broken Link Detection ---

async function checkBrokenLinks() {
  const shortcuts = await getShortcuts();
  const broken = [];

  for (const [key, value] of Object.entries(shortcuts)) {
    const checkUrl = isTemplateUrl(value.url) ? getBaseUrl(value.url) : value.url;
    if (!checkUrl) continue;
    try {
      await fetch(checkUrl, { method: "HEAD", mode: "no-cors" });
    } catch {
      broken.push(key);
    }
  }

  await chrome.storage.local.set({ brokenLinks: broken, brokenLinksCheckedAt: Date.now() });
}

// --- History Scanning for Smart Suggestions ---

async function scanHistory() {
  // Only scan if history permission is available
  if (!chrome.history) return;

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let items;
  try {
    items = await chrome.history.search({ text: "", startTime: oneWeekAgo, maxResults: 5000 });
  } catch {
    return;
  }

  // Count visits per domain
  const domainCounts = {};
  const domainUrls = {};
  for (const item of items) {
    try {
      const parsed = new URL(item.url);
      const domain = parsed.hostname.replace(/^www\./, "");
      domainCounts[domain] = (domainCounts[domain] || 0) + (item.visitCount || 1);
      if (!domainUrls[domain]) domainUrls[domain] = item.url;
    } catch { continue; }
  }

  // Get existing shortcut domains
  const shortcuts = await getShortcuts();
  const existingDomains = new Set();
  for (const value of Object.values(shortcuts)) {
    try {
      const d = new URL(isTemplateUrl(value.url) ? getBaseUrl(value.url) : value.url).hostname.replace(/^www\./, "");
      existingDomains.add(d);
    } catch { continue; }
  }

  // Filter out dismissed
  const { dismissedSuggestions } = await chrome.storage.local.get("dismissedSuggestions");
  const dismissed = new Set(dismissedSuggestions || []);

  // Build suggestions: domains visited 5+ times without shortcuts
  const suggestions = Object.entries(domainCounts)
    .filter(([domain, count]) => count >= 5 && !existingDomains.has(domain) && !dismissed.has(domain))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([domain, count]) => ({
      url: `https://${domain}`,
      domain,
      weeklyVisits: count,
      suggestedKey: domain.split(".")[0].slice(0, 2).toLowerCase()
    }));

  await chrome.storage.local.set({ historySuggestions: suggestions, historyLastScanned: Date.now() });
}

// Run background tasks on startup
checkBrokenLinks();
scanHistory();

// --- Message handler ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "updateRules") {
    syncRulesToDNR().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "getDefaults") {
    sendResponse({ shortcuts: DEFAULT_SHORTCUTS, groups: DEFAULT_GROUPS });
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
  if (msg.type === "getGroups") {
    getShortcutGroups().then(sendResponse);
    return true;
  }
  if (msg.type === "getUsageSummary") {
    (async () => {
      const { usageLog } = await chrome.storage.local.get("usageLog");
      const shortcuts = await getShortcuts();
      sendResponse(computeUsageSummary(usageLog || [], shortcuts));
    })();
    return true;
  }
  if (msg.type === "getHistorySuggestions") {
    chrome.storage.local.get(["historySuggestions", "historyLastScanned"]).then(sendResponse);
    return true;
  }
  if (msg.type === "dismissSuggestion") {
    (async () => {
      const { dismissedSuggestions } = await chrome.storage.local.get("dismissedSuggestions");
      const dismissed = dismissedSuggestions || [];
      dismissed.push(msg.domain);
      await chrome.storage.local.set({ dismissedSuggestions: dismissed });
      await scanHistory();
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg.type === "rescanHistory") {
    scanHistory().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// --- Storage change listener ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcuts) {
    syncRulesToDNR();
  }
});
