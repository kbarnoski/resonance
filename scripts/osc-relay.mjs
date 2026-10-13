#!/usr/bin/env node
// OSC RELAY — Resonance → TouchDesigner / Resolume / Notch / Max (OSC over UDP).
//
// Browsers cannot send UDP, so the kiosk page (opened with ?osc=1) streams a
// compact JSON frame 10–30× a second over a WebSocket to this relay, which
// turns each frame into OSC (src/lib/vj-bridge/osc-map.mjs) and sends it to
// host:port (default 127.0.0.1:7000). Separate process on purpose: no load on
// the kiosk's next server, start / stop it independently, a crash here never
// touches the show. Zero dependencies (Node 20 built-ins only).
//
// Optional data IN (--cues): OSC cues from the VJ desk (/resonance/cue/next …)
// are forwarded to the kiosk's phone-remote bus (/api/pack/remote — the
// offline pack only), allow-listed (osc-map.mjs cueToCommand).
//
//   node scripts/osc-relay.mjs                         # 127.0.0.1:7000, ws :9100
//   node scripts/osc-relay.mjs --osc-host 192.168.1.20 --osc-port 7000
//   node scripts/osc-relay.mjs --cues                  # + TD → Resonance on udp :7001
//   node scripts/osc-relay.mjs --demo                  # synthetic frames (patch TD with no kiosk)
//   node scripts/osc-relay.mjs --dump                  # print every OSC message
//
// Docs + address map: docs/touchdesigner-bridge.md

import http from "node:http";
import dgram from "node:dgram";
import { pathToFileURL } from "node:url";
import { acceptKey, encodeFrame, FrameParser } from "../src/lib/vj-bridge/ws-frame.mjs";
import { createMapState, frameToOsc, encodePackets, cueToCommand } from "../src/lib/vj-bridge/osc-map.mjs";
import { decodePacket } from "../src/lib/vj-bridge/osc.mjs";
import { RateGate } from "../src/lib/vj-bridge/rate-gate.mjs";

const MAX_FRAME_BYTES = 64 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

export function parseArgs(argv, env = process.env) {
  const o = {
    oscHost: env.OSC_HOST || "127.0.0.1",
    oscPort: Number(env.OSC_PORT || 7000),
    wsHost: env.OSC_WS_HOST || "127.0.0.1",
    wsPort: Number(env.OSC_WS_PORT || 9100),
    maxHz: Number(env.OSC_MAX_HZ || 30),
    bundle: true,
    // under a typical Ethernet / Wi-Fi MTU: no IP fragmentation on a LAN
    maxPacket: 1400,
    keyframeMs: 2000,
    cues: false,
    cueHost: "127.0.0.1",
    cuePort: Number(env.OSC_CUE_PORT || 7001),
    cueAllow: ["127.0.0.1"],
    bus: env.RESONANCE_BUS || "http://127.0.0.1:3000",
    remoteKey: env.TRAMOKYO_REMOTE_KEY || "",
    demo: false,
    dump: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--osc-host") o.oscHost = v();
    else if (a === "--osc-port") o.oscPort = Number(v());
    else if (a === "--ws-host") o.wsHost = v();
    else if (a === "--ws-port") o.wsPort = Number(v());
    else if (a === "--max-hz") o.maxHz = Number(v());
    else if (a === "--split") o.bundle = false;
    else if (a === "--max-packet") o.maxPacket = Math.max(256, Number(v()) || 1400);
    else if (a === "--keyframe-ms") o.keyframeMs = Number(v());
    else if (a === "--cues") o.cues = true;
    else if (a === "--cue-host") o.cueHost = v();
    else if (a === "--cue-port") o.cuePort = Number(v());
    else if (a === "--cue-allow") o.cueAllow = String(v()).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--bus") o.bus = v();
    else if (a === "--remote-key") o.remoteKey = v();
    else if (a === "--demo") o.demo = true;
    else if (a === "--dump") o.dump = true;
    else if (a === "--quiet") o.quiet = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Error(`unknown option ${a} (try --help)`);
  }
  return o;
}

