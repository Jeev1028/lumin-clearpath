// Electron shell for ClearPath on Windows -- deliberately thin: it just
// opens a native window and loads the live site (same "render the live
// site" approach as the Android TWA and iOS Capacitor shell, see
// android/generate.mjs and ios/capacitor.config.json), rather than
// bundling a local copy of the built web assets. That means every
// ClearPath feature (including Google Sign-In, which does a same-window
// redirect to accounts.google.com and back -- see src/routes/auth.tsx)
// keeps working here with zero app-side changes, since as far as the web
// app can tell this is just another Chromium browser window.
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const START_URL = "https://luminclearpath.ca/auth";

// Prevents two copies of the app running at once (e.g. double-clicking the
// desktop shortcut while it's already open) -- the second launch just
// focuses the existing window instead of spawning a duplicate.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 900,
      minHeight: 600,
      title: "ClearPath",
      backgroundColor: "#0A1128",
      icon: path.join(__dirname, "icons", "icon.ico"),
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Anything the page tries to open in a new window/tab -- e.g. the
    // footer's GitHub link, "cite this source" links, mailto: links, or a
    // Google Classroom assignment's "open in Classroom" button (see
    // TaskDetailDialog.tsx) -- opens in the user's normal default browser
    // instead of a second Electron window. Same-window navigation (which
    // is how every OAuth flow in this app works) is left completely
    // untouched, so Google Sign-In and connecting Classroom/Calendar still
    // work exactly like they do in a regular browser.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    mainWindow.loadURL(START_URL);

    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(() => {
    // Sets a normal desktop Chrome-style user agent -- some Google OAuth
    // consent screens degrade/refuse embedded-looking user agents, and
    // Electron's default UA string otherwise announces itself as Electron.
    session.defaultSession.setUserAgent(
      session.defaultSession
        .getUserAgent()
        .replace(/\s*Electron\/\S+/, "")
        .replace(/\s*clearpath-windows\/\S+/, ""),
    );

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
