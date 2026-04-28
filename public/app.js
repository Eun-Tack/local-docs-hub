import mermaid from "/vendor/mermaid.esm.min.mjs";
import { marked } from "/vendor-marked/marked.esm.js";

const rootPathInput = document.querySelector("#root-path");
const rootSummary = document.querySelector("#root-summary");
const treeEl = document.querySelector("#tree");
const viewerEl = document.querySelector("#viewer");
const editorEl = document.querySelector("#editor");
const editorPreviewEl = document.querySelector(".editor-preview");
const docTitleEl = document.querySelector("#doc-title");
const docPathEl = document.querySelector("#doc-path");
const searchInput = document.querySelector("#search-input");
const fontSizeRange = document.querySelector("#font-size-range");
const fontSizeValue = document.querySelector("#font-size-value");
const tocEl = document.querySelector("#toc");
const saveStatusEl = document.querySelector("#save-status");
const saveDocButton = document.querySelector("#save-doc-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const newDocButton = document.querySelector("#new-doc-button");
const editDocButton = document.querySelector("#edit-doc-button");
const renameDocButton = document.querySelector("#rename-doc-button");
const deleteDocButton = document.querySelector("#delete-doc-button");
const rootModalEl = document.querySelector("#root-modal");
const rootPickerForm = document.querySelector("#root-picker-form");
const rootPickerInput = document.querySelector("#root-picker-input");
const rootPickerBrowseButton = document.querySelector("#root-picker-browse");
const rootPickerSuggestions = document.querySelector("#root-picker-suggestions");
const rootPickerFavoritesButton = document.querySelector("#root-picker-favorites");
const rootPickerFavoritesPanel = document.querySelector("#root-picker-favorites-panel");
const rootPickerFavoritesList = document.querySelector("#root-picker-favorites-list");
const favoritesModalEl = document.querySelector("#favorites-modal");
const favoriteRootButton = document.querySelector("#favorite-root-button");
const favoriteRootInput = document.querySelector("#favorite-root-input");
const applyFavoriteRootButton = document.querySelector("#apply-favorite-root");
const saveFavoriteRootButton = document.querySelector("#save-favorite-root");
const closeFavoritesModalButton = document.querySelector("#close-favorites-modal");
const favoriteRootsList = document.querySelector("#favorite-roots-list");
const newDocModalEl = document.querySelector("#new-doc-modal");
const newDocForm = document.querySelector("#new-doc-form");
const newDocDirInput = document.querySelector("#new-doc-dir");
const newDocNameInput = document.querySelector("#new-doc-name");
const closeNewDocModalButton = document.querySelector("#close-new-doc-modal");

const MIN_VIEWER_FONT_SIZE = 8;
const MAX_VIEWER_FONT_SIZE = 24;
const DEFAULT_VIEWER_FONT_SIZE = 16;
const VIEWER_FONT_SIZE_KEY = "local-docs-hub-viewer-font-size";
const FAVORITE_ROOTS_KEY = "local-docs-hub-favorite-roots";
const TOC_EMPTY_MESSAGE = "\uBB38\uC11C\uB97C \uC5F4\uBA74 \uBAA9\uCC28\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4.";
const TOC_ERROR_MESSAGE = "\uBAA9\uCC28\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
const ROOT_REQUIRED_MESSAGE = "\uB8E8\uD2B8 \uD3F4\uB354\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
const SELECT_DOC_MESSAGE = "\uBB38\uC11C\uB97C \uC120\uD0DD\uD558\uAC70\uB098 \uC0C8 Markdown \uD30C\uC77C\uC744 \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.";
const SAVE_READY_MESSAGE = "\uC800\uC7A5\uB41C \uBC84\uC804\uC785\uB2C8\uB2E4.";
const SAVE_DIRTY_MESSAGE = "\uC800\uC7A5\uB418\uC9C0 \uC54A\uC740 \uBCC0\uACBD \uC0AC\uD56D\uC774 \uC788\uC2B5\uB2C8\uB2E4.";
const SAVE_SUCCESS_MESSAGE = "\uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
const PRINT_PAGE_HEIGHT_PX = 980;
const PRINT_PAGE_WIDTH_PX = 700;

let currentTree = [];
let currentDocumentPath = null;
let currentMarkdown = "";
let lastSavedMarkdown = "";
let defaultDocument = null;
let currentRootPath = "";
let isEditing = false;
let autoSaveTimer = null;
let saveRequest = null;
let editSession = null;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "default"
});

