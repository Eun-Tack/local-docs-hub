const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 4120;
const APP_DIR = __dirname;
const DEFAULT_TITLE = "Local Docs Hub";
const CONFIG_PATH = path.join(APP_DIR, "config.json");

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const rootPath = String(parsed.rootPath || "").trim();
    if (rootPath && fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory()) {
      return rootPath;
    }
  } catch {
    // config.json이 없거나 파싱 실패 시 빈 값으로 시작
  }
  return "";
}

function saveConfig(rootPath) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ rootPath, title: DEFAULT_TITLE }, null, 2), "utf8");
  } catch {
    // 저장 실패는 무시 (메모리 상태는 유효)
  }
}

let currentRootPath = loadConfig();

function resolveModulePath(...segments) {
  const localPath = path.join(APP_DIR, "node_modules", ...segments);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  return path.join(APP_DIR, "..", "node_modules", ...segments);
}

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(APP_DIR, "public")));
app.use("/vendor", express.static(resolveModulePath("mermaid", "dist")));
app.use("/vendor-marked", express.static(resolveModulePath("marked", "lib")));

function normalizeTarget(targetPath) {
  return path.resolve(targetPath);
}

function normalizeRelativePath(targetPath) {
  return String(targetPath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function getRootPath() {
  return currentRootPath ? normalizeTarget(currentRootPath) : "";
}

function assertRootConfigured() {
  const rootPath = getRootPath();
  if (!rootPath) {
    throw new Error("Root folder is not selected.");
  }
  return rootPath;
}

function assertInsideRoot(candidatePath) {
  const rootPath = assertRootConfigured();
  const normalized = normalizeTarget(candidatePath);
  const relative = path.relative(rootPath, normalized);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Requested path is outside the configured root.");
  }

  return normalized;
}

function ensureMarkdownFileName(fileName) {
  const trimmed = String(fileName || "").trim();
  if (!trimmed) {
    throw new Error("fileName is required.");
  }

  const sanitized = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
  if (!sanitized) {
    throw new Error("fileName is invalid.");
  }

  return /\.(md|markdown)$/i.test(sanitized) ? sanitized : `${sanitized}.md`;
}

function buildTree(dirPath, rootPath) {
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  return entries
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        return {
          type: "directory",
          name: entry.name,
          path: relativePath,
          children: buildTree(fullPath, rootPath)
        };
      }

      if (!/\.(md|markdown|png|jpg|jpeg|gif|svg|webp)$/i.test(entry.name)) {
        return null;
      }

      return {
        type: "file",
        name: entry.name,
        path: relativePath
      };
    })
    .filter(Boolean);
}

function pickFirstMarkdown(tree) {
  for (const node of tree) {
    if (node.type === "file" && /\.(md|markdown)$/i.test(node.name)) {
      return node.path;
    }

    if (node.type === "directory") {
      const match = pickFirstMarkdown(node.children || []);
      if (match) return match;
    }
  }

  return null;
}

app.get("/api/status", (req, res) => {
  const rootPath = getRootPath();
  const exists = rootPath ? fs.existsSync(rootPath) : false;

  res.json({
    title: DEFAULT_TITLE,
    rootPath,
    hasRoot: Boolean(rootPath),
    exists,
    port: PORT
  });
});

app.post("/api/config", (req, res) => {
  const nextRoot = String(req.body.rootPath || "").trim();

  if (!nextRoot) {
    return res.status(400).json({ error: "rootPath is required" });
  }

  const resolved = normalizeTarget(nextRoot);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return res.status(400).json({ error: "rootPath must be an existing directory" });
  }

  currentRootPath = resolved;
  saveConfig(resolved);

  res.json({
    ok: true,
    rootPath: resolved,
    title: DEFAULT_TITLE
  });
});

app.post("/api/reset-root", (req, res) => {
  currentRootPath = "";
  saveConfig("");
  res.json({ ok: true });
});

