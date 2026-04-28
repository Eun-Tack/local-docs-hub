const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { startServer } = require("./server");

let mainWindow = null;
let serverInfo = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Local Docs Hub",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require("path").join(__dirname, "preload.js")
    }
  });

  mainWindow.loadURL(serverInfo.url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "루트 폴더 선택"
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true, folderPath: "" };
  }

  return { cancelled: false, folderPath: result.filePaths[0] };
});

app.whenReady().then(async () => {
  serverInfo = await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
