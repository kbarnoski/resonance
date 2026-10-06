"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 19440-cantor — SING WITH HIS PIANO.
//
// One of Karel's real takes is ALWAYS the audible carrier. The mic is
// control-only (a dead-end analyser, never routed to the speakers): a
// per-frame YIN/CMNDF pitch detector reads your sung fundamental, and that
// pitch retunes a bank of resonant bandpass filters sitting on the take — so
// the piano's energy NEAR your note is extracted and rings out over the dry
// recording. Sing a note; his piano answers at your pitch.
//
// The camera is the engage gesture: open your mouth to let the resonance
// bloom (closed → it recedes to the dry take), tilt your head to bend the
// resonance ±1 semitone. Audio = his catalog only (rule 10); mic + face are
// control layers (2026-08-14 music-priority ruling: mic-as-secondary).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import {
  createFaceTracker,
  startCamera,
  type FaceLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { detectPitch, type PitchState } from "./pitch";

// Default carrier: "Bath" — a slow, open Welcome Home take whose sustained
// chords leave lots of harmonic energy for the resonators to find.
const DEFAULT_TRACK = "eba95845-cdbf-41d8-9c5d-8679686811ad";

type Drive = "live" | "pointer" | "demo";
type Phase = "idle" | "loading" | "running" | "error";

// Vocal range the column spans (log-frequency), ~G2..C6.
const F_MIN = 98;
const F_MAX = 1047;
const logN = (f: number) => (Math.log2(f) - Math.log2(F_MIN)) / (Math.log2(F_MAX) - Math.log2(F_MIN));

