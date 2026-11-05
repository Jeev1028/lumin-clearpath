// Lumin for Windows -- an Electron shell that loads the live site
// (luminclearpath.ca) rather than bundling web assets, the same "render the
// live site" approach as the Android TWA and the iOS Capacitor shell. Every
// web feature (Google Sign-In, the planner, chat) keeps working with zero
// app-side changes, since as far as the page can tell this is a Chromium window.
//
// Two ways to run it:
//  - normal app (default): a window plus a tray icon, Ctrl+Shift+L hotkey,
//    optional "Start with Windows", F11 full screen.
//  - Lumin mode (--desktop or --shell): Lumin becomes the desktop. A wallpaper
//    desktop, a floating dock with your running windows, an app launcher (every
//    installed app), files, status and power. --shell is the same thing used as
//    the Windows shell (see windows/lumin-mode/); in that case Windows' own
//    desktop and taskbar are not running at all.
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  safeStorage,
  screen,
  shell,
  session,
} = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMemory } = require("./memory");
const { createHome } = require("./home");

const ORIGIN = "https://luminclearpath.ca";
const START_URL = ORIGIN + "/auth";
const HOTKEY = "CommandOrControl+Shift+L";
const LAUNCHER_KEY = "Control+Space";
const ESCAPE_KEY = "Control+Alt+Shift+E";
const ICON = path.join(__dirname, "icons", "icon.ico");
const PRELOAD = path.join(__dirname, "preload.js");
const SHELL_PAGE = path.join(__dirname, "shell", "index.html");