const PRINT_BLOCK_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "pre",
  "table",
  "blockquote",
  "ul",
  "ol",
  "img",
  "hr",
  ".mermaid"
].join(", ");
const PRINT_HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

function isAsciiDiagram(text) {
  const source = String(text || "");
  const lines = source.split("\n").filter((line) => line.trim());
  if (lines.length < 3) return false;

  const asciiMarkers = ["+--", "|", "->", "<-", "[", "]", "(", ")", "/", "\\", "*", "="];
  const markerCount = asciiMarkers.reduce(
    (count, marker) => count + (source.includes(marker) ? 1 : 0),
    0
  );

  return markerCount >= 4;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function dirname(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function normalizeRelativePath(targetPath) {
  return String(targetPath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function getCurrentDirectoryPath() {
  return currentDocumentPath ? dirname(currentDocumentPath) : "";
}

function resolveRelativePath(baseDocPath, targetPath) {
  if (!targetPath) return "";
  if (/^(https?:|mailto:|#)/i.test(targetPath)) return targetPath;

  const baseDir = dirname(baseDocPath);
  const combined = `${baseDir}/${targetPath}`.replace(/\\/g, "/");
  const parts = [];

  for (const segment of combined.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }

  return parts.join("/");
}

function createRenderer(docPath) {
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }) => {
    if (lang === "mermaid") {
      return `<div class="mermaid">${escapeHtml(text)}</div>`;
    }

    const classes = [`language-${lang || "text"}`];
    const preClasses = [];

    if (!lang && isAsciiDiagram(text)) {
      preClasses.push("ascii-diagram");
      classes.push("ascii-diagram-code");
    }

    const preClassAttr = preClasses.length ? ` class="${preClasses.join(" ")}"` : "";
    return `<pre${preClassAttr}><code class="${classes.join(" ")}">${escapeHtml(text)}</code></pre>`;
  };

  renderer.image = ({ href, text, title }) => {
    const resolved = resolveRelativePath(docPath, href);
    const caption = title ? ` title="${title}"` : "";
    return `<img src="/api/raw?path=${encodeURIComponent(resolved)}" alt="${text || ""}"${caption}>`;
  };

  renderer.link = ({ href, text, title }) => {
    const resolved = resolveRelativePath(docPath, href);
    const caption = title ? ` title="${title}"` : "";

    if (/\.(md|markdown)$/i.test(resolved)) {
      return `<a href="#" data-doc-link="${resolved}"${caption}>${text}</a>`;
    }

    if (/^(https?:|mailto:|#)/i.test(href)) {
      return `<a href="${href}" target="_blank" rel="noreferrer"${caption}>${text}</a>`;
    }

    return `<a href="/api/raw?path=${encodeURIComponent(resolved)}" target="_blank" rel="noreferrer"${caption}>${text}</a>`;
  };

  return renderer;
}

async function apiGet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.text();
    const message =
      response.status === 404 && /^\/api\/doc(\/|$)/.test(url)
        ? "요청한 문서를 찾을 수 없습니다. 파일 목록을 다시 불러옵니다."
        : error || "Request failed";
    throw new Error(message);
  }
  return response.json();
}

async function apiPost(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (
      response.status === 404 &&
      ["/api/doc/create", "/api/doc/rename", "/api/doc/delete"].includes(url)
    ) {
      throw new Error("서버가 최신 기능으로 다시 시작되지 않았습니다. 앱 서버를 재시작한 뒤 다시 시도해 주세요.");
    }

    const payload = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(payload.error || "Request failed");
  }

  return response.json();
}

function readFavoriteRoots() {
  const raw = window.localStorage.getItem(FAVORITE_ROOTS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function writeFavoriteRoots(paths) {
  window.localStorage.setItem(FAVORITE_ROOTS_KEY, JSON.stringify(paths));
}

function saveFavoriteRoot(path) {
  const target = String(path || "").trim();
  if (!target) return;

  const favorites = readFavoriteRoots().filter((item) => item !== target);
  favorites.unshift(target);
  writeFavoriteRoots(favorites.slice(0, 12));
}

function removeFavoriteRoot(path) {
  writeFavoriteRoots(readFavoriteRoots().filter((item) => item !== path));
}

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

function updateDocActionStates() {
  const hasDoc = Boolean(currentDocumentPath);
  editDocButton.disabled = !hasDoc || isEditing;
  renameDocButton.disabled = !hasDoc;
  deleteDocButton.disabled = !hasDoc;
  saveDocButton.disabled = !hasDoc || !isEditing || currentMarkdown === lastSavedMarkdown;
  cancelEditButton.disabled = !isEditing;
  editDocButton.textContent = "\uC218\uC815";
}

function updateSaveState(message = SAVE_READY_MESSAGE, dirty = false) {
  saveStatusEl.textContent = message;
  saveStatusEl.classList.toggle("dirty", dirty);
  updateDocActionStates();
}

function setRootSummary(path) {
  rootSummary.textContent = path || ROOT_REQUIRED_MESSAGE;
}

function setEditingMode(nextEditing) {
  const shouldEdit = Boolean(nextEditing && currentDocumentPath);
  if (shouldEdit && !editSession) {
    editSession = {
      path: currentDocumentPath,
      markdown: lastSavedMarkdown,
      createdPath: null,
      previousPath: null
    };
  }

  if (!shouldEdit) {
    editSession = null;
  }

  isEditing = shouldEdit;
  editorPreviewEl.classList.toggle("editing", isEditing);
  editorEl.disabled = !isEditing;
  updateDocActionStates();
}

function setEmptyViewer(message = ROOT_REQUIRED_MESSAGE) {
  currentDocumentPath = null;
  currentMarkdown = "";
  lastSavedMarkdown = "";
  docTitleEl.textContent = "Select a Markdown file";
  docPathEl.textContent = "";
  editorEl.value = "";
  viewerEl.innerHTML = `
    <div class="empty-state">
      <h3>Ready</h3>
      <p>${message}</p>
    </div>
  `;
  tocEl.innerHTML = `<p class="toc-empty">${TOC_EMPTY_MESSAGE}</p>`;
  clearAutoSaveTimer();
  setEditingMode(false);
  updateSaveState(SAVE_READY_MESSAGE, false);
}

function openRootModal() {
  rootPickerInput.value = currentRootPath || rootPathInput.value || "";
  rootPickerFavoritesPanel.classList.add("hidden");
  rootModalEl.classList.remove("hidden");
}

function closeRootModal() {
  rootModalEl.classList.add("hidden");
}

function openFavoritesModal() {
  favoriteRootInput.value = currentRootPath || rootPathInput.value || "";
  renderFavoriteLists();
  favoritesModalEl.classList.remove("hidden");
}

function closeFavoritesModal() {
  favoritesModalEl.classList.add("hidden");
}

function openNewDocModal() {
  newDocDirInput.value = getCurrentDirectoryPath();
  newDocNameInput.value = "";
  newDocModalEl.classList.remove("hidden");
  newDocNameInput.focus();
}

function closeNewDocModal() {
  newDocModalEl.classList.add("hidden");
}

function createFavoriteItem(path, { compact = false } = {}) {
  const item = document.createElement("div");
  item.className = compact ? "favorite-item compact" : "favorite-item";

  const pathButton = document.createElement("button");
  pathButton.type = "button";
  pathButton.className = "favorite-path";
  pathButton.textContent = path;
  pathButton.addEventListener("click", async () => {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    rootPathInput.value = path;
    rootPickerInput.value = path;
    favoriteRootInput.value = path;
    closeFavoritesModal();
    closeRootModal();
    await applyRootPath(path);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "favorite-delete";
  deleteButton.textContent = "\uC0AD\uC81C";
  deleteButton.addEventListener("click", () => {
    removeFavoriteRoot(path);
    renderFavoriteLists();
  });

  item.append(pathButton, deleteButton);
  return item;
}

function renderFavoriteLists() {
  const favorites = readFavoriteRoots();
  const emptyMessage = `<p class="favorites-empty">\uB4F1\uB85D\uB41C \uC990\uACA8\uCC3E\uAE30 \uB8E8\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>`;

  rootPickerFavoritesList.innerHTML = "";
  favoriteRootsList.innerHTML = "";

  if (!favorites.length) {
    rootPickerFavoritesList.innerHTML = emptyMessage;
    favoriteRootsList.innerHTML = emptyMessage;
    return;
  }

  for (const favorite of favorites) {
    rootPickerFavoritesList.appendChild(createFavoriteItem(favorite, { compact: true }));
    favoriteRootsList.appendChild(createFavoriteItem(favorite));
  }
}

function fitMermaidDiagrams() {
  const availableWidth = Math.max(320, Math.min(viewerEl.clientWidth - 40, PRINT_PAGE_WIDTH_PX));

  for (const block of viewerEl.querySelectorAll(".mermaid")) {
    const svg = block.querySelector("svg");
    if (!svg) continue;

    block.classList.remove("mermaid-scaled");
    block.style.removeProperty("--mermaid-scale");

    const viewBox = svg.viewBox?.baseVal;
    const rawWidth =
      (viewBox && viewBox.width) ||
      Number.parseFloat(svg.getAttribute("width")) ||
      svg.getBoundingClientRect().width;
    const rawHeight =
      (viewBox && viewBox.height) ||
      Number.parseFloat(svg.getAttribute("height")) ||
      svg.getBoundingClientRect().height;

    if (!rawWidth || !rawHeight) continue;

    const widthScale = Math.min(1, availableWidth / rawWidth);
    const heightScale = Math.min(1, PRINT_PAGE_HEIGHT_PX / rawHeight);
    const scale = Math.min(widthScale, heightScale);

    if (scale < 0.98) {
      block.classList.add("mermaid-scaled");
      block.style.setProperty("--mermaid-scale", scale.toFixed(4));
    }
  }
}

function prepareViewerForPrint() {
  for (const section of viewerEl.querySelectorAll(".print-section-intro")) {
    section.replaceWith(...section.childNodes);
  }

  for (const block of viewerEl.querySelectorAll(".print-block")) {
    block.classList.remove("print-block");
  }

  for (const block of viewerEl.querySelectorAll(PRINT_BLOCK_SELECTOR)) {
    block.classList.add("print-block");
  }

  for (const heading of [...viewerEl.querySelectorAll(PRINT_HEADING_SELECTOR)]) {
    if (!heading.parentElement || heading.parentElement.classList.contains("print-section-intro")) {
      continue;
    }

    const group = [heading];
    let cursor = heading.nextElementSibling;
    let foundBody = false;

    while (cursor) {
      const nextCursor = cursor.nextElementSibling;
      const isHeading = cursor.matches(PRINT_HEADING_SELECTOR);
      group.push(cursor);

      if (!isHeading) {
        foundBody = true;
        break;
      }

      cursor = nextCursor;
    }

    if (!foundBody) continue;

    const wrapper = document.createElement("section");
    wrapper.className = "print-section-intro";
    heading.before(wrapper);

    for (const node of group) {
      wrapper.appendChild(node);
    }
  }
}

function slugifyHeading(text, index) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return base ? `section-${base}` : `section-${index + 1}`;
}

function renderToc() {
  const headings = [...viewerEl.querySelectorAll(PRINT_HEADING_SELECTOR)];

  if (!headings.length) {
    tocEl.innerHTML = `<p class="toc-empty">${TOC_EMPTY_MESSAGE}</p>`;
    return;
  }

  const usedIds = new Set();
  const list = document.createElement("ul");
  list.className = "toc-list";

  headings.forEach((heading, index) => {
    if (!heading.id) {
      const baseId = slugifyHeading(heading.textContent || "", index);
      let nextId = baseId;
      let suffix = 2;

      while (usedIds.has(nextId) || document.getElementById(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      heading.id = nextId;
    }

    usedIds.add(heading.id);

    const item = document.createElement("li");
    item.className = "toc-item";
    item.style.setProperty("--toc-level", heading.tagName.slice(1));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-link";
    button.dataset.targetId = heading.id;
    button.textContent = heading.textContent?.trim() || `Section ${index + 1}`;

    item.appendChild(button);
    list.appendChild(item);
  });

  tocEl.innerHTML = "";
  tocEl.appendChild(list);
}

function clampFontSize(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isNaN(numeric)) return DEFAULT_VIEWER_FONT_SIZE;
  return Math.min(MAX_VIEWER_FONT_SIZE, Math.max(MIN_VIEWER_FONT_SIZE, numeric));
}

function applyViewerFontSize(size) {
  const nextSize = clampFontSize(size);
  document.documentElement.style.setProperty("--viewer-font-size", `${nextSize}px`);
  viewerEl.style.setProperty("--viewer-font-size", `${nextSize}px`);
  fontSizeRange.value = String(nextSize);
  fontSizeValue.value = `${nextSize}px`;
  window.localStorage.setItem(VIEWER_FONT_SIZE_KEY, String(nextSize));
}

function loadViewerFontSizePreference() {
  const saved = window.localStorage.getItem(VIEWER_FONT_SIZE_KEY);
  applyViewerFontSize(saved || DEFAULT_VIEWER_FONT_SIZE);
}

function renderTree(tree, filterText = "") {
  const filter = filterText.trim().toLowerCase();

  function renderNodes(nodes) {
    const list = document.createElement("ul");
    list.className = "tree-list";

    for (const node of nodes) {
      const matchesFilter =
        !filter ||
        node.name.toLowerCase().includes(filter) ||
        node.path.toLowerCase().includes(filter);

      if (node.type === "directory") {
        const childContainer = renderNodes(node.children || []);
        const hasVisibleChildren = childContainer.childElementCount > 0;

        if (!matchesFilter && !hasVisibleChildren) continue;

        const item = document.createElement("li");
        item.className = "tree-item tree-dir";
        item.innerHTML = `<details open><summary>${node.name}</summary></details>`;
        item.querySelector("details").appendChild(childContainer);
        list.appendChild(item);
        continue;
      }

      if (!/\.(md|markdown)$/i.test(node.name) || !matchesFilter) continue;

      const item = document.createElement("li");
      item.className = "tree-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "tree-link";
      button.dataset.path = node.path;
      button.textContent = node.name;
      if (node.path === currentDocumentPath) {
        button.classList.add("active");
      }

      item.appendChild(button);
      list.appendChild(item);
    }

    return list;
  }

  treeEl.innerHTML = "";
  treeEl.appendChild(renderNodes(tree));
}

async function renderPreview(markdown, docPath = currentDocumentPath || "") {
  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: createRenderer(docPath)
  });

  viewerEl.innerHTML = marked.parse(markdown || "");

  for (const mermaidBlock of viewerEl.querySelectorAll(".mermaid")) {
    const definition = mermaidBlock.textContent;
    const { svg } = await mermaid.render(
      `mermaid-${Math.random().toString(36).slice(2)}`,
      definition
    );
    mermaidBlock.innerHTML = svg;
  }

  fitMermaidDiagrams();
  prepareViewerForPrint();
  renderToc();
}

function syncDirtyState() {
  const dirty = currentMarkdown !== lastSavedMarkdown;
  updateSaveState(dirty ? SAVE_DIRTY_MESSAGE : SAVE_READY_MESSAGE, dirty);
}

async function flushPendingSave() {
  if (autoSaveTimer) {
    clearAutoSaveTimer();
  }

  if (currentDocumentPath && currentMarkdown !== lastSavedMarkdown) {
    await saveCurrentDocument({ silent: true });
  }

  if (saveRequest) {
    await saveRequest;
  }
}

async function confirmDocumentChange() {
  if (!currentDocumentPath || currentMarkdown === lastSavedMarkdown) {
    return true;
  }

  const shouldSave = window.confirm(
    "\uC800\uC7A5\uB418\uC9C0 \uC54A\uC740 \uBCC0\uACBD \uC0AC\uD56D\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC800\uC7A5 \uD6C4 \uC774\uB3D9\uD560\uAE4C\uC694?"
  );

  if (!shouldSave) {
    return false;
  }

  try {
    await flushPendingSave();
    return true;
  } catch (error) {
    window.alert(error.message);
    return false;
  }
}

function updateTreeActiveState() {
  for (const button of treeEl.querySelectorAll(".tree-link")) {
    button.classList.toggle("active", button.dataset.path === currentDocumentPath);
  }
}

async function openDocumentFromPayload(payload) {
  currentDocumentPath = payload.path;
  currentMarkdown = payload.markdown;
  lastSavedMarkdown = payload.markdown;
  docTitleEl.textContent = payload.name;
  docPathEl.textContent = payload.path;
  editorEl.value = payload.markdown;
  setEditingMode(false);
  await renderPreview(payload.markdown, payload.path);
  editorEl.scrollTop = 0;
  viewerEl.scrollTop = 0;
  updateTreeActiveState();
  updateSaveState(SAVE_READY_MESSAGE, false);
}

async function renderCurrentDocument(docPath) {
  const payload = await apiGet(`/api/doc?path=${encodeURIComponent(docPath)}`);
  await openDocumentFromPayload(payload);
}

async function loadTree(openDefault = false) {
  const payload = await apiGet("/api/tree");

  currentTree = payload.tree || [];
  defaultDocument = payload.defaultDocument;
  currentRootPath = payload.rootPath || "";
  rootPathInput.value = currentRootPath;
  setRootSummary(currentRootPath);
  renderTree(currentTree, searchInput.value);

  if (openDefault) {
    const target = currentDocumentPath || defaultDocument;
    if (target) {
      try {
        await renderCurrentDocument(target);
        return;
      } catch (error) {
        currentDocumentPath = null;
        currentMarkdown = "";
        lastSavedMarkdown = "";

        if (target !== defaultDocument && defaultDocument) {
          try {
            await renderCurrentDocument(defaultDocument);
            return;
          } catch {
            // Fall through to empty viewer state.
          }
        }
      }
    }
  }

  if (!currentDocumentPath) {
    setEmptyViewer(currentRootPath ? SELECT_DOC_MESSAGE : ROOT_REQUIRED_MESSAGE);
  }
}

async function browseFolder() {
  if (window.electronAPI) {
    const result = await window.electronAPI.selectFolder();
    if (result.cancelled || !result.folderPath) return null;
    return result.folderPath;
  }

  const params = currentRootPath ? `?initialPath=${encodeURIComponent(currentRootPath)}` : "";
  const payload = await apiGet(`/api/browse-folder${params}`);
  if (payload.cancelled || !payload.folderPath) return null;
  return payload.folderPath;
}

async function applyRootPath(path) {
  const nextRoot = String(path || "").trim();
  if (!nextRoot) {
    window.alert(ROOT_REQUIRED_MESSAGE);
    return;
  }

  await apiPost("/api/config", { rootPath: nextRoot });
  currentRootPath = nextRoot;
  currentDocumentPath = null;
  currentMarkdown = "";
  lastSavedMarkdown = "";
  rootPathInput.value = nextRoot;
  rootPickerInput.value = nextRoot;
  favoriteRootInput.value = nextRoot;
  saveFavoriteRoot(nextRoot);
  renderFavoriteLists();
  closeRootModal();
  await loadTree(true);
}

async function saveCurrentDocument({ silent = false } = {}) {
  if (!currentDocumentPath || currentMarkdown === lastSavedMarkdown) return;

  clearAutoSaveTimer();
  const snapshot = currentMarkdown;
  const request = apiPost("/api/doc", {
    path: currentDocumentPath,
    markdown: snapshot
  });

  saveRequest = request;

  try {
    await request;
    lastSavedMarkdown = snapshot;
    updateSaveState(silent ? SAVE_READY_MESSAGE : SAVE_SUCCESS_MESSAGE, false);
    await loadTree(false);
  } finally {
    if (saveRequest === request) {
      saveRequest = null;
    }
  }
}

async function createNewDocument(dirPath, fileName) {
  const previousPath = currentDocumentPath;
  const payload = await apiPost("/api/doc/create", {
    dirPath,
    fileName,
    markdown: ""
  });

  closeNewDocModal();
  await loadTree(false);
  await renderCurrentDocument(payload.path);
  setEditingMode(true);
  editSession = {
    path: payload.path,
    markdown: "",
    createdPath: payload.path,
    previousPath
  };
  editorEl.focus();
}

async function cancelCurrentEdit() {
  if (!isEditing || !editSession) return;

  const session = editSession;
  clearAutoSaveTimer();

  if (session.createdPath && currentDocumentPath === session.createdPath) {
    await apiPost("/api/doc/delete", { path: session.createdPath });
    setEditingMode(false);
    await loadTree(false);

    if (session.previousPath) {
      try {
        await renderCurrentDocument(session.previousPath);
        return;
      } catch {
        // The previous document may have been deleted outside the app.
      }
    }

    setEmptyViewer(SELECT_DOC_MESSAGE);
    renderTree(currentTree, searchInput.value);
    return;
  }

  currentMarkdown = session.markdown;
  lastSavedMarkdown = session.markdown;
  editorEl.value = session.markdown;
  setEditingMode(false);
  await renderPreview(currentMarkdown, currentDocumentPath);
  updateSaveState(SAVE_READY_MESSAGE, false);
}

async function renameCurrentDocument() {
  if (!currentDocumentPath) return;

  const currentName = currentDocumentPath.split("/").pop() || "";
  const nextName = window.prompt("\uC0C8 \uD30C\uC77C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.", currentName);
  if (!nextName || nextName === currentName) return;

  const payload = await apiPost("/api/doc/rename", {
    path: currentDocumentPath,
    fileName: nextName
  });

  currentDocumentPath = payload.path;
  docTitleEl.textContent = payload.name;
  docPathEl.textContent = payload.path;
  await loadTree(false);
  renderTree(currentTree, searchInput.value);
}

async function deleteCurrentDocument() {
  if (!currentDocumentPath) return;

  const confirmed = window.confirm(
    "\uC774 Markdown \uD30C\uC77C\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694? \uC774 \uC791\uC5C5\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
  );
  if (!confirmed) return;

  await apiPost("/api/doc/delete", { path: currentDocumentPath });
  currentDocumentPath = null;
  currentMarkdown = "";
  lastSavedMarkdown = "";
  clearAutoSaveTimer();
  setEditingMode(false);
  await loadTree(true);
}

async function bootstrap() {
  const status = await apiGet("/api/status");
  currentRootPath = status.rootPath || "";
  rootPathInput.value = currentRootPath;
  setRootSummary(currentRootPath);
  renderFavoriteLists();

  if (!status.hasRoot) {
    setEmptyViewer(ROOT_REQUIRED_MESSAGE);
    openRootModal();
    return;
  }

  await loadTree(true);
}

window.addEventListener("beforeunload", (event) => {
  if (currentMarkdown !== lastSavedMarkdown || autoSaveTimer || saveRequest) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.querySelector("#reload-tree").addEventListener("click", async () => {
  if (!currentRootPath) {
    openRootModal();
    return;
  }

  const okay = await confirmDocumentChange();
  if (!okay) return;

  await loadTree(true);
});

document.querySelector("#print-doc").addEventListener("click", async () => {
  await renderPreview(currentMarkdown, currentDocumentPath);
  prepareViewerForPrint();
  fitMermaidDiagrams();
  window.print();
});

document.querySelector("#config-form").addEventListener("submit", (event) => {
  event.preventDefault();
  openRootModal();
});

let suggestTimer = null;

function hideSuggestions() {
  rootPickerSuggestions.classList.add("hidden");
  rootPickerSuggestions.innerHTML = "";
}

function showSuggestions(paths) {
  rootPickerSuggestions.innerHTML = "";
  if (!paths.length) {
    hideSuggestions();
    return;
  }
  for (const p of paths) {
    const li = document.createElement("li");
    li.textContent = p;
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      rootPickerInput.value = p;
      hideSuggestions();
      rootPickerInput.focus();
    });
    rootPickerSuggestions.appendChild(li);
  }
  rootPickerSuggestions.classList.remove("hidden");
}

rootPickerInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  const val = rootPickerInput.value.trim();
  if (!val) { hideSuggestions(); return; }
  suggestTimer = setTimeout(async () => {
    try {
      const list = await apiGet(`/api/suggest-path?q=${encodeURIComponent(val)}`);
      showSuggestions(list);
    } catch {
      hideSuggestions();
    }
  }, 180);
});

rootPickerInput.addEventListener("keydown", (e) => {
  if (rootPickerSuggestions.classList.contains("hidden")) return;
  const items = [...rootPickerSuggestions.querySelectorAll("li")];
  const activeItem = rootPickerSuggestions.querySelector("li.active");
  const activeIndex = items.indexOf(activeItem);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = items[activeIndex + 1] ?? items[0];
    activeItem?.classList.remove("active");
    next.classList.add("active");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = items[activeIndex - 1] ?? items[items.length - 1];
    activeItem?.classList.remove("active");
    prev.classList.add("active");
  } else if (e.key === "Enter" && activeItem) {
    e.preventDefault();
    rootPickerInput.value = activeItem.textContent;
    hideSuggestions();
  } else if (e.key === "Escape") {
    hideSuggestions();
  } else if (e.key === "Tab" && activeItem) {
    e.preventDefault();
    rootPickerInput.value = activeItem.textContent;
    hideSuggestions();
  }
});

rootPickerInput.addEventListener("blur", () => {
  setTimeout(hideSuggestions, 150);
});

rootPickerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextPath = rootPickerInput.value.trim();
  if (!nextPath) return;
  try {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    await applyRootPath(nextPath);
  } catch (error) {
    window.alert(error.message);
  }
});

