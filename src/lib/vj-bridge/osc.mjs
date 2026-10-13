// Minimal OSC 1.0 encoder / decoder (no dependencies, Node 20 + browser).
//
// Shared by scripts/osc-relay.mjs (Node, plain ESM — no TS build step) and
// the vitest suite. Supports the types every VJ tool reads: i (int32),
// f (float32), s (string), b (blob), T / F (no payload), plus bundles.
// Spec: https://opensoundcontrol.stanford.edu/spec-1_0.html

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Bytes needed for an OSC string (UTF-8 + NUL, padded to 4). */
function strSize(bytes) {
  return (bytes.length + 4) & ~3;
}

/**
 * Encode one OSC message.
 * @param {string} address  e.g. "/resonance/audio/bass"
 * @param {string} types    type tags WITHOUT the comma, e.g. "fs"
 * @param {Array<number|string|boolean|Uint8Array>} args
 * @returns {Uint8Array}
 */
export function encodeMessage(address, types = "", args = []) {
  if (typeof address !== "string" || address[0] !== "/") throw new Error(`OSC address must start with "/": ${address}`);
  const addr = enc.encode(address);
  const tags = enc.encode("," + types);
  const parts = [];
  let size = strSize(addr) + strSize(tags);
  let ai = 0;
  for (const t of types) {
    if (t === "T" || t === "F") continue;
    const v = args[ai++];
    if (t === "i" || t === "f") {
      size += 4;
      parts.push([t, v]);
    } else if (t === "s") {
      const b = enc.encode(String(v ?? ""));
      size += strSize(b);
      parts.push(["s", b]);
    } else if (t === "b") {
      const b = v instanceof Uint8Array ? v : new Uint8Array(0);
      size += 4 + ((b.length + 3) & ~3);
      parts.push(["b", b]);
    } else {
      throw new Error(`unsupported OSC type tag "${t}"`);
    }
  }
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let o = 0;
  out.set(addr, o); o += strSize(addr);
  out.set(tags, o); o += strSize(tags);
  for (const [t, v] of parts) {
    if (t === "i") { dv.setInt32(o, Math.trunc(Number(v) || 0), false); o += 4; }
    else if (t === "f") { dv.setFloat32(o, Number.isFinite(Number(v)) ? Number(v) : 0, false); o += 4; }
    else if (t === "s") { out.set(v, o); o += strSize(v); }
    else if (t === "b") { dv.setInt32(o, v.length, false); out.set(v, o + 4); o += 4 + ((v.length + 3) & ~3); }
  }
  return out;
}

/** "Immediately" time tag (OSC 1.0 §Timetags). */
const IMMEDIATE = [0, 1];

/**
 * Wrap encoded messages (or bundles) into one OSC bundle.
 * @param {Uint8Array[]} elements
 * @param {[number, number]} [timetag] NTP seconds / fraction; default = immediately
 */
export function encodeBundle(elements, timetag = IMMEDIATE) {
  let size = 16;
  for (const e of elements) size += 4 + e.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set(enc.encode("#bundle"), 0); // + NUL (already zero)
  dv.setUint32(8, timetag[0] >>> 0, false);
  dv.setUint32(12, timetag[1] >>> 0, false);
  let o = 16;
  for (const e of elements) {
    dv.setInt32(o, e.length, false);
    out.set(e, o + 4);
    o += 4 + e.length;
  }
  return out;
}

function readStr(buf, o) {
  let end = o;
  while (end < buf.length && buf[end] !== 0) end++;
  if (end >= buf.length) throw new Error("unterminated OSC string");
  return [dec.decode(buf.subarray(o, end)), (end + 4) & ~3];
}

/**
 * Decode an OSC packet into a flat list of messages (bundles are unrolled).
 * @param {Uint8Array} buf
 * @returns {{ address: string, types: string, args: Array<number|string|boolean|Uint8Array> }[]}
 */
export function decodePacket(buf, depth = 0) {
  if (!(buf instanceof Uint8Array)) buf = new Uint8Array(buf);
  if (depth > 4) throw new Error("OSC bundle nesting too deep");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length >= 16 && buf[0] === 0x23 /* # */) {
    const [tag] = readStr(buf, 0);
    if (tag !== "#bundle") throw new Error("bad OSC bundle header");
    const out = [];
    let o = 16;
    while (o + 4 <= buf.length) {
      const n = dv.getInt32(o, false);
      if (n < 0 || o + 4 + n > buf.length) throw new Error("bad OSC bundle element size");
      out.push(...decodePacket(buf.subarray(o + 4, o + 4 + n), depth + 1));
      o += 4 + n;
    }
    return out;
  }
  const [address, o1] = readStr(buf, 0);
  if (address[0] !== "/") throw new Error("bad OSC address");
  let types = "";
  let o = o1;
  if (o < buf.length && buf[o] === 0x2c /* , */) {
    const [t, o2] = readStr(buf, o);
    types = t.slice(1);
    o = o2;
  }
  const args = [];
  for (const t of types) {
    if (t === "i") { args.push(dv.getInt32(o, false)); o += 4; }
    else if (t === "f") { args.push(dv.getFloat32(o, false)); o += 4; }
    else if (t === "s") { const [s, n] = readStr(buf, o); args.push(s); o = n; }
    else if (t === "b") { const n = dv.getInt32(o, false); args.push(buf.slice(o + 4, o + 4 + n)); o += 4 + ((n + 3) & ~3); }
    else if (t === "T") args.push(true);
    else if (t === "F") args.push(false);
    else throw new Error(`unsupported OSC type tag "${t}"`);
    if (o > buf.length) throw new Error("truncated OSC message");
  }
  return [{ address, types, args }];
}

/** Hex dump helper for tests / debugging: "2f 6f 73 …" */
export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}