const args = process.argv.slice(1);
const asShell = args.includes("--shell");
const luminMode = asShell || args.includes("--desktop");
const startFullscreen = args.includes("--fullscreen");
const startHidden = args.includes("--hidden");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let desktopWindow = null;
  let dockWindow = null;
  let launcherWindow = null;
  let tray = null;
  let quitting = false;

  // ---------------------------------------------------------------- website window

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

  app.on("second-instance", () => {
    if (luminMode) showWindow();
    else showWindow();
  });

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
      show: luminMode ? true : !startHidden,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });

    // Links that should leave the app open in the normal browser. Same-window
    // navigation, which is how every sign-in flow works, is untouched.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

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

    // Normal app: closing hides to the tray. Lumin mode: it just closes.
    mainWindow.on("close", (event) => {
      if (quitting || startFullscreen || luminMode) return;
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

  // ---------------------------------------------------------------- Lumin mode

  const DOCK_H = 84;

  function shellPageWindow(view, opts) {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      skipTaskbar: true,
      icon: ICON,
      title: "Lumin " + view,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      ...opts,
    });
    win.removeMenu();
    void win.loadFile(SHELL_PAGE, { query: { view } });
    return win;
  }

  function createDesktop() {
    const b = screen.getPrimaryDisplay().bounds;
    desktopWindow = shellPageWindow("desktop", {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      resizable: false,
      movable: false,
      minimizable: false,
      backgroundColor: "#060d1f",
    });
    desktopWindow.once("ready-to-show", () => desktopWindow.show());
    // Ctrl+Shift+L is mapped in main; the desktop itself never closes except via quit.
    desktopWindow.on("close", (e) => {
      if (!quitting) e.preventDefault();
    });
  }

  function placeDock(width) {
    if (!dockWindow) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const w = Math.max(320, Math.min(Math.round(width), wa.width - 24));
    dockWindow.setBounds({
      x: Math.round(wa.x + (wa.width - w) / 2),
      y: wa.y + wa.height - DOCK_H - 6,
      width: w,
      height: DOCK_H,
    });
  }

  function createDock() {
    dockWindow = shellPageWindow("dock", {
      width: 760,
      height: DOCK_H,
      transparent: true,
      resizable: false,
      focusable: false,
      alwaysOnTop: true,
      hasShadow: false,
    });
    dockWindow.setAlwaysOnTop(true, "screen-saver");
    placeDock(760);
    dockWindow.once("ready-to-show", () => dockWindow.showInactive());
  }

  function toggleLauncher(show) {
    if (!luminMode) return;
    if (!launcherWindow) {
      const b = screen.getPrimaryDisplay().bounds;
      launcherWindow = shellPageWindow("launcher", {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
      });
      launcherWindow.setAlwaysOnTop(true, "screen-saver");
      // Click-away closes it, but not in the first moments while it is still taking focus.
      let readyAt = Infinity;
      launcherWindow.on("blur", () => {
        if (launcherWindow && Date.now() - readyAt > 900) launcherWindow.hide();
      });
      launcherWindow.on("closed", () => {
        launcherWindow = null;
      });
      // Show once the page has loaded (ready-to-show alone can be missed by
      // transparent windows).
      let revealed = false;
      const reveal = () => {
        if (revealed || !launcherWindow) return;
        revealed = true;
        readyAt = Date.now();
        launcherWindow.show();
        launcherWindow.focus();
        launcherWindow.webContents.send("launcher:shown");
      };
      launcherWindow.once("ready-to-show", reveal);
      launcherWindow.webContents.once("did-finish-load", () => setTimeout(reveal, 150));
      return;
    }
    const want = typeof show === "boolean" ? show : !launcherWindow.isVisible();
    if (want) {
      launcherWindow.show();
      launcherWindow.moveTop();
      launcherWindow.focus();
      launcherWindow.webContents.send("launcher:shown");
    } else {
      launcherWindow.hide();
    }
  }

  // ---- installed apps (Start Menu shortcuts + Store apps)

  let appCache = null; // id -> { id, name, kind, target, lnk, aumid }

  function walk(dir, out, depth = 0) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 4) walk(p, out, depth + 1);
      } else if (e.name.toLowerCase().endsWith(".lnk")) out.push(p);
    }
  }

  const SKIP_NAME = /(uninstall|readme|release notes|license|help|documentation|website|manual)/i;

  function psJson(script, timeoutMs = 15000) {
    return new Promise((resolve) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
        (err, stdout) => {
          if (err || !stdout.trim()) return resolve(null);
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(null);
          }
        },
      );
    });
  }

  async function loadApps() {
    const map = new Map();
    const roots = [
      path.join(process.env["ProgramData"] || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
      path.join(process.env["APPDATA"] || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    ];
    const links = [];
    for (const r of roots) walk(r, links);
    for (const lnk of links) {
      const name = path.basename(lnk, ".lnk");
      if (SKIP_NAME.test(name)) continue;
      const key = name.toLowerCase();
      if (map.has(key)) continue;
      let target = "";
      try {
        target = shell.readShortcutLink(lnk).target || "";
      } catch {
        // some shortcuts (e.g. Store apps) have no readable target
      }
      map.set(key, { id: "lnk:" + lnk, name, kind: "lnk", lnk, target });
    }
    // Store apps and anything else Windows lists in Start.
    const uwp = await psJson(
      "Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress",
      20000,
    );
    for (const a of Array.isArray(uwp) ? uwp : uwp ? [uwp] : []) {
      if (!a || !a.Name || !a.AppID) continue;
      const key = String(a.Name).toLowerCase();
      if (map.has(key) || SKIP_NAME.test(a.Name)) continue;
      map.set(key, { id: "uwp:" + a.AppID, name: a.Name, kind: "uwp", aumid: a.AppID });
    }
    appCache = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return appCache;
  }

  ipcMain.handle("apps:list", async () => {
    const list = appCache || (await loadApps());
    return list.map(({ id, name, kind }) => ({ id, name, kind }));
  });

  const iconCache = new Map();
  ipcMain.handle("apps:icon", async (_e, id) => {
    if (iconCache.has(id)) return iconCache.get(id);
    const a = (appCache || []).find((x) => x.id === id);
    if (!a || a.kind !== "lnk") return null;
    let url = null;
    for (const p of [a.target, a.lnk]) {
      if (!p) continue;
      try {
        const img = await app.getFileIcon(p, { size: "large" });
        if (!img.isEmpty()) {
          url = img.toDataURL();
          break;
        }
      } catch {
        // try the next path
      }
    }
    iconCache.set(id, url);
    return url;
  });

  ipcMain.handle("apps:launch", async (_e, id) => {
    const a = (appCache || []).find((x) => x.id === id);
    if (!a) return false;
    if (a.kind === "lnk") return (await shell.openPath(a.lnk)) === "";
    return (await shell.openPath("shell:AppsFolder\\" + a.aumid)) === "";
  });

  // ---- running windows

  ipcMain.handle("win:list", async () => {
    const rows = await psJson(
      "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | " +
        "Select-Object Id,ProcessName,MainWindowTitle,@{n='H';e={[int64]$_.MainWindowHandle}},Path | " +
        "ConvertTo-Json -Compress",
    );
    const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    const mine = new Set([process.pid]);
    const out = [];
    for (const r of list) {
      if (mine.has(r.Id)) continue;
      if (/^(lumin|textinputhost|applicationframehost)$/i.test(r.ProcessName) && !r.MainWindowTitle) continue;
      if (/^(lumin)$/i.test(r.ProcessName) && /^Lumin (desktop|dock|launcher)$/.test(r.MainWindowTitle)) continue;
      let icon = null;
      if (r.Path) {
        try {
          const img = await app.getFileIcon(r.Path, { size: "normal" });
          if (!img.isEmpty()) icon = img.toDataURL();
        } catch {
          // letter tile fallback
        }
      }
      out.push({ handle: r.H, title: r.MainWindowTitle, name: r.ProcessName, icon });
    }
    return out;
  });

  ipcMain.handle("win:focus", (_e, handle) => {
    const h = Number(handle);
    if (!Number.isFinite(h) || h <= 0) return false;
    const script =
      "Add-Type 'using System;using System.Runtime.InteropServices;public class W{" +
      '[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);' +
      '[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);' +
      '[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);}\';' +
      "$h=[IntPtr]" +
      Math.trunc(h) +
      ";if([W]::IsIconic($h)){[W]::ShowWindowAsync($h,9)|Out-Null};[W]::SetForegroundWindow($h)|Out-Null";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, () => {});
    return true;
  });

  // ---- status, power, files

  ipcMain.handle("sys:status", async () => {
    const battery = await psJson(
      "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress",
      8000,
    );
    const b = Array.isArray(battery) ? battery[0] : battery;
    const wifi = await new Promise((resolve) => {
      execFile("netsh", ["wlan", "show", "interfaces"], { windowsHide: true, timeout: 5000 }, (err, out) => {
        if (err) return resolve(null);
        const m = /^\s*SSID\s*:\s*(.+)$/m.exec(out);
        resolve(m && m[1] ? m[1].trim() : null);
      });
    });
    return {
      battery: b && typeof b.EstimatedChargeRemaining === "number" ? b.EstimatedChargeRemaining : null,
      charging: !!b && (b.BatteryStatus === 2 || b.BatteryStatus === 6),
      wifi,
      user: os.userInfo().username,
      host: os.hostname(),
    };
  });

  ipcMain.handle("power", (_e, action) => {
    const run = (cmd, a) => spawn(cmd, a, { windowsHide: true, detached: true, stdio: "ignore" }).unref();
    switch (action) {
      case "shutdown":
        return run("shutdown", ["/s", "/t", "0"]);
      case "restart":
        return run("shutdown", ["/r", "/t", "0"]);
      case "signout":
        return run("shutdown", ["/l"]);
      case "lock":
        return run("rundll32.exe", ["user32.dll,LockWorkStation"]);
      case "sleep":
        return run("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]);
      default:
        return undefined;
    }
  });

  ipcMain.handle("files:list", async (_e, dir) => {
    const home = os.homedir();
    // Windows' real folder locations (they may be redirected, e.g. into OneDrive).
    const known = {};
    for (const [label, key] of [
      ["Desktop", "desktop"],
      ["Documents", "documents"],
      ["Downloads", "downloads"],
      ["Pictures", "pictures"],
      ["Music", "music"],
      ["Videos", "videos"],
    ]) {
      try {
        known[label] = app.getPath(key);
      } catch {
        known[label] = path.join(home, label);
      }
    }
    const target = known[dir] || dir || home;
    let entries = [];
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      return { dir: target, parent: path.dirname(target), places: Object.keys(known), paths: known, items: [] };
    }
    const items = entries
      .filter((e) => !e.name.startsWith(".") && !/^(desktop.ini|thumbs.db)$/i.test(e.name))
      .map((e) => {
        const p = path.join(target, e.name);
        let mtime = 0;
        try {
          mtime = fs.statSync(p).mtimeMs;
        } catch {
          // unreadable entry
        }
        return { name: e.name, path: p, dir: e.isDirectory(), mtime };
      })
      .sort((a, b) => (a.dir === b.dir ? b.mtime - a.mtime : a.dir ? -1 : 1))
      .slice(0, 300);
    return { dir: target, parent: path.dirname(target), places: Object.keys(known), paths: known, items };
  });

  // Programs and scripts are only run after the user confirms the exact path.
  const RUNNABLE = /\.(exe|bat|cmd|ps1|msi|vbs|js|jar|py|com|scr|lnk)$/i;
  async function openSafely(p) {
    const file = String(p);
    if (RUNNABLE.test(file)) {
      const win = BrowserWindow.getFocusedWindow() || desktopWindow || undefined;
      const r = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Run it", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Run this file?",
        message: "Lumin is about to run:",
        detail: file + "\n\nOnly run files you trust.",
      });
      if (r.response !== 0) return "cancelled";
    }
    if (/\.ps1$/i.test(file)) {
      spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file], {
        detached: true,
        stdio: "ignore",
      }).unref();
      return "";
    }
    return shell.openPath(file);
  }
  ipcMain.handle("files:open", (_e, p) => openSafely(p));
  ipcMain.handle("files:run", async () => {
    const win = BrowserWindow.getFocusedWindow() || desktopWindow || undefined;
    const r = await dialog.showOpenDialog(win, { title: "Run a file with Lumin", properties: ["openFile"] });
    if (r.canceled || !r.filePaths[0]) return "cancelled";
    return openSafely(r.filePaths[0]);
  });

  // ---- Lumin Memory (opt-in, local only; see memory.js)
  let memory = null;
  ipcMain.handle("memory:state", () => (memory ? memory.state() : null));
  ipcMain.handle("memory:enable", (_e, opts) => (memory ? memory.enable(opts || {}) : null));
  ipcMain.handle("memory:disable", () => (memory ? memory.disable() : null));
  ipcMain.handle("memory:pause", (_e, v) => (memory ? memory.setPaused(v) : null));
  ipcMain.handle("memory:titles", (_e, v) => (memory ? memory.setTitles(v) : null));
  ipcMain.handle("memory:clear", () => (memory ? memory.clear() : null));
  ipcMain.handle("memory:ask", () => {
    if (!memory) return false;
    const q = "Using that summary, what did I spend my time on, and what should I change to study better?";
    const prompt = (memory.askContext() + "\n\n" + q).slice(0, 3800);
    showWindow(ORIGIN + "/chat?ask=" + encodeURIComponent(prompt));
    return true;
  });

  ipcMain.handle("lumin:open", (_e, route) => {
    const r = typeof route === "string" && route.startsWith("/") ? route : "/chat";
    showWindow(ORIGIN + r);
    return true;
  });

  // ---- Home AI: status / wake / shutdown through the Pi gateway (see home.js)
  const home = createHome(app.getPath("userData"), safeStorage);
  ipcMain.handle("home:get", () => home.get());
  ipcMain.handle("home:set", (_e, url, token) => home.set(url, token));
  ipcMain.handle("home:clear", () => home.clear());
  ipcMain.handle("home:status", () => home.status());
  ipcMain.handle("home:wake", () => home.wake());
  ipcMain.handle("home:shutdown", async () => {
    const win = BrowserWindow.getFocusedWindow() || desktopWindow || undefined;
    const r = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Shut down the PC", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Shut down your PC?",
      message: "Shut down your home PC?",
      detail: "Unsaved work on that PC will be lost.",
    });
    if (r.response !== 0) return { ok: false, error: "cancelled" };
    return home.shutdown();
  });

  // ---- pins (apps shown on the desktop), stored in the user's profile

  const pinsFile = () => path.join(app.getPath("userData"), "pins.json");
  ipcMain.handle("pins:get", () => {
    try {
      const v = JSON.parse(fs.readFileSync(pinsFile(), "utf8"));
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  });
  ipcMain.handle("pins:set", (_e, ids) => {
    const clean = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 40) : [];
    fs.writeFileSync(pinsFile(), JSON.stringify(clean));
    return true;
  });

  ipcMain.handle("launcher:toggle", (_e, show) => {
    toggleLauncher(show);
    return true;
  });
  ipcMain.handle("dock:resize", (_e, px) => {
    if (typeof px === "number") placeDock(px);
    return true;
  });

  // Hands the computer back to normal Windows: undoes the shell setting, starts
  // Explorer (the Windows desktop and taskbar), then exits Lumin mode.
  function restoreWindows() {
    if (asShell) {
      spawn("reg", ["delete", "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon", "/v", "Shell", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      }).on("close", () => {
        spawn("explorer.exe", [], { detached: true, stdio: "ignore" }).unref();
        quitting = true;
        app.quit();
      });
    } else {
      spawn("explorer.exe", [], { detached: true, stdio: "ignore" }).unref();
      quitting = true;
      app.quit();
    }
  }
  ipcMain.handle("shell:restore", () => {
    restoreWindows();
    return true;
  });

  // ---------------------------------------------------------------- start up

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

    globalShortcut.register(HOTKEY, toggleWindow);

    if (luminMode) {
      memory = createMemory(app.getPath("userData"));
      memory.prune();
      memory.start();
      createDesktop();
      createDock();
      globalShortcut.register(LAUNCHER_KEY, () => toggleLauncher());
      globalShortcut.register(ESCAPE_KEY, restoreWindows);
      void loadApps();
      screen.on("display-metrics-changed", () => {
        if (desktopWindow) desktopWindow.setBounds(screen.getPrimaryDisplay().bounds);
        placeDock(dockWindow ? dockWindow.getBounds().width : 760);
      });
      try {
        buildTray();
      } catch {
        // no tray when Explorer is not running
      }
    } else {
      createWindow();
      buildTray();
    }
  });

  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (memory) memory.stop();
  });

  // The app lives in the tray / as the desktop, so closing windows does not quit it.
  app.on("window-all-closed", () => {});
}
