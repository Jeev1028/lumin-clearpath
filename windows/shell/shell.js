// Lumin mode UI: one page, three views chosen by ?view= (desktop, dock, launcher).
// Everything is built with textContent/DOM calls (no innerHTML) and talks to the
// main process only through window.lumin (see preload.js).
(() => {
  const api = window.lumin;
  const view = new URLSearchParams(location.search).get("view") || "desktop";
  document.body.classList.add(view);
  const root = document.getElementById("root");

  const LUMIN_LINKS = [
    { name: "Chat", icon: "💬", route: "/chat" },
    { name: "Planner", icon: "🗓️", route: "/schedule" },
    { name: "Calendar", icon: "📆", route: "/calendar" },
    { name: "Tasks", icon: "✅", route: "/tasks" },
    { name: "Classroom", icon: "🎓", route: "/classroom" },
    { name: "Grades", icon: "📊", route: "/grades" },
    { name: "Flashcards", icon: "🃏", route: "/flashcards" },
    { name: "Account", icon: "⚙️", route: "/account" },
  ];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function letter(name) {
    return el("div", "letter", (name || "?").trim().charAt(0).toUpperCase());
  }

  // Fills `host` with an app's icon if Windows has one, otherwise a letter tile.
  function iconInto(host, appItem) {
    host.appendChild(letter(appItem.name));
    if (appItem.kind !== "lnk") return;
    api.icon(appItem.id).then((url) => {
      if (!url) return;
      const img = document.createElement("img");
      img.alt = "";
      img.src = url;
      host.replaceChildren(img);
    });
  }

  function appTile(a, opts = {}) {
    const b = el("button", "tile");
    const ico = el("div", "ico");
    iconInto(ico, a);
    b.append(ico, el("div", "nm", a.name));
    b.title = a.name + "\nRight-click to pin or unpin on the desktop";
    b.addEventListener("click", () => {
      void api.launch(a.id);
      if (opts.onLaunch) opts.onLaunch();
    });
    b.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (opts.onPin) opts.onPin(a);
    });
    return b;
  }

  async function togglePin(a) {
    const pins = await api.pins();
    const next = pins.includes(a.id) ? pins.filter((x) => x !== a.id) : [...pins, a.id];
    await api.setPins(next);
  }

  function askConfirm(text, fn, yesLabel) {
    const c = el("div", "confirm");
    const box = el("div");
    box.appendChild(el("div", null, text));
    const row = el("div", "row");
    const no = el("button", null, "Cancel");
    const yes = el("button", "go", yesLabel || "Yes");
    no.addEventListener("click", () => c.remove());
    yes.addEventListener("click", () => {
      c.remove();
      fn();
    });
    row.append(no, yes);
    box.appendChild(row);
    c.appendChild(box);
    document.body.appendChild(c);
    yes.focus();
  }

  // Lumin Memory: opt-in, local-only activity log (see memory.js for the rules).
  function memoryPanel() {
    const box = el("div", "panel");
    box.appendChild(el("h3", null, "Memory"));
    const body = el("div");
    box.appendChild(body);
    const mem = api.memory;

    function consentScreen() {
      const c = el("div", "confirm");
      const card = el("div", "consentcard");
      card.appendChild(el("h2", null, "Let Lumin learn from how you use this PC?"));
      const ul = el("ul");
      for (const [head, text] of [
        ["What it records", "Which app is in front and its window title, and for how long, only while you are at the keyboard."],
        ["What it never records", "Keystrokes, passwords, the clipboard, screenshots, file contents, private or incognito windows, or password managers."],
        ["Where it stays", "On this computer only. Nothing is uploaded unless you press Ask Lumin about my day, which sends a short summary."],
        ["You are in control", "Pause or delete everything any time. Data older than 30 days is removed automatically."],
      ]) {
        const li = el("li");
        li.append(el("b", null, head + ": "), document.createTextNode(text));
        ul.appendChild(li);
      }
      card.appendChild(ul);
      const lab = el("label", "chk");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = true;
      lab.append(cb, document.createTextNode(" Also record window titles (turn off to record app names only)"));
      card.appendChild(lab);
      const row = el("div", "row");
      const no = el("button", null, "Not now");
      const yes = el("button", "go", "Turn on Memory");
      no.addEventListener("click", () => c.remove());
      yes.addEventListener("click", async () => {
        await mem.enable({ consent: true, titles: cb.checked });
        c.remove();
        void paint();
      });
      row.append(no, yes);
      card.appendChild(row);
      c.appendChild(card);
      document.body.appendChild(c);
    }

    const fmt = (min) => (min >= 60 ? Math.floor(min / 60) + " h " + (min % 60) + " min" : min + " min");

    async function paint() {
      const st = await mem.state();
      body.replaceChildren();
      if (!st) return;
      if (!st.enabled) {
        body.appendChild(
          el("div", "memtext", "Off. Turn it on and Lumin can show where your time goes and answer what did I do today. Everything stays on this PC."),
        );
        const b = el("button", "btn2 go", "Turn on…");
        b.addEventListener("click", consentScreen);
        body.appendChild(b);
        return;
      }
      body.appendChild(
        el("div", "memstatus" + (st.paused ? " paused" : ""), st.paused ? "Paused" : "Recording on this PC"),
      );
      body.appendChild(el("div", "memtotal", fmt(st.today.totalMin) + " active today"));
      const max = Math.max(1, ...st.today.apps.map((a) => a.min));
      for (const a of st.today.apps) {
        const r = el("div", "approw");
        const bar = el("div", "bar");
        bar.style.width = Math.max(4, Math.round((a.min / max) * 100)) + "%";
        r.append(el("span", "an", a.name), el("span", "am", fmt(a.min)), bar);
        body.appendChild(r);
      }
      if (!st.today.apps.length) body.appendChild(el("div", "memtext", "Nothing recorded yet today."));
      const acts = el("div", "acts");
      const mk = (label, fn, cls) => {
        const b = el("button", "btn2" + (cls ? " " + cls : ""), label);
        b.addEventListener("click", fn);
        acts.appendChild(b);
      };
      mk("Ask Lumin about my day", () => void mem.ask(), "go");
      mk(st.paused ? "Resume" : "Pause", async () => {
        await mem.pause(!st.paused);
        void paint();
      });
      mk(st.titles ? "Titles: on" : "Titles: off", async () => {
        await mem.titles(!st.titles);
        void paint();
      });
      mk("Delete all", () =>
        askConfirm(
          "Delete everything Lumin has recorded about your activity?",
          async () => {
            await mem.clear();
            void paint();
          },
          "Delete",
        ),
      );
      mk("Turn off", async () => {
        await mem.disable();
        void paint();
      });
      body.appendChild(acts);
    }
    void paint();
    setInterval(() => void paint(), 30000);
    return box;
  }

  // Home AI: your PC and Pi (see pi/README.md). Wake, shut down, and see what's up.
  function homePanel() {
    const box = el("div", "panel");
    box.appendChild(el("h3", null, "Home AI"));
    const body = el("div");
    box.appendChild(body);
    const h = api.home;

    function setup(note) {
      body.replaceChildren();
      body.appendChild(
        el("div", "memtext", note || "Connect the Lumin gateway running on your Raspberry Pi. The token is stored encrypted on this PC."),
      );
      const url = el("input", "field");
      url.placeholder = "https://pi.tailXXXX.ts.net";
      const tok = el("input", "field");
      tok.type = "password";
      tok.placeholder = "Gateway token";
      const msg = el("div", "memtext");
      const save = el("button", "btn2 go", "Connect");
      save.addEventListener("click", async () => {
        const r = await h.set(url.value, tok.value);
        if (!r.ok) {
          msg.textContent = r.error;
          return;
        }
        void paint();
      });
      body.append(url, tok, save, msg);
    }

    async function paint() {
      const cfg = await h.get();
      if (!cfg.configured) return setup();
      const r = await h.status();
      body.replaceChildren();
      const dot = (name, up) => {
        const row = el("div", "approw");
        const label = el("span", "an", name);
        const state = el("span", "am", up ? "Online" : "Off");
        state.style.color = up ? "#5be3a0" : "#ff8a8a";
        row.append(label, state);
        return row;
      };
      if (!r.ok) {
        body.appendChild(
          el("div", "memtext", r.error === "unreachable" ? "Can't reach the gateway. Is the Pi on and Tailscale up?" : "The gateway refused the request. Check the token."),
        );
      } else {
        body.append(dot("PC (big model)", !!r.data.pc), dot("Raspberry Pi (small model)", !!r.data.pi));
      }
      const acts = el("div", "acts");
      const mk = (label, fn, cls) => {
        const b = el("button", "btn2" + (cls ? " " + cls : ""), label);
        b.addEventListener("click", fn);
        acts.appendChild(b);
      };
      mk("Wake PC", async () => {
        const w = await h.wake();
        body.appendChild(el("div", "memtext", w.ok ? "Wake signal sent. The PC takes about a minute." : "Could not send it: " + (w.error || w.data?.error || "failed")));
      }, "go");
      mk("Shut down PC", async () => {
        const s = await h.shutdown();
        if (s.error !== "cancelled") setTimeout(() => void paint(), 8000);
      });
      mk("Refresh", () => void paint());
      mk("Disconnect", async () => {
        await h.clear();
        void paint();
      });
      body.appendChild(acts);
    }
    void paint();
    setInterval(() => void paint(), 30000);
    return box;
  }

  // ------------------------------------------------------------------ desktop
  function desktopView() {
    const left = el("div");
    const clock = el("div", "clock");
    const date = el("div", "date");
    const hello = el("div", "hello");
    left.append(clock, date, hello);

    const ask = el("form", "ask");
    const input = el("input");
    input.placeholder = "Ask Lumin anything…";
    input.autocomplete = "off";
    const go = el("button", null, "Ask");
    go.type = "submit";
    ask.append(input, go);
    ask.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      void api.openLumin(q ? "/chat?ask=" + encodeURIComponent(q.slice(0, 1500)) : "/chat");
      input.value = "";
    });
    left.appendChild(ask);

    left.appendChild(el("div", "section", "Lumin"));
    const lt = el("div", "tiles");
    for (const l of LUMIN_LINKS) {
      const b = el("button", "tile");
      b.append(el("div", "ico", l.icon), el("div", "nm", l.name));
      b.addEventListener("click", () => void api.openLumin(l.route));
      lt.appendChild(b);
    }
    left.appendChild(lt);

    left.appendChild(el("div", "section", "Pinned apps"));
    const pinHost = el("div", "tiles");
    left.appendChild(pinHost);
    left.appendChild(
      el(
        "div",
        "hint",
        "Ctrl+Space opens every app. Ctrl+Shift+L shows or hides Lumin. Ctrl+Alt+Shift+E returns to normal Windows.",
      ),
    );

    // Files
    const right = el("div", "panel");
    right.appendChild(el("h3", null, "Files"));
    const places = el("div", "places");
    const crumb = el("div", "crumb");
    const list = el("div", "files");
    right.append(places, crumb, list);

    async function showDir(dir) {
      const r = await api.files(dir);
      places.replaceChildren();
      for (const p of r.places) {
        const c = el("button", "chip" + (r.dir.toLowerCase() === (r.paths[p] || "").toLowerCase() ? " on" : ""), p);
        c.addEventListener("click", () => void showDir(p));
        places.appendChild(c);
      }
      crumb.textContent = r.dir;
      list.replaceChildren();
      const up = el("button", "file");
      up.append(el("span", null, "↩"), el("span", "n", "Up one folder"));
      up.addEventListener("click", () => void showDir(r.parent));
      list.appendChild(up);
      for (const it of r.items) {
        const b = el("button", "file");
        b.append(el("span", null, it.dir ? "📁" : "📄"), el("span", "n", it.name));
        b.addEventListener("click", () => (it.dir ? void showDir(it.path) : void api.openPath(it.path)));
        list.appendChild(b);
      }
    }

    root.appendChild(Object.assign(el("div", "desk"), {}));
    const desk = root.firstChild;
    const col = el("div", "col");
    col.append(right, memoryPanel(), homePanel());
    desk.append(left, col);

    function tick() {
      const d = new Date();
      clock.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      date.textContent = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
      const h = d.getHours();
      hello.textContent = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    }
    tick();
    setInterval(tick, 10000);

    let lastPins = "";
    async function refreshPins() {
      const [pins, apps] = await Promise.all([api.pins(), api.apps()]);
      const key = pins.join("|") + apps.length;
      if (key === lastPins) return;
      lastPins = key;
      pinHost.replaceChildren();
      const chosen = pins.map((id) => apps.find((a) => a.id === id)).filter(Boolean);
      if (!chosen.length) {
        pinHost.appendChild(el("div", "empty", "Press Ctrl+Space, right-click an app to pin it here."));
      }
      for (const a of chosen) pinHost.appendChild(appTile(a, { onPin: (x) => void togglePin(x) }));
    }
    void refreshPins();
    setInterval(() => void refreshPins(), 3000);
    void showDir("Desktop");
  }

  // ------------------------------------------------------------------ dock
  function dockView() {
    const bar = el("div", "dockbar");
    root.appendChild(bar);

    const launcher = el("button", "dbtn", "◈");
    launcher.title = "All apps (Ctrl+Space)";
    launcher.style.color = "var(--accent)";
    launcher.addEventListener("click", () => void api.launcher());

    const fixed = [];
    for (const l of [LUMIN_LINKS[0], LUMIN_LINKS[1], LUMIN_LINKS[2]]) {
      const b = el("button", "dbtn", l.icon);
      b.title = l.name;
      b.addEventListener("click", () => void api.openLumin(l.route));
      fixed.push(b);
    }
    const running = el("div");
    running.style.display = "contents";
    const stat = el("div", "stat");
    const time = el("b");
    const info = el("span");
    stat.append(time, info);

    const memBtn = el("button", "dbtn", "●");
    memBtn.style.display = "none";
    memBtn.style.fontSize = "16px";
    let memState = null;
    memBtn.addEventListener("click", async () => {
      if (!memState) return;
      memState = await api.memory.pause(!memState.paused);
      paintMem();
    });
    function paintMem() {
      if (!memState || !memState.enabled) {
        memBtn.style.display = "none";
      } else {
        memBtn.style.display = "";
        memBtn.style.color = memState.paused ? "#ffb347" : "#ff5a5a";
        memBtn.title = memState.paused
          ? "Lumin Memory is paused. Click to resume."
          : "Lumin Memory is recording app usage on this PC. Click to pause.";
      }
      resize();
    }
    async function pollMem() {
      try {
        memState = await api.memory.state();
      } catch {
        return;
      }
      paintMem();
    }
    void pollMem();
    setInterval(() => void pollMem(), 5000);

    bar.append(launcher, ...fixed, el("div", "sep"), running, el("div", "sep"), memBtn, stat);

    let status = { battery: null, charging: false, wifi: null };
    function paintStatus() {
      time.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const bits = [];
      if (status.battery !== null) bits.push((status.charging ? "⚡" : "🔋") + status.battery + "%");
      bits.push(status.wifi ? "📶 " + status.wifi : "📶 —");
      info.textContent = bits.join("  ");
    }
    paintStatus();
    setInterval(paintStatus, 15000);
    async function pollStatus() {
      try {
        status = await api.status();
      } catch {
        // keep the last value
      }
      paintStatus();
      resize();
    }
    void pollStatus();
    setInterval(() => void pollStatus(), 45000);

    let lastKey = "";
    async function pollWindows() {
      let list = [];
      try {
        list = await api.windows();
      } catch {
        return;
      }
      const key = list.map((w) => w.handle + w.title).join("|");
      if (key === lastKey) return;
      lastKey = key;
      running.replaceChildren();
      for (const w of list.slice(0, 14)) {
        const b = el("button", "dbtn run");
        b.title = w.title;
        if (w.icon) {
          const img = document.createElement("img");
          img.alt = "";
          img.src = w.icon;
          b.appendChild(img);
        } else b.appendChild(letter(w.name));
        b.addEventListener("click", () => void api.focusWindow(w.handle));
        running.appendChild(b);
      }
      resize();
    }
    void pollWindows();
    setInterval(() => void pollWindows(), 2500);

    function resize() {
      void api.dockWidth(bar.getBoundingClientRect().width + 4);
    }
    resize();
  }

  // ------------------------------------------------------------------ launcher
  function launcherView() {
    const wrap = el("div", "lau");
    const input = el("input");
    input.placeholder = "Search apps, or type a question for Lumin…";
    input.autocomplete = "off";
    const grid = el("div", "grid");
    wrap.append(input, grid);

    const power = el("div", "power");
    const mk = (label, fn, danger) => {
      const b = el("button", danger ? "danger" : "", label);
      b.addEventListener("click", fn);
      power.appendChild(b);
    };
    function confirmThen(text, fn) {
      const c = el("div", "confirm");
      const box = el("div");
      box.appendChild(el("div", null, text));
      const row = el("div", "row");
      const no = el("button", null, "Cancel");
      const yes = el("button", "go", "Yes");
      no.addEventListener("click", () => c.remove());
      yes.addEventListener("click", () => {
        c.remove();
        fn();
      });
      row.append(no, yes);
      box.appendChild(row);
      c.appendChild(box);
      document.body.appendChild(c);
      yes.focus();
    }
    mk("Run a file…", () => {
      hide();
      void api.runFile();
    });
    mk("Windows desktop", () =>
      confirmThen("Leave Lumin mode and go back to the normal Windows desktop?", () => void api.restoreWindows()),
    );
    mk("Lock", () => void api.power("lock"));
    mk("Sleep", () => void api.power("sleep"));
    mk("Sign out", () => confirmThen("Sign out?", () => void api.power("signout")), true);
    mk("Restart", () => confirmThen("Restart the computer?", () => void api.power("restart")), true);
    mk("Shut down", () => confirmThen("Shut down the computer?", () => void api.power("shutdown")), true);
    root.append(wrap, power);

    let apps = [];
    let shown = [];
    let sel = 0;
    let pins = [];

    const hide = () => void api.launcher(false);

    function render() {
      const q = input.value.trim().toLowerCase();
      shown = q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      grid.replaceChildren();
      if (input.value.trim()) {
        const ask = el("button", "tile" + (sel === -1 ? " sel" : ""));
        ask.append(el("div", "ico", "✨"), el("div", "nm", "Ask Lumin"));
        ask.title = input.value.trim();
        ask.addEventListener("click", () => askLumin());
        grid.appendChild(ask);
      }
      shown.forEach((a, i) => {
        const t = appTile(a, {
          onLaunch: hide,
          onPin: async (x) => {
            await togglePin(x);
            pins = await api.pins();
          },
        });
        if (i === sel && input.value.trim()) t.classList.add("sel");
        grid.appendChild(t);
      });
      if (!shown.length && !input.value.trim()) grid.appendChild(el("div", "empty", "Loading apps…"));
    }

    function askLumin() {
      const q = input.value.trim();
      void api.openLumin(q ? "/chat?ask=" + encodeURIComponent(q.slice(0, 1500)) : "/chat");
      hide();
    }

    input.addEventListener("input", () => {
      sel = 0;
      render();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hide();
      } else if (e.key === "Enter") {
        if (shown[sel]) {
          void api.launch(shown[sel].id);
          hide();
        } else if (input.value.trim()) askLumin();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        sel = Math.min(shown.length - 1, sel + 1);
        render();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        sel = Math.max(0, sel - 1);
        render();
        e.preventDefault();
      }
    });
    // Clicking the empty backdrop closes the launcher.
    document.body.addEventListener("mousedown", (e) => {
      if (e.target === document.body || e.target === wrap) hide();
    });

    async function load() {
      apps = await api.apps();
      pins = await api.pins();
      render();
    }
    api.onLauncherShown(() => {
      input.value = "";
      sel = 0;
      void load();
      input.focus();
    });
    void load();
    input.focus();
  }

  if (view === "dock") dockView();
  else if (view === "launcher") launcherView();
  else desktopView();
})();
