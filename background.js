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
  try {
    const templateIdx = url.indexOf("{");
    if (templateIdx === -1) return url;
    const beforeTemplate = url.substring(0, templateIdx);
    // If template is in query string or hash, return just the origin
    if (beforeTemplate.includes("?") || beforeTemplate.includes("#")) {
      const parsed = new URL(url.replace(/\{[^}]+\}/g, "x"));
      return parsed.origin;
    }
    // Template is in path — strip the segment containing it
    return beforeTemplate.replace(/\/?$/, "") || new URL(url.replace(/\{[^}]+\}/g, "x")).origin;
  } catch {
    return url.replace(/\/?\{[^}]+\}.*$/, "");
  }
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
  if (msg.type === "getSessions") {
    getSessions().then(sendResponse);
    return true;
  }
  if (msg.type === "saveSession") {
    (async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const sessionTabs = tabs.map(t => ({ url: t.url, title: t.title || "" })).filter(t => t.url && !t.url.startsWith("chrome://"));
      const all = await getSessions();
      const id = Date.now().toString(36);
      const now = new Date();
      const name = msg.name || `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      all[id] = { name, created: Date.now(), tabs: sessionTabs };
      await chrome.storage.local.set({ sessions: all });
      sendResponse({ ok: true, id, count: sessionTabs.length });
    })();
    return true;
  }
  if (msg.type === "restoreSession") {
    (async () => {
      const all = await getSessions();
      const session = all[msg.id];
      if (session) {
        for (const tab of session.tabs) {
          await chrome.tabs.create({ url: tab.url, active: false });
        }
        sendResponse({ ok: true, count: session.tabs.length });
      } else {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
  if (msg.type === "deleteSession") {
    (async () => {
      const all = await getSessions();
      delete all[msg.id];
      await chrome.storage.local.set({ sessions: all });
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg.type === "renameSession") {
    (async () => {
      const all = await getSessions();
      if (all[msg.id]) {
        all[msg.id].name = msg.name;
        await chrome.storage.local.set({ sessions: all });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// --- Omnibox ---

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

chrome.omnibox.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({
    description: "Search shortcuts or type <match>add [key]</match> to save this page"
  });
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const trimmed = text.trim().toLowerCase();
  const shortcuts = await getShortcuts();
  const groups = await getShortcutGroups();
  const suggestions = [];

  if (trimmed.startsWith("add")) {
    const key = trimmed.replace(/^add\s*/, "").trim();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const title = escapeXml(tab.title || "current page");
      const displayKey = key || autoKey(tab.url);
      suggestions.push({
        content: `add ${displayKey}`,
        description: `Save <match>${title}</match> as <match>${escapeXml(displayKey)}/</match>`
      });
    }
  } else if (trimmed === "sessions" || trimmed === "session") {
    suggestions.push({
      content: "save-session",
      description: "Save all open tabs as a <match>session snapshot</match>"
    });
    const { sessions } = await chrome.storage.local.get("sessions");
    if (sessions) {
      for (const [id, session] of Object.entries(sessions).slice(0, 4)) {
        suggestions.push({
          content: `restore:${id}`,
          description: `Restore <match>${escapeXml(session.name)}</match> <dim>(${session.tabs.length} tabs)</dim>`
        });
      }
    }
  } else {
    for (const [key, group] of Object.entries(groups)) {
      if (key.includes(trimmed) || group.description.toLowerCase().includes(trimmed)) {
        suggestions.push({
          content: `group:${key}`,
          description: `<dim>[Group]</dim> <match>${escapeXml(key)}/</match> — ${escapeXml(group.description)} <dim>(${group.shortcuts.length} tabs)</dim>`
        });
      }
    }
    for (const [key, value] of Object.entries(shortcuts)) {
      if (key.includes(trimmed) || value.description.toLowerCase().includes(trimmed)) {
        const url = escapeXml(value.url.replace(/^https?:\/\//, "").slice(0, 40));
        suggestions.push({
          content: key,
          description: `<match>${escapeXml(key)}/</match> — ${escapeXml(value.description)} <dim>${url}</dim>`
        });
      }
    }
  }

  suggest(suggestions.slice(0, 8));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const trimmed = text.trim();

  // Save session
  if (trimmed === "save-session") {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const sessionTabs = tabs.map(t => ({ url: t.url, title: t.title || "" })).filter(t => t.url && !t.url.startsWith("chrome://"));
    const { sessions } = await chrome.storage.local.get("sessions");
    const all = sessions || {};
    const id = Date.now().toString(36);
    const now = new Date();
    all[id] = { name: `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, created: Date.now(), tabs: sessionTabs };
    await chrome.storage.local.set({ sessions: all });
    chrome.action.setBadgeText({ text: "OK" });
    chrome.action.setBadgeBackgroundColor({ color: "#238636" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    return;
  }

  // Restore session
  if (trimmed.startsWith("restore:")) {
    const id = trimmed.replace("restore:", "");
    const { sessions } = await chrome.storage.local.get("sessions");
    if (sessions && sessions[id]) {
      for (const tab of sessions[id].tabs) {
        await chrome.tabs.create({ url: tab.url, active: false });
      }
    }
    return;
  }

  // Quick-add
  if (trimmed.toLowerCase().startsWith("add")) {
    const key = trimmed.replace(/^add\s*/i, "").trim().toLowerCase();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const shortcuts = await getShortcuts();
    const shortcutKey = key && /^[a-z0-9\-_]+$/.test(key) ? key : autoKey(tab.url);

    shortcuts[shortcutKey] = {
      url: tab.url,
      description: tab.title || shortcutKey
    };

    await chrome.storage.sync.set({ shortcuts });
    await syncRulesToDNR();

    chrome.action.setBadgeText({ text: "+" });
    chrome.action.setBadgeBackgroundColor({ color: "#238636" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
    return;
  }

  // Open group
  if (trimmed.startsWith("group:")) {
    const groupKey = trimmed.replace("group:", "");
    const groups = await getShortcutGroups();
    const group = groups[groupKey];
    if (group) {
      const shortcuts = await getShortcuts();
      const urls = group.shortcuts
        .map(k => { const s = shortcuts[k]; return s ? (isTemplateUrl(s.url) ? getBaseUrl(s.url) : s.url) : null; })
        .filter(Boolean);
      for (const url of urls) {
        await chrome.tabs.create({ url, active: false });
      }
      trackUsage(groupKey, "group");
    }
    return;
  }

  // Navigate to shortcut
  const shortcuts = await getShortcuts();
  const parts = trimmed.split("/");
  const key = parts[0].toLowerCase();
  const param = parts.slice(1).join("/");

  if (shortcuts[key]) {
    let url;
    if (param && isTemplateUrl(shortcuts[key].url)) {
      url = shortcuts[key].url.replace(/\{[^}]+\}/, param);
    } else {
      url = isTemplateUrl(shortcuts[key].url) ? getBaseUrl(shortcuts[key].url) : shortcuts[key].url;
    }

    if (disposition === "currentTab") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.update(tab.id, { url });
    } else {
      chrome.tabs.create({ url, active: disposition === "newForegroundTab" });
    }
    trackRecentUsage(key);
    trackUsage(key);
  }
});

function autoKey(url) {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    return domain.split(".")[0].slice(0, 3).toLowerCase();
  } catch {
    return "new";
  }
}

// --- Sessions ---

async function getSessions() {
  const { sessions } = await chrome.storage.local.get("sessions");
  return sessions || {};
}

// --- Storage change listener ---

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.shortcuts) {
    syncRulesToDNR();
  }
});
