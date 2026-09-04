"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16800-attune — a room for shared listening, where presence is the instrument.
//
// Two people (or two browser tabs) join ONE synchronized session. Karel's single
// real piano take plays in sync on both. Each participant is a soft luminous
// presence in a shared, candlelit WebGL2 field. There is NO conducting, NO
// mixing, NO note-playing — the piece is about SHARED ATTENTION.
//
// A single scalar, `attunement`, rises only when both presences hold near each
// other AND move slowly and gently (attuning). As it rises the warm field blooms
// — deeper, warmer, more coherent (laminar) — and a soft honey bridge forms
// between the two glows. Drift apart, or move frantically, and it relaxes. The
// music is identical for both; the ART is the co-presence.
//
// Transport: _shared/peerSync (BroadcastChannel for two same-browser tabs, a real
// WebRTC data channel for remote peers, an NTP-style shared clock over both) so
// the take starts sample-close on each machine. Solo fallback: a slow breathing
// ambient presence you can attune to, so the bloom is always demoable alone.
//
// References: Pauline Oliveros — Deep Listening (listening together as a
// discipline; this is a room built for that practice). "Co-Sound: an interactive
// medium with spatial synchronization" (2026) — co-presence + spatial sync.
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
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";

// ── constants ────────────────────────────────────────────────────────────────

const ROOM = "attune";
const POS_SEND_MS = 55; // ~18 Hz presence broadcast
const PROX_THRESHOLD = 0.42; // uv distance at which nearness fades to zero
const SPEED_LO = 0.04; // uv/sec: below this, motion reads as "gentle"
const SPEED_HI = 0.5; // uv/sec: above this, motion reads as "frantic"