rootPickerBrowseButton.addEventListener("click", async () => {
  try {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    const folder = await browseFolder();
    if (folder) await applyRootPath(folder);
  } catch (error) {
    window.alert(error.message);
  }
});

rootPickerFavoritesButton.addEventListener("click", () => {
  rootPickerFavoritesPanel.classList.toggle("hidden");
  renderFavoriteLists();
});

favoriteRootButton.addEventListener("click", () => {
  openFavoritesModal();
});

applyFavoriteRootButton.addEventListener("click", async () => {
  const target = String(favoriteRootInput.value || "").trim();
  if (!target) {
    window.alert(ROOT_REQUIRED_MESSAGE);
    return;
  }
  try {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    closeFavoritesModal();
    await applyRootPath(target);
  } catch (error) {
    window.alert(error.message);
  }
});

saveFavoriteRootButton.addEventListener("click", () => {
  const target = String(favoriteRootInput.value || rootPathInput.value || "").trim();
  if (!target) {
    window.alert(ROOT_REQUIRED_MESSAGE);
    return;
  }
  saveFavoriteRoot(target);
  renderFavoriteLists();
});

closeFavoritesModalButton.addEventListener("click", () => {
  closeFavoritesModal();
});

newDocButton.addEventListener("click", async () => {
  if (!currentRootPath) {
    openRootModal();
    return;
  }

  const okay = await confirmDocumentChange();
  if (!okay) return;

  openNewDocModal();
});

