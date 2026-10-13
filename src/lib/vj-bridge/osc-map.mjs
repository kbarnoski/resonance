// VJ frame (protocol.ts) → OSC messages, and TD cues → remote-bus commands.
//
// Plain ESM so scripts/osc-relay.mjs runs it under bare Node 20.
// The address map is documented in docs/touchdesigner-bridge.md — keep the
// two in sync (osc-map.test.ts pins the addresses).
//
// CHOP-friendly by design: every continuous value is ONE number on its own
// address (TouchDesigner's OSC In CHOP makes one channel per address), and
// every event also drives a /resonance/pulse/* channel that holds the event's
// strength for exactly one frame, then returns to 0 — a ready-made trigger.
// Strings (names, palettes as hex) go out when they change and on a
// keyframe every couple of seconds, for an OSC In DAT.

import { encodeMessage, encodeBundle } from "./osc.mjs";

export const PREFIX = "/resonance";

/** pulse channels (always present, 0 when idle) */
export const PULSES = ["onset", "note", "section", "phrase", "crest", "breath", "cadence", "beat", "bar", "phase", "journey", "morph"];

/** Fresh per-connection mapper state. */
export function createMapState() {
  return { strings: new Map(), lastKeyframe: -Infinity, pulses: new Map() };
}

const hexRgb = (h) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || "");
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const int = (x) => Math.trunc(num(x));

/**
 * Map one frame to OSC messages ({ address, types, args }).
 * @param {object} f            a VjFrame (protocol.ts)
 * @param {ReturnType<typeof createMapState>} st
 * @param {number} nowMs
 * @param {{ keyframeMs?: number, eventsOnly?: boolean }} [opts]
 */
export function frameToOsc(f, st, nowMs, opts = {}) {
  const keyframeMs = opts.keyframeMs ?? 2000;
  const out = [];
  const P = PREFIX;
  const fl = (a, v) => out.push({ address: P + a, types: "f", args: [r3(num(v))] });
  const it = (a, v) => out.push({ address: P + a, types: "i", args: [int(v)] });

  // ── events (always, even when the continuous part is rate-limited) ──
  const fired = new Map();
  const pulse = (name, v) => fired.set(name, Math.max(fired.get(name) ?? 0, r3(num(v))));
  for (const e of Array.isArray(f.ev) ? f.ev : []) {
    if (!Array.isArray(e)) continue;
    const [kind, a, b, c] = e;
    if (kind === "onset") { out.push({ address: P + "/audio/onset", types: "ff", args: [r3(num(a)), r3(num(b))] }); pulse("onset", a); }
    else if (kind === "note") { out.push({ address: P + "/midi/note", types: "ii", args: [int(a), int(b)] }); pulse("note", num(b) / 127); }
    else if (kind === "noteoff") out.push({ address: P + "/midi/noteoff", types: "i", args: [int(a)] });
    else if (kind === "pedal") out.push({ address: P + "/midi/pedal", types: "i", args: [int(a)] });
    else if (kind === "phrase") {
      out.push({ address: P + "/phrase/event", types: "ssfs", args: [String(a), String(b), r3(num(c)), String(e[4] ?? "")] });
      if (["section", "phrase", "crest", "breath"].includes(a)) pulse(a, num(c) || 1);
    } else if (kind === "cadence") { out.push({ address: P + "/phrase/cadence", types: "f", args: [r3(num(a))] }); pulse("cadence", num(a) || 1); }
    else if (kind === "phase") { out.push({ address: P + "/event/phase", types: "si", args: [String(a), int(b)] }); pulse("phase", 1); }
    else if (kind === "journey") { out.push({ address: P + "/event/journey", types: "ss", args: [String(a), String(b ?? "")] }); pulse("journey", 1); }
    else if (kind === "morph") { out.push({ address: P + "/event/morph", types: "if", args: [int(a), r3(num(b))] }); if (a) pulse("morph", 1); }
    else if (kind === "beat") { out.push({ address: P + "/clock/tick", types: "i", args: [int(a)] }); pulse("beat", 1); }
    else if (kind === "bar") { out.push({ address: P + "/clock/downbeat", types: "i", args: [int(a)] }); pulse("bar", 1); }
  }
  // pulses: value for one frame, then back to 0 (only resend changes)
  for (const name of PULSES) {
    const v = fired.get(name) ?? 0;
    const prev = st.pulses.get(name);
    if (prev === undefined || v !== 0 || prev !== 0) {
      fl(`/pulse/${name}`, v);
      st.pulses.set(name, v);
    }
  }
  if (opts.eventsOnly) return out;

  // ── continuous ──
  const au = f.au ?? {};
  fl("/audio/bass", au.b); fl("/audio/mid", au.m); fl("/audio/treble", au.t); fl("/audio/level", au.l);
  fl("/audio/raw/bass", au.rb); fl("/audio/raw/mid", au.rm); fl("/audio/raw/treble", au.rt); fl("/audio/raw/level", au.rl);
  it("/audio/silent", au.sil);

  const ck = f.ck ?? {};
  fl("/clock/bpm", ck.bpm); fl("/clock/beat", ck.beat); fl("/clock/beat/phase", ck.bph);
  it("/clock/bar", ck.bar); fl("/clock/bar/phase", ck.barph);

  const pr = f.pr ?? {};
  it("/presenter/playing", pr.play); it("/presenter/holding", pr.hold);
  fl("/presenter/time", pr.time); fl("/presenter/duration", pr.dur); fl("/presenter/volume", pr.vol);

  const jn = f.jn ?? {};
  it("/journey/phase/index", jn.pi); it("/journey/phase/count", jn.pn);
  fl("/journey/phase/progress", jn.pp); fl("/journey/progress", jn.prog);
  it("/journey/emblem", jn.emb);

  // palette: the journey's image palette (this phase's stills), else its theme palette
  const theme = Array.isArray(jn.theme) ? jn.theme : [];
  const pal = Array.isArray(jn.pal) && jn.pal.length ? jn.pal : theme;
  it("/palette/count", Math.min(5, pal.length));
  for (let i = 0; i < 5; i++) {
    const [r, g, b] = hexRgb(pal[i] ?? pal[pal.length - 1]);
    fl(`/palette/${i}/r`, r); fl(`/palette/${i}/g`, g); fl(`/palette/${i}/b`, b);
  }

  const sh = f.sh ?? {};
  fl("/shader/opacity", sh.op);

  const pt = f.pt ?? {};
  it("/particles/present", pt.on);
  const sw = Array.isArray(pt.sw) ? pt.sw : [1, 1, 1];
  fl("/phrase/swell/density", sw[0]); fl("/phrase/swell/size", sw[1]); fl("/phrase/swell/react", sw[2]);
  const cur = Array.isArray(pt.cur) ? pt.cur : [0, 0, 0];
  fl("/harmony/current", cur[0]); fl("/harmony/tension", cur[1]); fl("/harmony/layering", cur[2]);
  const br = Array.isArray(pt.br) ? pt.br : [0, 0, 0];
  fl("/breath/amount", br[0]); fl("/breath/phase", br[1]); fl("/breath/settle", br[2]);

  const mo = f.mo ?? {};
  it("/morph/playing", mo.on); fl("/morph/progress", mo.prog);

  it("/heartbeat", f.seq);

  // ── strings: on change, plus a keyframe ──
  const keyframe = nowMs - st.lastKeyframe >= keyframeMs;
  if (keyframe) st.lastKeyframe = nowMs;
  const strs = [
    ["/journey/id", [jn.id]],
    ["/journey/name", [jn.name]],
    ["/journey/phase", [jn.phase]],
    ["/journey/image", [jn.img || "none"]],
    ["/shader/name", [sh.mode]],
    ["/shader/dual", [sh.dual || "none"]],
    ["/particles/soul", [pt.soul || "none"]],
    ["/presenter/label", [pr.label]],
    ["/palette/hex", pal.slice(0, 5)],
    ["/theme/hex", theme.slice(0, 4)],
  ];
  for (const [a, vals] of strs) {
    const args = vals.map((v) => String(v ?? ""));
    const key = args.join("\u0000");
    if (keyframe || st.strings.get(a) !== key) {
      st.strings.set(a, key);
      out.push({ address: P + a, types: "s".repeat(args.length), args });
    }
  }
  return out;
}

