const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 4120;
const APP_DIR = __dirname;
const DEFAULT_TITLE = "Local Docs Hub";

let currentRootPath = "";

function resolveModulePath(...segments) {
  const localPath = path.join(APP_DIR, "node_modules", ...segments);
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  return path.join(APP_DIR, "..", "node_modules", ...segments);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(APP_DIR, "public")));
app.use("/vendor", express.static(resolveModulePath("mermaid", "dist")));
app.use("/vendor-marked", express.static(resolveModulePath("marked", "lib")));

function normalizeTarget(targetPath) {
  return path.resolve(targetPath);
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

  res.json({
    ok: true,
    rootPath: resolved,
    title: DEFAULT_TITLE
  });
});

app.post("/api/reset-root", (req, res) => {
  currentRootPath = "";
  res.json({ ok: true });
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

app.listen(PORT, () => {
  console.log(`Local Docs Hub is running at http://127.0.0.1:${PORT}`);
});