editDocButton.addEventListener("click", async () => {
  if (!currentDocumentPath) return;

  try {
    setEditingMode(true);
    editorEl.focus();
  } catch (error) {
    window.alert(error.message);
  }
});

closeNewDocModalButton.addEventListener("click", () => {
  closeNewDocModal();
});

newDocForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await createNewDocument(
      normalizeRelativePath(newDocDirInput.value),
      newDocNameInput.value
    );
  } catch (error) {
    window.alert(error.message);
  }
});

saveDocButton.addEventListener("click", async () => {
  try {
    await saveCurrentDocument();
    setEditingMode(false);
  } catch (error) {
    window.alert(error.message);
  }
});

cancelEditButton.addEventListener("click", async () => {
  try {
    await cancelCurrentEdit();
  } catch (error) {
    window.alert(error.message);
  }
});

renameDocButton.addEventListener("click", async () => {
  try {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    await renameCurrentDocument();
  } catch (error) {
    window.alert(error.message);
  }
});

deleteDocButton.addEventListener("click", async () => {
  try {
    const okay = await confirmDocumentChange();
    if (!okay) return;
    await deleteCurrentDocument();
  } catch (error) {
    window.alert(error.message);
  }
});

treeEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".tree-link");
  if (!button) return;

  const okay = await confirmDocumentChange();
  if (!okay) return;

  await renderCurrentDocument(button.dataset.path);
});

