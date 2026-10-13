// Minimal RFC 6455 WebSocket server pieces (no dependencies).
//
// The relay only needs: the HTTP upgrade handshake, parsing masked client
// frames (text / ping / close, fragmentation), and writing small unmasked
// server frames. `ws` sits in node_modules only as a transitive extra, so
// the relay does not lean on it.

import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Sec-WebSocket-Accept for a client's Sec-WebSocket-Key. */
export function acceptKey(key) {
  return createHash("sha1").update(String(key) + GUID).digest("base64");
}

/** Encode one unmasked server frame (opcode 1 text, 2 binary, 8 close, 9 ping, 10 pong). */
export function encodeFrame(opcode, payload = new Uint8Array(0)) {
  const data = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const n = data.length;
  const head = n < 126 ? 2 : n < 65536 ? 4 : 10;
  const out = new Uint8Array(head + n);
  out[0] = 0x80 | (opcode & 0x0f);
  if (n < 126) out[1] = n;
  else if (n < 65536) { out[1] = 126; out[2] = n >> 8; out[3] = n & 0xff; }
  else {
    out[1] = 127;
    const dv = new DataView(out.buffer);
    dv.setUint32(2, Math.floor(n / 2 ** 32), false);
    dv.setUint32(6, n >>> 0, false);
  }
  out.set(data, head);
  return out;
}

/** Encode a MASKED client frame (tests + a self-check client). */
export function encodeClientFrame(opcode, payload, mask = [1, 2, 3, 4]) {
  const data = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const n = data.length;
  const head = (n < 126 ? 2 : n < 65536 ? 4 : 10) + 4;
  const out = new Uint8Array(head + n);
  out[0] = 0x80 | (opcode & 0x0f);
  if (n < 126) out[1] = 0x80 | n;
  else if (n < 65536) { out[1] = 0x80 | 126; out[2] = n >> 8; out[3] = n & 0xff; }
  else { out[1] = 0x80 | 127; const dv = new DataView(out.buffer); dv.setUint32(2, Math.floor(n / 2 ** 32)); dv.setUint32(6, n >>> 0); }
  out.set(mask, head - 4);
  for (let i = 0; i < n; i++) out[head + i] = data[i] ^ mask[i & 3];
  return out;
}

/**
 * Incremental frame parser. push() bytes as they arrive; it returns the
 * complete messages: { type: "text" | "binary" | "ping" | "pong" | "close", data }.
 * Throws on protocol errors (unmasked client frame, oversize) — close the socket.
 */
export class FrameParser {
  constructor(maxMessage = 256 * 1024) {
    this.max = maxMessage;
    this.buf = new Uint8Array(0);
    this.frag = null; // { opcode, chunks: Uint8Array[], size }
  }

  push(chunk) {
    const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const merged = new Uint8Array(this.buf.length + c.length);
    merged.set(this.buf, 0);
    merged.set(c, this.buf.length);
    this.buf = merged;
    const out = [];
    for (;;) {
      const b = this.buf;
      if (b.length < 2) break;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let o = 2;
      if (len === 126) { if (b.length < 4) break; len = (b[2] << 8) | b[3]; o = 4; }
      else if (len === 127) {
        if (b.length < 10) break;
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        len = dv.getUint32(2, false) * 2 ** 32 + dv.getUint32(6, false);
        o = 10;
      }
      if (!masked) throw new Error("client frames must be masked");
      if (len > this.max) throw new Error("frame too large");
      if (b.length < o + 4 + len) break;
      const mask = b.subarray(o, o + 4);
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = b[o + 4 + i] ^ mask[i & 3];
      this.buf = b.slice(o + 4 + len);

      if (opcode >= 8) {
        // control frames are never fragmented
        out.push({ type: opcode === 8 ? "close" : opcode === 9 ? "ping" : "pong", data });
        continue;
      }
      if (opcode !== 0) {
        if (this.frag) throw new Error("new data frame inside a fragmented message");
        if (fin) { out.push(dataMessage(opcode, data)); continue; }
        this.frag = { opcode, chunks: [data], size: len };
        continue;
      }
      // continuation
      if (!this.frag) throw new Error("continuation without a start frame");
      this.frag.chunks.push(data);
      this.frag.size += len;
      if (this.frag.size > this.max) throw new Error("message too large");
      if (fin) {
        const all = new Uint8Array(this.frag.size);
        let p = 0;
        for (const ch of this.frag.chunks) { all.set(ch, p); p += ch.length; }
        out.push(dataMessage(this.frag.opcode, all));
        this.frag = null;
      }
    }
    return out;
  }
}

function dataMessage(opcode, data) {
  return opcode === 1 ? { type: "text", data: new TextDecoder().decode(data) } : { type: "binary", data };
}
