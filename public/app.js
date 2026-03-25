import mermaid from "/vendor/mermaid.esm.min.mjs";
import { marked } from "/vendor-marked/marked.esm.js";

const rootPathInput = document.querySelector("#root-path");
const rootSummary = document.querySelector("#root-summary");
const treeEl = document.querySelector("#tree");
const viewerEl = document.querySelector("#viewer");
const docTitleEl = document.querySelector("#doc-title");
const docPathEl = document.querySelector("#doc-path");
const searchInput = document.querySelector("#search-input");
const fontSizeRange = document.querySelector("#font-size-range");
const fontSizeValue = document.querySelector("#font-size-value");
const tocEl = document.querySelector("#toc");
const rootModalEl = document.querySelector("#root-modal");
const rootPickerForm = document.querySelector("#root-picker-form");
const rootPickerInput = document.querySelector("#root-picker-input");
const rootPickerFavoritesButton = document.querySelector("#root-picker-favorites");
const rootPickerFavoritesPanel = document.querySelector("#root-picker-favorites-panel");
const rootPickerFavoritesList = document.querySelector("#root-picker-favorites-list");
const favoritesModalEl = document.querySelector("#favorites-modal");
const favoriteRootButton = document.querySelector("#favorite-root-button");
const favoriteRootInput = document.querySelector("#favorite-root-input");
const saveFavoriteRootButton = document.querySelector("#save-favorite-root");
const closeFavoritesModalButton = document.querySelector("#close-favorites-modal");
const favoriteRootsList = document.querySelector("#favorite-roots-list");

const MIN_VIEWER_FONT_SIZE = 8;
const MAX_VIEWER_FONT_SIZE = 24;
const DEFAULT_VIEWER_FONT_SIZE = 16;
const VIEWER_FONT_SIZE_KEY = "local-docs-hub-viewer-font-size";
const FAVORITE_ROOTS_KEY = "local-docs-hub-favorite-roots";
const TOC_EMPTY_MESSAGE = "\uBB38\uC11C\uB97C \uC5F4\uBA74 \uBAA9\uCC28\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4.";
const TOC_ERROR_MESSAGE = "\uBAA9\uCC28\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.";
const ROOT_REQUIRED_MESSAGE = "\uB8E8\uD2B8 \uD3F4\uB354\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.";
const PRINT_PAGE_HEIGHT_PX = 980;
const PRINT_PAGE_WIDTH_PX = 700;

let currentTree = [];
let currentDocumentPath = null;
let defaultDocument = null;
let currentRootPath = "";

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
    return `<pre><code class="language-${lang || "text"}">${escapeHtml(text)}</code></pre>`;
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
    throw new Error(error || "Request failed");
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

function setRootSummary(path) {
  rootSummary.textContent = path || ROOT_REQUIRED_MESSAGE;
}

function setEmptyViewer(message = ROOT_REQUIRED_MESSAGE) {
  currentDocumentPath = null;
  docTitleEl.textContent = "Select a Markdown file";
  docPathEl.textContent = "";
  viewerEl.innerHTML = `
    <div class="empty-state">
      <h3>Ready</h3>
      <p>${message}</p>
    </div>
  `;
  tocEl.innerHTML = `<p class="toc-empty">${TOC_EMPTY_MESSAGE}</p>`;
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

function createFavoriteItem(path, { compact = false } = {}) {
  const item = document.createElement("div");
  item.className = compact ? "favorite-item compact" : "favorite-item";

  const pathButton = document.createElement("button");
  pathButton.type = "button";
  pathButton.className = "favorite-path";
  pathButton.textContent = path;
  pathButton.addEventListener("click", async () => {
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

async function renderCurrentDocument(docPath) {
  const payload = await apiGet(`/api/doc?path=${encodeURIComponent(docPath)}`);
  currentDocumentPath = payload.path;
  docTitleEl.textContent = payload.name;
  docPathEl.textContent = payload.path;

  marked.setOptions({
    gfm: true,
    breaks: true,
    renderer: createRenderer(payload.path)
  });

  viewerEl.innerHTML = marked.parse(payload.markdown);
  prepareViewerForPrint();
  renderToc();
  renderTree(currentTree, searchInput.value);

  for (const mermaidBlock of viewerEl.querySelectorAll(".mermaid")) {
    const definition = mermaidBlock.textContent;
    const { svg } = await mermaid.render(
      `mermaid-${Math.random().toString(36).slice(2)}`,
      definition
    );
    mermaidBlock.innerHTML = svg;
  }

  fitMermaidDiagrams();
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
      await renderCurrentDocument(target);
      return;
    }
  }

  if (!currentDocumentPath) {
    setEmptyViewer(currentRootPath ? "\uBB38\uC11C\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694." : ROOT_REQUIRED_MESSAGE);
  }
}

async function applyRootPath(path) {
  const nextRoot = String(path || "").trim();
  if (!nextRoot) {
    window.alert(ROOT_REQUIRED_MESSAGE);
    return;
  }

  await apiPost("/api/config", { rootPath: nextRoot });
  currentRootPath = nextRoot;
  rootPathInput.value = nextRoot;
  rootPickerInput.value = nextRoot;
  favoriteRootInput.value = nextRoot;
  saveFavoriteRoot(nextRoot);
  renderFavoriteLists();
  closeRootModal();
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

window.addEventListener("beforeunload", () => {
  navigator.sendBeacon("/api/reset-root", new Blob(["{}"], { type: "application/json" }));
});

document.querySelector("#reload-tree").addEventListener("click", async () => {
  if (!currentRootPath) {
    openRootModal();
    return;
  }
  await loadTree(true);
});

document.querySelector("#print-doc").addEventListener("click", () => {
  prepareViewerForPrint();
  fitMermaidDiagrams();
  window.print();
});

document.querySelector("#config-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await applyRootPath(rootPathInput.value);
  } catch (error) {
    window.alert(error.message);
  }
});

rootPickerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await applyRootPath(rootPickerInput.value);
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

treeEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".tree-link");
  if (!button) return;
  await renderCurrentDocument(button.dataset.path);
});

viewerEl.addEventListener("click", async (event) => {
  const link = event.target.closest("[data-doc-link]");
  if (!link) return;
  event.preventDefault();
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

loadViewerFontSizePreference();

bootstrap().catch((error) => {
  setEmptyViewer(error.message);
  tocEl.innerHTML = `<p class="toc-empty">${TOC_ERROR_MESSAGE}</p>`;
  openRootModal();
});
