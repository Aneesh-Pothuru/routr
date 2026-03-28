let shortcuts = {};
let editingKey = null;

// --- Storage ---
async function loadShortcuts() {
  const { shortcuts } = await chrome.storage.sync.get("shortcuts");
  return shortcuts || {};
}

async function saveShortcuts(data) {
  await chrome.storage.sync.set({ shortcuts: data });
  shortcuts = data;
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
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// --- Rendering ---
function renderShortcuts(filter = "") {
  const list = document.getElementById("shortcuts-list");
  list.innerHTML = "";

  const entries = Object.entries(shortcuts)
    .filter(([key, value]) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return key.includes(q) || value.url.toLowerCase().includes(q) || value.description.toLowerCase().includes(q);
    })
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-state">No shortcuts found.</div>';
    return;
  }

  for (const [key, value] of entries) {
    const row = document.createElement("div");
    row.className = "shortcut-row";

    if (editingKey === key) {
      row.classList.add("editing");
      row.innerHTML = `
        <div><input type="text" class="edit-key" value="${escapeHtml(key)}"></div>
        <div><input type="url" class="edit-url" value="${escapeHtml(value.url)}"></div>
        <div><input type="text" class="edit-desc" value="${escapeHtml(value.description)}"></div>
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
      row.innerHTML = `
        <div><span class="shortcut-key">${escapeHtml(key)}/</span></div>
        <div class="shortcut-url"><a href="${escapeHtml(value.url)}" target="_blank">${escapeHtml(value.url)}</a></div>
        <div class="shortcut-desc">${escapeHtml(value.description)}</div>
        <div class="shortcut-actions">
          <button class="btn btn-sm btn-edit edit-btn">Edit</button>
          <button class="btn btn-sm btn-delete delete-btn">Delete</button>
        </div>
      `;
      row.querySelector(".edit-btn").addEventListener("click", () => {
        editingKey = key;
        renderShortcuts(document.getElementById("search").value);
      });
      row.querySelector(".delete-btn").addEventListener("click", () => handleDelete(key));
    }

    list.appendChild(row);
  }
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

  const key = keyInput.value.trim().toLowerCase().replace(/\/+$/, "");
  const url = urlInput.value.trim();
  const desc = descInput.value.trim();

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

  shortcuts[key] = { url, description: desc };
  await saveShortcuts(shortcuts);

  keyInput.value = "";
  urlInput.value = "";
  descInput.value = "";

  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${key}/" added!`);
}

async function handleDelete(key) {
  if (!confirm(`Delete shortcut "${key}/"?`)) return;

  delete shortcuts[key];
  await saveShortcuts(shortcuts);

  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${key}/" deleted.`);
}

async function handleSaveEdit(oldKey, row) {
  const newKey = row.querySelector(".edit-key").value.trim().toLowerCase().replace(/\/+$/, "");
  const newUrl = row.querySelector(".edit-url").value.trim();
  const newDesc = row.querySelector(".edit-desc").value.trim();

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
  }

  shortcuts[newKey] = { url: newUrl, description: newDesc };
  await saveShortcuts(shortcuts);

  editingKey = null;
  renderShortcuts(document.getElementById("search").value);
  showToast(`Shortcut "${newKey}/" updated!`);
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

      // Validate shape
      for (const [key, value] of Object.entries(data)) {
        if (!value.url || !value.description) {
          showToast("Invalid file: each shortcut must have 'url' and 'description'.", true);
          return;
        }
      }

      shortcuts = data;
      await saveShortcuts(shortcuts);
      renderShortcuts();
      showToast(`Imported ${Object.keys(data).length} shortcuts!`);
    } catch {
      showToast("Invalid JSON file.", true);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// --- Reset ---
async function handleReset() {
  if (!confirm("Reset all shortcuts to defaults? This cannot be undone.")) return;

  try {
    const defaults = await chrome.runtime.sendMessage({ type: "getDefaults" });
    shortcuts = defaults;
  } catch {
    // Fallback defaults if messaging fails
    shortcuts = {
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
  }

  await saveShortcuts(shortcuts);
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

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  shortcuts = await loadShortcuts();
  renderShortcuts();
  checkQueryParams();

  document.getElementById("add-form").addEventListener("submit", handleAdd);
  document.getElementById("search").addEventListener("input", handleSearch);
  document.getElementById("reset-btn").addEventListener("click", handleReset);
  document.getElementById("export-btn").addEventListener("click", handleExport);
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", handleImport);
});