viewerEl.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-doc-link]");
  if (!link) return;
  event.preventDefault();

  const okay = await confirmDocumentChange();
  if (!okay) return;

  await renderCurrentDocument(link.dataset.docLink);
});

tocEl.addEventListener("click", (event) => {
  const button = event.target.closest(".toc-link");
  if (!button) return;

  const target = document.getElementById(button.dataset.targetId);
  if (!target) return;

  target.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

editorEl.addEventListener("input", async () => {
  currentMarkdown = editorEl.value;
  syncDirtyState();
  await renderPreview(currentMarkdown, currentDocumentPath);
});

searchInput.addEventListener("input", () => {
  renderTree(currentTree, searchInput.value);
});

fontSizeRange.addEventListener("input", () => {
  applyViewerFontSize(fontSizeRange.value);
  fitMermaidDiagrams();
});

window.addEventListener("resize", () => {
  fitMermaidDiagrams();
});

rootModalEl.addEventListener("click", (event) => {
  if (event.target === rootModalEl && currentRootPath) {
    closeRootModal();
  }
});

favoritesModalEl.addEventListener("click", (event) => {
  if (event.target === favoritesModalEl) {
    closeFavoritesModal();
  }
});

newDocModalEl.addEventListener("click", (event) => {
  if (event.target === newDocModalEl) {
    closeNewDocModal();
  }
});

loadViewerFontSizePreference();
setEditingMode(false);
updateDocActionStates();

bootstrap().catch((error) => {
  setEmptyViewer(error.message);
  tocEl.innerHTML = `<p class="toc-empty">${TOC_ERROR_MESSAGE}</p>`;
  openRootModal();
});
