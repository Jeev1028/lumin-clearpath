// Bridge between the local Lumin shell pages (desktop, dock, launcher) and the
// main process. Only those local pages get this; the live website window has no preload.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("lumin", {
  apps: () => call("apps:list"),
  icon: (id) => call("apps:icon", id),
  launch: (id) => call("apps:launch", id),
  windows: () => call("win:list"),
  focusWindow: (handle) => call("win:focus", handle),
  status: () => call("sys:status"),
  power: (action) => call("power", action),
  files: (dir) => call("files:list", dir),
  openPath: (p) => call("files:open", p),
  runFile: () => call("files:run"),
  memory: {
    state: () => call("memory:state"),
    enable: (opts) => call("memory:enable", opts),
    disable: () => call("memory:disable"),
    pause: (v) => call("memory:pause", v),
    titles: (v) => call("memory:titles", v),
    clear: () => call("memory:clear"),
    ask: () => call("memory:ask"),
  },
  openLumin: (route) => call("lumin:open", route),
  pins: () => call("pins:get"),
  setPins: (ids) => call("pins:set", ids),
  launcher: (show) => call("launcher:toggle", show),
  dockWidth: (px) => call("dock:resize", px),
  restoreWindows: () => call("shell:restore"),
  onLauncherShown: (cb) => ipcRenderer.on("launcher:shown", () => cb()),
});
