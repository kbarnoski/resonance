"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15008 · "Sympathy of clocks" — Karel's catalog as a ROOM WITH NO CONDUCTOR.
//
// Each present listener (each browser tab, same origin) is ONE voice. A voice
// loops a short phrase of one of Karel's REAL recordings and carries a Kuramoto
// phase-oscillator: a phase θ and a natural frequency ω. Nobody holds a clock.
// Instead every voice weakly pulls toward the group's mean phase —
//
//     dθ_i/dt = ω_i + (K/N) · Σ_j sin(θ_j − θ_i)
//
// — so over ~15–40s the independently-drifting loops ENTRAIN and lock into a
// round: fireflies flashing in unison (Kuramoto 1975; Huygens' 1665 "sympathy
// of clocks"; Strogatz, *Sync*, 2003). Each voice retriggers its phrase on its
// own phase-zero crossing, so the audible loop period IS the oscillator period —
// coupling shifts WHEN a voice speaks, never its pitch.
//
// A solo tab is never empty: it seeds 2–3 GHOST voices with slightly detuned
// natural frequencies so the emergent-sync payoff is fully visible and audible
// alone. As real peer tabs arrive over BroadcastChannel, the ghosts yield and
// retire one by one. Drag on the field to NUDGE your own phase and watch the
// round scatter, then re-form.
//
// INPUT  multi-tab co-presence (BroadcastChannel) + catalog playback + pointer nudge
// OUTPUT raw WebGL2 (hand-written GLSL, no three.js, no Canvas2D)
// AUDIO  100% Karel's real catalog buffers — ZERO oscillators / ZERO synthesis
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
} from "../_shared/trackAnalysis";
import { PrototypeNav } from "../_shared/prototype-nav";

const TAU = Math.PI * 2;
const CHANNEL = "dream-15008-sympathy";
const MAX_VOICES = 12; // shader uniform-array bound
const K_COUPLING = 1.45; // Kuramoto coupling strength
const PEER_TIMEOUT = 2500; // ms since last heartbeat → peer considered gone
const BROADCAST_MS = 120; // heartbeat cadence
const BASE_VOICE_GAIN = 0.5; // per-voice bus level (safeMaster tames peaks)
const GHOST_LEVEL = 0.85; // ghost voices sit a touch under the "you" voice

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// stable 32-bit string hash → used for per-tab hue/position so tabs don't overlap
function computeHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296; // 0..1
}

// HSL → linear-ish RGB (0..1). We constrain hue to a COOL band before calling.
function computeHslRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// Cool ramp only: green(135) → teal(170) → cyan(190) → blue(235). NO warm hues.
function computeCoolHue(t: number): number {
  return 135 + clamp(t, 0, 1) * 100;
}

interface Voice {
  id: string;
  kind: "local" | "ghost";
  theta: number;
  omega: number; // natural angular frequency (rad/s)
  rate: number; // last integrated dθ/dt
  periodEst: number; // seconds, current loop period
  hue: number;
  rgb: [number, number, number];
  trackId: string;
  trackTitle: string;
  buffer: AudioBuffer | null;
  phraseStart: number; // seconds into the buffer
  phraseMax: number; // seconds, max slice length
  detuneCents: number;
  gain: GainNode | null;
  levelTarget: number;
  levelCur: number;
  nextFire: number; // θ threshold for the next retrigger
  amp: number; // visual flash energy, decays each frame
  pos: [number, number]; // layout on the room's unit disc
  active: boolean;
}

interface Peer {
  id: string;
  theta: number;
  omega: number;
  rgb: [number, number, number];
  trackTitle: string;
  pos: [number, number];
  lastSeen: number;
}

interface VoiceMsg {
  type: "voice" | "bye";
  peer: string;
  theta: number;
  omega: number;
  rgb: [number, number, number];
  title: string;
  pos: [number, number];
}

interface ReadoutVoice {
  title: string;
  rgb: [number, number, number];
  tag: string;
}