/** Browser origins allowed to feed the relay: the kiosk itself (any port). */
export function originAllowed(origin) {
  if (!origin) return true; // non-browser client (tests, a Max js object …)
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** A synthetic frame for --demo (patch TD with no kiosk running). */
export function demoFrame(seq, tSec) {
  const s = (f, p = 0) => 0.5 + 0.5 * Math.sin(tSec * f + p);
  const bpm = 72;
  const beat = (tSec * bpm) / 60;
  const phases = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"];
  const dur = 240;
  const prog = (tSec % dur) / dur;
  const pi = Math.min(5, Math.floor(prog * 6));
  const ev = [];
  if (Math.random() < 0.12) ev.push(["onset", 0.4 + 0.6 * Math.random(), Math.random(), tSec * 1000]);
  if (Math.floor(beat) !== Math.floor(beat - (bpm / 60) / 20)) ev.push(["beat", Math.floor(beat)]);
  return {
    v: 1, seq, ms: Math.round(tSec * 1000),
    au: { b: 0.3 * s(1.1), m: 0.25 * s(1.7, 1), t: 0.2 * s(2.3, 2), l: 0.25 * s(0.9), rb: 0.35 * s(5.1), rm: 0.3 * s(6.3), rt: 0.25 * s(7.7), rl: 0.3 * s(4.1), sil: 0 },
    ck: { bpm, beat, bph: beat % 1, bar: Math.floor(beat / 4), barph: (beat / 4) % 1 },
    pr: { play: 1, hold: 0, time: tSec % dur, dur, vol: 0.8, label: "" },
    jn: { id: "demo", name: "Demo Journey", phase: phases[pi], pi, pn: 6, pp: (prog * 6) % 1, prog, theme: ["#1a2a4a", "#4a6a9a", "#e8c070", "#f6e6c0"], pal: ["#13171d", "#572a12", "#a55922", "#44515f", "#e3a047"], img: "", emb: 0 },
    sh: { mode: "cosmos", dual: "", op: 1 },
    pt: { soul: "vortex", on: 1, sw: [1 + 0.2 * s(0.2), 1, 1], cur: [0.6, s(0.05), 0.5], br: [0.7, Math.sin(tSec * 0.4), 0.2 * s(0.1)] },
    mo: { on: 0, prog: 0 },
    ev,
  };
}

/**
 * Start the relay. Returns { close(), wsPort, cuePort, stats }.
 * @param {ReturnType<typeof parseArgs>} o
 * @param {{ log?: (s: string) => void, fetch?: typeof fetch }} [io]
 */
export async function startRelay(o, io = {}) {
  const log = io.log ?? ((s) => { if (!o.quiet) console.log(`[osc-relay] ${s}`); });
  const doFetch = io.fetch ?? globalThis.fetch;
  const stats = { clients: 0, framesIn: 0, framesRateLimited: 0, badFrames: 0, packetsOut: 0, sendErrors: 0, cuesIn: 0, cuesForwarded: 0, cuesRejected: 0 };
  const udp = dgram.createSocket(o.oscHost.includes(":") ? "udp6" : "udp4");
  udp.on("error", () => { stats.sendErrors++; });

  const sendFrame = (frame, st, gate) => {
    const now = Date.now();
    const full = gate.allow(now);
    if (!full) stats.framesRateLimited++;
    const msgs = frameToOsc(frame, st, now, { keyframeMs: o.keyframeMs, eventsOnly: !full });
    if (o.dump) for (const m of msgs) console.log(m.address, ...m.args);
    for (const p of encodePackets(msgs, { bundle: o.bundle, maxBytes: o.maxPacket })) {
      stats.packetsOut++;
      udp.send(p, o.oscPort, o.oscHost, (err) => { if (err) stats.sendErrors++; });
    }
  };

  // ── WebSocket in ──
  const server = http.createServer((req, res) => {
    // a tiny status page: curl http://127.0.0.1:9100/
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ relay: "resonance-osc", osc: `${o.oscHost}:${o.oscPort}`, cues: o.cues ? o.cuePort : null, stats }, null, 2));
  });
  const sockets = new Set();
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (String(req.headers.upgrade || "").toLowerCase() !== "websocket" || !key || !originAllowed(req.headers.origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    sockets.add(socket);
    stats.clients++;
    log(`page connected (${req.headers.origin || "no origin"})`);
    const parser = new FrameParser(MAX_FRAME_BYTES);
    const st = createMapState();
    const gate = new RateGate(o.maxHz);
    socket.write(encodeFrame(1, JSON.stringify({ hello: "resonance-osc-relay", v: 1, osc: `${o.oscHost}:${o.oscPort}` })));
    socket.on("data", (chunk) => {
      let msgs;
      try { msgs = parser.push(chunk); } catch { socket.destroy(); return; }
      for (const m of msgs) {
        if (m.type === "ping") socket.write(encodeFrame(10, m.data));
        else if (m.type === "close") { socket.end(encodeFrame(8)); return; }
        else if (m.type === "text") {
          let frame;
          try { frame = JSON.parse(m.data); } catch { stats.badFrames++; continue; }
          if (!frame || frame.v !== 1) { stats.badFrames++; continue; }
          stats.framesIn++;
          sendFrame(frame, st, gate);
        }
      }
    });
    const gone = () => {
      if (!sockets.delete(socket)) return;
      stats.clients--;
      log("page disconnected");
    };
    socket.on("close", gone);
    socket.on("error", gone);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.wsPort, o.wsHost, resolve);
  });
  const wsPort = server.address().port;
  log(`ws://${o.wsHost}:${wsPort} → OSC udp ${o.oscHost}:${o.oscPort}${o.bundle ? " (bundles)" : ""}, ≤${o.maxHz} Hz`);

  // ── cues in (optional) ──
  let cueSock = null;
  let cuePort = null;
  if (o.cues) {
    cueSock = dgram.createSocket(o.cueHost.includes(":") ? "udp6" : "udp4");
    const cueGate = new RateGate(5); // a stuck TD button cannot flood the show
    const allow = new Set(o.cueAllow.flatMap((a) => (LOOPBACK.has(a) ? [...LOOPBACK] : [a])));
    cueSock.on("message", (buf, rinfo) => {
      stats.cuesIn++;
      if (!allow.has(rinfo.address) && !allow.has("*")) { stats.cuesRejected++; return; }
      let messages;
      try { messages = decodePacket(new Uint8Array(buf)); } catch { stats.cuesRejected++; return; }
      for (const m of messages) {
        const command = cueToCommand(m.address, m.args);
        if (!command || !cueGate.allow(Date.now())) { stats.cuesRejected++; continue; }
        const url = `${o.bus.replace(/\/$/, "")}/api/pack/remote`;
        const headers = { "content-type": "application/json", ...(o.remoteKey ? { "x-remote-key": o.remoteKey } : {}) };
        doFetch(url, { method: "POST", headers, body: JSON.stringify({ command }) })
          .then((r) => { if (r.ok) stats.cuesForwarded++; else { stats.cuesRejected++; log(`cue ${command}: bus HTTP ${r.status}${r.status === 404 ? " (bus is offline-pack only)" : ""}`); } })
          .catch(() => { stats.cuesRejected++; log(`cue ${command}: kiosk server unreachable at ${o.bus}`); });
        log(`cue ${m.address} → ${command}`);
      }
    });
    await new Promise((resolve, reject) => {
      cueSock.once("error", reject);
      cueSock.bind(o.cuePort, o.cueHost, resolve);
    });
    cuePort = cueSock.address().port;
    log(`cues: udp ${o.cueHost}:${cuePort} (from ${o.cueAllow.join(", ")}) → ${o.bus}/api/pack/remote`);
  }

  // ── demo frames ──
  let demoTimer = null;
  if (o.demo) {
    const st = createMapState();
    const gate = new RateGate(o.maxHz);
    const t0 = Date.now();
    let seq = 0;
    demoTimer = setInterval(() => sendFrame(demoFrame(++seq, (Date.now() - t0) / 1000), st, gate), 50);
    log("demo: synthetic frames at 20 Hz");
  }

  return {
    wsPort,
    cuePort,
    stats,
    async close() {
      if (demoTimer) clearInterval(demoTimer);
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(() => r()));
      udp.close();
      if (cueSock) cueSock.close();
    },
  };
}

