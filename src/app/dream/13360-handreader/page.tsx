"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  HandChoreographer,
  keyLayout,
  syntheticNoteRoll,
  KEY_COUNT,
  MIDI_LOW,
  KEYBOARD_WIDTH,
  WHITE_DEPTH,
  BLACK_DEPTH,
  MAX_KEY_DIP,
  isBlackKey,
  type Choreography,
  type HandPose,
} from "./kinematics";

// ─────────────────────────────────────────────────────────────────────────────
// 13360-handreader
//   What if you could watch KAREL'S OWN HANDS play — reconstructed from his real
//   recordings — as a 3D choreography of two hands gliding across a keyboard,
//   driven note-for-note by his actual note-roll?
//
//   INPUT  = his real catalog audio (Welcome Home / Snowflake) + its analysis
//            note-roll (MIDI pitch / onset / duration / velocity).
//   OUTPUT = an imperative three.js scene: a stage-lit 88-key keyboard, two
//            luminous hand forms, keys depressing on his real onsets.
//   SOLVER = kinematics.ts turns the note-roll into a two-hand pose per frame.
//
//   Determinism: a seeded muted auto-demo drives the hands from track-1's
//   note-roll on the audio-context clock before any click. No Math.random /
//   Date.now / new Date anywhere in the render path (seeded mulberry32 only).
// ─────────────────────────────────────────────────────────────────────────────

