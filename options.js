let shortcuts = {};
let editingKey = null;
let activeCategory = "all";
let selectedForDelete = new Set();
let categoryOverrides = {};
let brokenLinks = [];

// --- Category Detection ---

const CATEGORY_MAP = [
  { pattern: /outlook\.office|waymo\.solium/, category: "Work", css: "cat-work" },
  { pattern: /rocketmoney|healthequity|vanguard|robinhood|fidelity|capitalone|chase\.com|mercury\.com|biltrewards/, category: "Finance", css: "cat-finance" },
  { pattern: /github|console\.cloud\.google|excalidraw|digitalocean|neetcode/, category: "Dev", css: "cat-dev" },
  { pattern: /ouraring|ucsfmychart/, category: "Health", css: "cat-health" },
  { pattern: /claude\.ai|openai\.com|gemini\.google/, category: "AI", css: "cat-ai" },
  { pattern: /calendar\.google|mail\.google|drive\.google|docs\.google|sheets\.google|slides\.google|maps\.google/, category: "Google", css: "cat-google" },
  { pattern: /amazon\.com|costco\.com|doordash\.com/, category: "Shopping", css: "cat-shopping" },
  { pattern: /linkedin|youtube|lu\.ma/, category: "Social", css: "cat-social" },
  { pattern: /att\.com/, category: "Other", css: "cat-other" },
  { pattern: /notion\.so/, category: "Other", css: "cat-other" }
];

const ALL_CATEGORY_NAMES = ["Work", "Finance", "Dev", "Health", "AI", "Google", "Shopping", "Social", "Other"];

const CATEGORY_CSS = {
  "Work": "cat-work", "Finance": "cat-finance", "Dev": "cat-dev",
  "Health": "cat-health", "AI": "cat-ai", "Google": "cat-google",
  "Shopping": "cat-shopping", "Social": "cat-social", "Other": "cat-other"
};

function getCategoryForUrl(url, key) {
  // Check manual override first
  if (key && categoryOverrides[key]) {
    const name = categoryOverrides[key];
    return { name, css: CATEGORY_CSS[name] || "cat-other" };
  }
  for (const entry of CATEGORY_MAP) {
    if (entry.pattern.test(url)) {
      return { name: entry.category, css: entry.css };
    }
  }
  return { name: "Other", css: "cat-other" };
}

function getAllCategories() {
  const cats = new Set();
  for (const [key, value] of Object.entries(shortcuts)) {
    cats.add(getCategoryForUrl(value.url, key).name);
  }
  return [...cats].sort();
}

// --- Template URL Helpers ---

function isTemplateUrl(url) {
  return /\{[^}]+\}/.test(url);
}

function getBaseUrl(url) {
  return url.replace(/\/?\{[^}]+\}.*$/, "");
}

// --- Storage ---

async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

async function loadCategoryOverrides() {
  const { categoryOverrides } = await chrome.storage.sync.get("categoryOverrides");
  return categoryOverrides || {};
}

async function saveCategoryOverrides(data) {
  await chrome.storage.sync.set({ categoryOverrides: data });
  categoryOverrides = data;
}

async function saveShortcuts(data) {
  await chrome.storage.sync.set({ shortcuts: data });
  shortcuts = data;
  chrome.runtime.sendMessage({ type: "updateRules" });
}

// --- Toast ---

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- Validation ---

function validateKey(key) {
  return /^[a-z0-9\-_]+$/.test(key);
}

function validateUrl(url) {
  // Allow template URLs with {param} — temporarily strip them for validation
  const cleanUrl = url.replace(/\{[^}]+\}/g, "placeholder");
  try {
    const parsed = new URL(cleanUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// --- Stats ---

function updateStats() {
  document.getElementById("stat-total").textContent = Object.keys(shortcuts).length;
  document.getElementById("stat-categories").textContent = getAllCategories().length;
}

// --- Category Tabs ---

function renderCategoryTabs() {
  const container = document.getElementById("category-tabs");
  const categories = getAllCategories();

  container.innerHTML = '<button class="cat-tab active" data-category="all">All</button>';
  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.className = "cat-tab";
    btn.dataset.category = cat;
    btn.textContent = cat;
    container.appendChild(btn);
  }

  if (activeCategory !== "all") {
    const allBtn = container.querySelector('[data-category="all"]');
    allBtn.classList.remove("active");
    const activeBtn = container.querySelector(`[data-category="${activeCategory}"]`);
    if (activeBtn) activeBtn.classList.add("active");
    else {
      activeCategory = "all";
      allBtn.classList.add("active");
    }
  }

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".cat-tab");
    if (!btn) return;
    container.querySelectorAll(".cat-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.category;
    renderShortcuts(document.getElementById("search").value);
  });
}

