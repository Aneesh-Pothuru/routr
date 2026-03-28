async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

function renderList(shortcuts, filter = "") {
  const list = document.getElementById("popup-list");
  list.innerHTML = "";

  const entries = Object.entries(shortcuts)
    .filter(([key, value]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return key.includes(q) || value.description.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    list.innerHTML = '<div class="popup-empty">No shortcuts found.</div>';
    return;
  }

  for (const [key, value] of entries) {
    const item = document.createElement("div");
    item.className = "popup-item";
    item.innerHTML = `
      <span class="popup-key">${escapeHtml(key)}/</span>
      <span class="popup-desc">${escapeHtml(value.description)}</span>
      <span class="popup-url">${escapeHtml(value.url.replace(/^https?:\/\//, ""))}</span>
    `;
    item.addEventListener("click", () => {
      chrome.tabs.update({ url: value.url });
      window.close();
    });
    list.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", async () => {
  const shortcuts = await loadShortcuts();
  renderList(shortcuts);

  document.getElementById("popup-search").addEventListener("input", (e) => {
    renderList(shortcuts, e.target.value);
  });

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
});