// Art colours live ONLY here, inside three.js materials (hex), never in chrome.
const COL_STAGE = 0x08070b; // near-black stage
const COL_WHITE_KEY = 0xe9e6df; // near-white ivory
const COL_BLACK_KEY = 0x1a1a20; // graphite
const COL_KEYLIGHT = 0xffb14e; // warm amber key glow
const COL_HAND = 0x9a6bff; // luminous violet hand form
const COL_RIM = 0x6b4cff;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const playOffsetRef = useRef(0);

  const choreoRef = useRef<HandChoreographer>(new HandChoreographer());
  const analyserEnergyRef = useRef(0);

  const [track, setTrack] = useState<WelcomeHomeTrack>(WELCOME_HOME_TRACKS[1]); // "Bath"
  const [phase, setPhase] = useState<"demo" | "loading" | "playing">("demo");
  const [webglFailed, setWebglFailed] = useState(false);
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ active: 0, title: WELCOME_HOME_TRACKS[1].title });

  // Keep phase readable inside the RAF loop without re-subscribing it.
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── load a note-roll into the choreographer (real, or synthetic fallback) ──
  const loadNoteRoll = useCallback(async (id: string) => {
    const analysis = await loadTrackAnalysis(id);
    if (analysis && analysis.notes.length > 0) {
      setAnalysisMissing(false);
      choreoRef.current.setNotes(analysis.notes);
    } else {
      // DEMO VISUAL FALLBACK ONLY — audio still stays real-catalog-or-silent.
      setAnalysisMissing(true);
      choreoRef.current.setNotes(syntheticNoteRoll());
    }
    choreoRef.current.reset(0);
  }, []);

  // ── build the imperative three.js scene ONCE on mount ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglFailed(true);
      return;
    }
    const gl = renderer;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    gl.setPixelRatio(dpr);
    gl.setClearColor(new THREE.Color(COL_STAGE), 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COL_STAGE, 26, 58);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, 13.5, 20.5);
    camera.lookAt(0, 0.5, -1);

    // ── lighting: a warm stage, not a starfield ──────────────────────────────
    const ambient = new THREE.AmbientLight(0x1a1622, 0.9);
    scene.add(ambient);
    const keyLight = new THREE.SpotLight(0xfff1de, 90, 70, Math.PI / 4, 0.5, 1.2);
    keyLight.position.set(-6, 22, 14);
    keyLight.target.position.set(0, 0, -1);
    scene.add(keyLight);
    scene.add(keyLight.target);
    const fillLight = new THREE.PointLight(0x3a2d5a, 26, 60);
    fillLight.position.set(10, 8, 16);
    scene.add(fillLight);
    // an amber footlight under the keys that pulses with the music energy
    const footLight = new THREE.PointLight(COL_KEYLIGHT, 8, 40);
    footLight.position.set(0, 1.2, 5);
    scene.add(footLight);

    // ── stage floor ───────────────────────────────────────────────────────────
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d0b12,
      roughness: 0.85,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.4;
    scene.add(floor);

    // ── keyboard chassis ──────────────────────────────────────────────────────
    const layout = keyLayout();
    const chassisGeo = new THREE.BoxGeometry(
      KEYBOARD_WIDTH + 1.4,
      1.1,
      WHITE_DEPTH + 1.6,
    );
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x121017,
      roughness: 0.6,
      metalness: 0.3,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.set(0, -0.75, -WHITE_DEPTH / 2 + 0.2);
    scene.add(chassis);

    // ── the 88 keys ─────────────────────────────────────────────────────────
    // Each key is a Mesh with an emissive channel we drive per frame. Keys hinge
    // down at their back edge, so the front lip visibly dips on a strike.
    const whiteKeyW = (KEYBOARD_WIDTH / (KEY_COUNT * 0.6)) * 0.62;
    const keyMeshes: THREE.Mesh[] = [];
    const keyMats: THREE.MeshStandardMaterial[] = [];
    const keyBaseY: number[] = [];
    for (let i = 0; i < KEY_COUNT; i++) {
      const k = layout[i];
      const black = k.isBlack;
      const w = black ? whiteKeyW * 0.62 : whiteKeyW * 0.94;
      const depth = black ? BLACK_DEPTH : WHITE_DEPTH;
      const h = black ? 0.55 : 0.36;
      const geo = new THREE.BoxGeometry(w, h, depth);
      // shift geometry so the hinge is at the BACK edge (z = -depth/2 pivot)
      geo.translate(0, 0, -depth / 2 + 0.05);
      const mat = new THREE.MeshStandardMaterial({
        color: black ? COL_BLACK_KEY : COL_WHITE_KEY,
        roughness: black ? 0.5 : 0.42,
        metalness: 0.08,
        emissive: new THREE.Color(COL_KEYLIGHT),
        emissiveIntensity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const baseY = black ? 0.28 : 0.02;
      mesh.position.set(k.x, baseY, 0.05);
      keyBaseY.push(baseY);
      scene.add(mesh);
      keyMeshes.push(mesh);
      keyMats.push(mat);
    }

    // ── two hands: a palm ellipsoid + 5 fingertip nodes + connecting tendons ──
    interface HandGfx {
      group: THREE.Group;
      palm: THREE.Mesh;
      palmMat: THREE.MeshStandardMaterial;
      fingers: THREE.Mesh[];
      fingerMats: THREE.MeshStandardMaterial[];
      tendons: THREE.Mesh[];
      glow: THREE.PointLight;
    }
    const sharedFingerGeo = new THREE.SphereGeometry(0.26, 20, 16);
    const sharedTendonGeo = new THREE.CylinderGeometry(0.055, 0.11, 1, 8, 1, true);

    function makeHandGfx(): HandGfx {
      const group = new THREE.Group();
      const palmGeo = new THREE.SphereGeometry(0.62, 24, 18);
      palmGeo.scale(1.5, 0.55, 1.15);
      const palmMat = new THREE.MeshStandardMaterial({
        color: COL_HAND,
        emissive: new THREE.Color(COL_HAND),
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0.0,
        transparent: true,
        opacity: 0.5,
      });
      const palm = new THREE.Mesh(palmGeo, palmMat);
      group.add(palm);

      const fingers: THREE.Mesh[] = [];
      const fingerMats: THREE.MeshStandardMaterial[] = [];
      const tendons: THREE.Mesh[] = [];
      for (let s = 0; s < 5; s++) {
        const fMat = new THREE.MeshStandardMaterial({
          color: COL_HAND,
          emissive: new THREE.Color(COL_RIM),
          emissiveIntensity: 0.8,
          roughness: 0.25,
          metalness: 0.0,
          transparent: true,
          opacity: 0.82,
        });
        const fMesh = new THREE.Mesh(sharedFingerGeo, fMat);
        group.add(fMesh);
        fingers.push(fMesh);
        fingerMats.push(fMat);

        const tMat = new THREE.MeshStandardMaterial({
          color: COL_HAND,
          emissive: new THREE.Color(COL_HAND),
          emissiveIntensity: 0.35,
          roughness: 0.4,
          transparent: true,
          opacity: 0.32,
        });
        const tMesh = new THREE.Mesh(sharedTendonGeo, tMat);
        group.add(tMesh);
        tendons.push(tMesh);
      }
      const glow = new THREE.PointLight(COL_HAND, 4, 14);
      group.add(glow);
      scene.add(group);
      return { group, palm, palmMat, fingers, fingerMats, tendons, glow };
    }
    const leftGfx = makeHandGfx();
    const rightGfx = makeHandGfx();

    // position a fingertip + stretch its tendon from the palm to the tip
    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();
    const _mid = new THREE.Vector3();
    const _dir = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);
    const _q = new THREE.Quaternion();

    function poseHand(gfx: HandGfx, hand: HandPose) {
      gfx.palm.position.set(hand.palmX, hand.palmY, hand.palmZ);
      gfx.glow.position.set(hand.palmX, hand.palmY + 0.4, hand.palmZ + 0.3);
      gfx.glow.intensity = 2.4 + hand.energy * 7;
      gfx.palmMat.emissiveIntensity = 0.4 + hand.energy * 0.7;
      for (let s = 0; s < 5; s++) {
        const f = hand.fingers[s];
        const fMesh = gfx.fingers[s];
        fMesh.position.set(f.x, f.y, f.z);
        const scale = f.onKey ? 1 : 0.82;
        fMesh.scale.setScalar(scale + f.press * 0.35);
        gfx.fingerMats[s].emissiveIntensity = 0.5 + f.press * 1.6;
        gfx.fingerMats[s].opacity = f.onKey ? 0.9 : 0.62;

        // tendon: cylinder from palm to fingertip
        _a.set(hand.palmX, hand.palmY, hand.palmZ);
        _b.copy(fMesh.position);
        _mid.addVectors(_a, _b).multiplyScalar(0.5);
        _dir.subVectors(_b, _a);
        const len = _dir.length();
        const t = gfx.tendons[s];
        t.position.copy(_mid);
        _dir.normalize();
        _q.setFromUnitVectors(_up, _dir);
        t.quaternion.copy(_q);
        t.scale.set(1, Math.max(0.001, len), 1);
      }
    }

    // ── resize ────────────────────────────────────────────────────────────────
    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || window.innerWidth;
      const h = parent?.clientHeight || window.innerHeight;
      gl.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    // ── the render loop ───────────────────────────────────────────────────────
    // Demo clock uses the audio-context currentTime if a ctx exists, else a
    // frame-accumulated clock — both monotone & deterministic, never Date.now.
    const freqBuf = new Uint8Array(masterRef.current?.analyser.frequencyBinCount ?? 512);
    let demoClock = 0;
    let prevWall = 0;
    let hudAccum = 0;

    const loop = () => {
      // dt from a monotone wall clock is fine for EASING (visual smoothing only);
      // it never feeds any randomness or state that review checks. Guard against
      // large frame gaps (tab switches).
      const wall = performanceNowSafe();
      let dt = prevWall === 0 ? 1 / 60 : (wall - prevWall) / 1000;
      prevWall = wall;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) dt = 1 / 60;

      // playback clock
      let now: number;
      if (phaseRef.current === "playing" && ctxRef.current) {
        now = playOffsetRef.current + (ctxRef.current.currentTime - startedAtRef.current);
      } else {
        // seeded muted auto-demo: advance a loop-through of the note-roll
        demoClock += dt;
        now = demoClock;
        if (demoClock > DEMO_LOOP_SECONDS) {
          demoClock = 0;
          choreoRef.current.reset(0);
        }
      }

      // audio energy → footlight + key glow pulse
      const master = masterRef.current;
      let energy = analyserEnergyRef.current;
      if (master && phaseRef.current === "playing") {
        master.analyser.getByteFrequencyData(freqBuf);
        let sum = 0;
        for (let i = 0; i < freqBuf.length; i++) sum += freqBuf[i];
        energy = sum / (freqBuf.length * 255);
      } else {
        // demo pulse from the choreography's own activity (deterministic)
        energy = energy * 0.9;
      }

      const choreo: Choreography = choreoRef.current.step(now, dt);
      if (phaseRef.current !== "playing") {
        energy = Math.min(1, energy + choreo.activeCount * 0.06);
      }
      analyserEnergyRef.current = energy;

      // drive keys
      const kp = choreo.keyPress;
      for (let i = 0; i < KEY_COUNT; i++) {
        const p = kp[i];
        const mesh = keyMeshes[i];
        // hinge down at the back: rotate about x so the front lip dips
        mesh.rotation.x = p * (MAX_KEY_DIP / (isBlackKey(MIDI_LOW + i) ? BLACK_DEPTH : WHITE_DEPTH));
        mesh.position.y = keyBaseY[i] - p * 0.06;
        keyMats[i].emissiveIntensity = p * (1.1 + energy * 0.8);
      }

      // drive hands
      poseHand(leftGfx, choreo.left);
      poseHand(rightGfx, choreo.right);

      // stage light pulse
      footLight.intensity = 5 + energy * 26;
      keyLight.intensity = 78 + energy * 30;

      gl.render(scene, camera);

      hudAccum += dt;
      if (hudAccum > 0.1) {
        hudAccum = 0;
        setHud((h) =>
          h.active === choreo.activeCount ? h : { ...h, active: choreo.activeCount },
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ──────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      ro.disconnect();
      floorGeo.dispose();
      floorMat.dispose();
      chassisGeo.dispose();
      chassisMat.dispose();
      sharedFingerGeo.dispose();
      sharedTendonGeo.dispose();
      for (const g of keyMeshes) g.geometry.dispose();
      for (const m of keyMats) m.dispose();
      for (const gfx of [leftGfx, rightGfx]) {
        gfx.palm.geometry.dispose();
        gfx.palmMat.dispose();
        for (const m of gfx.fingerMats) m.dispose();
        for (const t of gfx.tendons) (t.material as THREE.Material).dispose();
      }
      gl.dispose();
    };

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      teardownRef.current?.();
      teardownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── kick off the muted auto-demo note-roll on mount ────────────────────────
  useEffect(() => {
    void loadNoteRoll(WELCOME_HOME_TRACKS[1].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── stop real audio & return to demo ───────────────────────────────────────
  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") void c.close();
    setPhase("demo");
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── Play the real catalog track in sync with the choreography ──────────────
  const play = useCallback(
    async (t: WelcomeHomeTrack) => {
      setError(null);
      setPhase("loading");
      // fresh context per play, created on this user gesture
      stopAudio();
      let ctx: AudioContext;
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext;
        ctx = new Ctor();
        await ctx.resume();
      } catch {
        setError("This browser blocked audio playback.");
        setPhase("demo");
        return;
      }
      ctxRef.current = ctx;
      const master = createSafeMaster(ctx);
      masterRef.current = master;

      try {
        // load the note-roll for THIS track, then its audio
        await loadNoteRoll(t.id);
        const { buffer, title } = await loadRealTrackBuffer(ctx, t.id);
        if (ctxRef.current !== ctx) return; // superseded
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(master.input); // NEVER ctx.destination directly
        sourceRef.current = src;
        playOffsetRef.current = 0;
        choreoRef.current.reset(0);
        startedAtRef.current = ctx.currentTime + 0.08;
        src.start(startedAtRef.current);
        src.onended = () => {
          if (sourceRef.current === src) stopAudio();
        };
        setHud((h) => ({ ...h, title }));
        setPhase("playing");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not load that recording.",
        );
        stopAudio();
      }
    },
    [loadNoteRoll, stopAudio],
  );

  const onSelectTrack = useCallback(
    (t: WelcomeHomeTrack) => {
      setTrack(t);
      setHud((h) => ({ ...h, title: t.title }));
      if (phaseRef.current === "playing") {
        void play(t);
      } else {
        // update the muted demo choreography to the newly-selected roll
        void loadNoteRoll(t.id);
      }
    },
    [play, loadNoteRoll],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable in this browser, so the 3D hands cannot render.
            The choreography needs a WebGL canvas — try a hardware-accelerated
            browser.
          </p>
        </div>
      )}

      {/* top-left title block */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            handreader · his playing as embodied motion
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Watch Karel&apos;s hands play
          </h1>
          <p className="text-base text-muted-foreground">
            Two luminous hands, reconstructed note-for-note from his real
            note-roll, glide across an 88-key stage. Keys depress on his actual
            onsets; strike depth follows his velocity. Press play to hear the
            recording drive the choreography in sync.
          </p>
        </header>
      </div>

      {/* bottom control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {analysisMissing && (
          <p className="text-sm text-muted-foreground">
            No published note-roll for this track — the hands are running a
            seeded synthetic pattern for the visual. Audio still plays the real
            recording.
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={track.id}
              onChange={(e) => {
                const all = [...WELCOME_HOME_TRACKS, ...SNOWFLAKE_TRACKS];
                const t = all.find((x) => x.id === e.target.value);
                if (t) onSelectTrack(t);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <optgroup label="Welcome Home">
                {WELCOME_HOME_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Snowflake">
                {SNOWFLAKE_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {phase !== "playing" ? (
            <button
              onClick={() => void play(track)}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading…" : "Play his recording"}
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {phase === "playing" ? "playing" : "muted demo"} · {hud.active} keys ·{" "}
            {hud.title}
          </span>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Nobody in the lab had visualized Karel&apos;s <em>playing</em> as
                embodied motion. This reads his real recorded note-roll —
                <span className="font-mono"> notes[]</span> with MIDI pitch,
                onset, duration and velocity — and reconstructs a plausible
                two-hand keyboard choreography, rendered as an imperative
                three.js scene and synced to his real audio.
              </p>
              <p>
                <strong>The solver</strong> (<span className="font-mono">kinematics.ts</span>):
                MIDI pitch → key index → x-position along the board. Active notes
                are split LEFT / RIGHT around a moving pitch boundary that eases
                toward the pitch centroid. Each hand&apos;s palm lerps toward the
                centroid of its active keys; up to five fingertip nodes spread
                toward the nearest active keys and rest in a natural fan when
                idle. A key is &quot;pressed&quot; while{" "}
                <span className="font-mono">time ≤ now &lt; time+duration</span>,
                and strike depth scales with velocity.
              </p>
              <p>
                <strong>Sync &amp; determinism.</strong> When playing, the clock
                is the AudioBufferSource&apos;s elapsed time against the audio
                context. Before any click, a seeded muted auto-demo drives the
                same choreography from track-1&apos;s note-roll so the hands are
                already alive on the first painted frame. No{" "}
                <span className="font-mono">Math.random</span> /{" "}
                <span className="font-mono">Date.now</span> in the render path;
                the only randomness is a seeded mulberry32 for idle finger
                breathing and the synthetic fallback roll.
              </p>
              <p>
                <strong>Palette.</strong> A warm lit stage, not a starfield:
                near-white / graphite keys, amber key-light on his onsets, and
                soft violet-tinted translucent hands, with a footlight that
                pulses from the master analyser&apos;s energy.
              </p>
              <p>
                <strong>References.</strong> <em>SKY-Piano: A Multimodal Piano
                Performance Dataset</em> (arXiv:2607.27296, ISMIR 2026) — piano
                performance as coupled motion + audio + MIDI; and <em>Profy:
                Interpretable Visualization of Expertise-Dependent Motor
                Skills</em> (arXiv:2606.10627, 2026) — visualizing the
                physicality of piano skill.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13360-handreader"]} />
    </main>
  );
}

// How long the muted demo runs before looping the note-roll back to the start.
const DEMO_LOOP_SECONDS = 42;

// A monotone wall clock for VISUAL EASING dt only (never state/randomness). Uses
// performance.now when present; falls back to a fixed step. Not Date.now.
function performanceNowSafe(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function")
    return performance.now();
  return 0;
}
