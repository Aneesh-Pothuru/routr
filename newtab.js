// --- Data Loading ---

async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

async function loadGroups() {
  const { shortcutGroups } = await chrome.storage.sync.get("shortcutGroups");
  return shortcutGroups || {};
}

async function loadUsageSummary() {
  try {
    return await chrome.runtime.sendMessage({ type: "getUsageSummary" });
  } catch {
    return {};
  }
}

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  return url.replace(/\/?\{[^}]+\}.*$/, "");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Time Awareness ---

function getTimeContext() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return { label: "Morning", period: "morning", greeting: "Good morning" };
  if (hour >= 11 && hour < 17) return { label: "Afternoon", period: "afternoon", greeting: "Good afternoon" };
  if (hour >= 17 && hour < 22) return { label: "Evening", period: "evening", greeting: "Good evening" };
  return { label: "Night", period: "night", greeting: "Late night" };
}

// Map shortcut categories to time periods
const TIME_CATEGORIES = {
  morning: ["Google", "Work"],
  afternoon: ["Dev", "AI", "Work"],
  evening: ["Finance", "Health", "Shopping", "Social"],
  night: ["Social", "Shopping"]
};

// --- Category Detection (simplified, matches options.js) ---

const CATEGORY_MAP = [
  { pattern: /outlook\.office|waymo\.solium/, category: "Work" },
  { pattern: /rocketmoney|healthequity|vanguard|robinhood|fidelity|capitalone|chase\.com|mercury\.com|biltrewards/, category: "Finance" },
  { pattern: /github|console\.cloud\.google|excalidraw|digitalocean|neetcode/, category: "Dev" },
  { pattern: /ouraring|ucsfmychart/, category: "Health" },
  { pattern: /claude\.ai|openai\.com|gemini\.google/, category: "AI" },
  { pattern: /calendar\.google|mail\.google|drive\.google|docs\.google/, category: "Google" },
  { pattern: /amazon\.com|costco\.com|doordash\.com/, category: "Shopping" },
  { pattern: /linkedin|youtube|lu\.ma/, category: "Social" }
];

function getCategoryForUrl(url) {
  for (const entry of CATEGORY_MAP) {
    if (entry.pattern.test(url)) return entry.category;
  }
  return "Other";
}

// --- Rendering ---

function renderGroups(groups, shortcuts) {
  const container = document.getElementById("groups-row");
  const entries = Object.entries(groups);
  if (entries.length === 0) { container.style.display = "none"; return; }

  container.innerHTML = "";
  for (const [key, group] of entries) {
    const btn = document.createElement("div");
    btn.className = "group-btn";
    btn.innerHTML = `
      <span class="group-btn-key">${escapeHtml(key)}/</span>
      ${escapeHtml(group.description)}
      <span class="group-btn-count">${group.shortcuts.length} tabs</span>
    `;
    btn.addEventListener("click", async () => {
      const urls = group.shortcuts
        .map(k => { const s = shortcuts[k]; return s ? (isTemplateUrl(s.url) ? getBaseUrl(s.url) : s.url) : null; })
        .filter(Boolean);
      for (let i = 0; i < urls.length; i++) {
        await chrome.tabs.create({ url: urls[i], active: i === urls.length - 1 });
      }
    });
    container.appendChild(btn);
  }
}

function renderTimeSection(shortcuts, usageSummary) {
  const ctx = getTimeContext();
  document.getElementById("greeting").textContent = ctx.greeting;
  document.getElementById("time-label").textContent = `${ctx.label} Shortcuts`;

  const relevantCategories = TIME_CATEGORIES[ctx.period] || [];
  const timeShortcuts = Object.entries(shortcuts)
    .filter(([, v]) => {
      const cat = getCategoryForUrl(v.url);
      return relevantCategories.includes(cat);
    })
    .sort(([a], [b]) => {
      const aCount = usageSummary[a] ? usageSummary[a].weekCount : 0;
      const bCount = usageSummary[b] ? usageSummary[b].weekCount : 0;
      return bCount - aCount;
    })
    .slice(0, 8);

  renderTiles("time-tiles", timeShortcuts);
}

function renderTopShortcuts(shortcuts, usageSummary) {
  const topEntries = Object.entries(shortcuts)
    .sort(([a], [b]) => {
      const aCount = usageSummary[a] ? usageSummary[a].count : 0;
      const bCount = usageSummary[b] ? usageSummary[b].count : 0;
      return bCount - aCount;
    })
    .slice(0, 12);

  renderTiles("top-tiles", topEntries);
}

function renderTiles(containerId, entries) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  for (const [key, value] of entries) {
    const tile = document.createElement("a");
    tile.className = "tile";
    const navigateUrl = isTemplateUrl(value.url) ? getBaseUrl(value.url) : value.url;
    tile.href = navigateUrl;
    const initial = key.charAt(0).toUpperCase();
    tile.innerHTML = `
      <div class="tile-icon">${initial}</div>
      <div class="tile-name">${escapeHtml(value.description)}</div>
      <div class="tile-key">${escapeHtml(key)}/</div>
    `;
    container.appendChild(tile);
  }
}