export default function CantorPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { immersive, toggle } = useImmersive();

  const [phase, setPhase] = useState<Phase>("idle");
  const [drive, setDrive] = useState<Drive>("demo");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [trackTitle, setTrackTitle] = useState<string>("Bath");
  const [notice, setNotice] = useState<string>("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Live readout (throttled) for the status strip.
  const [readout, setReadout] = useState<{ note: string; cents: number; gate: number }>(
    { note: "—", cents: 0, gate: 0 },
  );

  // Mutable control signals read by the audio + render loop.
  const ctrl = useRef({
    pitchHz: 0, // detected sung fundamental (0 = none)
    clarity: 0, // 0..1 CMNDF confidence
    loud: 0, // 0..1 mic RMS
    gate: 0, // 0..1 mouth-open engage
    bend: 0, // -1..1 head tilt → ±1 semitone
    pointerX: 0.5,
    pointerY: 0.5,
  });
  const driveRef = useRef<Drive>("demo");
  useEffect(() => {
    driveRef.current = drive;
  }, [drive]);

  // ── Start / stop ────────────────────────────────────────────────────────────
  const stopRef = useRef<null | (() => void)>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setNotice("");

    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    await ctx.resume().catch(() => {});

    // ── Audio graph: carrier take → dry + resonant bandpass bank → safeMaster ──
    let decoded;
    try {
      decoded = await loadRealTrackBuffer(ctx, trackId);
    } catch {
      setPhase("error");
      setNotice("Couldn't load the recording. Check your connection and try again.");
      ctx.close().catch(() => {});
      return;
    }
    setTrackTitle(decoded.title);

    const master = createSafeMaster(ctx, { gain: 0.9 });

    const src = ctx.createBufferSource();
    src.buffer = decoded.buffer;
    src.loop = true;

    // Dry carrier — always audible.
    const dry = ctx.createGain();
    dry.gain.value = 0.55;

    // A tap of the source feeds the resonators.
    const resIn = ctx.createGain();
    resIn.gain.value = 1;

    // Three resonant bandpass filters: fundamental, octave, twelfth.
    const RATIOS = [1, 2, 3];
    const bands = RATIOS.map(() => {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 220;
      bp.Q.value = 8;
      return bp;
    });
    const wet = ctx.createGain();
    wet.gain.value = 0; // opens with the mouth-gate + clarity

    src.connect(dry);
    src.connect(resIn);
    bands.forEach((bp) => {
      resIn.connect(bp);
      bp.connect(wet);
    });
    dry.connect(master.input);
    wet.connect(master.input);
    src.start();

    // ── Mic: control-only, dead-end analyser (never connected onward) ─────────
    let micStream: MediaStream | null = null;
    let micAnalyser: AnalyserNode | null = null;
    let micBuf: Float32Array<ArrayBuffer> | null = null;
    let haveMic = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const micSrc = ctx.createMediaStreamSource(micStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 2048;
      micAnalyser.smoothingTimeConstant = 0;
      micSrc.connect(micAnalyser); // dead end — nothing downstream, no feedback
      // Back with a concrete ArrayBuffer so the type is Float32Array<ArrayBuffer>
      // (what getFloatTimeDomainData wants under the TS 5.7 DOM lib).
      micBuf = new Float32Array(new ArrayBuffer(micAnalyser.fftSize * 4));
      haveMic = true;
    } catch {
      haveMic = false;
    }

    // ── Camera: face-landmarker for the mouth-gate + head-tilt ─────────────────
    let faceTracker: FaceLandmarkerInst | null = null;
    let camStream: MediaStream | null = null;
    let haveCam = false;
    const video = videoRef.current;
    try {
      if (video) {
        faceTracker = await createFaceTracker(1);
        camStream = await startCamera(video);
        haveCam = true;
      }
    } catch {
      haveCam = false;
    }

    // Pick the honest initial drive label.
    let initialDrive: Drive = "demo";
    if (haveMic && haveCam) initialDrive = "live";
    else if (haveMic || haveCam) initialDrive = "live"; // partial-live; notice explains
    setDrive(initialDrive);
    driveRef.current = initialDrive;

    if (!haveMic && !haveCam) {
      setNotice("No mic or camera — running an autonomous demo. Pointer also drives it (Y = pitch · X = resonance).");
    } else if (!haveMic) {
      setNotice("No microphone — pointer sings instead (move up/down for pitch). Open your mouth to bloom the resonance.");
    } else if (!haveCam) {
      setNotice("No camera — the mouth-gate is held open. Sing and the piano will answer at your pitch.");
    }

    // ── three.js: a vertical log-pitch column of resonator rings ──────────────
    const mount = mountRef.current!;
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x05080a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080a, 0.12);
    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    camera.lookAt(0, 0, 0);

    // The rungs: 28 rings up a column, log-spaced in pitch.
    const RUNGS = 28;
    const COL_H = 9.2;
    const rungs: {
      ring: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      y: number;
      f: number;
    }[] = [];
    const ringGeo = new THREE.TorusGeometry(1, 0.03, 8, 64);
    for (let i = 0; i < RUNGS; i++) {
      const t = i / (RUNGS - 1);
      const f = F_MIN * Math.pow(F_MAX / F_MIN, t);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x1a3a33),
        transparent: true,
        opacity: 0.5,
      });
      const ring = new THREE.Mesh(ringGeo, mat);
      const y = (t - 0.5) * COL_H;
      // Narrower rings up top (higher pitch), wider at the base.
      const r = 2.3 - 1.3 * t;
      ring.scale.set(r, r, 1);
      ring.position.set(0, y, 0);
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      rungs.push({ ring, mat, y, f });
    }

    // The "sung marker" — a bright jade sprite that rides to your pitch.
    const markerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x7dffd6),
      transparent: true,
      opacity: 0,
    });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), markerMat);
    scene.add(marker);

    // Light-field: points scattered up the column that brighten with the
    // carrier's spectrum pouring through each rung.
    const MOTES = 520;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(MOTES * 3);
    const moteRung = new Int16Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      const ri = Math.floor(Math.random() * RUNGS);
      moteRung[i] = ri;
      const ry = rungs[ri].y;
      const rad = (2.3 - 1.3 * (ri / (RUNGS - 1))) * (0.3 + Math.random() * 0.9);
      const ang = Math.random() * Math.PI * 2;
      motePos[i * 3] = Math.cos(ang) * rad;
      motePos[i * 3 + 1] = ry + (Math.random() - 0.5) * 0.28;
      motePos[i * 3 + 2] = Math.sin(ang) * rad * 0.5;
    }
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    const moteCol = new Float32Array(MOTES * 3);
    moteGeo.setAttribute("color", new THREE.BufferAttribute(moteCol, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    // Spectrum tap of the carrier (post-safeMaster) for the light-field.
    const spec = master.analyser;
    const specBuf = new Uint8Array(new ArrayBuffer(spec.frequencyBinCount));

    // Smoothed display values.
    const disp = { markerY: 0, gate: 0, bend: 0, loud: 0 };
    const pitchState: PitchState = { hz: 0, clarity: 0, loud: 0 };

    let raf = 0;
    let running = true;
    let demoT = Math.random() * 100;
    let lastReadout = 0;

    const sampleRate = ctx.sampleRate;

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const d = driveRef.current;

      // ── 1. Read the sung pitch (mic) + the face gate/bend (camera) ──────────
      if (d === "live" && haveMic && micAnalyser && micBuf) {
        micAnalyser.getFloatTimeDomainData(micBuf);
        detectPitch(micBuf, sampleRate, pitchState);
        ctrl.current.pitchHz = pitchState.hz;
        ctrl.current.clarity = pitchState.clarity;
        ctrl.current.loud = pitchState.loud;
      }

      if (d === "live" && haveCam && faceTracker && video && video.readyState >= 2) {
        let res: ReturnType<FaceLandmarkerInst["detectForVideo"]> | null = null;
        try {
          res = faceTracker.detectForVideo(video, now);
        } catch {
          res = null;
        }
        const lm = res?.faceLandmarks?.[0];
        if (lm && lm.length > 400) {
          // Lip gap (upper inner lip 13, lower inner lip 14) normalized by
          // face height (forehead 10 → chin 152) — scale-invariant.
          const upper = lm[13];
          const lower = lm[14];
          const top = lm[10];
          const chin = lm[152];
          const faceH = Math.max(1e-3, Math.hypot(chin.x - top.x, chin.y - top.y));
          const gap = Math.hypot(lower.x - upper.x, lower.y - upper.y) / faceH;
          // gap ~0.02 closed, ~0.14 wide-open.
          const g = Math.min(1, Math.max(0, (gap - 0.03) / 0.11));
          ctrl.current.gate = g;
          // Head tilt (roll): eye line 33 (R) ↔ 263 (L).
          const rEye = lm[33];
          const lEye = lm[263];
          const roll = Math.atan2(lEye.y - rEye.y, lEye.x - rEye.x);
          ctrl.current.bend = Math.max(-1, Math.min(1, roll * 3.2));
          setNotice((n) => (n.startsWith("Tracking lost") ? "" : n));
        } else {
          // Face lost — keep the gate where it was but flag it.
          setNotice((n) =>
            n && !n.startsWith("Tracking lost") ? n : "Tracking lost — face the camera, head centred.",
          );
        }
      }

      // Partial-live without a camera: hold the gate open so singing works.
      if (d === "live" && haveMic && !haveCam) ctrl.current.gate = 1;

      // ── Pointer drive: Y = pitch, X = resonance depth ───────────────────────
      if (d === "pointer") {
        const py = ctrl.current.pointerY;
        ctrl.current.pitchHz = F_MIN * Math.pow(F_MAX / F_MIN, 1 - py);
        ctrl.current.clarity = 0.85;
        ctrl.current.loud = 0.6;
        ctrl.current.gate = ctrl.current.pointerX;
        ctrl.current.bend = 0;
      }

      // ── Demo drive: an autonomous melodic line wandering the column ──────────
      if (d === "demo") {
        demoT += 0.016;
        const mel = 0.5 + 0.42 * Math.sin(demoT * 0.5) * Math.sin(demoT * 0.17 + 1);
        ctrl.current.pitchHz = F_MIN * Math.pow(F_MAX / F_MIN, mel);
        ctrl.current.clarity = 0.7 + 0.25 * Math.sin(demoT * 0.9);
        ctrl.current.loud = 0.5 + 0.3 * Math.abs(Math.sin(demoT * 0.6));
        ctrl.current.gate = 0.5 + 0.5 * Math.sin(demoT * 0.33);
        ctrl.current.bend = 0.4 * Math.sin(demoT * 0.12);
      }

      // ── 2. Map controls → audio ──────────────────────────────────────────────
      const c = ctrl.current;
      const hasPitch = c.pitchHz > 60 && c.clarity > 0.35;
      // Engage = mouth-gate × pitch-clarity (so random noise doesn't ring).
      const engage = c.gate * (hasPitch ? Math.min(1, c.clarity * 1.4) : 0);
      const bendSemis = c.bend; // ±1 semitone
      const t3 = now * 0.001;

      if (hasPitch) {
        const base = c.pitchHz * Math.pow(2, bendSemis / 12);
        bands.forEach((bp, i) => {
          const target = Math.min(sampleRate / 2.2, base * RATIOS[i]);
          bp.frequency.setTargetAtTime(target, ctx.currentTime, 0.08);
          // Higher clarity → sharper resonance; loudness adds a touch of width.
          const q = 4 + 18 * c.clarity - 3 * (1 - Math.min(1, c.loud * 1.5));
          bp.Q.setTargetAtTime(Math.max(2, q), ctx.currentTime, 0.1);
        });
      }
      // Wet gain opens with engagement; dry recedes slightly as the resonance
      // blooms so the answer is audible without clipping.
      wet.gain.setTargetAtTime(0.0 + 1.35 * engage * (0.5 + 0.5 * c.loud), ctx.currentTime, 0.1);
      dry.gain.setTargetAtTime(0.55 - 0.18 * engage, ctx.currentTime, 0.12);

      // ── 3. Render ─────────────────────────────────────────────────────────────
      spec.getByteFrequencyData(specBuf);
      // Smooth display signals.
      disp.gate += (c.gate - disp.gate) * 0.12;
      disp.bend += (c.bend - disp.bend) * 0.1;
      disp.loud += (c.loud - disp.loud) * 0.15;
      const targetY = hasPitch ? (logN(c.pitchHz) - 0.5) * COL_H : disp.markerY;
      disp.markerY += (targetY - disp.markerY) * 0.18;

      // Rungs light with the carrier spectrum sitting at their frequency, and
      // flare near the sung pitch.
      for (let i = 0; i < RUNGS; i++) {
        const rg = rungs[i];
        const bin = Math.min(
          specBuf.length - 1,
          Math.round((rg.f / (sampleRate / 2)) * specBuf.length),
        );
        const e = specBuf[bin] / 255;
        const nearSung = hasPitch
          ? Math.exp(-Math.pow((rg.y - disp.markerY) / 0.8, 2)) * engage
          : 0;
        const lum = Math.min(1, 0.12 + e * 0.8 + nearSung * 1.1);
        // jade ramp: deep teal floor → bright jade at the sung rung.
        rg.mat.color.setRGB(0.1 + 0.4 * nearSung, 0.5 * lum + 0.5 * nearSung, 0.42 * lum + 0.35 * nearSung);
        rg.mat.opacity = 0.35 + 0.55 * lum;
        const pulse = 1 + 0.05 * e + 0.12 * nearSung;
        const baseR = 2.3 - 1.3 * (i / (RUNGS - 1));
        rg.ring.scale.set(baseR * pulse, baseR * pulse, 1);
      }

      // Motes brighten with their rung's energy + the overall engagement.
      for (let i = 0; i < MOTES; i++) {
        const ri = moteRung[i];
        const rg = rungs[ri];
        const bin = Math.min(
          specBuf.length - 1,
          Math.round((rg.f / (sampleRate / 2)) * specBuf.length),
        );
        const e = specBuf[bin] / 255;
        const nearSung = hasPitch
          ? Math.exp(-Math.pow((rg.y - disp.markerY) / 0.9, 2)) * engage
          : 0;
        const b = Math.min(1, 0.05 + e * 0.6 + nearSung * 1.2);
        moteCol[i * 3] = 0.25 * nearSung + 0.05;
        moteCol[i * 3 + 1] = b * 0.9;
        moteCol[i * 3 + 2] = b * 0.7 + 0.1;
      }
      moteGeo.attributes.color.needsUpdate = true;

      // The sung marker.
      markerMat.opacity += (engage * 0.95 - markerMat.opacity) * 0.15;
      marker.position.set(0, disp.markerY, 0.1);
      const ms = 0.17 * (1 + 0.5 * disp.loud) * (0.6 + 0.6 * engage);
      marker.scale.setScalar(ms);

      // Gentle breathing orbit + head-tilt sway.
      const orbit = Math.sin(t3 * 0.05) * 0.25 + disp.bend * 0.3;
      camera.position.x = Math.sin(orbit) * 7.2;
      camera.position.z = Math.cos(orbit) * 7.2;
      camera.position.y = disp.markerY * 0.15;
      camera.lookAt(0, disp.markerY * 0.2, 0);

      renderer.render(scene, camera);

      // Throttled status readout.
      if (now - lastReadout > 120) {
        lastReadout = now;
        const nm = hasPitch ? hzToNote(c.pitchHz * Math.pow(2, c.bend / 12)) : { name: "—", cents: 0 };
        setReadout({ note: nm.name, cents: nm.cents, gate: disp.gate });
      }
    };
    raf = requestAnimationFrame(frame);
    setPhase("running");

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── Teardown ──────────────────────────────────────────────────────────────
    stopRef.current = () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      faceTracker?.close();
      camStream?.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
      master.disconnect();
      ctx.close().catch(() => {});
      ringGeo.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      markerMat.dispose();
      rungs.forEach((r) => r.mat.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      setPhase("idle");
    };
  }, [phase, trackId]);

  useEffect(() => () => stop(), [stop]);

  // Pointer drive hookup.
  const onPointer = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ctrl.current.pointerX = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    ctrl.current.pointerY = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  }, []);

  const running = phase === "running";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* The viz IS the page. */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        onPointerMove={drive === "pointer" ? onPointer : undefined}
        onPointerDown={() => {
          if (running && drive !== "pointer") setDrive("pointer");
        }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Idle / start panel. */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/80 p-6 shadow-lg backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cantor</h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Sing with his piano. One of Karel&apos;s real takes plays as the carrier; your sung
              note tunes a bank of resonators sitting on the recording, so the piano&apos;s energy
              near your pitch rings out. Open your mouth to let the resonance bloom; tilt your head
              to bend it. <span className="text-foreground">Headphones recommended.</span>
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Carrier take
              </label>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {COLLECTIONS.map((col) => (
                  <optgroup key={col.name} label={col.name}>
                    {col.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={start}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {phase === "loading" ? "Loading…" : "Start — allow mic + camera"}
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
            {phase === "error" && notice && (
              <p className="mt-4 text-sm text-destructive">{notice}</p>
            )}
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              The mic never reaches the speakers — it only reads your pitch. Audio is Karel&apos;s
              catalog.
            </p>
          </div>
        </div>
      )}

      {/* Running chrome — hidden in immersive. */}
      {running && !immersive && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-sm">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Cantor</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {trackTitle} · sing a note and the piano answers at your pitch
            </p>
          </div>
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setNotesOpen(true);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              design notes
            </Link>
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              stop
            </button>
          </div>
        </>
      )}

      {/* Status strip — always visible while running (even immersive). */}
      {running && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
          <span
            className={
              drive === "live"
                ? notice.startsWith("Tracking lost")
                  ? "text-destructive"
                  : "text-primary"
                : "text-muted-foreground"
            }
          >
            {drive === "live"
              ? notice.startsWith("Tracking lost")
                ? "tracking · lost"
                : "tracking · live"
              : drive === "pointer"
                ? "pointer · sing"
                : "demo · autonomous"}
          </span>
          <span className="ml-3 text-muted-foreground">
            {readout.note}
            {readout.note !== "—" && readout.cents !== 0
              ? ` ${readout.cents > 0 ? "+" : ""}${readout.cents}¢`
              : ""}
          </span>
          <span className="ml-3 text-muted-foreground/70">
            bloom {Math.round(readout.gate * 100)}%
          </span>
        </div>
      )}

      {/* Error / notice toast while running. */}
      {running && notice && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 max-w-xs rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          {notice}
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Cantor"
        description="One of Karel's real piano takes plays as a carrier. Your sung pitch (read by the microphone, which never reaches the speakers) tunes a bank of resonators on the recording, so the piano's own energy near your note rings out. Open your mouth to bloom the resonance; tilt your head to bend it."
        howTo={[
          "Put on headphones and allow the mic + camera.",
          "Sing or hum a steady note — the bright jade marker rides to your pitch.",
          "Open your mouth wider to let the resonance bloom louder.",
          "Tilt your head to bend the resonance up or down a semitone.",
          "No mic? Drag up/down to sing with the pointer instead.",
        ]}
      />

      {/* Design-notes modal. */}
      {(notesOpen || showNotes) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => {
            setNotesOpen(false);
            setShowNotes(false);
          }}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Cantor — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The carrier is one of Karel&apos;s real recordings, looping untouched. A tap of it
                feeds three resonant bandpass filters tuned to your sung fundamental, its octave,
                and its twelfth — so the recording&apos;s harmonic energy sitting near those pitches
                is lifted out and rings over the dry take. You don&apos;t add a tone; you make his
                piano resonate at the note you sing.
              </p>
              <p>
                Your voice is read, never heard: the mic feeds a dead-end analyser that drives a
                YIN/CMNDF pitch detector (cumulative-mean-normalized difference — it suppresses the
                octave errors plain autocorrelation makes). Clarity sharpens the resonators&apos; Q;
                loudness widens the bloom. The camera reads your mouth-opening as the engage gate and
                your head-tilt as a ±1-semitone bend.
              </p>
              <p>
                No mic or camera? A pointer sings (vertical = pitch, horizontal = resonance) and an
                autonomous demo wanders the column so the piece is alive on load. Audio is Karel&apos;s
                verified catalog only, bussed through a shared safe-master limiter.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNotesOpen(false);
                setShowNotes(false);
              }}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A..G♯ note name + cents deviation for the readout.
function hzToNote(hz: number): { name: string; cents: number } {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const midi = 69 + 12 * Math.log2(hz / 440);
  const rounded = Math.round(midi);
  const cents = Math.round((midi - rounded) * 100);
  const name = names[((rounded % 12) + 12) % 12] + (Math.floor(rounded / 12) - 1);
  return { name, cents };
}
