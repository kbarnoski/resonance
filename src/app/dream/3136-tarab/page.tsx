"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  TarabAudio,
  PLAY_LO,
  PLAY_COUNT,
  PLAY_FREQS,
  TARAB_FREQS,
  TARAB_COUNT,
  makeRng,
} from "./synth";
import {
  SEGMENTS,
  FIELD_W,
  STRING_H,
  baseColor,
  litColor,
  writeStandingWave,
} from "./strings";

/**
 * 3136 · Tarab — a keybed that wakes a body of sympathetic strings.
 *
 * The note you DECIDE to play is joined by everything that rings in sympathy
 * behind it: a rack of 25 playable strings in front, 22 just-intoned tarab
 * strings behind, coupled by shared-partial resonance. A single key blooms into
 * a chord of ringing overtones. state: instrument · pole: warm-decision.
 */

// ── Computer-keyboard fallback (fully playable with no MIDI device) ───────────
const WHITE = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const WHITE_OFF = [0, 2, 4, 5, 7, 9, 11, 12, 14];
const BLACK = ["w", "e", "t", "y", "u"];
const BLACK_OFF = [1, 3, 6, 8, 10];
const KEY_OFFSET = new Map<string, number>();
WHITE.forEach((k, i) => KEY_OFFSET.set(k, WHITE_OFF[i]));
BLACK.forEach((k, i) => KEY_OFFSET.set(k, BLACK_OFF[i]));

type Phase = "idle" | "running";

interface StringMeta {
  x: number;
  z: number;
  phase: number;
  speed: number;
  mode: number;
}

// Precompute a seeded, deterministic demo phrase over the raga keybed.
function makeDemoPhrase(): { midi: number; vel: number; gap: number }[] {
  const rng = makeRng(0x7a4ab001);
  const scale = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 72];
  const steps: { midi: number; vel: number; gap: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const midi = scale[Math.floor(rng() * scale.length)];
    const vel = 0.55 + rng() * 0.4;
    const gap = rng() < 0.18 ? 0.72 : 0.34 + rng() * 0.18;
    steps.push({ midi, vel, gap });
  }
  return steps;
}

