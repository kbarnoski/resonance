"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFaceTracker,
  startCamera,
  type Category,
  type Landmark,
} from "../_shared/cameraTracking";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── Art constants (ink-on-bone lives only inside the SVG) ────────────────────
const W = 1600;
const H = 900;
const INK = "#1b1a17";
const BONE = "#e9e4d8";
const STAFF_N = 5;
const PTS = 90;
const MARKS = 110;
const SCROLL = 110; // px / s the notation drifts left
const MAX_LOST_HOLD = 0.7; // seconds to hold last-good face values

interface FaceLike {
  faceLandmarks: Landmark[][];
  faceBlendshapes?: { categories: Category[] }[];
}
interface FaceTrackerLike {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceLike;
  close(): void;
}
interface Mark {
  alive: boolean;
  x: number;
  off: number;
  vel: number;
  born: number;
}
interface AudioRig {
  ctx: AudioContext;
  master: SafeMaster;
  src: AudioBufferSourceNode | null;
  dryGain: GainNode;
  bloomGain: GainNode;
  feedback: GainNode;
  presence: BiquadFilterCorner;
  bright: BiquadFilterCorner;
  pan: StereoPannerNode;
  nodes: AudioNode[];
  input: GainNode;
}
type BiquadFilterCorner = BiquadFilterNode;
type Mode = "idle" | "face" | "pointer";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function computeCat(cats: Category[], name: string): number {
  for (const c of cats) if (c.categoryName === name) return c.score ?? 0;
  return 0;
}

