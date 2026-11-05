// Lumin home gateway. Runs on the Raspberry Pi (always on, ~5 W).
//
//   Lumin (Vercel)  ->  Tailscale Funnel  ->  this gateway  ->  PC's Ollama   (if up)
//                                                          ->  Pi's Ollama   (if the PC is off)
//
// - Every request needs  Authorization: Bearer <GATEWAY_TOKEN>. Nothing else gets in.
// - POST /wake      sends a Wake-on-LAN packet to the PC.
// - POST /shutdown  runs SHUTDOWN_CMD (a fixed command you set; never user input).
// - GET  /status    says which machines are up.
// - /v1/*           is forwarded to Ollama (OpenAI-compatible), rewriting the model
//                   name for whichever machine answers.
//
// Config is read from environment variables (see pi/README.md). No dependencies.
import http from "node:http";
import dgram from "node:dgram";
import { exec } from "node:child_process";
import { Readable } from "node:stream";

const env = (k, d = "") => process.env[k] ?? d;
const PORT = Number(env("PORT", "8787"));
const TOKEN = env("GATEWAY_TOKEN");
const PC_URL = env("PC_OLLAMA_URL"); // e.g. http://192.168.1.50:11434
const PC_MODEL = env("PC_MODEL", "gpt-oss:120b");
const PI_URL = env("PI_OLLAMA_URL", "http://127.0.0.1:11434");
const PI_MODEL = env("PI_MODEL", "qwen2.5:3b");
const PC_MAC = env("PC_MAC"); // e.g. AA:BB:CC:DD:EE:FF
const BROADCAST = env("BROADCAST", "255.255.255.255");
const SHUTDOWN_CMD = env("SHUTDOWN_CMD"); // e.g. ssh -o BatchMode=yes me@192.168.1.50 shutdown /s /t 5

if (!TOKEN || TOKEN.length < 24) {
  console.error("Set GATEWAY_TOKEN to a long random string (24+ characters).");
  process.exit(1);
}

async function isUp(base) {
  if (!base) return false;
  try {
    const r = await fetch(base + "/api/tags", { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function wake() {
  if (!PC_MAC) throw new Error("PC_MAC is not set");
  const mac = Buffer.from(PC_MAC.replace(/[^0-9a-f]/gi, ""), "hex");
  if (mac.length !== 6) throw new Error("PC_MAC must look like AA:BB:CC:DD:EE:FF");
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(mac)]);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket("udp4");
    s.once("error", reject);
    s.bind(() => {
      s.setBroadcast(true);
      s.send(packet, 9, BROADCAST, (e) => {
        s.close();
        e ? reject(e) : resolve();
      });
    });
  });
}

function send(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  try {
    const auth = req.headers["authorization"] || "";
    if (auth !== "Bearer " + TOKEN) return send(res, 401, { error: "unauthorized" });
    const url = new URL(req.url, "http://x");

    if (req.method === "GET" && url.pathname === "/status") {
      const [pc, pi] = await Promise.all([isUp(PC_URL), isUp(PI_URL)]);
      return send(res, 200, { pc, pi });
    }
    if (req.method === "POST" && url.pathname === "/wake") {
      await wake();
      return send(res, 200, { ok: true, note: "magic packet sent; the PC needs ~1 minute" });
    }
    if (req.method === "POST" && url.pathname === "/shutdown") {
      if (!SHUTDOWN_CMD) return send(res, 400, { error: "SHUTDOWN_CMD is not set" });
      exec(SHUTDOWN_CMD, { timeout: 15000 }, () => {});
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/v1/")) {
      // PC if it answers, otherwise the Pi's own small model.
      const pcUp = await isUp(PC_URL);
      const base = pcUp ? PC_URL : PI_URL;
      const model = pcUp ? PC_MODEL : PI_MODEL;

      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = Buffer.concat(chunks);
      const type = String(req.headers["content-type"] || "");
      if (body.length && type.includes("application/json")) {
        try {
          const j = JSON.parse(body.toString("utf8"));
          if (j && typeof j === "object" && "model" in j) j.model = model;
          body = Buffer.from(JSON.stringify(j));
        } catch {
          return send(res, 400, { error: "bad json" });
        }
      }
      const upstream = await fetch(base + url.pathname + url.search, {
        method: req.method,
        headers: type ? { "content-type": type } : {},
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      });
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "x-lumin-served-by": pcUp ? "pc" : "pi",
      });
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
      else res.end();
      return;
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error("[gateway]", e && e.message ? e.message : e);
    if (!res.headersSent) send(res, 502, { error: "gateway error" });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  // Listens on localhost only; Tailscale Funnel/Serve is what exposes it.
  console.log("Lumin gateway on http://127.0.0.1:" + PORT);
});