const GLSL_VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const GLSL_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform vec2 uPos[${MAX_VOICES}];
uniform vec3 uCol[${MAX_VOICES}];
uniform float uPhase[${MAX_VOICES}];
uniform float uAmp[${MAX_VOICES}];
uniform float uOrder;      // order parameter r, 0..1
uniform float uMeanPhase;  // mean-field phase
uniform float uAudio;      // master loudness 0..1

// distance from point p to the segment a→b
float distSeg(vec2 p, vec2 a, vec2 b){
  vec2 ab = b - a; vec2 ap = p - a;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(ap - ab * t);
}

void main(){
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // near-black cool ground + faint drifting nebula
  vec3 col = vec3(0.008, 0.014, 0.022);
  float neb = 0.5 + 0.5 * sin(p.x * 2.1 + uTime * 0.05) * cos(p.y * 1.7 - uTime * 0.04);
  col += vec3(0.010, 0.020, 0.030) * neb;

  // filaments of the tightening round: each voice → room centre, revealed by lock
  for (int i = 0; i < ${MAX_VOICES}; i++){
    if (i >= uCount) break;
    float dl = distSeg(p, uPos[i], vec2(0.0));
    float fil = exp(-dl * dl * 220.0) * uOrder * (0.5 + 0.5 * uAmp[i]);
    col += uCol[i] * fil * 0.10;
  }

  // the voices themselves: firefly nodes flashing on their phase
  for (int i = 0; i < ${MAX_VOICES}; i++){
    if (i >= uCount) break;
    vec2 d = p - uPos[i];
    float r2 = dot(d, d);
    float flash = uAmp[i];
    float pulse = 0.5 + 0.5 * cos(uPhase[i]);
    float core = exp(-r2 * 46.0);
    float halo = exp(-r2 * 6.5);
    float b = core * (0.55 + flash * 1.9) + halo * (0.05 + flash * 0.55) * (0.4 + 0.6 * pulse);
    col += uCol[i] * b;
    float rr = sqrt(r2);
    float ring = exp(-pow(rr - 0.11, 2.0) * 300.0) * flash * 0.5;
    col += uCol[i] * ring;
  }

  // unison wash: at lock the whole room breathes on the mean phase
  float unison = uOrder * pow(0.5 + 0.5 * cos(uMeanPhase), 4.0);
  col += vec3(0.55, 0.85, 1.0) * unison * 0.16;

  // gentle cool bloom from the actual mix loudness
  col += vec3(0.02, 0.05, 0.07) * uAudio;

  // vignette + tone map
  float vign = smoothstep(1.7, 0.25, length(p));
  col *= vign;
  col = col / (1.0 + col);
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.85)), 1.0);
}`;

export default function Page() {
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // UI-visible readouts (updated at a throttled cadence, not every frame)
  const [voiceCount, setVoiceCount] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [orderR, setOrderR] = useState(0);
  const [locked, setLocked] = useState(false);
  const [readout, setReadout] = useState<ReadoutVoice[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const startEngine = useCallback(() => {
    setEntered(true);
    setLoading(true);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let cancelled = false;
    let ctx: AudioContext | null = null;
    let master: ReturnType<typeof createSafeMaster> | null = null;
    let bc: BroadcastChannel | null = null;
    let gl: WebGL2RenderingContext | null = null;
    let glProg: WebGLProgram | null = null;
    let glVao: WebGLVertexArrayObject | null = null;
    let loseCtx: WEBGL_lose_context | null = null;
    const glLoc: Record<string, WebGLUniformLocation | null> = {};

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduce ? 0.55 : 1;

    const peerId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `p${Math.floor(Math.random() * 1e9).toString(36)}`;

    const localVoices: Voice[] = [];
    const peers = new Map<string, Peer>();
    const analyser = () => master?.analyser ?? null;
    const audioBins = new Uint8Array(1024);

    // ── WebGL2 init ──────────────────────────────────────────────────────
    function runInitGl(): boolean {
      try {
        const context = canvas!.getContext("webgl2", { antialias: false });
        if (!context) return false;
        const compile = (type: number, src: string) => {
          const sh = context.createShader(type);
          if (!sh) return null;
          context.shaderSource(sh, src);
          context.compileShader(sh);
          if (!context.getShaderParameter(sh, context.COMPILE_STATUS)) {
            context.deleteShader(sh);
            return null;
          }
          return sh;
        };
        const vs = compile(context.VERTEX_SHADER, GLSL_VERT);
        const fs = compile(context.FRAGMENT_SHADER, GLSL_FRAG);
        if (!vs || !fs) return false;
        const prog = context.createProgram();
        if (!prog) return false;
        context.attachShader(prog, vs);
        context.attachShader(prog, fs);
        context.linkProgram(prog);
        if (!context.getProgramParameter(prog, context.LINK_STATUS)) return false;
        const vao = context.createVertexArray();
        context.bindVertexArray(vao);
        const buf = context.createBuffer();
        context.bindBuffer(context.ARRAY_BUFFER, buf);
        context.bufferData(
          context.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          context.STATIC_DRAW,
        );
        const loc = context.getAttribLocation(prog, "a");
        context.enableVertexAttribArray(loc);
        context.vertexAttribPointer(loc, 2, context.FLOAT, false, 0, 0);
        for (const name of [
          "uRes", "uTime", "uCount", "uPos", "uCol",
          "uPhase", "uAmp", "uOrder", "uMeanPhase", "uAudio",
        ]) {
          glLoc[name] = context.getUniformLocation(prog, name);
        }
        loseCtx = context.getExtension("WEBGL_lose_context");
        gl = context;
        glProg = prog;
        glVao = vao;
        return true;
      } catch {
        return false;
      }
    }

    function applyResize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(canvas!.clientWidth * dpr);
      const h = Math.floor(canvas!.clientHeight * dpr);
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
    }

    // ── audio retrigger: play one phrase slice at the phase-zero crossing ──
    function runFire(v: Voice) {
      if (!ctx || !v.buffer || !v.gain || !v.active) return;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = v.buffer;
      src.detune.value = v.detuneCents;
      const dur = clamp(v.periodEst, 2.0, v.phraseMax);
      const env = ctx.createGain();
      env.gain.value = 0;
      src.connect(env);
      env.connect(v.gain);
      const t0 = now + 0.02;
      const atk = 0.06;
      const rel = Math.min(0.35, dur * 0.35);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(1, t0 + atk);
      env.gain.setValueAtTime(1, Math.max(t0 + atk, t0 + dur - rel));
      env.gain.linearRampToValueAtTime(0, t0 + dur);
      try {
        src.start(t0, v.phraseStart, dur + 0.08);
        src.stop(t0 + dur + 0.12);
      } catch {
        /* buffer/timing race on teardown */
      }
      v.amp = 1;
    }

    // ── build one voice (audio loaded lazily) ──────────────────────────────
    function buildVoice(
      kind: "local" | "ghost",
      slot: number,
      hue: number,
      period: number,
      track: { id: string; title: string },
      detuneCents: number,
    ): Voice {
      const ang =
        kind === "local"
          ? computeHash(peerId) * TAU
          : computeHash(peerId + ":g" + slot) * TAU + 0.7 + slot * 1.9;
      const rad = 0.42 + ((slot * 0.13) % 0.24);
      return {
        id: kind === "local" ? peerId : `${peerId}:g${slot}`,
        kind,
        theta: computeHash(track.id + slot) * TAU,
        omega: TAU / period,
        rate: TAU / period,
        periodEst: period,
        hue,
        rgb: computeHslRgb(hue, 0.72, 0.6),
        trackId: track.id,
        trackTitle: track.title,
        buffer: null,
        phraseStart: 0.2,
        phraseMax: Math.min(6.5, period + 0.8),
        detuneCents,
        gain: null,
        levelTarget: kind === "local" ? 1 : GHOST_LEVEL,
        levelCur: 0,
        nextFire: 0,
        amp: 0,
        pos: [Math.cos(ang) * rad, Math.sin(ang) * rad],
        active: true,
      };
    }

    async function loadVoiceAudio(v: Voice) {
      if (!ctx || !master) return;
      const { buffer } = await loadRealTrackBuffer(ctx, v.trackId);
      if (cancelled) return;
      v.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master.input);
      v.gain = g;

      // choose a musical phrase window + a consonant detune from the analysis
      let start = buffer.duration * 0.22;
      const analysis = await loadTrackAnalysis(v.trackId).catch(() => null);
      if (analysis && analysis.notes.length > 8) {
        const target = analysis.notes.find((n) => n.time > buffer.duration * 0.18);
        if (target) start = target.time;
      }
      // bend ghost voices toward the track's third so the round stays consonant
      if (analysis && analysis.chords.length && v.kind === "ghost") {
        const sym = analysis.chords[0].chord;
        const root = chordRoot(sym);
        if (root !== null) v.detuneCents += chordIsMinor(sym) ? 300 : 400;
      }
      v.phraseStart = clamp(
        start,
        0,
        Math.max(0, buffer.duration - v.phraseMax - 0.2),
      );
    }

    // ── broadcast + receive ────────────────────────────────────────────────
    function runBroadcast() {
      const v = localVoices[0];
      if (!bc || !v) return;
      const msg: VoiceMsg = {
        type: "voice",
        peer: peerId,
        theta: v.theta,
        omega: v.omega,
        rgb: v.rgb,
        title: v.trackTitle,
        pos: v.pos,
      };
      try {
        bc.postMessage(msg);
      } catch {
        /* channel closing */
      }
    }

    // throttled React readout push
    let lastPush = 0;
    let lastLocked = false;
    function runPushReadout(now: number, r: number, active: Voice[]) {
      if (now - lastPush < 180) return;
      lastPush = now;
      const list: ReadoutVoice[] = active.map((v) => ({
        title: v.trackTitle,
        rgb: v.rgb,
        tag: v.kind === "local" ? "you" : "ghost",
      }));
      for (const pr of peers.values()) {
        list.push({ title: pr.trackTitle, rgb: pr.rgb, tag: "peer" });
      }
      setReadout(list.slice(0, MAX_VOICES));
      setVoiceCount(active.length + peers.size);
      setPeerCount(peers.size);
      setOrderR(r);
      const nowLocked = r > 0.9;
      if (nowLocked !== lastLocked) {
        lastLocked = nowLocked;
        setLocked(nowLocked);
      }
    }

    // reusable typed-array scratch for the shader
    const uPos = new Float32Array(MAX_VOICES * 2);
    const uCol = new Float32Array(MAX_VOICES * 3);
    const uPhase = new Float32Array(MAX_VOICES);
    const uAmp = new Float32Array(MAX_VOICES);

    function drawScene(
      count: number,
      order: number,
      meanPhase: number,
      audioLevel: number,
      time: number,
    ) {
      if (!gl || !glProg) return;
      gl.viewport(0, 0, canvas!.width, canvas!.height);
      gl.useProgram(glProg);
      gl.bindVertexArray(glVao);
      gl.uniform2f(glLoc.uRes, canvas!.width, canvas!.height);
      gl.uniform1f(glLoc.uTime, time);
      gl.uniform1i(glLoc.uCount, count);
      gl.uniform2fv(glLoc.uPos, uPos);
      gl.uniform3fv(glLoc.uCol, uCol);
      gl.uniform1fv(glLoc.uPhase, uPhase);
      gl.uniform1fv(glLoc.uAmp, uAmp);
      gl.uniform1f(glLoc.uOrder, order);
      gl.uniform1f(glLoc.uMeanPhase, meanPhase);
      gl.uniform1f(glLoc.uAudio, audioLevel);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ── pointer nudge: drag adds an impulse to the local voice's phase ─────
    let pressing = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      pressing = true;
      lastX = e.clientX;
      if (ctx && ctx.state === "suspended") void ctx.resume();
    };
    const onMove = (e: PointerEvent) => {
      if (!pressing) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const v = localVoices[0];
      if (v) v.theta += dx * 0.012;
    };
    const onUp = () => {
      pressing = false;
    };

    // ── main loop ──────────────────────────────────────────────────────────
    let last = performance.now();
    let lastBroadcast = 0;
    const t0Clock = last;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.05) * timeScale;

      // prune stale peers
      for (const [id, pr] of peers) {
        if (now - pr.lastSeen > PEER_TIMEOUT) peers.delete(id);
      }
      // advance peer phases by their own natural rate (dead reckoning between beats)
      for (const pr of peers.values()) {
        pr.theta += pr.omega * dt;
      }

      // ghosts yield as real peers arrive: keep (3 − peers) ghosts active
      const desiredGhosts = clamp(3 - peers.size, 0, 3);
      let ghostIdx = 0;
      for (const v of localVoices) {
        if (v.kind !== "ghost") continue;
        const shouldBe = ghostIdx < desiredGhosts;
        ghostIdx++;
        v.active = shouldBe;
        v.levelTarget = shouldBe ? GHOST_LEVEL : 0;
      }

      // participants = active local voices + present peers
      const active = localVoices.filter((v) => v.active);
      const phases: number[] = [];
      for (const v of localVoices) if (v.active) phases.push(v.theta);
      for (const pr of peers.values()) phases.push(pr.theta);
      const N = Math.max(1, phases.length);

      // order parameter r + mean-field phase
      let sx = 0,
        sy = 0;
      for (const th of phases) {
        sx += Math.cos(th);
        sy += Math.sin(th);
      }
      const order = Math.hypot(sx, sy) / N;
      const meanPhase = Math.atan2(sy, sx);

      // integrate each local voice under Kuramoto coupling toward the whole room
      for (const v of localVoices) {
        if (!v.active && v.levelCur < 0.02) {
          // silent ghost: keep smoothing its gain to zero, skip firing
          v.levelCur += (0 - v.levelCur) * Math.min(1, dt * 2.2);
          if (v.gain) v.gain.gain.value = 0;
          continue;
        }
        let coup = 0;
        for (const th of phases) coup += Math.sin(th - v.theta);
        const rate = v.omega + (K_COUPLING / N) * coup;
        v.rate = rate;
        v.theta += rate * dt;
        v.periodEst = TAU / Math.max(0.25, rate);

        // retrigger on each phase-zero crossing (skip run-away catch-up)
        if (v.theta - v.nextFire > TAU * 3) v.nextFire = v.theta;
        while (v.theta >= v.nextFire) {
          runFire(v);
          v.nextFire += TAU;
        }

        v.amp *= Math.exp(-dt * 2.4);
        v.levelCur += (v.levelTarget - v.levelCur) * Math.min(1, dt * 1.8);
        if (v.gain) v.gain.gain.value = v.levelCur * BASE_VOICE_GAIN;
      }

      // audio loudness for the global bloom
      let audioLevel = 0;
      const an = analyser();
      if (an) {
        an.getByteFrequencyData(audioBins);
        let sum = 0;
        for (let i = 0; i < 64; i++) sum += audioBins[i];
        audioLevel = clamp(sum / 64 / 180, 0, 1);
      }

      // pack shader arrays: active local voices, then peers, capped at MAX_VOICES
      let count = 0;
      const pushNode = (
        pos: [number, number],
        rgb: [number, number, number],
        phase: number,
        amp: number,
      ) => {
        if (count >= MAX_VOICES) return;
        uPos[count * 2] = pos[0];
        uPos[count * 2 + 1] = pos[1];
        uCol[count * 3] = rgb[0];
        uCol[count * 3 + 1] = rgb[1];
        uCol[count * 3 + 2] = rgb[2];
        uPhase[count] = phase;
        uAmp[count] = amp;
        count++;
      };
      for (const v of localVoices) {
        if (!v.active) continue;
        pushNode(v.pos, v.rgb, v.theta, v.amp);
      }
      for (const pr of peers.values()) {
        // peers carry no local amp; synthesize a firefly flash near their phase-zero
        const pFlash = Math.pow(0.5 + 0.5 * Math.cos(pr.theta), 8);
        pushNode(pr.pos, pr.rgb, pr.theta, pFlash);
      }

      drawScene(count, order, meanPhase, audioLevel, (now - t0Clock) / 1000);

      if (now - lastBroadcast > BROADCAST_MS) {
        lastBroadcast = now;
        runBroadcast();
      }
      runPushReadout(now, order, active);
    }

    // ── boot ────────────────────────────────────────────────────────────────
    (async () => {
      applyResize();
      if (!runInitGl()) {
        setError(
          "WebGL2 is unavailable in this browser, so the room can't be drawn.",
        );
        setLoading(false);
        return;
      }

      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        master = createSafeMaster(ctx);

        // pick distinct tracks for the "you" voice + up to 3 ghosts
        const startIdx = Math.floor(computeHash(peerId) * REAL_TRACKS.length);
        const pick = (n: number) =>
          REAL_TRACKS[(startIdx + n) % REAL_TRACKS.length];
        const detunes = [0, 700, -500, 1200]; // cents: unison, fifth, fourth-down, octave
        const periods = [5.0, 4.3, 5.7, 6.3]; // slightly detuned natural loop periods

        localVoices.push(
          buildVoice("local", 0, computeCoolHue(0.55), periods[0], pick(0), detunes[0]),
        );
        for (let i = 1; i <= 3; i++) {
          localVoices.push(
            buildVoice(
              "ghost",
              i,
              computeCoolHue([0.05, 0.9, 0.35][i - 1]),
              periods[i],
              pick(i),
              detunes[i],
            ),
          );
        }

        // load all voice buffers; require at least the "you" voice to succeed
        const results = await Promise.allSettled(
          localVoices.map((v) => loadVoiceAudio(v)),
        );
        if (cancelled) return;
        if (results[0].status === "rejected" || !localVoices[0].buffer) {
          throw new Error("could not load Karel's audio");
        }
        // drop ghosts whose audio failed
        for (let i = localVoices.length - 1; i >= 1; i--) {
          if (!localVoices[i].buffer) localVoices.splice(i, 1);
        }

        // fire each voice once so the room speaks immediately, then space by a period
        for (const v of localVoices) {
          v.nextFire = TAU;
          runFire(v);
        }

        bc = new BroadcastChannel(CHANNEL);
        bc.onmessage = (e: MessageEvent<VoiceMsg>) => {
          const m = e.data;
          if (!m || m.peer === peerId) return;
          if (m.type === "bye") {
            peers.delete(m.peer);
            return;
          }
          const ex = peers.get(m.peer);
          peers.set(m.peer, {
            id: m.peer,
            theta: m.theta,
            omega: m.omega,
            rgb: m.rgb,
            trackTitle: m.title,
            pos: ex ? ex.pos : m.pos,
            lastSeen: performance.now(),
          });
        };

        setLoading(false);
        window.addEventListener("resize", applyResize);
        canvas.addEventListener("pointerdown", onDown);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } catch {
        setError(
          "Karel's audio could not be loaded right now — the room stays silent.",
        );
        setLoading(false);
      }
    })();

    // ── teardown ──────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", applyResize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        bc?.postMessage({ type: "bye", peer: peerId } as VoiceMsg);
      } catch {
        /* channel already gone */
      }
      bc?.close();
      for (const v of localVoices) {
        if (v.gain) {
          try {
            v.gain.disconnect();
          } catch {
            /* closing */
          }
        }
      }
      master?.disconnect();
      if (ctx && ctx.state !== "closed") void ctx.close();
      if (gl && glProg) {
        gl.deleteProgram(glProg);
        if (glVao) gl.deleteVertexArray(glVao);
      }
      loseCtx?.loseContext();
    };
  }, [entered]);

  const rPct = Math.round(orderR * 100);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* pre-enter hero */}
      {!entered && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background/85 px-6 text-center backdrop-blur-sm">
          <div className="max-w-xl">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              15008 · sympathy of clocks
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              A room with no conductor
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Each listener is a voice looping a phrase of Karel&apos;s real
              recordings. No clock is imposed — the voices weakly pull toward
              each other and, over half a minute, entrain into a phase-locked
              round. Open a second tab to add your voice.
            </p>
          </div>
          <button
            type="button"
            onClick={startEngine}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the room
          </button>
          <p className="text-sm text-muted-foreground">
            Alone, ghost voices join so the sync is audible; drag to nudge your phase.
          </p>
        </div>
      )}

      {/* loading / error */}
      {entered && loading && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            gathering voices…
          </span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <p className="max-w-md text-center text-base leading-relaxed text-destructive">
            {error}
          </p>
        </div>
      )}

      {/* live HUD */}
      {entered && !error && !loading && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {voiceCount} {voiceCount === 1 ? "voice" : "voices"} ·{" "}
                {peerCount} {peerCount === 1 ? "peer" : "peers"}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  order r
                </span>
                <div className="h-1.5 w-36 overflow-hidden rounded-md bg-muted">
                  <div
                    className="h-full origin-left rounded-md bg-primary transition-transform duration-150"
                    style={{ transform: `scaleX(${clamp(orderR, 0, 1)})` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {(orderR).toFixed(2)}
                </span>
                {locked && (
                  <span className="text-sm font-medium text-primary">locked</span>
                )}
              </div>
            </div>
            <div className="pointer-events-auto">
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>

          {/* per-voice legend */}
          <div className="pointer-events-none absolute bottom-16 left-4 z-10 flex max-w-[70vw] flex-col gap-1.5">
            {readout.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: `rgb(${Math.round(v.rgb[0] * 255)}, ${Math.round(
                      v.rgb[1] * 255,
                    )}, ${Math.round(v.rgb[2] * 255)})`,
                  }}
                />
                <span className="truncate text-sm text-muted-foreground">
                  {v.title}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {v.tag}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Sympathy of clocks
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if
                Karel&apos;s catalog became a room with no conductor — where each
                present listener is a voice, and the voices find each other and
                lock into a round through decentralized mutual influence, not an
                imposed clock?
              </p>
              <p>
                <span className="text-foreground">How the sync works.</span> Each
                voice carries a Kuramoto phase-oscillator — a phase θ and a
                natural frequency ω. Every frame each voice adjusts toward the
                whole room:{" "}
                <span className="text-foreground">
                  dθ/dt = ω + (K/N)·Σ sin(θⱼ − θᵢ)
                </span>
                . Nobody is master; the pull is symmetric and weak, so the
                loops drift, hunt, and gradually entrain. The order parameter{" "}
                <span className="text-foreground">r = |mean(e^{"{iθ}"})|</span>{" "}
                climbs from ~0 (chaos) toward 1 (a phase-locked round). Currently{" "}
                <span className="text-foreground">{rPct}%</span>.
              </p>
              <p>
                <span className="text-foreground">The audio is all real.</span>{" "}
                Every voice loops a phrase of one of Karel&apos;s actual
                recordings, retriggered on its own phase-zero crossing — so the
                loop period is the oscillator period. Coupling shifts{" "}
                <span className="text-foreground">when</span> a voice speaks, not
                its pitch. No synthesis, no oscillators: 100% catalog audio.
              </p>
              <p>
                <span className="text-foreground">A room, not a mixer.</span> Open
                a second tab (same origin) to add a voice; tabs share only phase,
                hue and track over a BroadcastChannel, and their sounds sum in
                your speakers. Alone, 2–3 ghost voices with detuned frequencies
                make the entrainment audible; they yield and retire as real peers
                arrive. Drag anywhere to nudge your phase and watch the round
                scatter, then re-form.
              </p>
              <p className="text-xs">
                After Kuramoto (1975); Huygens&apos; &ldquo;sympathy of
                clocks&rdquo; (1665); Strogatz, <em>Sync</em> (2003). INPUT ·
                multi-tab co-presence + catalog playback + pointer nudge. OUTPUT ·
                raw WebGL2 / hand-written GLSL. TECHNIQUE · Kuramoto decentralized
                phase-sync. PALETTE · near-black + a constrained cool ramp.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15008-sympathy"]} />
    </main>
  );
}
