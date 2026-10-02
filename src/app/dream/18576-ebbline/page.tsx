"use client";

/* ── 18576 · Ebbline ─────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if leaning your body forward and back made one of Karel's
 *  real piano recordings FLOW FORWARD or RUN BACKWARD — your torso the live
 *  performer the playback engine follows, in RATE and in TIME-DIRECTION?
 *
 *  INPUT  : MediaPipe PoseLandmarker. We read ONLY the upper-body landmarks a
 *           seated laptop webcam actually sees — shoulders + nose — and fold the
 *           forward/back PITCH of the shoulder–nose line into one signed scalar
 *           lean ∈ [-1,+1]: shoulder-line foreshortening (width grows as you come
 *           toward the lens) + the nose's drop relative to the shoulder midline.
 *           Both are measured as deviation from a slow self-calibrating neutral,
 *           so UPRIGHT → 0, lean FORWARD → +1, lean BACK → −1. We NEVER gate on
 *           hips/ankles (they are off-frame at a desk); any missing lower landmark
 *           is simply unused, never a reason to drop the frame.
 *  TECHNIQUE (the fresh lab verb): TIME-DIRECTION + VARIABLE RATE. Two synced
 *           AudioBufferSourceNodes read the SAME real take — a FORWARD buffer and
 *           a REVERSED buffer (the Float32 channel data reversed once at load).
 *           A virtual playhead integrates your signed lean velocity. lean≈0 holds
 *           a near-still shimmer (both voices barely creeping, overlapping);
 *           lean>0 crossfades equal-power to the FORWARD voice at rate 1+k·lean;
 *           lean<0 crossfades to the REVERSED voice at rate scaled by |lean|. On
 *           every direction flip both voices are re-seeded to the shared playhead
 *           so the reversal reads as the SAME music running backward, not a second
 *           track. Rate + crossfade are ramped with setTargetAtTime(…,0.12) — no
 *           zipper, no clicks.
 *  OUTPUT : an SVG "tide line" — a field of vertical filaments that STREAM LEFT as
 *           the music flows forward and reverse to stream RIGHT as it runs back;
 *           their spacing COMPRESSES with |rate| and a central waterline TILTS with
 *           lean. Every filament is driven by BOTH lean/rate AND the safeMaster
 *           analyser, so every audible change has a visible one. Garnet-smoke:
 *           deep wine-garnet (forward surge) through ash/smoke-grey (backward ebb)
 *           on near-black.
 *  POLE   : intense ↔ contemplative — forward surge vs backward ebb.
 *
 *  Inverts arXiv:2609.18999 "Variable-Rate Harmonic-Percussive Time-Scale
 *  Modification with Real-Time Playback" (Jerin et al., 2026) — whose thesis is
 *  that playback rate "must change continuously in response to a live performer."
 *  Here the TORSO is that live performer, conducting rate AND direction of Karel's
 *  real recording. See README.md.
 *
 *  Alive on load via a labelled autonomous demo drive (a slow lean sweep −1→+1)
 *  that feeds the IDENTICAL lean → rate/direction → SVG chain, so the piece
 *  breathes with no camera.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── SVG art constants (garnet-smoke palette lives ONLY inside the art) ───────
const W = 1600;
const H = 900;
const FIELD = "hsl(350 32% 4%)"; // near-black garnet field
const N_FIL = 200; // filament pool (fixed DOM, mutated per frame)
const SP_WIDE = 26; // filament spacing at near-still (stretched)
const SP_NARROW = 9.5; // filament spacing at full rate (compressed)
const TILT_MAX = 0.34; // waterline tilt (rad) at |lean|=1
const FLOW = 150; // px/s of streaming per unit rate

// ── conducting / audio constants ─────────────────────────────────────────────
const DEFAULT_TRACK = REAL_TRACKS[0].id;
const SHIMMER = 0.055; // near-still creep rate at lean≈0
const RATE_K = 1.4; // rate gained per unit |lean| (max ≈ SHIMMER + 1.4)
const FLIP_DEAD = 0.05; // lean hysteresis band for a direction flip
const BUS = 0.92; // crossfade bus ceiling
const LOST_HOLD = 0.6; // s to hold last-good lean before "lost"

type Driver = "demo" | "live";

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
  setTrack: (id: string) => void;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  lean: number;
  rate: number;
  dir: 1 | -1;
  title: string;
}

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Reverse every channel of a decoded take once, into a fresh buffer. */
function makeReversedBuffer(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const rev = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = rev.getChannelData(ch);
    const n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return rev;
}

