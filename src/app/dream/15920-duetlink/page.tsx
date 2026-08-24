"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15920-duetlink — the dream lab's first MULTI-USER piece.
//
// Two people, in two places, conduct ONE of Karel's real piano takes together.
// The single decoded buffer is split by a Linkwitz-Riley-style crossover into a
// LOW voice (bass/pad) and a HIGH voice (melody). The HOST shapes the LOW voice,
// the GUEST shapes the HIGH voice — each with their pointer (x = spatial/filter
// axis, y = gain + a gentle playbackRate lean). Both peers see BOTH cursors and
// hear BOTH voices, anchored to a shared clock so the take starts sample-close
// on each machine. The mix is a two-person gesture on a single recording.
//
// Transport: _shared/peerSync (BroadcastChannel for two same-browser tabs, a
// real WebRTC data channel for remote peers, NTP-style shared clock over both).
// Solo fallback: one visitor drives their voice while an auto-partner "ghost"
// cursor breathes the other voice, so the full duet is always audible.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createPeerSync,
  type PeerSync,
  type PeerClockInfo,
} from "../_shared/peerSync";
import { loadTrackAnalysis, type TrackAnalysis } from "../_shared/trackAnalysis";

// ── constants ────────────────────────────────────────────────────────────────

const ROOM = "duetlink";
const XOVER = 420; // crossover corner (Hz) between the two voices
const LOW_RGB: [number, number, number] = [0.4, 0.64, 0.86]; // cool blue
const HIGH_RGB: [number, number, number] = [0.86, 0.93, 1.0]; // cool white
const RIBBON_N = 140;

interface Vec2 {
  x: number;
  y: number;
}

interface VoiceChain {
  lpA: BiquadFilterNode;
  hpA: BiquadFilterNode;
  lowColor: BiquadFilterNode;
  highColor: BiquadFilterNode;
  panLow: StereoPannerNode;
  panHigh: StereoPannerNode;
  gainLow: GainNode;
  gainHigh: GainNode;
}

interface AnchorInfo {
  S: number;
  O: number;
  trackId: string;
}

// ── small helpers (never prefixed `use`) ─────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  return prog;
}

// Build one voice's crossover branch + expression nodes, summing into master.
function makeVoiceChain(ctx: AudioContext, master: SafeMaster): VoiceChain {
  const lpA = ctx.createBiquadFilter();
  lpA.type = "lowpass";
  lpA.frequency.value = XOVER;
  lpA.Q.value = 0.7071;
  const lpB = ctx.createBiquadFilter();
  lpB.type = "lowpass";
  lpB.frequency.value = XOVER;
  lpB.Q.value = 0.7071;
  const lowColor = ctx.createBiquadFilter();
  lowColor.type = "lowpass";
  lowColor.frequency.value = 300;
  lowColor.Q.value = 0.9;
  const panLow = ctx.createStereoPanner();
  const gainLow = ctx.createGain();
  gainLow.gain.value = 0.0001;
  lpA.connect(lpB);
  lpB.connect(lowColor);
  lowColor.connect(panLow);
  panLow.connect(gainLow);
  gainLow.connect(master.input);

  const hpA = ctx.createBiquadFilter();
  hpA.type = "highpass";
  hpA.frequency.value = XOVER;
  hpA.Q.value = 0.7071;
  const hpB = ctx.createBiquadFilter();
  hpB.type = "highpass";
  hpB.frequency.value = XOVER;
  hpB.Q.value = 0.7071;
  const highColor = ctx.createBiquadFilter();
  highColor.type = "peaking";
  highColor.frequency.value = 1500;
  highColor.gain.value = 6;
  highColor.Q.value = 1;
  const panHigh = ctx.createStereoPanner();
  const gainHigh = ctx.createGain();
  gainHigh.gain.value = 0.0001;
  hpA.connect(hpB);
  hpB.connect(highColor);
  highColor.connect(panHigh);
  panHigh.connect(gainHigh);
  gainHigh.connect(master.input);

  return { lpA, hpA, lowColor, highColor, panLow, panHigh, gainLow, gainHigh };
}