// --- Rendering ---

function renderShortcuts(filter = "") {
  const list = document.getElementById("shortcuts-list");
  list.innerHTML = "";

  const entries = Object.entries(shortcuts)
    .filter(([key, value]) => {
      if (filter) {
        const q = filter.toLowerCase();
        if (!key.includes(q) && !value.url.toLowerCase().includes(q) && !value.description.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (activeCategory !== "all") {
        const cat = getCategoryForUrl(value.url, key);
        if (cat.name !== activeCategory) return false;
      }
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-state">No shortcuts found.</div>';
    return;
  }

  for (const [key, value] of entries) {
    const cat = getCategoryForUrl(value.url, key);
    const isBroken = brokenLinks.includes(key);
    const hasTemplate = isTemplateUrl(value.url);
    const row = document.createElement("div");
    row.className = "shortcut-row";

    if (editingKey === key) {
      row.classList.add("editing");
      const aliasStr = (value.aliases || []).join(", ");
      row.innerHTML = `
        <div></div>
        <div><input type="text" class="edit-key" value="${escapeHtml(key)}"></div>
        <div></div>
        <div><input type="url" class="edit-url" value="${escapeHtml(value.url)}" placeholder="URL (use {param} for templates)"></div>
        <div><input type="text" class="edit-desc" value="${escapeHtml(value.description)}"></div>
        <div><input type="text" class="edit-aliases" value="${escapeHtml(aliasStr)}" placeholder="Aliases (comma-separated)"></div>
        <div class="shortcut-actions">
          <button class="btn btn-sm btn-add save-btn">Save</button>
          <button class="btn btn-sm btn-secondary cancel-btn">Cancel</button>
        </div>
      `;
      row.querySelector(".save-btn").addEventListener("click", () => handleSaveEdit(key, row));
      row.querySelector(".cancel-btn").addEventListener("click", () => {
        editingKey = null;
        renderShortcuts(document.getElementById("search").value);
      });
    } else {
      const checked = selectedForDelete.has(key) ? "checked" : "";
      const brokenIcon = isBroken ? '<span class="broken-badge" title="May be unreachable">&#9888;</span>' : "";
      const templateBadge = hasTemplate ? '<span class="template-badge" title="Parameterized URL">{..}</span>' : "";
      const aliasDisplay = (value.aliases && value.aliases.length > 0)
        ? value.aliases.map(a => escapeHtml(a) + "/").join(", ")
        : "";

      row.innerHTML = `
        <div><input type="checkbox" class="shortcut-checkbox" data-key="${escapeHtml(key)}" ${checked}></div>
        <div>
          <span class="shortcut-key">${escapeHtml(key)}/</span>
          ${templateBadge}
          ${brokenIcon}
        </div>
        <div><span class="shortcut-cat ${cat.css} editable-cat" data-key="${escapeHtml(key)}" title="Click to change category">${cat.name}</span></div>
        <div class="shortcut-url"><a href="${escapeHtml(getBaseUrl(value.url) || value.url)}" target="_blank">${escapeHtml(value.url.replace(/^https?:\/\//, ""))}</a></div>
        <div class="shortcut-desc">${escapeHtml(value.description)}</div>
        <div class="alias-list">${aliasDisplay}</div>
        <div class="shortcut-actions">
          <button class="btn btn-sm btn-edit edit-btn">Edit</button>
          <button class="btn btn-sm btn-delete delete-btn">Delete</button>
        </div>
      `;
      row.querySelector(".shortcut-checkbox").addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedForDelete.add(key);
        } else {
          selectedForDelete.delete(key);
        }
        updateBulkBar();
      });
      row.querySelector(".editable-cat").addEventListener("click", (e) => {
        showCategoryPicker(e.target, key);
      });
      row.querySelector(".edit-btn").addEventListener("click", () => {
        editingKey = key;
        renderShortcuts(document.getElementById("search").value);
      });
      row.querySelector(".delete-btn").addEventListener("click", () => handleDelete(key));
    }

    list.appendChild(row);
  }
}

