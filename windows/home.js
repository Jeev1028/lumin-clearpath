// Talks to the Lumin Pi gateway (pi/gateway.mjs): is the PC / Pi up, wake the PC,
// shut it down. The gateway address and token live only here in the main process
// (the token is encrypted with the Windows account via Electron safeStorage) and are
// never handed to the web pages.
const fs = require("node:fs");
const path = require("node:path");

function createHome(userDataDir, safeStorage) {
  const file = path.join(userDataDir, "home.json");

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      let token = "";
      if (j.token) {
        token = j.enc
          ? safeStorage.decryptString(Buffer.from(j.token, "base64"))
          : String(j.token);
      }
      return { url: String(j.url || ""), token };
    } catch {
      return { url: "", token: "" };
    }
  }

  function save(url, token) {
    const enc = safeStorage.isEncryptionAvailable();
    fs.writeFileSync(
      file,
      JSON.stringify({
        url,
        enc,
        token: enc ? safeStorage.encryptString(token).toString("base64") : token,
      }),
    );
  }

  async function call(method, pathname) {
    const { url, token } = load();
    if (!url || !token) return { ok: false, error: "not set up" };
    try {
      const res = await fetch(url.replace(/\/+$/, "") + pathname, {
        method,
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, error: "unreachable" };
    }
  }

  return {
    get() {
      const { url, token } = load();
      return { configured: !!(url && token), url };
    },
    set(url, token) {
      const u = String(url || "").trim();
      const t = String(token || "").trim();
      if (!/^https?:\/\/[^\s/]+/i.test(u)) return { ok: false, error: "Enter the gateway address (https://…)" };
      if (t.length < 24) return { ok: false, error: "That token looks too short" };
      save(u, t);
      return { ok: true };
    },
    clear() {
      try {
        fs.unlinkSync(file);
      } catch {
        // nothing saved
      }
      return { ok: true };
    },
    status: () => call("GET", "/status"),
    wake: () => call("POST", "/wake"),
    shutdown: () => call("POST", "/shutdown"),
  };
}

module.exports = { createHome };