export default function EbblinePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const filRefs = useRef<(SVGLineElement | null)[]>([]);
  const waterRef = useRef<SVGLineElement | null>(null);
  const glowRef = useRef<SVGStopElement | null>(null);
  const glowOuterRef = useRef<SVGStopElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "failed">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    lean: 0,
    rate: SHIMMER,
    dir: 1,
    title: REAL_TRACKS[0].title,
  });

  // ── one engine, built once; React buttons reach it via engineRef ────────────
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flowScale = reduce ? 0.5 : 1;

    // ── audio state ────────────────────────────────────────────────────────────
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let mixer: GainNode | null = null;
    let fwdXfade: GainNode | null = null;
    let revXfade: GainNode | null = null;
    let fwdSeed: GainNode | null = null;
    let revSeed: GainNode | null = null;
    let fwdSrc: AudioBufferSourceNode | null = null;
    let revSrc: AudioBufferSourceNode | null = null;
    let fwdBuf: AudioBuffer | null = null;
    let revBuf: AudioBuffer | null = null;
    let wantTrack = DEFAULT_TRACK;
    let loadingTrack = false;
    let specBuf: Uint8Array<ArrayBuffer> | null = null;

    // ── conducting state (shared by live + demo — the IDENTICAL chain) ──────────
    let lean = 0; // smoothed signed lean ∈ [-1,+1]
    let curRate = SHIMMER; // JS mirror of the ramped rate magnitude
    let head = 0; // virtual forward playhead (s) into the take
    let dir: 1 | -1 = 1; // current time-direction (hysteresis-latched)

    // ── pose self-calibration baselines (slow EMA = the person's neutral) ───────
    let widthBase = -1;
    let dropBase = -1;

    let driver: Driver = "demo";
    let lost = false;
    let sawReal = false;

    // ── derive signed lean from shoulders + nose ONLY ───────────────────────────
    // Forward lean brings the torso toward the lens: the shoulder line foreshortens
    // WIDER, and the nose DROPS relative to the shoulder midline. Both are read as
    // deviation from a slowly-learned neutral so upright posture reads as 0.
    function ingestPose(
      lw: number,
      lmidY: number,
      lnoseY: number,
      present: boolean,
      dt: number,
    ) {
      if (!present) {
        // relax toward neutral so the tide eases to its near-still shimmer
        lean += (0 - lean) * Math.min(1, dt / 0.5);
        return;
      }
      if (widthBase < 0) {
        widthBase = lw;
        dropBase = lnoseY - lmidY;
      }
      const kb = Math.min(1, dt / 3.2); // ~3 s self-calibration
      widthBase += (lw - widthBase) * kb;
      dropBase += (lnoseY - lmidY - dropBase) * kb;

      const fore = widthBase > 1e-4 ? (lw - widthBase) / widthBase : 0; // +=wider=forward
      const drop = (lnoseY - lmidY) - dropBase; // +=nose lower=forward
      // combine + scale into [-1,1]; foreshortening is the stronger, steadier cue
      const raw = fore * 3.4 + drop * 5.0;
      const target = clamp(raw, -1, 1);
      lean += (target - lean) * Math.min(1, dt / 0.16); // ~0.16 s smoothing
    }

    // ── demo drive: a slow autonomous lean sweep −1 → +1 → −1 ───────────────────
    function demoLean(nowS: number): number {
      // slow sine through the full range (passes 0 = shimmer, +1 surge, −1 ebb)
      return Math.sin(nowS * 0.19) * 0.96 + 0.04 * Math.sin(nowS * 0.73);
    }

    // ── re-seed one voice to the shared playhead, click-free via a seed dip ─────
    function reseed(which: "fwd" | "rev") {
      if (!ctx) return;
      const buf = which === "fwd" ? fwdBuf : revBuf;
      const seed = which === "fwd" ? fwdSeed : revSeed;
      if (!buf || !seed) return;
      const now = ctx.currentTime;
      const dur = buf.duration;
      // forward voice reads original time = head; reversed voice reads reversed
      // position (dur − head) so it plays the SAME instant, running backward.
      let off = which === "fwd" ? head : dur - head;
      off = Math.max(0, Math.min(dur - 0.03, off));

      seed.gain.cancelScheduledValues(now);
      seed.gain.setValueAtTime(seed.gain.value, now);
      seed.gain.linearRampToValueAtTime(0, now + 0.006);

      const old = which === "fwd" ? fwdSrc : revSrc;
      if (old) {
        try {
          old.stop(now + 0.008);
        } catch {
          /* already stopped */
        }
        const o = old;
        window.setTimeout(() => {
          try {
            o.disconnect();
          } catch {
            /* ignore */
          }
        }, 80);
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = Math.max(0.01, curRate);
      src.connect(seed);
      try {
        src.start(now + 0.008, off);
      } catch {
        try {
          src.start(now + 0.008);
        } catch {
          /* ctx not running */
        }
      }
      seed.gain.linearRampToValueAtTime(1, now + 0.022);
      if (which === "fwd") fwdSrc = src;
      else revSrc = src;
    }

    // ── audio lifecycle ─────────────────────────────────────────────────────────
    async function loadInto(c: AudioContext, id: string) {
      loadingTrack = true;
      try {
        const loaded = await loadRealTrackBuffer(c, id);
        fwdBuf = loaded.buffer;
        revBuf = makeReversedBuffer(c, loaded.buffer);
        head = Math.min(head, fwdBuf.duration - 0.05);
        reseed("fwd");
        reseed("rev");
        setReadout((r) => ({ ...r, title: loaded.title }));
        setNotice(null);
      } catch {
        fwdBuf = null;
        revBuf = null;
        setNotice(
          "That recording could not be loaded — the tide keeps streaming on your lean, silently.",
        );
      } finally {
        loadingTrack = false;
      }
    }

    function startAudio() {
      if (ctx) {
        void ctx.resume();
        return;
      }
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        master = createSafeMaster(ctx);
        mixer = ctx.createGain();
        mixer.gain.value = 1;
        mixer.connect(master.input); // EVERYTHING terminates at the safe bus
        fwdXfade = ctx.createGain();
        revXfade = ctx.createGain();
        fwdXfade.gain.value = BUS * Math.SQRT1_2;
        revXfade.gain.value = BUS * Math.SQRT1_2;
        fwdXfade.connect(mixer);
        revXfade.connect(mixer);
        fwdSeed = ctx.createGain();
        revSeed = ctx.createGain();
        fwdSeed.gain.value = 1;
        revSeed.gain.value = 1;
        fwdSeed.connect(fwdXfade);
        revSeed.connect(revXfade);
        specBuf = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
        void loadInto(ctx, wantTrack);
      } catch {
        ctx = null;
        master = null;
        setNotice("Web Audio is unavailable here — the tide still streams on your lean.");
      }
    }

    function stopAudio() {
      const deadCtx = ctx;
      ctx = null;
      master = null;
      mixer = null;
      fwdXfade = null;
      revXfade = null;
      fwdSeed = null;
      revSeed = null;
      fwdBuf = null;
      revBuf = null;
      for (const s of [fwdSrc, revSrc]) {
        if (s) {
          try {
            s.stop();
          } catch {
            /* ignore */
          }
          try {
            s.disconnect();
          } catch {
            /* ignore */
          }
        }
      }
      fwdSrc = null;
      revSrc = null;
      if (deadCtx && deadCtx.state !== "closed") {
        window.setTimeout(() => {
          if (deadCtx.state !== "closed") void deadCtx.close();
        }, 300);
      }
    }

    function setTrack(id: string) {
      wantTrack = id;
      if (ctx && !loadingTrack) void loadInto(ctx, id);
    }

    // ── pose / camera ────────────────────────────────────────────────────────────
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    let lastGoodT = -1;

    async function startCam() {
      setCamState("starting");
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamState("failed");
        setNotice("No camera available — the autonomous demo keeps conducting the tide.");
        return;
      }
      try {
        stream = await startCamera(video);
      } catch {
        setCamState("failed");
        setNotice("Camera blocked or off — the autonomous demo keeps conducting the tide.");
        return;
      }
      try {
        landmarker = await createPoseTracker(1);
        setCamState("on");
        setNotice(null);
      } catch {
        setCamState("failed");
        setNotice("Body-tracking model couldn't load (offline?) — the demo keeps conducting.");
      }
    }

    engineRef.current = { startAudio, stopAudio, startCam, setTrack };

    // ── read the live body → shoulder-line + nose, gate on those ONLY ───────────
    function readLive(
      nowMs: number,
    ): { width: number; midY: number; noseY: number; present: boolean } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { width: 0, midY: 0, noseY: 0, present: false };
      const ls = lm[POSE_LM.leftShoulder];
      const rs = lm[POSE_LM.rightShoulder];
      const nose = lm[POSE_LM.nose];
      const vis = (p?: { visibility?: number }) => (p?.visibility ?? 0) > 0.5;
      // GATE ON SHOULDERS + NOSE ONLY — hips/ankles are off-frame and never read.
      if (!vis(ls) || !vis(rs) || !vis(nose)) {
        return { width: 0, midY: 0, noseY: 0, present: false };
      }
      const width = Math.hypot(ls.x - rs.x, ls.y - rs.y);
      const midY = (ls.y + rs.y) / 2;
      return { width, midY, noseY: nose.y, present: true };
    }

    // ── SVG render ───────────────────────────────────────────────────────────────
    let tideShift = 0;
    function renderTide(nowS: number, level: number, audioOn: boolean) {
      const svg = svgRef.current;
      if (!svg) return;
      // forward fraction (equal-power crossfade axis): 0 = full ebb, 1 = full surge
      const ff = clamp(0.5 + lean * 0.5);
      const spacing = lerp(SP_WIDE, SP_NARROW, clamp((curRate - SHIMMER) / RATE_K));
      const signedVel = (lean >= 0 ? 1 : -1) * curRate;
      // stream the filament field: forward → leftward, backward → rightward
      tideShift += signedVel * FLOW * flowScale * lastDt;

      const slope = Math.tan(lean * TILT_MAX);
      const waveAmp = 26 + level * 150;
      const wrap = W + spacing;
      const visible = Math.ceil(W / spacing) + 2;

      // garnet (surge) → smoke-grey (ebb) base hue/sat
      const baseHue = lerp(16, 348, ff);
      const baseSat = lerp(7, 72, ff);

      for (let i = 0; i < N_FIL; i++) {
        const el = filRefs.current[i];
        if (!el) continue;
        if (i >= visible) {
          if (el.getAttribute("opacity") !== "0") el.setAttribute("opacity", "0");
          continue;
        }
        const x = ((i * spacing - tideShift) % wrap + wrap) % wrap - spacing;
        // per-filament amplitude from the analyser (every audible change → visible)
        let a: number;
        if (audioOn && specBuf) {
          const bin = (2 + ((i * 3) % 220)) | 0;
          a = specBuf[bin] / 255;
        } else {
          a = 0;
        }
        const idle = 0.5 + 0.5 * Math.sin(x * 0.011 - nowS * (1.1 + curRate) * (lean >= 0 ? 1 : -1));
        const amp = clamp(0.1 + a * 0.95 + idle * (audioOn ? 0.12 : 0.34));
        const halfLen = lerp(14, 232, amp) * (0.7 + 0.45 * Math.abs(lean));
        const yc = H / 2 + (x - W / 2) * slope + Math.sin(x * 0.012 + nowS * 1.4) * waveAmp;
        const ef = clamp(Math.min(x, W - x) / 130);
        const light = 26 + amp * 48;
        const op = clamp(0.16 + amp * 0.8) * ef;

        el.setAttribute("x1", x.toFixed(1));
        el.setAttribute("x2", x.toFixed(1));
        el.setAttribute("y1", (yc - halfLen).toFixed(1));
        el.setAttribute("y2", (yc + halfLen).toFixed(1));
        el.setAttribute("stroke", `hsl(${baseHue.toFixed(0)} ${baseSat.toFixed(0)}% ${light.toFixed(0)}%)`);
        el.setAttribute("stroke-width", lerp(1.2, 3.4, amp).toFixed(2));
        el.setAttribute("opacity", op.toFixed(3));
      }

      // central waterline: tilts with lean, thickens with level
      const water = waterRef.current;
      if (water) {
        const deg = ((lean * TILT_MAX * 180) / Math.PI).toFixed(2);
        water.setAttribute("transform", `rotate(${deg} ${W / 2} ${H / 2})`);
        water.setAttribute("stroke", `hsl(${baseHue.toFixed(0)} ${(baseSat * 0.9).toFixed(0)}% ${(40 + level * 36).toFixed(0)}%)`);
        water.setAttribute("stroke-width", (1.6 + level * 5).toFixed(2));
        water.setAttribute("opacity", (0.4 + level * 0.4).toFixed(2));
      }

      // field glow: garnet when surging forward, smoke when ebbing back
      const glow = glowRef.current;
      if (glow) {
        const gl = 30 + Math.abs(lean) * 22;
        glow.setAttribute("stop-color", `hsl(${baseHue.toFixed(0)} ${baseSat.toFixed(0)}% ${gl.toFixed(0)}%)`);
        glow.setAttribute("stop-opacity", (0.1 + Math.abs(lean) * 0.26 + level * 0.18).toFixed(3));
      }
      const glowOuter = glowOuterRef.current;
      if (glowOuter) {
        glowOuter.setAttribute("stop-color", FIELD);
      }
    }

    // ── the one loop ─────────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let lastDt = 0;
    let roAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      lastDt = dt;
      const nowS = nowMs / 1000;

      // 1) feed the lean chain — live camera if it has seen a body, else demo.
      let usedLive = false;
      let liveLost = false;
      const live = readLive(nowMs);
      if (live) {
        if (live.present) {
          ingestPose(live.width, live.midY, live.noseY, true, dt);
          usedLive = true;
          lastGoodT = nowS;
          if (!sawReal) sawReal = true;
        } else {
          // tracking on but shoulders/nose not framed → hold briefly, then lost
          const sinceGood = lastGoodT < 0 ? Infinity : nowS - lastGoodT;
          if (sinceGood > LOST_HOLD) {
            liveLost = true;
          }
          usedLive = true;
        }
      }
      // demo drive on mount, and whenever live is unavailable/lost
      if (!usedLive || liveLost) {
        lean += (demoLean(nowS) - lean) * Math.min(1, dt / 0.16);
      }
      driver = usedLive && sawReal && !liveLost ? "live" : "demo";
      lost = liveLost;

      // 2) conduct: signed rate magnitude + crossfade + direction flip
      const rateMag = SHIMMER + Math.abs(lean) * RATE_K;
      curRate += (rateMag - curRate) * (1 - Math.exp(-dt / 0.12)); // mirror the ramp
      // advance the shared virtual playhead by the signed lean velocity
      if (fwdBuf) {
        const dur = fwdBuf.duration;
        head += dt * (lean >= 0 ? 1 : -1) * curRate;
        if (head >= dur) head -= dur;
        if (head < 0) head += dur;
      }

      if (ctx && fwdXfade && revXfade && fwdSrc && revSrc) {
        const now = ctx.currentTime;
        const ff = clamp(0.5 + lean * 0.5);
        const fg = Math.sin(ff * Math.PI * 0.5) * BUS;
        const rg = Math.cos(ff * Math.PI * 0.5) * BUS;
        fwdXfade.gain.setTargetAtTime(fg, now, 0.12);
        revXfade.gain.setTargetAtTime(rg, now, 0.12);
        fwdSrc.playbackRate.setTargetAtTime(Math.max(0.01, rateMag), now, 0.12);
        revSrc.playbackRate.setTargetAtTime(Math.max(0.01, rateMag), now, 0.12);
        // direction flip (hysteresis): re-seed BOTH voices to the shared playhead
        // so the reversal reads as the SAME music running backward.
        if (lean > FLIP_DEAD && dir < 0) {
          dir = 1;
          reseed("fwd");
          reseed("rev");
        } else if (lean < -FLIP_DEAD && dir > 0) {
          dir = -1;
          reseed("fwd");
          reseed("rev");
        }
      } else {
        // visual-only direction latch when audio is off
        if (lean > FLIP_DEAD) dir = 1;
        else if (lean < -FLIP_DEAD) dir = -1;
      }

      // 3) analyser level for the tide
      let level = 0;
      if (master && specBuf) {
        master.analyser.getByteTimeDomainData(specBuf);
        let acc = 0;
        for (let i = 0; i < specBuf.length; i++) {
          const v = (specBuf[i] - 128) / 128;
          acc += v * v;
        }
        level = Math.sqrt(acc / specBuf.length);
        master.analyser.getByteFrequencyData(specBuf); // refresh for per-filament bins
      }

      renderTide(nowS, level, !!(ctx && (fwdSrc || revSrc)));

      // 4) throttled React readout
      roAccum += dt;
      if (roAccum > 0.18) {
        roAccum = 0;
        setReadout((r) => {
          const lr = Math.round(lean * 100) / 100;
          const rt = Math.round(curRate * 100) / 100;
          if (
            r.driver === driver &&
            r.lost === lost &&
            r.dir === dir &&
            Math.abs(r.lean - lr) < 0.02 &&
            Math.abs(r.rate - rt) < 0.02
          ) {
            return r;
          }
          return { ...r, driver, lost, dir, lean: lr, rate: rt };
        });
      }
    }
    raf = requestAnimationFrame(loop);

    // ── teardown ─────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      stopAudio();
      engineRef.current = null;
    };
  }, []); // built once; buttons drive it through engineRef

  // ── button handlers ──────────────────────────────────────────────────────────
  const handleSound = useCallback(() => {
    if (soundOn) {
      engineRef.current?.stopAudio();
      setSoundOn(false);
    } else {
      engineRef.current?.startAudio();
      setSoundOn(true);
    }
  }, [soundOn]);

  const handleCam = useCallback(() => {
    void engineRef.current?.startCam();
  }, []);

  const handleTrack = useCallback((id: string) => {
    setTrackId(id);
    engineRef.current?.setTrack(id);
  }, []);

  // ── status line ──────────────────────────────────────────────────────────────
  const flow =
    readout.dir > 0 ? "flowing forward →" : "running backward ←";
  const statusEl =
    readout.driver === "live" ? (
      readout.lost ? (
        <span className="text-destructive">
          tracking · lost — face the camera, shoulders in frame; lean forward and back
        </span>
      ) : (
        <span className="text-foreground">
          tracking · live — lean {readout.lean >= 0 ? "+" : ""}
          {readout.lean.toFixed(2)} · {flow} · ×{readout.rate.toFixed(2)}
        </span>
      )
    ) : (
      <span className="text-muted-foreground/70">
        demo · autonomous — lean {readout.lean >= 0 ? "+" : ""}
        {readout.lean.toFixed(2)} · {flow} · ×{readout.rate.toFixed(2)}
      </span>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden feed for MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed tide line */}
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="A horizontal tide of vertical filaments that stream with the direction and rate of the music"
      >
        <defs>
          <radialGradient id="ebb-glow" cx="50%" cy="50%" r="72%">
            <stop ref={glowRef} offset="0%" stopColor="hsl(348 60% 32%)" stopOpacity="0.14" />
            <stop ref={glowOuterRef} offset="100%" stopColor={FIELD} stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill={FIELD} />
        <rect x="0" y="0" width={W} height={H} fill="url(#ebb-glow)" />
        {Array.from({ length: N_FIL }, (_, i) => (
          <line
            key={i}
            ref={(el) => {
              filRefs.current[i] = el;
            }}
            strokeLinecap="round"
            opacity="0"
          />
        ))}
        <line
          ref={waterRef}
          x1="0"
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="hsl(348 60% 44%)"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Ebbline"
        description="Lean your torso forward and back to conduct one of Karel's real piano recordings in rate AND in time-direction. Lean forward and the take flows forward and faster; sit upright for a near-still shimmer; lean back and the very same music runs backward. Two synced sources — a forward buffer and a reversed buffer of the same take — are crossfaded and re-seeded to a shared playhead so the reversal reads as the music itself ebbing. It is drawn as a tide of garnet-to-smoke filaments that stream left as it flows forward and right as it runs back."
        howTo={[
          "Press Start sound, then Enable camera.",
          "Sit so your head and shoulders fill the frame.",
          "Lean your torso forward to surge the music forward and faster.",
          "Sit upright for a near-still shimmer; lean back to run the same music backward.",
          "No camera? The autonomous demo sweeps the lean on its own.",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* tracking status — always visible while active */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {statusEl}
      </div>

      {!immersive && (
        <>
          {/* back link */}
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <Link
              href="/dream"
              className="pointer-events-auto text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← dream lab
            </Link>
          </div>

          {/* title + controls strip, bottom-anchored light overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Ebbline</h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                Your torso is the performer the playback engine follows. Lean
                forward to surge Karel&apos;s recording onward; lean back and the
                same music ebbs in reverse — drawn as a garnet-to-smoke tide.
              </p>
            </div>

            {notice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {notice}
              </p>
            )}

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSound}
                className={
                  soundOn
                    ? "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    : "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                }
              >
                {soundOn ? "Stop sound" : "Start sound"}
              </button>
              {camState !== "on" && (
                <button
                  type="button"
                  onClick={handleCam}
                  disabled={camState === "starting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {camState === "starting"
                    ? "Enabling camera…"
                    : camState === "failed"
                      ? "Retry camera"
                      : "Enable camera — conduct with your lean"}
                </button>
              )}

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                track
                <select
                  value={trackId}
                  onChange={(e) => handleTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {COLLECTIONS.map((c) => (
                    <optgroup key={c.name} label={c.name}>
                      {c.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