// --- Category Picker ---

function showCategoryPicker(anchor, key) {
  // Remove existing picker if any
  const existing = document.querySelector(".category-picker");
  if (existing) existing.remove();

  const picker = document.createElement("div");
  picker.className = "category-picker";

  for (const cat of ALL_CATEGORY_NAMES) {
    const opt = document.createElement("div");
    opt.className = "category-picker-option";
    const css = CATEGORY_CSS[cat] || "cat-other";
    opt.innerHTML = `<span class="shortcut-cat ${css}">${cat}</span>`;
    opt.addEventListener("click", async () => {
      categoryOverrides[key] = cat;
      await saveCategoryOverrides(categoryOverrides);
      picker.remove();
      renderCategoryTabs();
      renderShortcuts(document.getElementById("search").value);
      showToast(`Category for "${key}/" changed to ${cat}.`);
    });
    picker.appendChild(opt);
  }

  // Position near the anchor
  const rect = anchor.getBoundingClientRect();
  picker.style.position = "fixed";
  picker.style.top = (rect.bottom + 4) + "px";
  picker.style.left = rect.left + "px";
  document.body.appendChild(picker);

  // Close on outside click
  const closeHandler = (e) => {
    if (!picker.contains(e.target) && e.target !== anchor) {
      picker.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- CRUD ---

async function handleAdd(e) {
  e.preventDefault();

  const keyInput = document.getElementById("shortcut-key");
  const urlInput = document.getElementById("shortcut-url");
  const descInput = document.getElementById("shortcut-desc");
  const aliasInput = document.getElementById("shortcut-aliases");

  const key = keyInput.value.trim().toLowerCase().replace(/\/+$/, "");
  const url = urlInput.value.trim();
  const desc = descInput.value.trim();
  const aliasStr = aliasInput ? aliasInput.value.trim() : "";

  if (!validateKey(key)) {
    showToast("Shortcut must be lowercase letters, numbers, hyphens, or underscores.", true);
    return;
  }

  if (!validateUrl(url)) {
    showToast("Please enter a valid URL starting with http:// or https://", true);
    return;
  }

  if (!desc) {
    showToast("Description is required.", true);
    return;
  }

  if (shortcuts[key] && !confirm(`Shortcut "${key}/" already exists. Overwrite?`)) {
    return;
  }

  const entry = { url, description: desc };

  // Parse aliases
  if (aliasStr) {
    const aliases = aliasStr.split(",").map(a => a.trim().toLowerCase().replace(/\/+$/, "")).filter(a => a && validateKey(a) && a !== key);
    if (aliases.length > 0) {
      entry.aliases = aliases;
    }
  }

  shortcuts[key] = entry;
  await saveShortcuts(shortcuts);

  keyInput.value = "";
  urlInput.value = "";
  descInput.value = "";
  if (aliasInput) aliasInput.value = "";

  updateStats();
  renderCategoryTabs();
  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${key}/" added and ready to use!`);
}

async function handleDelete(key) {
  if (!confirm(`Delete shortcut "${key}/"?`)) return;

  delete shortcuts[key];
  // Also clean up category override
  if (categoryOverrides[key]) {
    delete categoryOverrides[key];
    await saveCategoryOverrides(categoryOverrides);
  }
  await saveShortcuts(shortcuts);

  updateStats();
  renderCategoryTabs();
  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${key}/" deleted.`);
}

async function handleSaveEdit(oldKey, row) {
  const newKey = row.querySelector(".edit-key").value.trim().toLowerCase().replace(/\/+$/, "");
  const newUrl = row.querySelector(".edit-url").value.trim();
  const newDesc = row.querySelector(".edit-desc").value.trim();
  const aliasStr = row.querySelector(".edit-aliases") ? row.querySelector(".edit-aliases").value.trim() : "";

  if (!validateKey(newKey)) {
    showToast("Shortcut must be lowercase letters, numbers, hyphens, or underscores.", true);
    return;
  }

  if (!validateUrl(newUrl)) {
    showToast("Please enter a valid URL starting with http:// or https://", true);
    return;
  }

  if (!newDesc) {
    showToast("Description is required.", true);
    return;
  }

  if (newKey !== oldKey && shortcuts[newKey]) {
    if (!confirm(`Shortcut "${newKey}/" already exists. Overwrite?`)) return;
  }

  if (newKey !== oldKey) {
    delete shortcuts[oldKey];
    // Move category override
    if (categoryOverrides[oldKey]) {
      categoryOverrides[newKey] = categoryOverrides[oldKey];
      delete categoryOverrides[oldKey];
      await saveCategoryOverrides(categoryOverrides);
    }
  }

  const entry = { url: newUrl, description: newDesc };

  // Parse aliases
  if (aliasStr) {
    const aliases = aliasStr.split(",").map(a => a.trim().toLowerCase().replace(/\/+$/, "")).filter(a => a && validateKey(a) && a !== newKey);
    if (aliases.length > 0) {
      entry.aliases = aliases;
    }
  }

  shortcuts[newKey] = entry;
  await saveShortcuts(shortcuts);

  editingKey = null;
  updateStats();
  renderCategoryTabs();
  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${newKey}/" updated!`);
}

// --- Bulk Delete ---

function updateBulkBar() {
  const bar = document.getElementById("bulk-bar");
  const count = selectedForDelete.size;
  if (count > 0) {
    bar.style.display = "flex";
    document.getElementById("bulk-count").textContent = `${count} selected`;
  } else {
    bar.style.display = "none";
  }
}

async function handleBulkDelete() {
  const count = selectedForDelete.size;
  if (count === 0) return;
  if (!confirm(`Delete ${count} shortcut${count > 1 ? "s" : ""}?`)) return;

  for (const key of selectedForDelete) {
    delete shortcuts[key];
    if (categoryOverrides[key]) {
      delete categoryOverrides[key];
    }
  }
  selectedForDelete.clear();
  await saveCategoryOverrides(categoryOverrides);
  await saveShortcuts(shortcuts);

  updateStats();
  renderCategoryTabs();
  renderShortcuts(document.getElementById("search").value);
  updateBulkBar();
  showToast(`Deleted ${count} shortcut${count > 1 ? "s" : ""}.`);
}

// --- Search ---

function handleSearch(e) {
  renderShortcuts(e.target.value);
}

// --- Export ---

function handleExport() {
  const data = JSON.stringify(shortcuts, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "routr-shortcuts.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Shortcuts exported!");
}

// --- Import ---

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);

      for (const [key, value] of Object.entries(data)) {
        if (!value.url || !value.description) {
          showToast("Invalid file: each shortcut must have 'url' and 'description'.", true);
          return;
        }
      }

      const importCount = Object.keys(data).length;
      const mode = await showImportDialog(importCount);
      if (mode === "cancel") return;

      if (mode === "merge") {
        let added = 0;
        let skipped = 0;
        for (const [key, value] of Object.entries(data)) {
          if (shortcuts[key]) {
            skipped++;
          } else {
            shortcuts[key] = value;
            added++;
          }
        }
        await saveShortcuts(shortcuts);
        showToast(`Merged: ${added} added, ${skipped} already existed.`);
      } else {
        shortcuts = data;
        await saveShortcuts(shortcuts);
        showToast(`Replaced all shortcuts with ${importCount} from file.`);
      }

      updateStats();
      renderCategoryTabs();
      renderShortcuts();
    } catch {
      showToast("Invalid JSON file.", true);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function showImportDialog(count) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "import-dialog-overlay";
    overlay.innerHTML = `
      <div class="import-dialog">
        <h3>Import ${count} Shortcuts</h3>
        <p>How would you like to import?</p>
        <div class="import-dialog-actions">
          <button class="btn btn-add" data-mode="merge">Merge (keep existing)</button>
          <button class="btn btn-danger" data-mode="replace">Replace All</button>
          <button class="btn btn-secondary" data-mode="cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (btn) {
        overlay.remove();
        resolve(btn.dataset.mode);
      }
    });
  });
}

// --- Reset ---

async function handleReset() {
  if (!confirm("Reset all shortcuts to defaults? This cannot be undone.")) return;

  try {
    const defaults = await chrome.runtime.sendMessage({ type: "getDefaults" });
    shortcuts = defaults;
  } catch {
    shortcuts = {};
  }

  categoryOverrides = {};
  await saveCategoryOverrides(categoryOverrides);
  await saveShortcuts(shortcuts);
  updateStats();
  renderCategoryTabs();
  renderShortcuts();
  showToast("Shortcuts reset to defaults!");
}

// --- Query param handling ---

function checkQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const addKey = params.get("add");
  if (addKey) {
    document.getElementById("shortcut-key").value = addKey;
    document.getElementById("shortcut-url").focus();
  }
}

// --- Demo animation (dynamic — uses actual shortcuts) ---

function startDemoAnimation() {
  const el = document.getElementById("demo-text");

  // Pick 4 shortcuts to demo — prefer ones with short keys
  const entries = Object.entries(shortcuts);
  const demos = [];

  // Try to pick interesting ones: templates first, then short keys
  const templates = entries.filter(([, v]) => isTemplateUrl(v.url));
  const statics = entries.filter(([, v]) => !isTemplateUrl(v.url)).sort(([a], [b]) => a.length - b.length);

  // Add a template example if we have one
  if (templates.length > 0) {
    const [key, value] = templates[0];
    const baseHost = getBaseUrl(value.url).replace(/^https?:\/\//, "").replace(/\/$/, "");
    demos.push({ text: key + "/example", result: baseHost + "/example" });
  }

  // Fill remaining with short static shortcuts
  for (const [key, value] of statics) {
    if (demos.length >= 4) break;
    const host = value.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    demos.push({ text: key + "/", result: host });
  }

  // Fallback if no shortcuts
  if (demos.length === 0) {
    demos.push(
      { text: "c/", result: "calendar.google.com" },
      { text: "gh/", result: "github.com" },
      { text: "cl/", result: "claude.ai" },
      { text: "ow/", result: "outlook.office.com" }
    );
  }

  let demoIdx = 0;

  function animateDemo() {
    const demo = demos[demoIdx % demos.length];
    demoIdx++;

    let charIdx = 0;
    el.textContent = "";

    const typeInterval = setInterval(() => {
      charIdx++;
      el.textContent = demo.text.substring(0, charIdx);
      if (charIdx >= demo.text.length) {
        clearInterval(typeInterval);
        setTimeout(() => {
          el.innerHTML = `<span style="color: #8b949e">${escapeHtml(demo.result)}</span>`;
          setTimeout(() => {
            el.textContent = "";
            setTimeout(animateDemo, 600);
          }, 2000);
        }, 500);
      }
    }, 150);
  }

  setTimeout(animateDemo, 800);
}

// --- Broken Links UI ---

async function loadBrokenLinks() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "getBrokenLinks" });
    brokenLinks = result.brokenLinks || [];
  } catch {
    brokenLinks = [];
  }
}

// --- Init ---

document.addEventListener("DOMContentLoaded", async () => {
  shortcuts = await loadShortcuts();
  categoryOverrides = await loadCategoryOverrides();
  await loadBrokenLinks();

  updateStats();
  renderCategoryTabs();
  renderShortcuts();
  checkQueryParams();
  startDemoAnimation();

  document.getElementById("add-form").addEventListener("submit", handleAdd);
  document.getElementById("search").addEventListener("input", handleSearch);
  document.getElementById("reset-btn").addEventListener("click", handleReset);
  document.getElementById("export-btn").addEventListener("click", handleExport);
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", handleImport);
  document.getElementById("bulk-delete-btn").addEventListener("click", handleBulkDelete);
  document.getElementById("bulk-clear-btn").addEventListener("click", () => {
    selectedForDelete.clear();
    updateBulkBar();
    renderShortcuts(document.getElementById("search").value);
  });
});
