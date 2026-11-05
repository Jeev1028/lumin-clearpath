// Lumin for Windows -- an Electron shell that loads the live site
// (luminclearpath.ca) rather than bundling web assets, the same "render the
// live site" approach as the Android TWA and the iOS Capacitor shell. Every
// web feature (Google Sign-In, the planner, chat) keeps working with zero
// app-side changes, since as far as the page can tell this is a Chromium window.
//
// On top of the window it adds what makes it feel like part of the computer:
//  - a tray icon (the app keeps running when the window is closed)
//  - a global hotkey, Ctrl+Shift+L, to show/hide Lumin from anywhere
//  - an optional "Start with Windows" setting
//  - full screen on F11, or from the start with --fullscreen (used by Lumin mode)
const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, shell, session } = require("electron");
const path = require("node:path");

const ORIGIN = "https://luminclearpath.ca";
const START_URL = ORIGIN + "/auth";
const HOTKEY = "CommandOrControl+Shift+L";
const ICON = path.join(__dirname, "icons", "icon.ico");

const args = process.argv.slice(1);
const startFullscreen = args.includes("--fullscreen");
const startHidden = args.includes("--hidden");

// Only one copy at a time: a second launch just brings the first to the front.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let tray = null;
  let quitting = false;

  function showWindow(url) {
    if (!mainWindow) createWindow();
    if (url) void mainWindow.loadURL(url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function toggleWindow() {
    if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
    else showWindow();
  }

  app.on("second-instance", () => showWindow());

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 900,
      minHeight: 600,
      title: "Lumin",
      backgroundColor: "#0A1128",
      icon: ICON,
      autoHideMenuBar: true,
      fullscreen: startFullscreen,
      show: !startHidden,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Links that should leave the app (the footer's GitHub link, "cite this
    // source", mailto:, "open in Classroom") open in the normal browser.
    // Same-window navigation, which is how every sign-in flow works, is untouched.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    // F11 toggles full screen; Esc leaves it.
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      if (input.key === "F11") {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      } else if (input.key === "Escape" && mainWindow.isFullScreen() && !startFullscreen) {
        mainWindow.setFullScreen(false);
      }
    });

    void mainWindow.loadURL(START_URL);

    // Closing the window hides it to the tray; "Quit Lumin" in the tray really exits.
    mainWindow.on("close", (event) => {
      if (quitting || startFullscreen) return;
      event.preventDefault();
      mainWindow.hide();
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  function buildTray() {
    tray = new Tray(nativeImage.createFromPath(ICON));
    tray.setToolTip("Lumin (Ctrl+Shift+L)");
    const refresh = () =>
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Open Lumin", click: () => showWindow() },
          { label: "Chat with Lumin", click: () => showWindow(ORIGIN + "/chat") },
          { label: "Study planner", click: () => showWindow(ORIGIN + "/schedule") },
          { type: "separator" },
          {
            label: "Start with Windows",
            type: "checkbox",
            checked: app.getLoginItemSettings().openAtLogin,
            click: (item) => {
              app.setLoginItemSettings({ openAtLogin: item.checked, args: ["--hidden"] });
              refresh();
            },
          },
          { type: "separator" },
          {
            label: "Quit Lumin",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
    refresh();
    tray.on("click", toggleWindow);
  }

  app.whenReady().then(() => {
    // A normal desktop Chrome user agent: some Google sign-in screens refuse
    // embedded-looking ones, and Electron's default announces itself.
    session.defaultSession.setUserAgent(
      session.defaultSession
        .getUserAgent()
        .replace(/\s*Electron\/\S+/, "")
        .replace(/\s*clearpath-windows\/\S+/, "")
        .replace(/\s*lumin-windows\/\S+/, ""),
    );

    createWindow();
    buildTray();
    globalShortcut.register(HOTKEY, toggleWindow);
  });

  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());

  // The app lives in the tray, so closing every window does not quit it.
  app.on("window-all-closed", () => {});
}