// One point of a voice's centerline, driven by its owner's cursor + analyser.
function sampleVoice(
  i: number,
  cursor: Vec2,
  band: number,
  baseY: number,
  phaseSign: number,
  t: number,
): Vec2 {
  const clipx = (i / (RIBBON_N - 1)) * 2 - 1;
  const center = baseY + (0.5 - cursor.y) * 0.85;
  const amp = 0.05 + band * 0.4 + (1 - cursor.y) * 0.05;
  const freq = 2.0 + cursor.x * 5.0;
  const phase = t * 0.6 * phaseSign + cursor.x * 6.2831;
  const y =
    center +
    amp * Math.sin(clipx * freq + phase) +
    amp * 0.4 * Math.sin(clipx * freq * 1.9 - phase * 1.3);
  return { x: clipx, y };
}

// ── component ────────────────────────────────────────────────────────────────

export default function DuetLinkPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state (display only — the engine lives in refs to avoid render churn)
  const [entered, setEntered] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [backend, setBackend] = useState("solo");
  const [roleLabel, setRoleLabel] = useState<"host" | "guest">("host");
  const [peerCount, setPeerCount] = useState(0);
  const [clock, setClock] = useState<PeerClockInfo>({ offsetMs: 0, rttMs: 0 });
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [trackId, setTrackId] = useState(COLLECTIONS[0].tracks[0].id);
  const [trackTitle, setTrackTitle] = useState(COLLECTIONS[0].tracks[0].title);
  const [keyInfo, setKeyInfo] = useState<string | null>(null);
  // WebRTC copy-paste signaling
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [pasteBox, setPasteBox] = useState("");

  // Engine refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const chainRef = useRef<VoiceChain | null>(null);
  const syncRef = useRef<PeerSync | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const srcLowRef = useRef<AudioBufferSourceNode | null>(null);
  const srcHighRef = useRef<AudioBufferSourceNode | null>(null);
  const startInfoRef = useRef<AnchorInfo | null>(null);
  const enteredRef = useRef(false);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const currentTrackRef = useRef(trackId);

  const selfCursorRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const remoteCursorRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const lastSendRef = useRef(0);
  const roleRef = useRef<"host" | "guest">("host");

  // Actions wired up inside the mount effect, invoked from JSX handlers.
  const actionsRef = useRef<{
    enter: () => void;
    reanchor: () => void;
    createOffer: () => void;
    acceptAnswer: (code: string) => void;
    acceptOffer: (code: string) => void;
  } | null>(null);

  // Keep a ref of the selected track so async paths read the latest value.
  useEffect(() => {
    currentTrackRef.current = trackId;
  }, [trackId]);

  // Load lightweight analysis (key/tempo) for the header chip; degrade quietly.
  useEffect(() => {
    let alive = true;
    setKeyInfo(null);
    loadTrackAnalysis(trackId)
      .then((a: TrackAnalysis | null) => {
        if (!alive || !a) return;
        const parts: string[] = [];
        if (a.key_signature) parts.push(a.key_signature);
        if (a.tempo) parts.push(`${Math.round(a.tempo)} bpm`);
        if (parts.length) setKeyInfo(parts.join(" · "));
      })
      .catch(() => {
        /* analysis is optional */
      });
    return () => {
      alive = false;
    };
  }, [trackId]);

  // ── the one big engine effect: transport, audio, render ────────────────────
  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    // ---- peerSync wiring --------------------------------------------------
    const refreshRole = () => {
      const s = syncRef.current;
      if (!s) return;
      const r = s.role();
      roleRef.current = r;
      setRoleLabel(r);
      setBackend(s.getBackend());
      setPeerCount(s.peers().length);
    };

    const sync = createPeerSync({
      room: ROOM,
      onStatus: (st) => {
        setStatus(st);
        refreshRole();
      },
      onPeers: () => refreshRole(),
      onClock: (info) => setClock(info),
      onMessage: (payload) => onPeerMessage(payload),
    });
    syncRef.current = sync;
    // Zero-click two-tab review path: same-browser tabs sync instantly.
    sync.startLocal();
    refreshRole();

    function onPeerMessage(payload: unknown): void {
      if (!isRecord(payload)) return;
      const t = payload.t;
      if (t === "cursor") {
        const { x, y } = payload;
        if (typeof x === "number" && typeof y === "number") {
          remoteCursorRef.current = { x: clamp01(x), y: clamp01(y) };
        }
      } else if (t === "play" || t === "anchor") {
        const { S, O, trackId: tid } = payload;
        if (typeof S === "number" && typeof O === "number") {
          const id = typeof tid === "string" ? tid : currentTrackRef.current;
          void handleAnchor(S, O, id, t === "play");
        }
      }
    }

    // ---- audio graph ------------------------------------------------------
    async function ensureTrack(
      ctx: AudioContext,
      id: string,
    ): Promise<AudioBuffer | null> {
      const cached = buffersRef.current.get(id);
      if (cached) return cached;
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        buffersRef.current.set(id, buffer);
        if (id === currentTrackRef.current) setTrackTitle(title);
        return buffer;
      } catch {
        setError(
          "Could not load Karel's recording. Check the connection and re-enter.",
        );
        return null;
      }
    }

    function stopSources(): void {
      for (const ref of [srcLowRef, srcHighRef]) {
        const node = ref.current;
        if (node) {
          try {
            node.stop();
          } catch {
            /* already stopped */
          }
          try {
            node.disconnect();
          } catch {
            /* detached */
          }
          ref.current = null;
        }
      }
    }

    async function startVoices(
      S: number,
      O: number,
      id: string,
    ): Promise<void> {
      const ctx = ctxRef.current;
      const chain = chainRef.current;
      const s = syncRef.current;
      if (!ctx || !chain || !s || startingRef.current) return;
      startingRef.current = true;
      try {
        const buf = await ensureTrack(ctx, id);
        if (!buf) return;
        currentTrackRef.current = id;
        stopSources();

        const srcLow = ctx.createBufferSource();
        srcLow.buffer = buf;
        srcLow.loop = true;
        srcLow.connect(chain.lpA);
        const srcHigh = ctx.createBufferSource();
        srcHigh.buffer = buf;
        srcHigh.loop = true;
        srcHigh.connect(chain.hpA);

        const delay = (S - s.now()) / 1000;
        let offset = O;
        let startAt = ctx.currentTime;
        if (delay > 0) startAt = ctx.currentTime + delay;
        else offset = O + -delay; // late join → jump into the take
        offset = ((offset % buf.duration) + buf.duration) % buf.duration;

        srcLow.start(startAt, offset);
        srcHigh.start(startAt, offset);
        srcLowRef.current = srcLow;
        srcHighRef.current = srcHigh;
        startInfoRef.current = { S, O, trackId: id };
        startedRef.current = true;
        setStarted(true);
      } finally {
        startingRef.current = false;
      }
    }

    // Anchors keep a late guest aligned; only 'play' forces a (re)start.
    async function handleAnchor(
      S: number,
      O: number,
      id: string,
      force: boolean,
    ): Promise<void> {
      if (!enteredRef.current || !ctxRef.current) return;
      if (startedRef.current && !force) return;
      await startVoices(S, O, id);
    }

    function startTransport(): void {
      const s = syncRef.current;
      if (!s) return;
      const id = currentTrackRef.current;
      const S = s.now() + 600;
      s.send({ t: "play", S, O: 0, trackId: id });
      void startVoices(S, 0, id);
    }

    function sendAnchor(): void {
      const s = syncRef.current;
      const info = startInfoRef.current;
      if (!s || !info) return;
      const elapsed = (s.now() - info.S) / 1000;
      const S2 = s.now() + 500;
      const O2 = info.O + elapsed + 0.5;
      s.send({ t: "anchor", S: S2, O: O2, trackId: info.trackId });
    }

    // Host-authoritative transport keeper: auto-start when host, else re-anchor.
    const keeper = setInterval(() => {
      const s = syncRef.current;
      if (!s || !enteredRef.current) return;
      if (s.isHost()) {
        if (!startedRef.current) startTransport();
        else sendAnchor();
      }
    }, 2000);

    // ---- actions exposed to the UI ----------------------------------------
    actionsRef.current = {
      enter: () => {
        if (enteredRef.current) return;
        void (async () => {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) {
            setError("Web Audio is unavailable in this browser.");
            return;
          }
          const ctx = new AC();
          await ctx.resume();
          const master = createSafeMaster(ctx);
          const chain = makeVoiceChain(ctx, master);
          ctxRef.current = ctx;
          masterRef.current = master;
          chainRef.current = chain;
          const buf = await ensureTrack(ctx, currentTrackRef.current);
          if (!buf) return;
          enteredRef.current = true;
          setEntered(true);
          if (syncRef.current?.isHost()) startTransport();
        })();
      },
      reanchor: () => {
        const s = syncRef.current;
        if (!s || !s.isHost()) return;
        startedRef.current = false;
        setStarted(false);
        startTransport();
      },
      createOffer: () => {
        void (async () => {
          const s = syncRef.current;
          if (!s) return;
          try {
            const code = await s.createOffer();
            setOfferCode(code);
            refreshRole();
          } catch {
            setError("Could not create an invite (WebRTC unavailable?).");
          }
        })();
      },
      acceptAnswer: (code) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            await s.acceptAnswer(code.trim());
            refreshRole();
          } catch {
            setError("That reply code could not be read.");
          }
        })();
      },
      acceptOffer: (code) => {
        void (async () => {
          const s = syncRef.current;
          if (!s || !code.trim()) return;
          try {
            const ans = await s.acceptOffer(code.trim());
            setAnswerCode(ans);
            refreshRole();
          } catch {
            setError("That invite code could not be read.");
          }
        })();
      },
    };

    // ---- renderer (WebGL2 primary, Canvas2D fallback) ---------------------
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });

    let raf = 0;
    const dyn = new Float32Array(RIBBON_N * 2 * 5);

    if (gl) {
      setWebglOk(true);
      runGl(gl);
    } else {
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        setWebglOk(false);
        run2d(ctx2d);
      }
    }

    // Shared per-frame logic: resolve cursors, drive audio params. Returns the
    // host/guest cursors (plus which one is "self") for the renderer.
    function tick(t: number): {
      host: Vec2;
      guest: Vec2;
      selfIsHost: boolean;
      lowBand: number;
      highBand: number;
    } {
      const s = syncRef.current;
      // A connected peer keeps its (possibly still) cursor; the ghost partner
      // only drives the other voice when there is genuinely no peer at all.
      const remoteOn = !!s && s.connected();
      const role = roleRef.current;
      const self = selfCursorRef.current;
      const ghost: Vec2 = {
        x: 0.5 + 0.34 * Math.sin(t * 0.23),
        y: 0.5 + 0.3 * Math.sin(t * 0.31 + 1.3),
      };
      const other = remoteOn ? remoteCursorRef.current : ghost;
      const host = role === "host" ? self : other;
      const guest = role === "guest" ? self : other;

      // analyser energy → per-band amplitude
      let lowBand = 0;
      let highBand = 0;
      const analyser = masterRef.current?.analyser;
      if (analyser) {
        const n = analyser.frequencyBinCount;
        const freq = new Uint8Array(n);
        analyser.getByteFrequencyData(freq);
        let lo = 0;
        let hi = 0;
        const loEnd = Math.min(40, n);
        const hiStart = Math.min(60, n);
        for (let i = 1; i < loEnd; i++) lo += freq[i];
        for (let i = hiStart; i < Math.min(220, n); i++) hi += freq[i];
        lowBand = lo / (loEnd * 255);
        highBand = hi / (Math.max(1, Math.min(220, n) - hiStart) * 255);
      }

      // drive audio params (low ← host cursor, high ← guest cursor)
      const ctx = ctxRef.current;
      const chain = chainRef.current;
      if (ctx && chain) {
        const now = ctx.currentTime;
        const tc = 0.1;
        chain.lowColor.frequency.setTargetAtTime(140 + host.x * 380, now, tc);
        chain.panLow.pan.setTargetAtTime((host.x * 2 - 1) * 0.8, now, tc);
        chain.gainLow.gain.setTargetAtTime(
          (0.15 + (1 - host.y) * 0.85) * 0.85,
          now,
          tc,
        );
        if (srcLowRef.current)
          srcLowRef.current.playbackRate.setTargetAtTime(
            1 + (0.5 - host.y) * 0.05,
            now,
            tc,
          );
        chain.highColor.frequency.setTargetAtTime(700 + guest.x * 3100, now, tc);
        chain.panHigh.pan.setTargetAtTime((guest.x * 2 - 1) * 0.8, now, tc);
        chain.gainHigh.gain.setTargetAtTime(
          (0.15 + (1 - guest.y) * 0.85) * 0.7,
          now,
          tc,
        );
        if (srcHighRef.current)
          srcHighRef.current.playbackRate.setTargetAtTime(
            1 + (0.5 - guest.y) * 0.05,
            now,
            tc,
          );
      }

      return { host, guest, selfIsHost: role === "host", lowBand, highBand };
    }

    function sizeCanvas(): { w: number; h: number } {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return { w, h };
    }

    // ---- WebGL2 dual-ribbon path ------------------------------------------
    function runGl(g: WebGL2RenderingContext): void {
      const glowVs = `#version 300 es
        in vec2 aPos; in vec2 aUv; in float aBright;
        out vec2 vUv; out float vBright;
        void main(){ vUv=aUv; vBright=aBright; gl_Position=vec4(aPos,0.0,1.0); }`;
      const glowFs = `#version 300 es
        precision highp float;
        in vec2 vUv; in float vBright;
        uniform vec3 uColor; uniform float uIntensity;
        out vec4 frag;
        void main(){
          float d = length(vUv);
          float a = pow(clamp(1.0-d,0.0,1.0),1.6) * uIntensity * vBright;
          frag = vec4(uColor*a, a);
        }`;
      const fadeVs = `#version 300 es
        in vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }`;
      const fadeFs = `#version 300 es
        precision highp float; uniform vec4 uColor; out vec4 frag;
        void main(){ frag = uColor; }`;

      const glowProg = makeProgram(g, glowVs, glowFs);
      const fadeProg = makeProgram(g, fadeVs, fadeFs);
      if (!glowProg || !fadeProg) {
        setWebglOk(false);
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) run2d(ctx2d);
        return;
      }

      const aPos = g.getAttribLocation(glowProg, "aPos");
      const aUv = g.getAttribLocation(glowProg, "aUv");
      const aBright = g.getAttribLocation(glowProg, "aBright");
      const uColor = g.getUniformLocation(glowProg, "uColor");
      const uIntensity = g.getUniformLocation(glowProg, "uIntensity");
      const fadePos = g.getAttribLocation(fadeProg, "aPos");
      const fadeCol = g.getUniformLocation(fadeProg, "uColor");

      const dynBuf = g.createBuffer();
      const fadeBuf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, fadeBuf);
      g.bufferData(
        g.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        g.STATIC_DRAW,
      );

      // clear once to the ground color
      g.clearColor(0.02, 0.03, 0.05, 1);
      g.clear(g.COLOR_BUFFER_BIT);

      const drawGlow = (
        arr: Float32Array,
        count: number,
        mode: number,
        color: [number, number, number],
        intensity: number,
      ) => {
        g.useProgram(glowProg);
        g.bindBuffer(g.ARRAY_BUFFER, dynBuf);
        g.bufferData(g.ARRAY_BUFFER, arr, g.DYNAMIC_DRAW);
        g.enableVertexAttribArray(aPos);
        g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 20, 0);
        g.enableVertexAttribArray(aUv);
        g.vertexAttribPointer(aUv, 2, g.FLOAT, false, 20, 8);
        g.enableVertexAttribArray(aBright);
        g.vertexAttribPointer(aBright, 1, g.FLOAT, false, 20, 16);
        g.uniform3f(uColor, color[0], color[1], color[2]);
        g.uniform1f(uIntensity, intensity);
        g.drawArrays(mode, 0, count);
      };

      const buildRibbon = (
        cursor: Vec2,
        band: number,
        baseY: number,
        phaseSign: number,
        t: number,
      ) => {
        const cursorClipX = cursor.x * 2 - 1;
        const halfWBase = 0.02 + band * 0.05;
        let prev = sampleVoice(0, cursor, band, baseY, phaseSign, t);
        for (let i = 0; i < RIBBON_N; i++) {
          const p = sampleVoice(i, cursor, band, baseY, phaseSign, t);
          const next =
            i < RIBBON_N - 1
              ? sampleVoice(i + 1, cursor, band, baseY, phaseSign, t)
              : p;
          const tx = next.x - prev.x;
          const ty = next.y - prev.y;
          const len = Math.hypot(tx, ty) || 1;
          const nx = -ty / len;
          const ny = tx / len;
          const hw = halfWBase;
          const near = Math.max(0, 1 - Math.abs(p.x - cursorClipX) * 1.6);
          const bright = 0.5 + near * 0.9 + band * 0.4;
          const base = i * 10;
          dyn[base] = p.x + nx * hw;
          dyn[base + 1] = p.y + ny * hw;
          dyn[base + 2] = 0;
          dyn[base + 3] = 1;
          dyn[base + 4] = bright;
          dyn[base + 5] = p.x - nx * hw;
          dyn[base + 6] = p.y - ny * hw;
          dyn[base + 7] = 0;
          dyn[base + 8] = -1;
          dyn[base + 9] = bright;
          prev = p;
        }
      };

      const glowQuad = new Float32Array(6 * 5);
      const buildGlow = (cx: number, cy: number, r: number, bright: number) => {
        const corners: Array<[number, number]> = [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ];
        for (let i = 0; i < 6; i++) {
          const [ux, uy] = corners[i];
          const b = i * 5;
          glowQuad[b] = cx + ux * r;
          glowQuad[b + 1] = cy + uy * r;
          glowQuad[b + 2] = ux;
          glowQuad[b + 3] = uy;
          glowQuad[b + 4] = bright;
        }
      };

      const frame = () => {
        const { w, h } = sizeCanvas();
        g.viewport(0, 0, w, h);
        const now = performance.now() / 1000;
        const { host, guest, selfIsHost, lowBand, highBand } = tick(now);

        // trail fade (normal blend over previous frame)
        g.useProgram(fadeProg);
        g.disable(g.BLEND);
        g.enable(g.BLEND);
        g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
        g.bindBuffer(g.ARRAY_BUFFER, fadeBuf);
        g.enableVertexAttribArray(fadePos);
        g.vertexAttribPointer(fadePos, 2, g.FLOAT, false, 0, 0);
        g.uniform4f(fadeCol, 0.02, 0.03, 0.05, 0.14);
        g.drawArrays(g.TRIANGLES, 0, 3);

        // additive art on top
        g.blendFunc(g.ONE, g.ONE);
        buildRibbon(host, lowBand, -0.16, 1, now);
        drawGlow(dyn, RIBBON_N * 2, g.TRIANGLE_STRIP, LOW_RGB, 0.9);
        buildRibbon(guest, highBand, 0.16, -1, now);
        drawGlow(dyn, RIBBON_N * 2, g.TRIANGLE_STRIP, HIGH_RGB, 0.9);

        buildGlow(host.x * 2 - 1, 1 - host.y * 2, 0.06, 1);
        drawGlow(glowQuad, 6, g.TRIANGLES, LOW_RGB, selfIsHost ? 1.4 : 0.9);
        buildGlow(guest.x * 2 - 1, 1 - guest.y * 2, 0.06, 1);
        drawGlow(glowQuad, 6, g.TRIANGLES, HIGH_RGB, selfIsHost ? 0.9 : 1.4);

        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    // ---- Canvas2D graceful fallback ---------------------------------------
    function run2d(c: CanvasRenderingContext2D): void {
      const toCss = (rgb: [number, number, number], a: number) =>
        `rgba(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(
          rgb[2] * 255,
        )},${a})`;
      const frame = () => {
        const { w, h } = sizeCanvas();
        const now = performance.now() / 1000;
        const { host, guest, selfIsHost, lowBand, highBand } = tick(now);
        c.fillStyle = "rgba(5,8,13,0.16)";
        c.fillRect(0, 0, w, h);
        const drawRibbon = (
          cursor: Vec2,
          band: number,
          baseY: number,
          sign: number,
          rgb: [number, number, number],
        ) => {
          c.beginPath();
          for (let i = 0; i < RIBBON_N; i++) {
            const p = sampleVoice(i, cursor, band, baseY, sign, now);
            const px = ((p.x + 1) / 2) * w;
            const py = ((1 - p.y) / 2) * h;
            if (i === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.strokeStyle = toCss(rgb, 0.85);
          c.lineWidth = 2 + band * 6;
          c.shadowBlur = 18;
          c.shadowColor = toCss(rgb, 0.9);
          c.stroke();
          c.shadowBlur = 0;
        };
        drawRibbon(host, lowBand, -0.16, 1, LOW_RGB);
        drawRibbon(guest, highBand, 0.16, -1, HIGH_RGB);
        const dot = (cur: Vec2, rgb: [number, number, number], big: boolean) => {
          const px = cur.x * w;
          const py = cur.y * h;
          const r = big ? 16 : 10;
          const grad = c.createRadialGradient(px, py, 0, px, py, r);
          grad.addColorStop(0, toCss(rgb, 0.95));
          grad.addColorStop(1, toCss(rgb, 0));
          c.fillStyle = grad;
          c.beginPath();
          c.arc(px, py, r, 0, Math.PI * 2);
          c.fill();
        };
        dot(host, LOW_RGB, selfIsHost);
        dot(guest, HIGH_RGB, !selfIsHost);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    // ---- pointer capture ---------------------------------------------------
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      selfCursorRef.current = { x, y };
      const s = syncRef.current;
      const nowMs = performance.now();
      if (s && nowMs - lastSendRef.current > 40) {
        lastSendRef.current = nowMs;
        s.send({ t: "cursor", x, y });
      }
    };
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);

    // ---- cleanup -----------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(keeper);
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      stopSources();
      try {
        sync.destroy();
      } catch {
        /* already gone */
      }
      const ctx = ctxRef.current;
      if (ctx) {
        masterRef.current?.disconnect();
        void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      masterRef.current = null;
      chainRef.current = null;
      syncRef.current = null;
    };
    // Mount-once engine; UI reads/writes go through refs and state setters.
  }, []);

  // ── derived UI ─────────────────────────────────────────────────────────────
  const connected = peerCount > 0;
  const yourVoice = roleLabel === "host" ? "LOW voice" : "HIGH voice";
  const voiceColor = roleLabel === "host" ? "text-primary" : "text-foreground";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top-left: title + status */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 15920 · duetlink
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Two hands on one take
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Two people conduct one of Karel&apos;s real piano recordings
            together — one shapes the low voice, one the high — anchored to a
            shared clock so the mix is a single, split gesture.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              {trackTitle}
            </span>
            {keyInfo && (
              <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-muted-foreground">
                {keyInfo}
              </span>
            )}
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono uppercase tracking-wider text-muted-foreground">
              you: <span className={voiceColor}>{yourVoice}</span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>transport: {backend}</span>
            <span>·</span>
            <span>{status}</span>
            <span>·</span>
            <span>
              {connected
                ? `${peerCount} peer${peerCount > 1 ? "s" : ""}`
                : "solo (ghost partner)"}
            </span>
            {connected && backend !== "local" && (
              <>
                <span>·</span>
                <span>
                  offset {Math.round(clock.offsetMs)}ms / rtt{" "}
                  {Number.isFinite(clock.rttMs) ? Math.round(clock.rttMs) : "–"}
                  ms
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* top-right: notes link */}
      <div className="pointer-events-none absolute right-0 top-0 p-5 sm:p-6">
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* error */}
      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
          <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        </div>
      )}

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            {!entered ? (
              <button
                onClick={() => actionsRef.current?.enter()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the duet
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                {started ? "Take is live — move to conduct" : "Waiting for host…"}
              </span>
            )}

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                take
              </span>
              <select
                value={trackId}
                disabled={entered}
                onChange={(e) => {
                  setTrackId(e.target.value);
                  currentTrackRef.current = e.target.value;
                }}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((col) => (
                  <optgroup key={col.name} label={col.name}>
                    {col.tracks.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {entered && roleLabel === "host" && (
              <button
                onClick={() => actionsRef.current?.reanchor()}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Re-anchor
              </button>
            )}

            <button
              onClick={() => setShowRemote((v) => !v)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Connect a friend
            </button>

            {!webglOk && (
              <span className="font-mono text-[11px] text-muted-foreground">
                WebGL2 unavailable — Canvas2D fallback
              </span>
            )}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Fastest demo: open this page in{" "}
            <span className="text-foreground">two browser tabs</span> — they sync
            instantly over BroadcastChannel, and one becomes host (low voice),
            the other guest (high voice). Solo works too: a ghost partner breathes
            the other voice.
          </p>

          {showRemote && (
            <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Host — invite a remote peer
                </p>
                <button
                  onClick={() => actionsRef.current?.createOffer()}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  1. Create invite code
                </button>
                <textarea
                  readOnly
                  value={offerCode}
                  placeholder="invite code appears here — send it to your friend"
                  className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                />
                <input
                  value={pasteBox}
                  onChange={(e) => setPasteBox(e.target.value)}
                  placeholder="2. paste their reply code"
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                />
                <button
                  onClick={() => actionsRef.current?.acceptAnswer(pasteBox)}
                  className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  3. Connect
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Guest — join with a code
                </p>
                <input
                  value={pasteBox}
                  onChange={(e) => setPasteBox(e.target.value)}
                  placeholder="1. paste the host's invite code"
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                />
                <button
                  onClick={() => actionsRef.current?.acceptOffer(pasteBox)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  2. Generate reply code
                </button>
                <textarea
                  readOnly
                  value={answerCode}
                  placeholder="reply code appears here — send it back to the host"
                  className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what
                if two people, in two places, could conduct ONE of Karel&apos;s
                real recordings together — each shaping a different voice of the
                same take, so the mix is a shared gesture?
              </p>
              <p>
                <span className="text-foreground">One take, two voices.</span> A
                single decoded buffer feeds two source nodes started at the same
                synced instant. A Linkwitz-Riley-style crossover (two cascaded
                Butterworth filters at {XOVER} Hz per branch) splits it into a
                LOW voice and a HIGH voice. The host&apos;s cursor shapes the low
                voice; the guest&apos;s shapes the high — x sweeps a colour
                filter and stereo pan, y sets gain and a gentle ±2.5% playback
                lean.
              </p>
              <p>
                <span className="text-foreground">Shared clock.</span> peerSync
                runs an NTP-style ping/pong so <code>now()</code> reads the same
                millisecond on both peers. The host anchors playback to a synced
                instant S from buffer offset O; both peers schedule from{" "}
                <code>ctx.currentTime + (S − now())/1000</code>, so the take
                starts sample-close. The host re-broadcasts its position every
                couple of seconds so a late guest catches up mid-piece
                (RTCP-style re-anchoring against drift).
              </p>
              <p>
                <span className="text-foreground">Three transports, one API.</span>{" "}
                Two same-browser tabs sync instantly over BroadcastChannel; two
                remote machines use a real WebRTC data channel (copy-paste SDP,
                no server); and a lone visitor gets a solo ghost partner that
                breathes the unclaimed voice so the full duet is always audible.
              </p>
              <p>
                <span className="text-foreground">References.</span> the
                latency-tolerance findings of networked music performance
                research; the RTCDataChannel + NTP-style clock-offset pattern
                that is the 2026 browser consensus for collaborative audio; and
                RTCP-style periodic re-anchoring to hold two clocks together.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: multi-user peer cursors (WebRTC/BroadcastChannel) ·
                output: WebGL2 dual-ribbon · technique: peer clock-sync +
                dual-voice crossover of one take · palette: cold/achromatic
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