// --- Search ---

let searchIndex = -1;

function setupSearch(shortcuts, groups) {
  const input = document.getElementById("newtab-search");
  const results = document.getElementById("search-results");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.remove("visible"); searchIndex = -1; return; }

    // Check if it looks like a direct shortcut navigation (contains /)
    const hasSlash = q.includes("/");

    const items = [];

    // Match groups
    for (const [key, group] of Object.entries(groups)) {
      if (key.includes(q) || group.description.toLowerCase().includes(q)) {
        items.push({ type: "group", key, data: group });
      }
    }

    // Match shortcuts
    for (const [key, value] of Object.entries(shortcuts)) {
      if (key.includes(q) || value.description.toLowerCase().includes(q) || value.url.toLowerCase().includes(q)) {
        items.push({ type: "shortcut", key, data: value });
      }
      if (value.aliases) {
        for (const alias of value.aliases) {
          if (alias.includes(q)) {
            items.push({ type: "shortcut", key, data: value });
            break;
          }
        }
      }
    }

    if (items.length === 0) {
      results.classList.remove("visible");
      searchIndex = -1;
      return;
    }

    results.innerHTML = "";
    results.classList.add("visible");
    searchIndex = -1;

    for (const item of items.slice(0, 10)) {
      const row = document.createElement("div");
      row.className = "search-result-item";

      if (item.type === "group") {
        row.innerHTML = `
          <span class="search-result-key group-key">${escapeHtml(item.key)}/</span>
          <span class="search-result-desc">${escapeHtml(item.data.description)}</span>
          <span class="search-result-meta">${item.data.shortcuts.length} tabs</span>
        `;
        row.addEventListener("click", async () => {
          const urls = item.data.shortcuts
            .map(k => { const s = shortcuts[k]; return s ? (isTemplateUrl(s.url) ? getBaseUrl(s.url) : s.url) : null; })
            .filter(Boolean);
          for (let i = 0; i < urls.length; i++) {
            await chrome.tabs.create({ url: urls[i], active: i === urls.length - 1 });
          }
        });
      } else {
        const url = isTemplateUrl(item.data.url) ? getBaseUrl(item.data.url) : item.data.url;
        row.innerHTML = `
          <span class="search-result-key">${escapeHtml(item.key)}/</span>
          <span class="search-result-desc">${escapeHtml(item.data.description)}</span>
          <span class="search-result-meta">${escapeHtml(item.data.url.replace(/^https?:\/\//, "").slice(0, 30))}</span>
        `;
        row.addEventListener("click", () => {
          window.location.href = url;
        });
      }

      results.appendChild(row);
    }
  });

  // Handle direct shortcut/template navigation on Enter
  input.addEventListener("keydown", (e) => {
    const resultItems = results.querySelectorAll(".search-result-item");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      searchIndex = Math.min(searchIndex + 1, resultItems.length - 1);
      resultItems.forEach((r, i) => r.classList.toggle("selected", i === searchIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      searchIndex = Math.max(searchIndex - 1, 0);
      resultItems.forEach((r, i) => r.classList.toggle("selected", i === searchIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim();

      // Try direct shortcut navigation (e.g., "gh/routr")
      if (q.includes("/")) {
        const parts = q.split("/");
        const key = parts[0].toLowerCase();
        const param = parts.slice(1).join("/");

        // Check shortcuts
        const shortcut = shortcuts[key];
        if (shortcut) {
          if (param && isTemplateUrl(shortcut.url)) {
            window.location.href = shortcut.url.replace(/\{[^}]+\}/, param);
          } else {
            window.location.href = isTemplateUrl(shortcut.url) ? getBaseUrl(shortcut.url) : shortcut.url;
          }
          return;
        }

        // Check groups
        const group = groups[key];
        if (group) {
          (async () => {
            const urls = group.shortcuts
              .map(k => { const s = shortcuts[k]; return s ? (isTemplateUrl(s.url) ? getBaseUrl(s.url) : s.url) : null; })
              .filter(Boolean);
            for (let i = 0; i < urls.length; i++) {
              await chrome.tabs.create({ url: urls[i], active: i === urls.length - 1 });
            }
          })();
          return;
        }
      }

      // Otherwise, click selected result
      if (searchIndex >= 0 && resultItems[searchIndex]) {
        resultItems[searchIndex].click();
      } else if (resultItems.length > 0) {
        resultItems[0].click();
      }
    } else if (e.key === "Escape") {
      results.classList.remove("visible");
      input.value = "";
      searchIndex = -1;
    }
  });

  // Hide results on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) {
      results.classList.remove("visible");
    }
  });
}

// --- Init ---

document.addEventListener("DOMContentLoaded", async () => {
  const shortcuts = await loadShortcuts();
  const groups = await loadGroups();
  const usageSummary = await loadUsageSummary();

  renderGroups(groups, shortcuts);
  renderTimeSection(shortcuts, usageSummary);
  renderTopShortcuts(shortcuts, usageSummary);
  setupSearch(shortcuts, groups);

  document.getElementById("open-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