export default function FaceScorePage() {
  const { immersive, toggle } = useImmersive();

  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [faceLive, setFaceLive] = useState(false);
  const [title, setTitle] = useState<string>(REAL_TRACKS[0].title);

  const videoRef = useRef<HTMLVideoElement>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const trackerRef = useRef<FaceTrackerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modeRef = useRef<Mode>("idle");
  const playingRef = useRef(false);
  const faceLiveRef = useRef(false);
  const loadSeq = useRef(0);

  // SVG element refs (created once, mutated per frame)
  const staffRefs = useRef<(SVGPathElement | null)[]>([]);
  const inkRef = useRef<SVGPathElement | null>(null);
  const ghostRef = useRef<SVGPathElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const headRefs = useRef<(SVGCircleElement | null)[]>([]);
  const tailRefs = useRef<(SVGLineElement | null)[]>([]);

  // Controls (smoothed) + targets
  const ctl = useRef({
    open: 0.5, brow: 0.5, tilt: 0,
    tOpen: 0.5, tBrow: 0.5, tTilt: 0,
    lastFace: -1, faceEver: false,
    px: 0.5, py: 0.5,
  });

  const setModeBoth = useCallback((m: Mode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const applyBuildRig = useCallback((): AudioRig => {
    if (rigRef.current) return rigRef.current;
    const ctx = new AudioContext();
    const master = createSafeMaster(ctx);
    const nodes: AudioNode[] = [];
    const mk = <T extends AudioNode>(n: T): T => {
      nodes.push(n);
      return n;
    };
    const input = mk(ctx.createGain());

    // DRY / ARTICULATE bus: presence shelf + fast-release compressor, makeup.
    const presence = mk(ctx.createBiquadFilter());
    presence.type = "highshelf";
    presence.frequency.value = 3200;
    presence.gain.value = 3;
    const comp = mk(ctx.createDynamicsCompressor());
    comp.threshold.value = -26;
    comp.ratio.value = 5;
    comp.attack.value = 0.02;
    comp.release.value = 0.1;
    const makeup = mk(ctx.createGain());
    makeup.gain.value = 1.3;
    const dryGain = mk(ctx.createGain());
    input.connect(presence);
    presence.connect(comp);
    comp.connect(makeup);
    makeup.connect(dryGain);

    // BLOOMED / LEGATO bus: feedback delay network from the take itself.
    const bloomDirect = mk(ctx.createGain());
    bloomDirect.gain.value = 0.75;
    const delay = mk(ctx.createDelay(1));
    delay.delayTime.value = 0.24;
    const loopLp = mk(ctx.createBiquadFilter());
    loopLp.type = "lowpass";
    loopLp.frequency.value = 2600;
    loopLp.Q.value = 0.5;
    const feedback = mk(ctx.createGain());
    feedback.gain.value = 0.5;
    const wet = mk(ctx.createGain());
    wet.gain.value = 0.85;
    const bloomGain = mk(ctx.createGain());
    input.connect(bloomDirect);
    bloomDirect.connect(bloomGain);
    input.connect(delay);
    delay.connect(loopLp);
    loopLp.connect(feedback);
    feedback.connect(delay);
    loopLp.connect(wet);
    wet.connect(bloomGain);

    // brow -> brightness, tilt -> lean
    const bright = mk(ctx.createBiquadFilter());
    bright.type = "highshelf";
    bright.frequency.value = 4500;
    bright.gain.value = 0;
    const pan = mk(ctx.createStereoPanner());
    dryGain.connect(bright);
    bloomGain.connect(bright);
    bright.connect(pan);
    pan.connect(master.input);

    dryGain.gain.value = 0.7;
    bloomGain.gain.value = 0.7;
    const rig: AudioRig = {
      ctx, master, src: null, dryGain, bloomGain, feedback,
      presence, bright, pan, nodes, input,
    };
    rigRef.current = rig;
    return rig;
  }, []);

  const runStartTrack = useCallback(
    async (id: string) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        const rig = applyBuildRig();
        if (rig.ctx.state === "suspended") await rig.ctx.resume();
        const { buffer, title: t } = await loadRealTrackBuffer(rig.ctx, id);
        if (seq !== loadSeq.current) return;
        if (rig.src) {
          try { rig.src.stop(); } catch { /* already stopped */ }
          rig.src.disconnect();
        }
        const src = rig.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = 1.0;
        src.connect(rig.input);
        src.start();
        rig.src = src;
        setTitle(t);
        playingRef.current = true;
        setPlaying(true);
      } catch (e) {
        if (seq === loadSeq.current) {
          setError(
            "Could not load the recording" +
              (e instanceof Error ? ` (${e.message})` : "") +
              ". Try another track.",
          );
        }
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [applyBuildRig],
  );

  const runStartFace = useCallback(async () => {
    if (trackerRef.current || streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      const stream = await startCamera(video);
      streamRef.current = stream;
      await video.play().catch(() => undefined);
      setModeBoth("face");
      setNotice(null);
      try {
        trackerRef.current = (await createFaceTracker(1)) as FaceTrackerLike;
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setModeBoth("pointer");
        setNotice("Face model failed to load. Pointer fallback: move the mouse, Y opens the face, X tilts.");
      }
    } catch {
      setModeBoth("pointer");
      setNotice("Camera unavailable or denied. Pointer fallback: move the mouse, Y opens the face, X tilts.");
    }
  }, [setModeBoth]);

  const handlePlay = useCallback(() => {
    void runStartTrack(trackId);
    void runStartFace();
  }, [runStartTrack, runStartFace, trackId]);

  const handleStop = useCallback(() => {
    loadSeq.current++;
    const rig = rigRef.current;
    if (rig?.src) {
      try { rig.src.stop(); } catch { /* already stopped */ }
      rig.src.disconnect();
      rig.src = null;
    }
    playingRef.current = false;
    setPlaying(false);
    setLoading(false);
  }, []);

  const handleTrack = useCallback(
    (id: string) => {
      setTrackId(id);
      if (playingRef.current) void runStartTrack(id);
    },
    [runStartTrack],
  );

  // ── Pointer fallback input ─────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      ctl.current.px = e.clientX / Math.max(1, window.innerWidth);
      ctl.current.py = e.clientY / Math.max(1, window.innerHeight);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // ── Main rAF loop: face → controls → audio params → SVG ───────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastVideoT = -1;
    let phase = 0;
    let scroll = 0;
    let level = 0;
    let emaE = 0;
    let lastSpawn = 0;
    let nextMark = 0;
    const marks: Mark[] = Array.from({ length: MARKS }, () => ({
      alive: false, x: 0, off: 0, vel: 0, born: 0,
    }));
    const freq = new Uint8Array(512);
    let lostSince = -1;

    const contourY = (x: number, t: number, open: number, amp: number) => {
      const k = lerp(0.016, 0.0058, open); // wavelength grows with openness
      const s = Math.sin(x * k + t * 0.55) + 0.45 * Math.sin(x * k * 2.1 - t * 0.37 + 1.3);
      const sq = Math.tanh(Math.sin(x * k * 2.4 + t * 0.4) * 4) * 1.15; // clipped square-ish wave for the tight face
      const v = lerp(sq, s / 1.45, open);
      return H * 0.5 + v * amp;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      phase += dt;
      const c = ctl.current;

      // 1. face detection
      const video = videoRef.current;
      const tracker = trackerRef.current;
      if (tracker && video && video.readyState >= 2 && video.currentTime !== lastVideoT) {
        lastVideoT = video.currentTime;
        try {
          const res = tracker.detectForVideo(video, now);
          const lm = res.faceLandmarks?.[0];
          if (lm && lm.length > 263) {
            const cats = res.faceBlendshapes?.[0]?.categories ?? [];
            const jaw = clamp(computeCat(cats, "jawOpen") * 2.4);
            const smile = (computeCat(cats, "mouthSmileLeft") + computeCat(cats, "mouthSmileRight")) / 2;
            const blink = (computeCat(cats, "eyeBlinkLeft") + computeCat(cats, "eyeBlinkRight")) / 2;
            const eyeOpen = 1 - blink;
            const up = computeCat(cats, "browInnerUp");
            const down = (computeCat(cats, "browDownLeft") + computeCat(cats, "browDownRight")) / 2;
            const brow = clamp(0.45 + up * 1.6 - down * 1.5);
            const open = clamp(0.12 + jaw * 0.85 + (eyeOpen - 0.75) * 0.7 + (brow - 0.5) * 0.5 + smile * 0.5);
            const a = lm[33], b = lm[263];
            const roll = Math.atan2(b.y - a.y, b.x - a.x);
            c.tOpen = open;
            c.tBrow = brow;
            c.tTilt = clamp(roll / 0.45, -1, 1);
            c.lastFace = t;
            c.faceEver = true;
            lostSince = -1;
          }
        } catch {
          /* a bad frame never throws out of the loop */
        }
      }
      const sinceFace = c.lastFace < 0 ? Infinity : t - c.lastFace;
      const live = modeRef.current === "face" && sinceFace < MAX_LOST_HOLD;
      if (modeRef.current === "face" && !live && lostSince < 0) lostSince = t;
      if (live !== faceLiveRef.current) {
        faceLiveRef.current = live;
        setFaceLive(live);
      }

      // 2. fallbacks (labelled in UI): pointer, else the demo breath
      if (modeRef.current === "pointer") {
        c.tOpen = clamp(1 - c.py);
        c.tTilt = clamp((c.px - 0.5) * 2);
        c.tBrow = clamp(0.5 + (c.px - 0.5) * 0.4 + (0.5 - c.py) * 0.3);
      } else if (!live && modeRef.current !== "face") {
        const slow = 0.5 + 0.5 * Math.sin(phase * 0.42);
        c.tOpen = 0.12 + 0.8 * slow;
        c.tBrow = 0.5 + 0.3 * Math.sin(phase * 0.27 + 1);
        c.tTilt = 0.35 * Math.sin(phase * 0.19);
      } else if (!live && modeRef.current === "face" && (!c.faceEver || sinceFace > 2.5)) {
        // camera on, no face yet / lost for a while: demo breath keeps it alive
        const slow = 0.5 + 0.5 * Math.sin(phase * 0.42);
        c.tOpen = 0.12 + 0.8 * slow;
        c.tBrow = 0.5 + 0.3 * Math.sin(phase * 0.27 + 1);
        c.tTilt = 0.35 * Math.sin(phase * 0.19);
      }
      const sm = 1 - Math.exp(-dt * 5);
      c.open = lerp(c.open, c.tOpen, sm);
      c.brow = lerp(c.brow, c.tBrow, sm);
      c.tilt = lerp(c.tilt, c.tTilt, sm);

      // 3. audio params
      const rig = rigRef.current;
      let energy = 0;
      if (rig) {
        const tc = 0.12;
        const at = rig.ctx.currentTime;
        const ang = c.open * Math.PI * 0.5;
        rig.dryGain.gain.setTargetAtTime(Math.cos(ang) * 0.85, at, tc);
        rig.bloomGain.gain.setTargetAtTime(Math.sin(ang) * 0.85, at, tc);
        rig.feedback.gain.setTargetAtTime(0.45 + 0.13 * c.open, at, tc);
        rig.presence.gain.setTargetAtTime(1 + 5 * (1 - c.open), at, tc);
        rig.bright.gain.setTargetAtTime(-6 + 12 * c.brow, at, tc);
        rig.pan.pan.setTargetAtTime(clamp(c.tilt * 0.5, -0.6, 0.6), at, tc);

        if (playingRef.current) {
          rig.master.analyser.getByteFrequencyData(freq);
          let e = 0;
          let wsum = 0;
          for (let i = 2; i < 200; i++) {
            const v = freq[i] / 255;
            e += v * v;
            wsum += v * i;
          }
          energy = Math.sqrt(e / 198);
          const centroid = e > 0 ? wsum / Math.max(1e-6, Math.sqrt(e) * 198) : 0.3;
          const flux = energy - emaE;
          emaE = lerp(emaE, energy, 1 - Math.exp(-dt * 6));
          if (flux > 0.035 && t - lastSpawn > 0.09) {
            lastSpawn = t;
            const m = marks[nextMark];
            nextMark = (nextMark + 1) % MARKS;
            m.alive = true;
            m.x = W * 0.82;
            m.off = (0.5 - clamp(centroid * 1.6)) * 230 + (Math.random() - 0.5) * 30;
            m.vel = clamp(flux * 7);
            m.born = t;
          }
        }
      }
      level = lerp(level, energy, 1 - Math.exp(-dt * 8));
      scroll += dt * SCROLL * (0.6 + 0.8 * c.open);

      // 4. SVG
      const open = c.open;
      const idleBreath = 0.5 + 0.5 * Math.sin(phase * 0.8);
      const amp = lerp(46, 118, open) * (0.8 + 0.5 * level + (playingRef.current ? 0 : 0.2 * idleBreath));
      const g = groupRef.current;
      if (g) g.setAttribute("transform", `rotate(${(c.tilt * 7).toFixed(2)} ${W / 2} ${H / 2})`);

      const buildPath = (dy: number, a: number, shift: number) => {
        let d = "";
        for (let i = 0; i <= PTS; i++) {
          const x = -40 + ((W + 80) * i) / PTS;
          const y = contourY(x + scroll + shift, t, open, a) + dy;
          d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
        }
        return d;
      };
      for (let s = 0; s < STAFF_N; s++) {
        const el = staffRefs.current[s];
        if (!el) continue;
        const dy = (s - 2) * lerp(30, 46, open);
        el.setAttribute("d", buildPath(dy, amp * 0.55, s * 14));
        el.setAttribute("stroke-width", (lerp(1.0, 1.5, open) + (s === 2 ? 0.3 : 0)).toFixed(2));
        el.setAttribute("opacity", (0.28 + 0.1 * (1 - Math.abs(s - 2) / 2)).toFixed(2));
      }
      const main = buildPath(0, amp, 0);
      const ink = inkRef.current;
      if (ink) {
        const w = lerp(2.4, 6.5, open) * (0.85 + 0.6 * level);
        ink.setAttribute("d", main);
        ink.setAttribute("stroke-width", w.toFixed(2));
        // tight face → staccato dashes; open face → unbroken line
        const dashOn = lerp(9, 600, open * open);
        const gap = lerp(15, 0, clamp(open * 2.2 - 0.5));
        ink.setAttribute("stroke-dasharray", gap < 0.5 ? "none" : `${dashOn.toFixed(0)} ${gap.toFixed(0)}`);
      }
      const gh = ghostRef.current;
      if (gh) {
        gh.setAttribute("d", buildPath(10, amp * 1.04, -30));
        gh.setAttribute("stroke-width", lerp(0.8, 3.2, open).toFixed(2));
        gh.setAttribute("opacity", (0.1 + 0.3 * open).toFixed(2));
      }

      // marks ride the contour; tails lengthen with openness (legato)
      for (let i = 0; i < MARKS; i++) {
        const m = marks[i];
        const head = headRefs.current[i];
        const tail = tailRefs.current[i];
        if (!head || !tail) continue;
        if (!m.alive) {
          if (head.getAttribute("opacity") !== "0") {
            head.setAttribute("opacity", "0");
            tail.setAttribute("opacity", "0");
          }
          continue;
        }
        m.x -= dt * SCROLL * (0.6 + 0.8 * open);
        if (m.x < -300) {
          m.alive = false;
          continue;
        }
        const age = t - m.born;
        const y = contourY(m.x + scroll, t, open, amp) + m.off * 0.6;
        const r = 3.2 + m.vel * 7;
        const tailLen = lerp(8, 60 + 240 * m.vel, open);
        const fade = clamp(1 - Math.max(0, age - 8) / 6) * clamp((m.x + 300) / 300);
        head.setAttribute("cx", m.x.toFixed(1));
        head.setAttribute("cy", y.toFixed(1));
        head.setAttribute("r", r.toFixed(1));
        head.setAttribute("opacity", fade.toFixed(2));
        // open: horizontal tie stretching right; tight: tiny vertical tick
        const tx = lerp(m.x, m.x + tailLen, open);
        const ty = lerp(y - 18 - m.vel * 14, y, open);
        tail.setAttribute("x1", m.x.toFixed(1));
        tail.setAttribute("y1", lerp(y + 4, y, open).toFixed(1));
        tail.setAttribute("x2", tx.toFixed(1));
        tail.setAttribute("y2", ty.toFixed(1));
        tail.setAttribute("stroke-width", lerp(2.4, 1.6, open).toFixed(2));
        tail.setAttribute("opacity", (fade * lerp(0.9, 0.55, open)).toFixed(2));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      loadSeq.current++;
      const rig = rigRef.current;
      if (rig) {
        try { rig.src?.stop(); } catch { /* already stopped */ }
        rig.src?.disconnect();
        rig.nodes.forEach((n) => {
          try { n.disconnect(); } catch { /* noop */ }
        });
        try { rig.master.disconnect(); } catch { /* noop */ }
        void rig.ctx.close().catch(() => undefined);
        rigRef.current = null;
      }
      try { trackerRef.current?.close(); } catch { /* noop */ }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const statusLine = (() => {
    if (mode === "face") {
      return faceLive
        ? { text: "tracking · live", bad: false }
        : ctl.current.faceEver
          ? { text: "tracking · lost — face the camera, good light (demo breath meanwhile)", bad: true }
          : { text: "tracking · searching — face the camera, good light (demo breath meanwhile)", bad: true };
    }
    if (mode === "pointer") return { text: "pointer fallback · mouse Y opens, X tilts", bad: false };
    return null;
  })();

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: BONE }}>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="A living ink line-score that bends with the phrasing"
      >
        <rect x="0" y="0" width={W} height={H} fill={BONE} />
        <g ref={groupRef}>
          {Array.from({ length: STAFF_N }, (_, i) => (
            <path
              key={`s${i}`}
              ref={(el) => { staffRefs.current[i] = el; }}
              fill="none"
              stroke={INK}
              strokeLinecap="round"
              strokeLinejoin="round"
              d={`M0 ${H / 2 + (i - 2) * 38} L${W} ${H / 2 + (i - 2) * 38}`}
            />
          ))}
          <path ref={ghostRef} fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round" />
          <path ref={inkRef} fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round" />
          {Array.from({ length: MARKS }, (_, i) => (
            <g key={`m${i}`}>
              <line
                ref={(el) => { tailRefs.current[i] = el; }}
                stroke={INK}
                strokeLinecap="round"
                opacity="0"
              />
              <circle
                ref={(el) => { headRefs.current[i] = el; }}
                fill={INK}
                r="4"
                opacity="0"
              />
            </g>
          ))}
        </g>
      </svg>

      <video ref={videoRef} className="pointer-events-none absolute h-px w-px opacity-0" playsInline muted />

      {!immersive && (
        <div className="absolute left-0 right-0 top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
          <div className="mr-auto min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Face Score</h1>
            <p className="truncate text-sm text-muted-foreground">
              {playing ? `Now conducting: ${title}` : "Your face conducts the phrasing of Karel's piano."}
            </p>
          </div>
          <select
            value={trackId}
            onChange={(e) => handleTrack(e.target.value)}
            aria-label="Recording"
            className="min-h-[44px] max-w-[14rem] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          {playing ? (
            <button
              type="button"
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading…" : "Play"}
            </button>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex max-w-[calc(100%-8rem)] flex-col gap-2">
        {error && (
          <p className="rounded-md bg-background/80 px-3 py-2 text-sm text-destructive backdrop-blur-md">{error}</p>
        )}
        {notice && (
          <p className="rounded-md bg-background/80 px-3 py-2 text-sm text-muted-foreground backdrop-blur-md">{notice}</p>
        )}
        {statusLine && (
          <p
            className={`rounded-md bg-background/80 px-3 py-2 font-mono text-xs backdrop-blur-md ${
              statusLine.bad ? "text-destructive" : "text-foreground"
            }`}
          >
            {statusLine.text}
          </p>
        )}
        {mode === "idle" && (
          <p className="rounded-md bg-background/80 px-3 py-2 font-mono text-xs text-muted-foreground backdrop-blur-md">
            demo drive · autonomous breathing{playing ? "" : " (press Play)"}
          </p>
        )}
      </div>

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Face Score"
        description="One real recording of Karel's piano, conducted by your face. An open, soft expression blooms the phrasing into long legato through a feedback delay built from the take itself; a tight, narrow face clips it into dry, articulate attacks. The sound is drawn as a living ink line-score on bone paper that bends, thickens and breaks into dashes with the phrasing."
        howTo={[
          "Press Play.",
          "Allow the camera.",
          "Soften and open your face to bloom the piano into long legato; tighten it to clip the notes short and dry. Tilt your head to lean the sound.",
          "Press F for fullscreen, I for info.",
        ]}
      />
    </div>
  );
}
