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
    desk.append(left, right);

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

    bar.append(launcher, ...fixed, el("div", "sep"), running, el("div", "sep"), stat);

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