const HELP = `Resonance OSC relay — kiosk page (?osc=1) → OSC/UDP for TouchDesigner & co.

  --osc-host H      OSC destination host           (default 127.0.0.1, env OSC_HOST)
  --osc-port P      OSC destination port           (default 7000, env OSC_PORT)
  --ws-host H       WebSocket bind host            (default 127.0.0.1)
  --ws-port P       WebSocket port the page uses   (default 9100; page: ?oscws=ws://127.0.0.1:P)
  --max-hz N        continuous OSC rate cap        (default 30; events always pass)
  --split           one UDP packet per message instead of bundles
  --max-packet N    split bundles to stay under N bytes (default 1400, MTU-safe)
  --keyframe-ms N   resend string state every N ms (default 2000)
  --cues            accept OSC cues (TD → Resonance) on udp --cue-port (default 7001)
  --cue-host H      cue bind host (default 127.0.0.1; 0.0.0.0 for a LAN desk)
  --cue-allow A,B   cue source IPs allowed (default 127.0.0.1; * = any)
  --bus URL         kiosk server for cues (default http://127.0.0.1:3000)
  --remote-key K    TRAMOKYO_REMOTE_KEY for the remote bus, if set
  --demo            send synthetic frames (patch TD without a kiosk)
  --dump            print every OSC message
  --quiet           no logs
`;

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(String(e.message)); process.exit(2); }
  if (o.help) { process.stdout.write(HELP); return; }
  // the show's own priority: never compete with the kiosk for the CPU
  try { (await import("node:os")).setPriority(19); } catch { /* not permitted — fine */ }
  const relay = await startRelay(o);
  const status = setInterval(() => {
    const s = relay.stats;
    if (!o.quiet && (s.framesIn || o.demo)) console.log(`[osc-relay] clients=${s.clients} in=${s.framesIn} limited=${s.framesRateLimited} packets=${s.packetsOut} errors=${s.sendErrors}${o.cues ? ` cues=${s.cuesForwarded}/${s.cuesIn}` : ""}`);
  }, 30_000);
  const stop = async () => { clearInterval(status); await relay.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`[osc-relay] ${e?.message ?? e}`); process.exit(1); });
}