app.get("/api/browse-folder", (req, res) => {
  const initialPath = String(req.query.initialPath || "").trim();
  const escapedInitial = initialPath.replace(/'/g, "''");
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:selected = ''
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.Opacity = 0
$form.StartPosition = 'CenterScreen'
$form.ShowInTaskbar = $false
$form.Add_Shown({
    $form.Activate()
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = '루트 폴더 선택'
    $dlg.ShowNewFolderButton = $true
    $dlg.SelectedPath = '${escapedInitial}'
    if ($dlg.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $script:selected = $dlg.SelectedPath
    }
    $form.Close()
})
[System.Windows.Forms.Application]::Run($form)
if ($script:selected) { $script:selected } else { '' }
`;

  execFile(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", psScript],
    { encoding: "utf8", timeout: 300000, windowsHide: false },
    (error, stdout) => {
      if (error && error.killed) {
        return res.json({ cancelled: true, folderPath: "" });
      }
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const result = stdout.trim();
      if (!result) {
        return res.json({ cancelled: true, folderPath: "" });
      }
      res.json({ cancelled: false, folderPath: result });
    }
  );
});

app.get("/api/suggest-path", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  try {
    let parentDir, partial;
    if (q.endsWith("\\") || q.endsWith("/")) {
      parentDir = path.resolve(q);
      partial = "";
    } else {
      const resolved = path.resolve(q);
      parentDir = path.dirname(resolved);
      partial = path.basename(resolved).toLowerCase();
    }

    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      return res.json([]);
    }

    const suggestions = fs
      .readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name.toLowerCase().startsWith(partial))
      .slice(0, 12)
      .map((e) => path.join(parentDir, e.name));

    res.json(suggestions);
  } catch {
    res.json([]);
  }
});

app.get("/api/tree", (req, res) => {
  try {
    const rootPath = assertRootConfigured();
    const tree = buildTree(rootPath, rootPath);

    res.json({
      rootPath,
      tree,
      defaultDocument: pickFirstMarkdown(tree)
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      rootPath: "",
      tree: [],
      defaultDocument: null
    });
  }
});

app.get("/api/doc", (req, res) => {
  const relativePath = String(req.query.path || "");

  if (!relativePath) {
    return res.status(400).json({ error: "path is required" });
  }

  try {
    const rootPath = assertRootConfigured();
    const fullPath = assertInsideRoot(path.join(rootPath, relativePath));

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json({
      path: relativePath.replace(/\\/g, "/"),
      name: path.basename(fullPath),
      markdown: fs.readFileSync(fullPath, "utf8")
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/doc", (req, res) => {
  const relativePath = normalizeRelativePath(req.body.path);
  const markdown = String(req.body.markdown ?? "");

  if (!relativePath) {
    return res.status(400).json({ error: "path is required" });
  }

  try {
    const rootPath = assertRootConfigured();
    const fullPath = assertInsideRoot(path.join(rootPath, relativePath));

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!/\.(md|markdown)$/i.test(fullPath)) {
      return res.status(400).json({ error: "Only Markdown files can be saved." });
    }

    fs.writeFileSync(fullPath, markdown, "utf8");

    res.json({
      ok: true,
      path: relativePath,
      name: path.basename(fullPath)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/doc/create", (req, res) => {
  const dirPath = normalizeRelativePath(req.body.dirPath);
  const initialMarkdown = String(req.body.markdown ?? "");

  try {
    const rootPath = assertRootConfigured();
    const fileName = ensureMarkdownFileName(req.body.fileName);
    const targetDir = assertInsideRoot(path.join(rootPath, dirPath || "."));

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return res.status(400).json({ error: "Target directory does not exist." });
    }

    const fullPath = assertInsideRoot(path.join(targetDir, fileName));

    if (fs.existsSync(fullPath)) {
      return res.status(400).json({ error: "A file with the same name already exists." });
    }

    fs.writeFileSync(fullPath, initialMarkdown, "utf8");

    res.json({
      ok: true,
      path: path.relative(rootPath, fullPath).replace(/\\/g, "/"),
      name: path.basename(fullPath)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/doc/rename", (req, res) => {
  const relativePath = normalizeRelativePath(req.body.path);
  const nextFileName = req.body.fileName;

  if (!relativePath) {
    return res.status(400).json({ error: "path is required" });
  }

  try {
    const rootPath = assertRootConfigured();
    const fullPath = assertInsideRoot(path.join(rootPath, relativePath));

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: "Document not found" });
    }

    const safeFileName = ensureMarkdownFileName(nextFileName);
    const renamedPath = assertInsideRoot(path.join(path.dirname(fullPath), safeFileName));

    if (fs.existsSync(renamedPath)) {
      return res.status(400).json({ error: "A file with the same name already exists." });
    }

    fs.renameSync(fullPath, renamedPath);

    res.json({
      ok: true,
      path: path.relative(rootPath, renamedPath).replace(/\\/g, "/"),
      name: path.basename(renamedPath)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/doc/delete", (req, res) => {
  const relativePath = normalizeRelativePath(req.body.path);

  if (!relativePath) {
    return res.status(400).json({ error: "path is required" });
  }

  try {
    const rootPath = assertRootConfigured();
    const fullPath = assertInsideRoot(path.join(rootPath, relativePath));

    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!/\.(md|markdown)$/i.test(fullPath)) {
      return res.status(400).json({ error: "Only Markdown files can be deleted." });
    }

    fs.unlinkSync(fullPath);

    res.json({
      ok: true,
      path: relativePath
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/raw", (req, res) => {
  const relativePath = String(req.query.path || "");

  if (!relativePath) {
    return res.status(400).send("path is required");
  }

  try {
    const rootPath = assertRootConfigured();
    const fullPath = assertInsideRoot(path.join(rootPath, relativePath));
    res.sendFile(fullPath);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      const url = `http://127.0.0.1:${PORT}`;
      console.log(`Local Docs Hub is running at ${url}`);
      resolve({ server, url, port: PORT });
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, PORT };
