// Lumin OS shell for Linux (the session that runs inside the Lumin OS ISO).
//
// Same shell pages as Lumin mode on Windows (../windows/shell, copied in by
// prepare.mjs), with the Windows-only parts swapped for Linux ones:
//   installed apps  -> .desktop files            (instead of Start Menu shortcuts)
//   running windows -> wmctrl                    (instead of PowerShell)
//   battery / Wi-Fi-> /sys and nmcli
//   power           -> systemctl
// It always runs as the desktop: wallpaper window, dock and launcher on top of
// the Openbox window manager (see os/live-build).
const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
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

// Virtual machines usually have no 3D acceleration; software rendering is safer.
if (process.env["LUMIN_SOFTWARE"]) app.disableHardwareAcceleration();

const ORIGIN = "https://luminclearpath.ca";
const START_URL = ORIGIN + "/auth";
const HOTKEY = "CommandOrControl+Shift+L";
const LAUNCHER_KEY = "Control+Space";
const ESCAPE_KEY = "Control+Alt+Shift+E";
const PRELOAD = path.join(__dirname, "preload.js");
const SHELL_PAGE = path.join(__dirname, "shell", "index.html");
const DOCK_H = 84;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let desktopWindow = null;
  let dockWindow = null;
  let launcherWindow = null;
  let quitting = false;
  let memory = null;

  // ---------------------------------------------------------------- website window

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 900,
      minHeight: 600,
      title: "Lumin",
      backgroundColor: "#0A1128",
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });
    void mainWindow.loadURL(START_URL);
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

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

  // ---------------------------------------------------------------- shell windows

  function shellPageWindow(view, opts) {
    const win = new BrowserWindow({
      show: false,
      frame: false,
      skipTaskbar: true,
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
    // The window manager rules match on these exact titles.
    win.on("page-title-updated", (e) => e.preventDefault());
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
    placeDock(760);
    dockWindow.once("ready-to-show", () => dockWindow.showInactive());
  }

  function toggleLauncher(show) {
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
      let readyAt = Infinity;
      launcherWindow.on("blur", () => {
        if (launcherWindow && Date.now() - readyAt > 900) launcherWindow.hide();
      });
      launcherWindow.on("closed", () => {
        launcherWindow = null;
      });
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

  // ---------------------------------------------------------------- installed apps (.desktop files)

  const APP_DIRS = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    path.join(os.homedir(), ".local", "share", "applications"),
  ];
  let appCache = null; // [{ id, name, file, exec, icon }]

  function parseDesktop(file) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return null;
    }
    const kv = {};
    let inEntry = false;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("[")) {
        inEntry = line === "[Desktop Entry]";
        continue;
      }
      if (!inEntry || !line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      if (k.includes("[")) continue; // translated keys
      if (!(k in kv)) kv[k] = line.slice(i + 1).trim();
    }
    if (kv["Type"] !== "Application" || kv["NoDisplay"] === "true" || kv["Hidden"] === "true") return null;
    if (!kv["Name"] || !kv["Exec"]) return null;
    return kv;
  }

  function loadApps() {
    const map = new Map();
    for (const dir of APP_DIRS) {
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of names) {
        if (!f.endsWith(".desktop")) continue;
        const file = path.join(dir, f);
        const kv = parseDesktop(file);
        if (!kv) continue;
        if (/^Lumin( OS)?$/i.test(kv["Name"])) continue;
        const key = kv["Name"].toLowerCase();
        if (map.has(key)) continue;
        map.set(key, { id: "desk:" + file, name: kv["Name"], file, exec: kv["Exec"], icon: kv["Icon"] || "" });
      }
    }
    appCache = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return appCache;
  }

  const ICON_ROOTS = [
    "/usr/share/icons/hicolor",
    path.join(os.homedir(), ".local", "share", "icons", "hicolor"),
    "/usr/share/icons/Adwaita",
  ];
  const ICON_SIZES = ["48x48", "64x64", "128x128", "256x256", "32x32", "scalable"];

  function findIcon(name) {
    if (!name) return null;
    if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
    for (const root of ICON_ROOTS) {
      for (const size of ICON_SIZES) {
        for (const ext of ["png", "svg"]) {
          const p = path.join(root, size, "apps", name + "." + ext);
          if (fs.existsSync(p)) return p;
        }
      }
    }
    for (const ext of ["png", "svg"]) {
      const p = path.join("/usr/share/pixmaps", name + "." + ext);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  function iconDataUrl(name) {
    const p = findIcon(name);
    if (!p) return null;
    try {
      const buf = fs.readFileSync(p);
      if (buf.length > 600 * 1024) return null;
      if (p.endsWith(".svg")) return "data:image/svg+xml;base64," + buf.toString("base64");
      if (p.endsWith(".png")) return "data:image/png;base64," + buf.toString("base64");
    } catch {
      // letter tile fallback
    }
    return null;
  }

  ipcMain.handle("apps:list", () => {
    const list = appCache || loadApps();
    return list.map(({ id, name }) => ({ id, name, kind: "desktop" }));
  });

  const iconCache = new Map();
  ipcMain.handle("apps:icon", (_e, id) => {
    if (iconCache.has(id)) return iconCache.get(id);
    const a = (appCache || []).find((x) => x.id === id);
    const url = a ? iconDataUrl(a.icon) : null;
    iconCache.set(id, url);
    return url;
  });

  ipcMain.handle("apps:launch", (_e, id) => {
    const a = (appCache || []).find((x) => x.id === id);
    if (!a) return false;
    return new Promise((resolve) => {
      const c = spawn("gio", ["launch", a.file], { detached: true, stdio: "ignore" });
      c.on("error", () => {
        // Fall back to running the Exec line directly (without the %f/%u placeholders).
        const cmd = a.exec.replace(/%[a-zA-Z%]/g, "").trim();
        spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
        resolve(true);
      });
      c.on("spawn", () => {
        c.unref();
        resolve(true);
      });
    });
  });

  // ---------------------------------------------------------------- running windows (wmctrl)

  ipcMain.handle("win:list", () =>
    new Promise((resolve) => {
      execFile("wmctrl", ["-lpx"], { timeout: 4000 }, (err, out) => {
        if (err) return resolve([]);
        const apps = appCache || loadApps();
        const list = [];
        for (const line of out.split("\n")) {
          const m = /^(0x[0-9a-f]+)\s+(-?\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/i.exec(line);
          if (!m) continue;
          const [, hex, desk, , cls, , title] = m;
          if (Number(desk) < 0 || !title.trim()) continue;
          if (/^Lumin (desktop|dock|launcher)$/.test(title.trim())) continue;
          const instance = cls.split(".")[0].toLowerCase();
          const match = apps.find(
            (a) =>
              path.basename(a.exec.split(/\s+/)[0]).toLowerCase() === instance ||
              path.basename(a.file, ".desktop").toLowerCase().includes(instance),
          );
          list.push({
            handle: parseInt(hex, 16),
            title: title.trim(),
            name: match ? match.name : instance,
            icon: match ? iconDataUrl(match.icon) : null,
          });
        }
        resolve(list);
      });
    }),
  );

  ipcMain.handle("win:focus", (_e, handle) => {
    const h = Number(handle);
    if (!Number.isFinite(h) || h <= 0) return false;
    execFile("wmctrl", ["-ia", "0x" + Math.trunc(h).toString(16)], () => {});
    return true;
  });

  // ---------------------------------------------------------------- status, power, files

  function readBattery() {
    try {
      const dirs = fs.readdirSync("/sys/class/power_supply").filter((d) => /^BAT/.test(d));
      if (!dirs.length) return { battery: null, charging: false };
      const base = "/sys/class/power_supply/" + dirs[0];
      const cap = parseInt(fs.readFileSync(base + "/capacity", "utf8"), 10);
      const st = fs.readFileSync(base + "/status", "utf8").trim();
      return { battery: Number.isFinite(cap) ? cap : null, charging: st === "Charging" || st === "Full" };
    } catch {
      return { battery: null, charging: false };
    }
  }

  ipcMain.handle("sys:status", async () => {
    const wifi = await new Promise((resolve) => {
      execFile("nmcli", ["-t", "-f", "ACTIVE,SSID", "dev", "wifi"], { timeout: 5000 }, (err, out) => {
        if (err) return resolve(null);
        const line = out.split("\n").find((l) => l.startsWith("yes:"));
        resolve(line ? line.slice(4).replace(/\\:/g, ":").trim() || null : null);
      });
    });
    return { ...readBattery(), wifi, user: os.userInfo().username, host: os.hostname() };
  });

  ipcMain.handle("power", (_e, action) => {
    const run = (cmd, a) => spawn(cmd, a, { detached: true, stdio: "ignore" }).unref();
    switch (action) {
      case "shutdown":
        return run("systemctl", ["poweroff"]);
      case "restart":
        return run("systemctl", ["reboot"]);
      case "sleep":
        return run("systemctl", ["suspend"]);
      case "signout":
        quitting = true;
        return app.exit(0);
      default:
        return undefined; // lock is not available in this session yet
    }
  });

  ipcMain.handle("files:list", (_e, dir) => {
    const home = os.homedir();
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
      .filter((e) => !e.name.startsWith("."))
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

  // Programs and scripts only run after the user confirms the exact path.
  const RUNNABLE = /\.(sh|bash|py|appimage|run|bin|jar|deb|desktop)$/i;
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
      const detach = (cmd, a) => {
        spawn(cmd, a, { detached: true, stdio: "ignore" }).unref();
        return "";
      };
      if (/\.(sh|bash)$/i.test(file)) return detach("sh", [file]);
      if (/\.py$/i.test(file)) return detach("python3", [file]);
      if (/\.jar$/i.test(file)) return detach("java", ["-jar", file]);
      try {
        fs.accessSync(file, fs.constants.X_OK);
        return detach(file, []);
      } catch {
        // not executable: let the desktop decide what opens it
      }
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

  // ---------------------------------------------------------------- Memory, Home AI, pins

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
  // "Leave Lumin": ends the session (the login screen / autologin starts it again).
  ipcMain.handle("shell:restore", () => {
    quitting = true;
    app.exit(0);
    return true;
  });

  // ---------------------------------------------------------------- start up

  app.on("window-all-closed", () => {
    // The desktop window is always open; never quit just because windows closed.
  });
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (memory) memory.stop();
  });

  app.whenReady().then(() => {
    session.defaultSession.setUserAgent(
      session.defaultSession
        .getUserAgent()
        .replace(/\s*Electron\/\S+/, "")
        .replace(/\s*lumin-os-shell\/\S+/, ""),
    );
    globalShortcut.register(HOTKEY, toggleWindow);
    memory = createMemory(app.getPath("userData"));
    memory.prune();
    memory.start();
    createDesktop();
    createDock();
    globalShortcut.register(LAUNCHER_KEY, () => toggleLauncher());
    globalShortcut.register(ESCAPE_KEY, () => {
      quitting = true;
      app.exit(0);
    });
    loadApps();
    screen.on("display-metrics-changed", () => {
      if (desktopWindow) desktopWindow.setBounds(screen.getPrimaryDisplay().bounds);
      placeDock(dockWindow ? dockWindow.getBounds().width : 760);
    });
  });
}
