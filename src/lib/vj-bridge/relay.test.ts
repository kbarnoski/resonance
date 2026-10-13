// End-to-end: the real relay (scripts/osc-relay.mjs) on ephemeral loopback
// ports — a raw-socket WebSocket client in, a UDP listener out. No browser.
import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import dgram from "node:dgram";
import { parseArgs, startRelay, originAllowed, demoFrame } from "../../../scripts/osc-relay.mjs";
import { encodeClientFrame, acceptKey, FrameParser } from "./ws-frame.mjs";
import { decodePacket, encodeMessage } from "./osc.mjs";
import { packFrame } from "./protocol";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

async function udpListener() {
  const sock = dgram.createSocket("udp4");
  const got: { address: string; types: string; args: unknown[] }[] = [];
  sock.on("message", (b) => got.push(...decodePacket(new Uint8Array(b))));
  await new Promise<void>((r) => sock.bind(0, "127.0.0.1", () => r()));
  cleanups.push(() => { sock.close(); });
  return { port: (sock.address() as { port: number }).port, got };
}

function wsConnect(port: number, origin?: string): Promise<{ sock: net.Socket; status: string; texts: string[] }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, "127.0.0.1");
    const key = Buffer.from("0123456789abcdef").toString("base64");
    let head = "";
    let upgraded = false;
    const texts: string[] = [];
    const parser = { buf: Buffer.alloc(0) };
    sock.on("data", (d) => {
      if (!upgraded) {
        head += d.toString("latin1");
        const end = head.indexOf("\r\n\r\n");
        if (end < 0) return;
        upgraded = true;
        const status = head.split("\r\n")[0];
        if (status.includes("101")) expect(head).toContain(`Sec-WebSocket-Accept: ${acceptKey(key)}`);
        resolve({ sock, status, texts });
        parser.buf = Buffer.from(head.slice(end + 4), "latin1");
      } else parser.buf = Buffer.concat([parser.buf, d]);
      // server frames are unmasked + small: text frames only here
      while (parser.buf.length >= 2 && parser.buf.length >= 2 + (parser.buf[1] & 0x7f)) {
        const n = parser.buf[1] & 0x7f;
        if ((parser.buf[0] & 0x0f) === 1) texts.push(parser.buf.subarray(2, 2 + n).toString());
        parser.buf = parser.buf.subarray(2 + n);
      }
    });
    sock.on("error", reject);
    sock.write(
      `GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ""}\r\n`,
    );
    cleanups.push(() => { sock.destroy(); });
  });
}

const until = async (cond: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("osc-relay (end to end, loopback)", () => {
  it("turns a page frame into OSC on the configured host:port", async () => {
    const udp = await udpListener();
    const relay = await startRelay({ ...parseArgs(["--osc-port", String(udp.port), "--ws-port", "0", "--quiet"]) });
    cleanups.push(() => relay.close());
    const { sock, status, texts } = await wsConnect(relay.wsPort, "http://localhost:3000");
    expect(status).toContain("101");
    const frame = packFrame({
      seq: 1, ms: 0, playing: true, journeyId: "ghost", journeyName: "Ghost",
      bands: { bass: 0.5, mid: 0.25, treble: 0.125, level: 0.3, rawBass: 0, rawMid: 0, rawTreble: 0, rawLevel: 0, silent: false },
      events: [["onset", 0.75, 0.5, 0]],
    });
    sock.write(encodeClientFrame(1, JSON.stringify(frame)));
    await until(() => udp.got.some((m) => m.address === "/resonance/journey/name"));
    const bass = udp.got.find((m) => m.address === "/resonance/audio/bass");
    expect(bass?.args).toEqual([0.5]);
    expect(udp.got.find((m) => m.address === "/resonance/audio/onset")?.args).toEqual([0.75, 0.5]);
    expect(udp.got.find((m) => m.address === "/resonance/journey/name")?.args).toEqual(["Ghost"]);
    await until(() => texts.length > 0);
    expect(JSON.parse(texts[0]).hello).toBe("resonance-osc-relay");
    expect(relay.stats.framesIn).toBe(1);
  });

  it("refuses foreign browser origins", async () => {
    const relay = await startRelay(parseArgs(["--ws-port", "0", "--quiet"]));
    cleanups.push(() => relay.close());
    const { status } = await wsConnect(relay.wsPort, "https://evil.example.com");
    expect(status).toContain("403");
    expect(originAllowed("http://127.0.0.1:3000")).toBe(true);
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("http://192.168.1.9")).toBe(false);
  });

  it("forwards allow-listed OSC cues to the kiosk remote bus", async () => {
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      calls.push({ url, body: init.body, headers: init.headers });
      return { ok: true, status: 200 };
    }) as unknown as typeof fetch;
    const relay = await startRelay(parseArgs(["--ws-port", "0", "--cues", "--cue-port", "0", "--remote-key", "k1", "--quiet"]), { fetch: fakeFetch });
    cleanups.push(() => relay.close());
    const tx = dgram.createSocket("udp4");
    cleanups.push(() => { tx.close(); });
    tx.send(encodeMessage("/resonance/cue/next", "i", [1]), relay.cuePort!, "127.0.0.1");
    tx.send(encodeMessage("/resonance/cue/reload", "", []), relay.cuePort!, "127.0.0.1");
    await until(() => relay.stats.cuesIn >= 2 && calls.length >= 1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:3000/api/pack/remote");
    expect(JSON.parse(calls[0].body)).toEqual({ command: "skip" });
    expect(calls[0].headers["x-remote-key"]).toBe("k1");
  });

  it("demo frames are valid frames", () => {
    const f = demoFrame(1, 12.3);
    expect(f.v).toBe(1);
    expect(f.jn.pn).toBe(6);
  });

  it("the ws parser handles fragmented + split frames", () => {
    const p = new FrameParser();
    const a = encodeClientFrame(1, "hello");
    a[0] &= 0x7f; // FIN off → fragment
    const b = encodeClientFrame(0, " world");
    const both = new Uint8Array([...a, ...b]);
    expect(p.push(both.subarray(0, 5))).toEqual([]);
    expect(p.push(both.subarray(5))).toEqual([{ type: "text", data: "hello world" }]);
    const big = "x".repeat(70_000);
    expect(new FrameParser(100_000).push(encodeClientFrame(1, big))).toEqual([{ type: "text", data: big }]);
    expect(() => new FrameParser(10).push(encodeClientFrame(1, "way too long"))).toThrow();
  });
});
