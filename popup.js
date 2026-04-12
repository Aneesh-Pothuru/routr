let selectedIndex = -1;

async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

async function loadGroups() {
  const { shortcutGroups } = await chrome.storage.sync.get("shortcutGroups");
  return shortcutGroups || {};
}

async function getRecentlyUsed() {
  const { recentlyUsed } = await chrome.storage.local.get("recentlyUsed");
  return recentlyUsed || [];
}

function renderList(shortcuts, groups, recentKeys, filter = "") {
  const list = document.getElementById("popup-list");
  list.innerHTML = "";
  selectedIndex = -1;

  const shortcutEntries = Object.entries(shortcuts)
    .filter(([key, value]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      const aliasMatch = value.aliases && value.aliases.some(a => a.includes(q));
      return key.includes(q) || value.description.toLowerCase().includes(q) || value.url.toLowerCase().includes(q) || aliasMatch;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  const groupEntries = Object.entries(groups)
    .filter(([key, value]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return key.includes(q) || value.description.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (shortcutEntries.length === 0 && groupEntries.length === 0) {
    list.innerHTML = '<div class="popup-empty">No shortcuts found.</div>';
    return;
  }

  // Groups section
  if (groupEntries.length > 0) {
    const label = document.createElement("div");
    label.className = "popup-section-label";
    label.textContent = "Groups";
    list.appendChild(label);

    for (const [key, group] of groupEntries) {
      list.appendChild(createGroupItem(key, group, shortcuts));
    }
  }

  // Recently used section
  const recentEntries = [];
  if (!filter && recentKeys.length > 0) {
    for (const key of recentKeys) {
      if (shortcuts[key]) {
        recentEntries.push([key, shortcuts[key]]);
      }
    }
  }

  if (recentEntries.length > 0) {
    const label = document.createElement("div");
    label.className = "popup-section-label";
    label.textContent = "Recent";
    list.appendChild(label);

    for (const [key, value] of recentEntries) {
      list.appendChild(createItem(key, value));
    }
  }

  // All shortcuts
  if (shortcutEntries.length > 0) {
    const allLabel = document.createElement("div");
    allLabel.className = "popup-section-label";
    allLabel.textContent = "All Shortcuts";
    list.appendChild(allLabel);

    for (const [key, value] of shortcutEntries) {
      list.appendChild(createItem(key, value));
    }
  }
}

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  try {
    const templateIdx = url.indexOf("{");
    if (templateIdx === -1) return url;
    const beforeTemplate = url.substring(0, templateIdx);
    if (beforeTemplate.includes("?") || beforeTemplate.includes("#")) {
      const parsed = new URL(url.replace(/\{[^}]+\}/g, "x"));
      return parsed.origin;
    }
    return beforeTemplate.replace(/\/?$/, "") || new URL(url.replace(/\{[^}]+\}/g, "x")).origin;
  } catch {
    return url.replace(/\/?\{[^}]+\}.*$/, "");
  }
}

function createGroupItem(key, group, shortcuts) {
  const item = document.createElement("div");
  item.className = "popup-item popup-group-item";
  const count = group.shortcuts.length;
  item.title = `Opens ${count} tabs: ${group.shortcuts.join(", ")}`;
  item.innerHTML = `
    <span class="popup-key popup-group-key">${escapeHtml(key)}/</span>
    <span class="popup-desc">${escapeHtml(group.description)}</span>
    <span class="popup-group-count">${count} tabs</span>
  `;
  item.addEventListener("click", async () => {
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
    window.close();
  });
  return item;
}