/** Encode mapped messages: one bundle (default) or one packet per message.
 *  Bundles are split so no UDP datagram exceeds maxBytes. */
export function encodePackets(messages, { bundle = true, maxBytes = 8192 } = {}) {
  const enc = messages.map((m) => encodeMessage(m.address, m.types, m.args));
  if (!bundle) return enc;
  const packets = [];
  let cur = [];
  let size = 16;
  for (const e of enc) {
    if (cur.length && size + 4 + e.length > maxBytes) {
      packets.push(encodeBundle(cur));
      cur = [];
      size = 16;
    }
    cur.push(e);
    size += 4 + e.length;
  }
  if (cur.length) packets.push(encodeBundle(cur));
  return packets;
}

// ── data in: TD → Resonance cues ─────────────────────────────────────────

/**
 * An incoming OSC cue → a phone-remote bus command (use-kiosk-remote.ts
 * runCommand), or null if it is not an allowed cue. Allow-list only: a VJ
 * desk can steer the show the way the phone remote can, nothing more.
 */
export function cueToCommand(address, args = []) {
  const a = String(address || "").replace(/\/+$/, "");
  const C = PREFIX + "/cue";
  if (!a.startsWith(C + "/")) return null;
  const cue = a.slice(C.length + 1);
  // a trigger with a 0 argument (button release from TD) is ignored
  if (args.length === 1 && typeof args[0] === "number" && args[0] === 0 && cue !== "volume") return null;
  switch (cue) {
    case "next": return "skip";
    case "prev": return "prev";
    case "play": case "toggle": return "toggle-play";
    case "set/next": return "set-next";
    case "set/prev": return "set-prev";
    case "title/hold": return "title-hold";
    case "title/release": return "title-release";
    case "live": return "live";
    case "loop": return "loop";
    case "mark": return `mark:${Date.now()}`;
    case "volume": {
      const v = Number(args[0]);
      return Number.isFinite(v) ? `volume:${Math.max(0, Math.min(1, v)).toFixed(3)}` : null;
    }
    case "journey": {
      const id = typeof args[0] === "string" ? args[0] : "";
      return /^[a-z0-9-]{1,64}(@[a-z0-9-]{1,64})?$/i.test(id) ? `jump:${id}` : null;
    }
    case "program": {
      const id = typeof args[0] === "string" ? args[0] : "";
      return /^[a-z0-9-]{1,64}$/i.test(id) ? `program:${id}` : null;
    }
    default: return null;
  }
}