export default function TarabPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<TarabAudio | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const prevTimeRef = useRef(0);

  const frontLinesRef = useRef<THREE.Line[]>([]);
  const tarabLinesRef = useRef<THREE.Line[]>([]);
  const frontBaseRef = useRef<THREE.Color[]>([]);
  const tarabBaseRef = useRef<THREE.Color[]>([]);
  const frontMetaRef = useRef<StringMeta[]>([]);
  const tarabMetaRef = useRef<StringMeta[]>([]);
  const playedAmpRef = useRef<Float32Array>(new Float32Array(PLAY_COUNT));
  const tarabAmpRef = useRef<Float32Array>(new Float32Array(TARAB_COUNT));

  const heldKeysRef = useRef<Set<string>>(new Set());
  const octaveRef = useRef(0);
  const demoRef = useRef(false);
  const demoStepRef = useRef(0);
  const demoNextRef = useRef(0);
  const phraseRef = useRef(makeDemoPhrase());

  const [phase, setPhase] = useState<Phase>("idle");
  const [demo, setDemo] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);

  /* --------------------------- strike a note ---------------------------- */
  // Drives audio AND lights the strings. Works visual-only if audio is absent.
  const strike = useCallback((midi: number, vel: number) => {
    const audio = audioRef.current;
    if (audio) {
      const res = audio.strike(midi, vel);
      playedAmpRef.current[res.rod] = Math.min(
        1,
        Math.max(playedAmpRef.current[res.rod], 0.6 + vel * 0.4),
      );
      const amps = tarabAmpRef.current;
      for (let i = 0; i < TARAB_COUNT; i++) {
        if (res.couplings[i] > 0) {
          amps[i] = Math.min(1, Math.max(amps[i], res.couplings[i] * vel));
        }
      }
    } else {
      // No audio yet — still animate the geometry from the pure coupling law.
      let rod = Math.round(midi) - PLAY_LO;
      while (rod < 0) rod += 12;
      while (rod >= PLAY_COUNT) rod -= 12;
      playedAmpRef.current[rod] = Math.min(1, 0.6 + vel * 0.4);
    }
  }, []);

  /* ------------------------------ scene --------------------------------- */
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount) return false;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return false;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0a0810, 1);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0810, 0.055);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(2.4, 0.7, 7.0);
    camera.lookAt(0, 0, -0.7);
    cameraRef.current = camera;

    // Soundboard behind both racks — dark warm violet-brown.
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W * 2.0, STRING_H * 1.4),
      new THREE.MeshBasicMaterial({ color: 0x140f1e }),
    );
    board.position.set(0, 0, -2.4);
    scene.add(board);

    const buildRack = (
      count: number,
      freqs: number[],
      z: number,
      spread: number,
      played: boolean,
      lines: THREE.Line[],
      bases: THREE.Color[],
      metas: StringMeta[],
    ) => {
      const rng = makeRng(played ? 0x0b0a55 : 0x7a5aab);
      for (let i = 0; i < count; i++) {
        const t = count > 1 ? i / (count - 1) : 0.5;
        const x = (t - 0.5) * spread;
        const positions = new Float32Array((SEGMENTS + 1) * 3);
        for (let s = 0; s <= SEGMENTS; s++) {
          positions[s * 3] = x;
          positions[s * 3 + 1] = STRING_H * (0.5 - s / SEGMENTS);
          positions[s * 3 + 2] = z;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const base = baseColor(t, played);
        const mat = new THREE.LineBasicMaterial({
          color: base.clone(),
          transparent: true,
          opacity: played ? 0.62 : 0.4,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        lines.push(line);
        bases.push(base);
        const speed = 6 + Math.log2(freqs[i] / 130) * 3.4;
        metas.push({
          x,
          z,
          phase: rng() * Math.PI * 2,
          speed,
          mode: played ? 1 : i % 3 === 0 ? 2 : 1,
        });

      }

      // A subtle nut + bridge terminator so the rack reads as strung.
      for (const yb of [STRING_H * 0.5, -STRING_H * 0.5]) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(spread * 1.05, 0.06, 0.12),
          new THREE.MeshBasicMaterial({ color: 0x241a33 }),
        );
        bar.position.set(0, yb, z);
        scene.add(bar);
      }
    };

    buildRack(
      PLAY_COUNT,
      PLAY_FREQS,
      0,
      FIELD_W,
      true,
      frontLinesRef.current,
      frontBaseRef.current,
      frontMetaRef.current,
    );
    buildRack(
      TARAB_COUNT,
      TARAB_FREQS,
      -1.7,
      FIELD_W * 0.92,
      false,
      tarabLinesRef.current,
      tarabBaseRef.current,
      tarabMetaRef.current,
    );

    // Bloom for the warm glow (the piece is real geometry; this is only polish).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.9,
      0.55,
      0.0,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composerRef.current = composer;
    return true;
  }, []);

  /* ---------------------------- render loop ----------------------------- */
  const runFrame = useCallback(() => {
    const composer = composerRef.current;
    const now = performance.now();
    if (startTimeRef.current === 0) {
      startTimeRef.current = now;
      prevTimeRef.current = now;
    }
    const t = (now - startTimeRef.current) / 1000;
    const dt = Math.min(0.05, (now - prevTimeRef.current) / 1000);
    prevTimeRef.current = now;

    // Seeded autoplay demo — same code path as a real key press.
    if (demoRef.current) {
      if (t >= demoNextRef.current) {
        const phrase = phraseRef.current;
        const step = phrase[demoStepRef.current % phrase.length];
        strike(step.midi, step.vel);
        demoStepRef.current += 1;
        demoNextRef.current = t + step.gap;
      }
    }

    // Decay ring amplitudes (tarab rings far longer than the driver).
    const pDecay = Math.exp(-dt / 0.85);
    const sDecay = Math.exp(-dt / 3.6);
    const pAmp = playedAmpRef.current;
    const sAmp = tarabAmpRef.current;

    const front = frontLinesRef.current;
    const fMeta = frontMetaRef.current;
    const fBase = frontBaseRef.current;
    for (let i = 0; i < front.length; i++) {
      pAmp[i] *= pDecay;
      const a = pAmp[i];
      const m = fMeta[i];
      const geo = front[i].geometry as THREE.BufferGeometry;
      const attr = geo.attributes.position as THREE.BufferAttribute;
      writeStandingWave(
        attr.array as Float32Array,
        m.x,
        m.z,
        a,
        t,
        m.phase,
        m.speed,
        m.mode,
      );
      attr.needsUpdate = true;
      const mat = front[i].material as THREE.LineBasicMaterial;
      mat.color.copy(litColor(fBase[i], a));
      mat.opacity = 0.55 + a * 0.45;
    }

    const tarab = tarabLinesRef.current;
    const tMeta = tarabMetaRef.current;
    const tBase = tarabBaseRef.current;
    for (let i = 0; i < tarab.length; i++) {
      sAmp[i] *= sDecay;
      const a = sAmp[i];
      const m = tMeta[i];
      const geo = tarab[i].geometry as THREE.BufferGeometry;
      const attr = geo.attributes.position as THREE.BufferAttribute;
      writeStandingWave(
        attr.array as Float32Array,
        m.x,
        m.z,
        a,
        t,
        m.phase,
        m.speed,
        m.mode,
      );
      attr.needsUpdate = true;
      const mat = tarab[i].material as THREE.LineBasicMaterial;
      mat.color.copy(litColor(tBase[i], a));
      mat.opacity = 0.34 + a * 0.6;
    }

    // Gentle breathing of the camera so the racks read in depth.
    const cam = cameraRef.current;
    if (cam) {
      cam.position.x = 2.4 + Math.sin(t * 0.18) * 0.6;
      cam.position.y = 0.7 + Math.sin(t * 0.13) * 0.25;
      cam.lookAt(0, 0, -0.7);
    }

    if (composer) composer.render();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [strike]);

  /* ------------------------------ resize -------------------------------- */
  useEffect(() => {
    const onResize = () => {
      const mount = mountRef.current;
      const renderer = rendererRef.current;
      const composer = composerRef.current;
      const cam = cameraRef.current;
      if (!mount || !renderer || !composer || !cam) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* ------------------------------ MIDI ---------------------------------- */
  const setupMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") return;
    nav
      .requestMIDIAccess()
      .then((access) => {
        const wire = () => {
          let any = false;
          access.inputs.forEach((input) => {
            any = true;
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const data = e.data;
              if (!data || data.length < 3) return;
              const status = data[0] & 0xf0;
              const note = data[1];
              const vel = data[2];
              if (status === 0x90 && vel > 0) strike(note, vel / 127);
            };
          });
          setMidiConnected(any);
        };
        wire();
        access.onstatechange = () => wire();
      })
      .catch(() => {
        /* no MIDI — keyboard still works */
      });
  }, [strike]);

  /* --------------------------- keyboard --------------------------------- */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "z") {
        octaveRef.current = Math.max(-1, octaveRef.current - 1);
        return;
      }
      if (k === "x") {
        octaveRef.current = Math.min(1, octaveRef.current + 1);
        return;
      }
      const off = KEY_OFFSET.get(k);
      if (off === undefined) return;
      if (heldKeysRef.current.has(k)) return; // ignore auto-repeat
      heldKeysRef.current.add(k);
      const midi = PLAY_LO + 12 * octaveRef.current + off;
      strike(midi, 0.85);
    },
    [strike],
  );

  const onKeyUp = useCallback((e: KeyboardEvent) => {
    heldKeysRef.current.delete(e.key.toLowerCase());
  }, []);

  /* ------------------------------ start --------------------------------- */
  const start = useCallback(async () => {
    if (phase === "running") return;
    const ok = buildScene();
    setWebglOk(ok);

    try {
      const audio = new TarabAudio();
      await audio.resume();
      audioRef.current = audio;
    } catch {
      audioRef.current = null;
    }

    setupMidi();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    setPhase("running");
    // Always run the loop: it steps the demo + amplitude decay even when WebGL
    // is unavailable (audio still plays), and renders when a composer exists.
    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [phase, buildScene, setupMidi, onKeyDown, onKeyUp, runFrame]);

  const toggleDemo = useCallback(() => {
    const next = !demoRef.current;
    demoRef.current = next;
    setDemo(next);
    if (next) {
      demoStepRef.current = 0;
      demoNextRef.current = 0;
    }
  }, []);

  /* --------------------------- teardown --------------------------------- */
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      const audio = audioRef.current;
      if (audio) audio.close();
      audioRef.current = null;

      const scene = sceneRef.current;
      if (scene) {
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh & THREE.Line;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as
            | THREE.Material
            | THREE.Material[]
            | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        });
      }
      composerRef.current?.dispose();
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      rendererRef.current = null;
      composerRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      frontLinesRef.current = [];
      tarabLinesRef.current = [];
    };
  }, [onKeyDown, onKeyUp]);

  /* ------------------------------- UI ----------------------------------- */
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Header / controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          3136 · Tarab
        </p>
        <h1 className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground">
          A keybed that wakes a body of sympathetic strings
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Press one key: the note you decide to play blooms into a chord of tarab
          strings ringing in sympathy behind it.
        </p>

        <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the instrument
            </button>
          ) : (
            <button
              onClick={toggleDemo}
              className={
                demo
                  ? "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              {demo ? "Autoplay: on" : "Autoplay / demo"}
            </button>
          )}

          {phase === "running" && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {midiConnected
                ? "MIDI live"
                : "No MIDI · type A–L (white) · W E T Y U (black) · Z/X octave"}
            </span>
          )}
        </div>

        {!webglOk && phase === "running" && (
          <p className="max-w-xl text-base text-destructive">
            WebGL is unavailable, so the strings can’t be drawn — but the
            sympathetic audio still plays. Try the keyboard or autoplay.
          </p>
        )}
      </div>

      {/* Design notes link */}
      <div className="absolute bottom-5 right-6 z-10">
        <button
          onClick={() => setNotesOpen(true)}
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      <div className="absolute bottom-5 left-6 z-10">
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← all prototypes
        </Link>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Tarab — sympathetic resonance as an instrument
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Twenty-five playable strings sit in front; twenty-two{" "}
                <em>tarab</em> strings — the sympathetic strings of a
                sarangi/sitar — hang behind, each tuned to a just-intoned raga
                degree. When you strike a note, every tarab string whose partials
                overlap the note’s partials rings on its own and decays slowly.
              </p>
              <p>
                Coupling is modelled as shared-partial overlap: a driver at f0
                radiates partials k·f0, a tarab string at fs owns partials j·fs,
                and their agreement is weighted 1/(k·j) — so unison rings
                loudest, then the octave, the fifth, the fourth. This is the
                classical modal-synthesis view (Adrien, “The missing link: modal
                synthesis”, 1991), and the ringing you hear echoes the
                sympathetic shimmer of La Monte Young’s{" "}
                <em>The Well-Tuned Piano</em>.
              </p>
              <p>
                The keybed is honest equal temperament — no quantizer rounds your
                pitch onto a scale. Because the tarab rack is just-intoned, a
                consonant note blooms fully while an out-of-key note only
                shimmers: the decision of which note to play is the whole point.
              </p>
              <p className="text-muted-foreground/80">
                Input: Web MIDI (fallback computer keyboard). Output: three.js
                lines whose vertices displace along a decaying standing wave —
                the string you watch shiver is the string you hear ring. Known
                limits: WebGL line width is 1px (glow comes from bloom); overlap
                of many long tarab voices is capped only by coupling threshold.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
