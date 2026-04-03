let selectedIndex = -1;

async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

async function getRecentlyUsed() {
  const { recentlyUsed } = await chrome.storage.local.get("recentlyUsed");
  return recentlyUsed || [];
}

function renderList(shortcuts, recentKeys, filter = "") {
  const list = document.getElementById("popup-list");
  list.innerHTML = "";
  selectedIndex = -1;

  const entries = Object.entries(shortcuts)
    .filter(([key, value]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return key.includes(q) || value.description.toLowerCase().includes(q) || value.url.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    list.innerHTML = '<div class="popup-empty">No shortcuts found.</div>';
    return;
  }

  // Show recently used section if no filter and we have recent data
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

    const allLabel = document.createElement("div");
    allLabel.className = "popup-section-label";
    allLabel.textContent = "All Shortcuts";
    list.appendChild(allLabel);
  }

  for (const [key, value] of entries) {
    list.appendChild(createItem(key, value));
  }
}

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  return url.replace(/\/?\{[^}]+\}.*$/, "");
}

function createItem(key, value) {
  const item = document.createElement("div");
  item.className = "popup-item";
  item.title = value.url;
  const displayUrl = value.url.replace(/^https?:\/\//, "");
  const hasTemplate = isTemplateUrl(value.url);
  const templateHint = hasTemplate ? '<span class="popup-template">{..}</span>' : "";
  const navigateUrl = hasTemplate ? getBaseUrl(value.url) : value.url;
  item.innerHTML = `
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

document.addEventListener("DOMContentLoaded", async () => {
  const shortcuts = await loadShortcuts();
  const recentKeys = await getRecentlyUsed();
  renderList(shortcuts, recentKeys);

  const searchInput = document.getElementById("popup-search");

  searchInput.addEventListener("input", (e) => {
    renderList(shortcuts, recentKeys, e.target.value);
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
    }
  });

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