function createItem(key, value) {
  const item = document.createElement("div");
  item.className = "popup-item";
  item.title = value.url;
  const displayUrl = value.url.replace(/^https?:\/\//, "");
  const hasTemplate = isTemplateUrl(value.url);
  const templateHint = hasTemplate ? '<span class="popup-template">{..}</span>' : "";
  const navigateUrl = hasTemplate ? getBaseUrl(value.url) : value.url;
  const faviconSrc = getFaviconUrl(value.url);
  const faviconImg = faviconSrc ? `<img class="popup-favicon" src="${faviconSrc}" alt="">` : "";
  item.innerHTML = `
    ${faviconImg}
    <span class="popup-key">${escapeHtml(key)}/${templateHint}</span>
    <span class="popup-desc">${escapeHtml(value.description)}</span>
    <span class="popup-url">${escapeHtml(displayUrl)}</span>
  `;
  item.addEventListener("click", () => {
    chrome.tabs.update({ url: navigateUrl });
    window.close();
  });
  return item;
}

function getSelectableItems() {
  return document.querySelectorAll("#popup-list .popup-item");
}

function updateSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedIndex);
  });
  if (items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: "nearest" });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getFaviconUrl(url, size = 16) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const shortcuts = await loadShortcuts();
  const groups = await loadGroups();
  const recentKeys = await getRecentlyUsed();
  renderList(shortcuts, groups, recentKeys);

  const searchInput = document.getElementById("popup-search");

  searchInput.addEventListener("input", (e) => {
    renderList(shortcuts, groups, recentKeys, e.target.value);
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = getSelectableItems();
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        items[selectedIndex].click();
      } else if (items.length > 0) {
        items[0].click();
      }
    } else if (e.key === "Escape") {
      window.close();
    }
  });

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Sessions
  const saveSessionBtn = document.getElementById("save-session");
  const sessionsList = document.getElementById("sessions-list");

  async function renderSessions() {
    try {
      const sessions = await chrome.runtime.sendMessage({ type: "getSessions" });
      sessionsList.innerHTML = "";
      const entries = Object.entries(sessions).sort(([, a], [, b]) => b.created - a.created).slice(0, 4);
      for (const [id, session] of entries) {
        const item = document.createElement("div");
        item.className = "session-item";
        item.innerHTML = `
          <span class="session-name">${escapeHtml(session.name)}</span>
          <span class="session-meta">${session.tabs.length} tabs</span>
          <button class="session-restore-btn">Restore</button>
        `;
        item.querySelector(".session-restore-btn").addEventListener("click", async (e) => {
          e.stopPropagation();
          await chrome.runtime.sendMessage({ type: "restoreSession", id });
          const btn = e.target;
          btn.textContent = "Done!";
          setTimeout(() => window.close(), 500);
        });
        sessionsList.appendChild(item);
      }
    } catch {}
  }

  saveSessionBtn.addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({ type: "saveSession" });
    if (result.ok) {
      saveSessionBtn.textContent = `Saved ${result.count} tabs!`;
      saveSessionBtn.style.borderColor = "#238636";
      saveSessionBtn.style.color = "#238636";
      await renderSessions();
      setTimeout(() => {
        saveSessionBtn.textContent = "Save open tabs as session";
        saveSessionBtn.style.borderColor = "#a371f7";
        saveSessionBtn.style.color = "#a371f7";
      }, 2000);
    }
  });

  renderSessions();

  // Close duplicate tabs
  const dupeBtn = document.getElementById("close-dupes");
  if (dupeBtn) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const seen = new Set();
    let dupeCount = 0;
    for (const tab of tabs) {
      if (seen.has(tab.url)) dupeCount++;
      else seen.add(tab.url);
    }
    if (dupeCount > 0) {
      dupeBtn.textContent = `Close ${dupeCount} duplicate${dupeCount > 1 ? "s" : ""}`;
      dupeBtn.style.display = "block";
      dupeBtn.addEventListener("click", async () => {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const seenUrls = new Set();
        const toClose = [];
        for (const tab of allTabs) {
          if (seenUrls.has(tab.url)) toClose.push(tab.id);
          else seenUrls.add(tab.url);
        }
        if (toClose.length > 0) {
          await chrome.tabs.remove(toClose);
          dupeBtn.textContent = "Done!";
          setTimeout(() => { dupeBtn.style.display = "none"; }, 1000);
        }
      });
    }
  }
});
