// Lumin Memory: an opt-in, local-only log of which app and window you are using,
// so Lumin can tell you where your time went and answer "what did I do today?".
//
// Deliberately limited:
//  - OFF until the user turns it on from the consent screen.
//  - Records the foreground app name, its window title (optional) and how long,
//    only while you are actually at the keyboard (idle time is skipped).
//  - Never records keystrokes, passwords, clipboard, screenshots or file contents.
//  - Skips private/incognito windows and password managers.
//  - Stays on this computer (userData). Nothing is uploaded; the only thing that
//    ever leaves is a short summary the user explicitly sends via "Ask Lumin".
//  - Can be paused, viewed and deleted at any time. Old data is pruned.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const IDLE_LIMIT_S = 120;
const SAMPLE_EVERY_S = 3;
const SKIP_APPS = /^(keepass.*|bitwarden|1password|lastpass|dashlane|enpass|nordpass|roboform|lumin)$/i;
const SKIP_TITLE = /(incognito|inprivate|private browsing|private window|password|sign in|log in|login)/i;

function createMemory(userDataDir) {
  const cfgFile = path.join(userDataDir, "memory.json");
  const logFile = path.join(userDataDir, "activity.jsonl");
  const psFile = path.join(userDataDir, "memory-sampler.ps1");

  let cfg = { enabled: false, consentedAt: null, titles: true, retentionDays: 30 };
  try {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile, "utf8")) };
  } catch {
    // first run
  }
  let paused = false;
  let child = null;
  let seg = null; // { t, app, title, last }
  let buf = "";

  const saveCfg = () => fs.writeFileSync(cfgFile, JSON.stringify(cfg));

  function flush() {
    if (!seg) return;
    const d = Math.round((seg.last - seg.t) / 1000) + SAMPLE_EVERY_S;
    if (d >= SAMPLE_EVERY_S) {
      const row = { t: seg.t, d, app: seg.app };
      if (cfg.titles && seg.title) row.title = seg.title.slice(0, 160);
      fs.appendFileSync(logFile, JSON.stringify(row) + "\n");
    }
    seg = null;
  }

  function onSample(s) {
    const now = Date.now();
    const skip =
      paused ||
      !s.app ||
      s.idle > IDLE_LIMIT_S ||
      SKIP_APPS.test(s.app) ||
      SKIP_TITLE.test(s.title || "");
    if (skip) return flush();
    const title = cfg.titles ? s.title || "" : "";
    if (seg && seg.app === s.app && seg.title === title && now - seg.last < 15000) {
      seg.last = now;
      return;
    }
    flush();
    seg = { t: now, app: s.app, title, last: now };
  }

  const SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public class F {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [StructLayout(LayoutKind.Sequential)] public struct LII { public uint cb; public uint t; }
 [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII i);
 public static uint Idle() { LII i = new LII(); i.cb = 8; GetLastInputInfo(ref i); return ((uint)Environment.TickCount - i.t) / 1000; }
 public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
 public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
}
'@
while ($true) {
  $h = [F]::GetForegroundWindow()
  $p = [F]::Pid($h)
  $n = ''
  try { $n = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch {}
  [Console]::Out.WriteLine((@{ app = $n; title = [F]::Title($h); idle = [F]::Idle() } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${SAMPLE_EVERY_S}
}
`;

  function start() {
    if (child || !cfg.enabled) return;
    fs.writeFileSync(psFile, SCRIPT);
    child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psFile], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          onSample(JSON.parse(line));
        } catch {
          // ignore a garbled line
        }
      }
    });
    child.on("exit", () => {
      child = null;
      flush();
    });
  }

  function stop() {
    flush();
    if (child) {
      child.kill();
      child = null;
    }
  }

  function readRows(sinceMs) {
    let text = "";
    try {
      text = fs.readFileSync(logFile, "utf8");
    } catch {
      return [];
    }
    const rows = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const r = JSON.parse(line);
        if (r.t >= sinceMs) rows.push(r);
      } catch {
        // skip bad line
      }
    }
    return rows;
  }

  function prune() {
    const cutoff = Date.now() - cfg.retentionDays * 86400000;
    const keep = readRows(cutoff);
    try {
      fs.writeFileSync(logFile, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""));
    } catch {
      // nothing to prune
    }
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function summarize(sinceMs) {
    const rows = readRows(sinceMs);
    const apps = new Map();
    const titles = new Map();
    let total = 0;
    for (const r of rows) {
      total += r.d;
      apps.set(r.app, (apps.get(r.app) || 0) + r.d);
      if (r.title) titles.set(r.app + " - " + r.title, (titles.get(r.app + " - " + r.title) || 0) + r.d);
    }
    const top = (m, n) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, s]) => ({ name, min: Math.round(s / 60) }))
        .filter((x) => x.min > 0);
    return { totalMin: Math.round(total / 60), apps: top(apps, 8), titles: top(titles, 10) };
  }

  function state() {
    const today = summarize(startOfToday());
    return {
      enabled: cfg.enabled,
      recording: cfg.enabled && !paused && !!child,
      paused,
      titles: cfg.titles,
      retentionDays: cfg.retentionDays,
      consentedAt: cfg.consentedAt,
      today,
    };
  }

  // A short plain-text summary that the user can choose to hand to Lumin.
  function askContext() {
    const week = summarize(Date.now() - 7 * 86400000);
    const today = summarize(startOfToday());
    const fmt = (l) => l.map((x) => x.name + " (" + x.min + " min)").join(", ") || "nothing yet";
    return [
      "Here is a summary of how I used my computer (recorded locally, shared only because I asked):",
      "Today, " + today.totalMin + " minutes active. Apps: " + fmt(today.apps) + ".",
      today.titles.length ? "Most-used windows today: " + fmt(today.titles.slice(0, 6)) + "." : "",
      "Last 7 days, " + week.totalMin + " minutes active. Apps: " + fmt(week.apps) + ".",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return {
    state,
    askContext,
    start,
    stop,
    prune,
    // Turning on requires the consent screen to have been confirmed.
    enable({ consent, titles }) {
      if (consent !== true) return state();
      cfg = { ...cfg, enabled: true, consentedAt: new Date().toISOString(), titles: titles !== false };
      saveCfg();
      paused = false;
      start();
      return state();
    },
    disable() {
      cfg.enabled = false;
      saveCfg();
      stop();
      return state();
    },
    setPaused(v) {
      paused = !!v;
      if (paused) flush();
      return state();
    },
    setTitles(v) {
      cfg.titles = !!v;
      saveCfg();
      return state();
    },
    clear() {
      flush();
      try {
        fs.writeFileSync(logFile, "");
      } catch {
        // already empty
      }
      return state();
    },
  };
}

module.exports = { createMemory };