interface Vec2 {
  x: number;
  y: number;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function makeShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makeProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = makeShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = makeShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// ── shaders ──────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;   // fullscreen triangle → 0..1, y up
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// One fullscreen fragment pass: a warm, candlelit generative light field. Two
// soft presence glows; a honey bridge and shared halo that only bloom as the
// shared attunement scalar rises; domain-warped fbm that grows more laminar
// (coherent) with attunement and shimmery with harmonic tension.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uSelf;    // presence, uv 0..1 (y up)
uniform vec2  uOther;
uniform float uAtt;     // shared attunement 0..1
uniform float uLevel;   // overall audio level 0..1
uniform float uLow;     // low-band audio energy 0..1
uniform float uWarm;    // 0 amber .. 1 rose/honey (chord-driven hue nudge)
uniform float uMinor;   // 0..1 harmonic tension
uniform float uSelfA;   // self presence brightness 0..1
uniform float uOtherA;  // other presence brightness 0..1

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0;
  float a = 0.5;
  for(int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return s;
}
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

void main(){
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 p = vUv * aspect;
  vec2 s = uSelf * aspect;
  vec2 o = uOther * aspect;
  float t = uTime;

  // Warm family only — deep umber ground, amber → honey → rose.
  vec3 ground = vec3(0.045, 0.028, 0.020);
  vec3 amber  = vec3(0.95, 0.44, 0.16);
  vec3 honey  = vec3(1.00, 0.66, 0.30);
  vec3 rose   = vec3(1.00, 0.52, 0.40);
  vec3 warmA  = mix(amber, honey, clamp(uWarm, 0.0, 1.0));
  vec3 warmB  = mix(honey, rose, clamp(uMinor * 0.7 + uWarm * 0.3, 0.0, 1.0));

  // Domain-warped flow. Turbulence falls as attunement rises → more laminar.
  float turb = mix(0.9, 0.28, uAtt);
  vec2 q = vec2(
    fbm(p * 1.6 + vec2(0.0, t * 0.05)),
    fbm(p * 1.6 + vec2(3.1, -t * 0.04))
  );
  float flow = fbm(p * 2.2 + turb * q + vec2(t * 0.03, -t * 0.02));
  float shim = uMinor * 0.12 * sin(fbm(p * 6.0 - t * 0.35) * 6.2831 + t * 1.8);

  float drift = 0.5 + 0.5 * sin(t * 0.08);   // slow luminance drift, no strobe

  // Base field: warm ground, deepening only as the room attunes.
  vec3 col = ground * 1.4;
  col += warmA * (flow * (0.10 + uAtt * 0.16) + shim) * (0.5 + 0.5 * uAtt);

  // Two soft candlelit presence glows (exp falloff, gentle breath + audio).
  float rS = 0.16 + uLevel * 0.05 + 0.02 * sin(t * 0.9);
  float rO = 0.16 + uLevel * 0.05 + 0.02 * sin(t * 0.9 + 1.7);
  float dS = length(p - s);
  float dO = length(p - o);
  float gS = exp(-(dS * dS) / (rS * rS)) * uSelfA;
  float gO = exp(-(dO * dO) / (rO * rO)) * uOtherA;
  vec3 coreS = mix(warmA, honey, uAtt);
  vec3 coreO = mix(warmB, honey, uAtt);
  col += coreS * gS * (0.9 + uLow * 0.6);
  col += coreO * gO * (0.9 + uLow * 0.6);

  // Attunement bridge: a honey filament between the two presences.
  float dSeg = sdSeg(p, s, o);
  float bridgeW = mix(0.02, 0.13, uAtt);
  float bridge = exp(-(dSeg * dSeg) / (bridgeW * bridgeW)) * (0.6 + 0.5 * flow);
  col += honey * bridge * uAtt * 1.25;

  // Shared bloom halo at the midpoint, grows with attunement.
  vec2 mid = (s + o) * 0.5;
  float dM = length(p - mid);
  float halo = exp(-(dM * dM) / (0.5 * 0.5));
  col += warmA * halo * uAtt * (0.10 + 0.10 * drift);

  // Intimate vignette + slow global drift.
  float vig = smoothstep(0.95, 0.28, length(vUv - 0.5));
  col *= mix(0.72, 1.0, vig);
  col *= 0.94 + 0.06 * drift;

  // Soft filmic-ish tone map, keep it warm.
  col = col / (col + vec3(0.6));
  col = pow(col, vec3(0.85));

  frag = vec4(col, 1.0);
}`;

// ── component ────────────────────────────────────────────────────────────────

export default function AttunePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state (display only — the engine lives in refs to avoid render churn)
  const [entered, setEntered] = useState(false);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [backend, setBackend] = useState("solo");
  const [peerCount, setPeerCount] = useState(0);
  const [clock, setClock] = useState<PeerClockInfo>({ offsetMs: 0, rttMs: 0 });
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [trackId, setTrackId] = useState(COLLECTIONS[0].tracks[0].id);
  const [trackTitle, setTrackTitle] = useState(COLLECTIONS[0].tracks[0].title);
  const [keyInfo, setKeyInfo] = useState<string | null>(null);
  const [attView, setAttView] = useState(0); // throttled mirror for the meter
  // WebRTC copy-paste signaling
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [hostPaste, setHostPaste] = useState("");
  const [guestPaste, setGuestPaste] = useState("");

  // Engine refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const roomFilterRef = useRef<BiquadFilterNode | null>(null);
  const roomGainRef = useRef<GainNode | null>(null);
  const syncRef = useRef<PeerSync | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startInfoRef = useRef<AnchorInfo | null>(null);
  const bufDurRef = useRef(0);
  const enteredRef = useRef(false);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const currentTrackRef = useRef(trackId);
  const analysisRef = useRef<TrackAnalysis | null>(null);

  // Presence + attunement engine (screen-normalized, y DOWN; converted to uv on draw)
  const selfTargetRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSmoothRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfPrevRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherTargetRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherSmoothRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const otherPrevRef = useRef<Vec2>({ x: 0.5, y: 0.5 });
  const selfSpeedRef = useRef(0);
  const otherSpeedRef = useRef(0);
  const attRef = useRef(0);
  const warmRef = useRef(0.5);
  const minorRef = useRef(0);
  const lastSendRef = useRef(0);

  // Actions wired up inside the mount effect, invoked from JSX handlers.
  const actionsRef = useRef<{
    enter: () => void;
    reanchor: () => void;
    createOffer: () => void;
    acceptAnswer: (code: string) => void;
    acceptOffer: (code: string) => void;
  } | null>(null);

  useEffect(() => {
    currentTrackRef.current = trackId;
  }, [trackId]);

  // Load analysis for the current track: header chip + chord-driven hue. Degrade
  // quietly to a neutral warm state if the track has no public analysis.
  useEffect(() => {
    let alive = true;
    setKeyInfo(null);
    analysisRef.current = null;
    setNotice(null);
    loadTrackAnalysis(trackId)
      .then((a: TrackAnalysis | null) => {
        if (!alive) return;
        if (!a || a.chords.length === 0) {
          setNotice(
            "No chord analysis for this take — the field drifts on a neutral warm state.",
          );
          return;
        }
        analysisRef.current = a;
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
    const refresh = () => {
      const s = syncRef.current;
      if (!s) return;
      setBackend(s.getBackend());
      setPeerCount(s.peers().length);
    };

    const sync = createPeerSync({
      room: ROOM,
      onStatus: (st) => {
        setStatus(st);
        refresh();
      },
      onPeers: () => refresh(),
      onClock: (info) => setClock(info),
      onMessage: (payload) => onPeerMessage(payload),
    });
    syncRef.current = sync;
    // Zero-click two-tab review path: same-browser tabs sync instantly.
    sync.startLocal();
    refresh();

    function onPeerMessage(payload: unknown): void {
      if (!isRecord(payload)) return;
      const t = payload.t;
      if (t === "pos") {
        const { x, y } = payload;
        if (typeof x === "number" && typeof y === "number") {
          otherTargetRef.current = { x: clamp01(x), y: clamp01(y) };
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
      if (cached) {
        bufDurRef.current = cached.duration;
        return cached;
      }
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        buffersRef.current.set(id, buffer);
        bufDurRef.current = buffer.duration;
        if (id === currentTrackRef.current) setTrackTitle(title);
        return buffer;
      } catch {
        setError(
          "Could not load Karel's recording. Check the connection and re-enter.",
        );
        return null;
      }
    }

    function stopSource(): void {
      const node = srcRef.current;
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
        srcRef.current = null;
      }
    }

    // The ONE audible path: source → room filter/gain (a single shared "room"
    // that opens as attunement rises) → safe master. No per-user mixing.
    async function startPlayback(S: number, O: number, id: string): Promise<void> {
      const ctx = ctxRef.current;
      const filter = roomFilterRef.current;
      const s = syncRef.current;
      if (!ctx || !filter || !s || startingRef.current) return;
      startingRef.current = true;
      try {
        const buf = await ensureTrack(ctx, id);
        if (!buf) return;
        currentTrackRef.current = id;
        stopSource();

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(filter);

        const delay = (S - s.now()) / 1000;
        let offset = O;
        let startAt = ctx.currentTime;
        if (delay > 0) startAt = ctx.currentTime + delay;
        else offset = O - delay; // late join → jump into the take
        offset = ((offset % buf.duration) + buf.duration) % buf.duration;

        src.start(startAt, offset);
        srcRef.current = src;
        startInfoRef.current = { S, O, trackId: id };
        startedRef.current = true;
        setStarted(true);
      } finally {
        startingRef.current = false;
      }
    }

    async function handleAnchor(
      S: number,
      O: number,
      id: string,
      force: boolean,
    ): Promise<void> {
      if (!enteredRef.current || !ctxRef.current) return;
      if (startedRef.current && !force) return;
      await startPlayback(S, O, id);
    }

    function startTransport(): void {
      const s = syncRef.current;
      if (!s) return;
      const id = currentTrackRef.current;
      const S = s.now() + 700;
      s.send({ t: "play", S, O: 0, trackId: id });
      void startPlayback(S, 0, id);
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

    // Host-authoritative keeper: auto-start when host, else re-anchor for drift.
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
          // Shared "room": a lowpass + trim that both peers derive identically
          // from the same two presence positions, so the music stays the same
          // for both — it just deepens as the room attunes.
          const filter = ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 2200;
          filter.Q.value = 0.7071;
          const gain = ctx.createGain();
          gain.gain.value = 0.72;
          filter.connect(gain);
          gain.connect(master.input);

          ctxRef.current = ctx;
          masterRef.current = master;
          roomFilterRef.current = filter;
          roomGainRef.current = gain;

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
            refresh();
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
            refresh();
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
            refresh();
          } catch {
            setError("That invite code could not be read.");
          }
        })();
      },
    };

    // ---- WebGL2 renderer (required; house-style notice on failure) --------
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) {
      setWebglOk(false);
      return () => {
        clearInterval(keeper);
        try {
          sync.destroy();
        } catch {
          /* already gone */
        }
        syncRef.current = null;
      };
    }

    const prog = makeProgram(gl, VERT, FRAG);
    if (!prog) {
      setWebglOk(false);
      return () => {
        clearInterval(keeper);
        try {
          sync.destroy();
        } catch {
          /* already gone */
        }
        syncRef.current = null;
      };
    }

    const aPos = gl.getAttribLocation(prog, "aPos");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uSelf = gl.getUniformLocation(prog, "uSelf");
    const uOther = gl.getUniformLocation(prog, "uOther");
    const uAtt = gl.getUniformLocation(prog, "uAtt");
    const uLevel = gl.getUniformLocation(prog, "uLevel");
    const uLow = gl.getUniformLocation(prog, "uLow");
    const uWarm = gl.getUniformLocation(prog, "uWarm");
    const uMinor = gl.getUniformLocation(prog, "uMinor");
    const uSelfA = gl.getUniformLocation(prog, "uSelfA");
    const uOtherA = gl.getUniformLocation(prog, "uOtherA");

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const freqBins = new Uint8Array(512);

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

    // Advance presence, attunement, chord hue, and audio "room" for one frame.
    function step(dt: number, tSec: number): {
      self: Vec2;
      other: Vec2;
      att: number;
      level: number;
      low: number;
      selfA: number;
      otherA: number;
    } {
      const s = syncRef.current;
      const connected = !!s && s.connected();

      // Other presence: a live peer, or a slow breathing ambient orb when solo.
      if (connected) {
        otherSmoothRef.current = {
          x: lerp(otherSmoothRef.current.x, otherTargetRef.current.x, 0.12),
          y: lerp(otherSmoothRef.current.y, otherTargetRef.current.y, 0.12),
        };
      } else {
        otherSmoothRef.current = {
          x: 0.5 + 0.18 * Math.sin(tSec * 0.11),
          y: 0.5 + 0.14 * Math.sin(tSec * 0.09 + 1.0),
        };
      }
      // Self presence: smoothed local pointer.
      selfSmoothRef.current = {
        x: lerp(selfSmoothRef.current.x, selfTargetRef.current.x, 0.18),
        y: lerp(selfSmoothRef.current.y, selfTargetRef.current.y, 0.18),
      };

      // Speeds (uv/sec), smoothed.
      const safeDt = Math.max(dt, 1e-3);
      const selfV =
        Math.hypot(
          selfSmoothRef.current.x - selfPrevRef.current.x,
          selfSmoothRef.current.y - selfPrevRef.current.y,
        ) / safeDt;
      const otherV =
        Math.hypot(
          otherSmoothRef.current.x - otherPrevRef.current.x,
          otherSmoothRef.current.y - otherPrevRef.current.y,
        ) / safeDt;
      selfSpeedRef.current = lerp(selfSpeedRef.current, selfV, 0.2);
      otherSpeedRef.current = lerp(otherSpeedRef.current, otherV, 0.2);
      selfPrevRef.current = { ...selfSmoothRef.current };
      otherPrevRef.current = { ...otherSmoothRef.current };

      // Attunement = nearness × gentleness(self) × gentleness(other). Both must
      // hold: close together AND moving slowly. Rises slowly (patience), relaxes
      // faster when broken.
      const d = Math.hypot(
        selfSmoothRef.current.x - otherSmoothRef.current.x,
        selfSmoothRef.current.y - otherSmoothRef.current.y,
      );
      const nearness = 1 - smoothstep(0, PROX_THRESHOLD, d);
      const gentleSelf = 1 - smoothstep(SPEED_LO, SPEED_HI, selfSpeedRef.current);
      const gentleOther =
        1 - smoothstep(SPEED_LO, SPEED_HI, otherSpeedRef.current);
      const target = nearness * gentleSelf * gentleOther;
      const rising = target > attRef.current;
      const rate = rising ? 0.7 : 2.2; // per second
      attRef.current = lerp(
        attRef.current,
        target,
        clamp01(rate * safeDt),
      );

      // Audio bands from the tamed master signal.
      let level = 0;
      let low = 0;
      const analyser = masterRef.current?.analyser;
      if (analyser) {
        const n = Math.min(analyser.frequencyBinCount, freqBins.length);
        analyser.getByteFrequencyData(freqBins);
        let sum = 0;
        let lo = 0;
        const loEnd = Math.min(40, n);
        for (let i = 0; i < n; i++) sum += freqBins[i];
        for (let i = 1; i < loEnd; i++) lo += freqBins[i];
        level = sum / (n * 255);
        low = lo / (loEnd * 255);
      }

      // Chord-driven warm hue nudge (kept inside the warm family) + tension.
      const analysis = analysisRef.current;
      const info = startInfoRef.current;
      if (analysis && info && s && bufDurRef.current > 0) {
        const pos =
          (((info.O + (s.now() - info.S) / 1000) % bufDurRef.current) +
            bufDurRef.current) %
          bufDurRef.current;
        let cur = analysis.chords[0];
        for (const ch of analysis.chords) {
          if (ch.time <= pos) cur = ch;
          else break;
        }
        if (cur) {
          const root = chordRoot(cur.chord);
          const warmTarget =
            root === null ? 0.5 : (pitchClassHue(root) % 60) / 60; // 0..1 within warm band
          warmRef.current = lerp(warmRef.current, warmTarget, 0.05);
          minorRef.current = lerp(
            minorRef.current,
            chordIsMinor(cur.chord) ? 1 : 0,
            0.05,
          );
        }
      }

      // Drive the shared room: lowpass opens + trim lifts as attunement rises.
      const ctx = ctxRef.current;
      const filter = roomFilterRef.current;
      const gain = roomGainRef.current;
      if (ctx && filter && gain) {
        const now = ctx.currentTime;
        filter.frequency.setTargetAtTime(2200 + attRef.current * 11800, now, 0.2);
        gain.gain.setTargetAtTime(0.72 + attRef.current * 0.26, now, 0.25);
      }

      return {
        self: selfSmoothRef.current,
        other: otherSmoothRef.current,
        att: attRef.current,
        level,
        low,
        selfA: 1,
        otherA: connected ? 1 : 0.7 + 0.15 * Math.sin(tSec * 0.5),
      };
    }

    let raf = 0;
    let prevT = performance.now();
    let uiAccum = 0;

    const frame = () => {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - prevT) / 1000);
      prevT = nowMs;
      const tSec = nowMs / 1000;

      const { w, h } = sizeCanvas();
      gl.viewport(0, 0, w, h);

      const st = step(dt, tSec);

      gl.useProgram(prog);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, tSec);
      // convert screen y-down → shader uv y-up
      gl.uniform2f(uSelf, st.self.x, 1 - st.self.y);
      gl.uniform2f(uOther, st.other.x, 1 - st.other.y);
      gl.uniform1f(uAtt, st.att);
      gl.uniform1f(uLevel, st.level);
      gl.uniform1f(uLow, st.low);
      gl.uniform1f(uWarm, warmRef.current);
      gl.uniform1f(uMinor, minorRef.current);
      gl.uniform1f(uSelfA, st.selfA);
      gl.uniform1f(uOtherA, st.otherA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      uiAccum += dt;
      if (uiAccum > 0.15) {
        uiAccum = 0;
        setAttView(st.att);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- pointer capture ---------------------------------------------------
    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = clamp01((e.clientX - rect.left) / rect.width);
      const y = clamp01((e.clientY - rect.top) / rect.height);
      selfTargetRef.current = { x, y };
      const s = syncRef.current;
      const t = performance.now();
      if (s && t - lastSendRef.current > POS_SEND_MS) {
        lastSendRef.current = t;
        s.send({ t: "pos", x, y });
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
      stopSource();
      try {
        sync.destroy();
      } catch {
        /* already gone */
      }
      try {
        gl.deleteProgram(prog);
        gl.deleteBuffer(vbo);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* context already lost */
      }
      const ctx = ctxRef.current;
      if (ctx) {
        try {
          roomFilterRef.current?.disconnect();
          roomGainRef.current?.disconnect();
        } catch {
          /* ctx closing */
        }
        masterRef.current?.disconnect();
        void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      masterRef.current = null;
      roomFilterRef.current = null;
      roomGainRef.current = null;
      syncRef.current = null;
    };
    // Mount-once engine; UI reads/writes go through refs and state setters.
  }, []);

  // ── derived UI ─────────────────────────────────────────────────────────────
  const connected = peerCount > 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base leading-relaxed text-destructive">
            This piece needs WebGL2, which isn&apos;t available in this browser.
            The shared field can&apos;t render — try a recent Chrome, Firefox, or
            Safari.
          </p>
        </div>
      )}

      {/* top-left: title + presence status */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-6">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 16800 · attune
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            A room for listening together
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Two presences, one of Karel&apos;s real piano takes playing in sync.
            No conducting, no mixing — only attention. Hold near each other and
            move slowly, and the room deepens.
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
          </div>

          {/* presence status */}
          <p className="mt-3 text-sm text-foreground">
            {connected
              ? "Someone is here with you."
              : "You're alone in the room — open a second tab, or invite someone. An ambient presence breathes with you until then."}
          </p>

          {/* attunement meter (violet = brand chrome accent) */}
          <div className="mt-2 max-w-xs">
            <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span>attunement</span>
              <span>{Math.round(attView * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.round(attView * 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>transport: {backend}</span>
            <span>·</span>
            <span>{status}</span>
            <span>·</span>
            <span>
              {connected
                ? `${peerCount} peer${peerCount > 1 ? "s" : ""}`
                : "solo (ambient presence)"}
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

      {/* error / notice */}
      {(error || notice) && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex flex-col items-center gap-2 px-4">
          {error && (
            <p className="pointer-events-auto rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && !error && (
            <p className="pointer-events-auto rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-muted-foreground">
              {notice}
            </p>
          )}
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
                Enter the room
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-3 text-sm text-foreground">
                {started
                  ? "Listening together — hold near, move slowly"
                  : "Waiting for the room…"}
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

            {entered && (
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
              Connect a remote listener
            </button>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Fastest demo: open this page in{" "}
            <span className="text-foreground">two browser tabs</span> — they sync
            instantly, and each tab is a presence. Bring the two glows close and
            move slowly to feel the room bloom. Alone works too: attune to the
            ambient presence.
          </p>

          {showRemote && (
            <div className="grid gap-4 rounded-md border border-border bg-muted/40 p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Host — invite a remote listener
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
                  placeholder="invite code appears here — send it to your listener"
                  className="h-20 resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-muted-foreground"
                />
                <input
                  value={hostPaste}
                  onChange={(e) => setHostPaste(e.target.value)}
                  placeholder="2. paste their reply code"
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                />
                <button
                  onClick={() => actionsRef.current?.acceptAnswer(hostPaste)}
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
                  value={guestPaste}
                  onChange={(e) => setGuestPaste(e.target.value)}
                  placeholder="1. paste the host's invite code"
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                />
                <button
                  onClick={() => actionsRef.current?.acceptOffer(guestPaste)}
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
                if presence itself — two people simply being here together,
                listening to the same take — were the only instrument, and the
                room deepened only when you attuned to each other?
              </p>
              <p>
                <span className="text-foreground">Co-presence, not control.</span>{" "}
                There is no conducting, no mixing, no note-playing. Karel&apos;s
                one recording plays identically for both listeners. Each person
                is a soft luminous presence in a shared warm field; the art is
                the shared attention between them.
              </p>
              <p>
                <span className="text-foreground">Attunement.</span> A single
                scalar rises only when both presences hold near each other AND
                move slowly and gently — nearness × gentleness(you) ×
                gentleness(them). It rises slowly (attuning takes patience) and
                relaxes faster when broken. As it rises the field blooms warmer
                and more laminar, a honey bridge forms between the glows, and the
                shared &ldquo;room&rdquo; opens — a lowpass and trim, derived
                identically on both sides from the same two positions, so the
                music stays the same for both and only deepens.
              </p>
              <p>
                <span className="text-foreground">Sync.</span> peerSync runs an
                NTP-style clock so <code>now()</code> reads the same millisecond
                on both peers. The host anchors playback to a synced instant S
                from offset O; both schedule from{" "}
                <code>ctx.currentTime + (S − now())/1000</code>, so the take
                starts sample-close, and the host re-broadcasts an anchor every
                ~2s so a late joiner catches up. Presence positions stream at
                ~18 Hz. Two same-browser tabs sync instantly over
                BroadcastChannel; two machines use a real WebRTC data channel
                (copy-paste SDP, no server).
              </p>
              <p>
                <span className="text-foreground">Warm field.</span> A single
                WebGL2 fragment pass: an umber near-black ground with amber /
                honey / rose-gold presence glows. Domain-warped fbm grows more
                coherent as attunement rises; the current chord (tracked by
                playback time) nudges the hue within the warm family and adds a
                gentle shimmer on tension. Slow luminance drift only — no strobe,
                no grain.
              </p>
              <p>
                <span className="text-foreground">References.</span> Pauline
                Oliveros — <em>Deep Listening</em>, the practice of listening
                together as a discipline; this is a room built for it.
                &ldquo;Co-Sound: an interactive medium with spatial
                synchronization&rdquo; (2026) — co-presence and spatial sync.
                Framed around shared attention, not virtuosity.
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                input: catalog playback + slow pointer-presence + multi-user peer
                · output: raw WebGL2 fragment field · technique: co-presence
                attunement scalar · palette: warm / candlelit / intimate
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
