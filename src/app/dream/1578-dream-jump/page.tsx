"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { makeScene, type DreamScene } from "./scene";
import { DreamAudio, type Analysis } from "./audio";
import { mulberry32 } from "./random";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1578 — Dream Jump
//
// THE QUESTION: "What if each sung phrase teleported you into an entirely new
// dream-scene — with the browser itself performing the liquid metamorphosis?"
//
// The headline technique is the CSS View Transitions API. Each teleport swaps
// the entire DOM scene inside document.startViewTransition(), and customized
// ::view-transition-old/new(root) keyframes make the browser morph the whole
// reality on the compositor (crossfade + scale + rotate + clip-path iris).
// Where the API is absent (headless / older browsers) the swap runs directly
// and a CSS enter-animation covers it — the piece is complete either way.
//
// See README.md for design notes and the named references.
// ════════════════════════════════════════════════════════════════════════════

const INITIAL_SEED = 0x15781234;
const ENERGY_THRESHOLD = 0.03; // sustained RMS that counts as a "sung phrase"

type MicState = "off" | "on" | "denied";
type VtMode = "on" | "fallback";

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => unknown;
};

// Injected global stylesheet: view-transition pseudo-elements + drift keyframes.
// (These MUST be global — ::view-transition-*(root) live at the document level.)
const STYLE = `
.dj-scene {
  animation: dj-enter 900ms cubic-bezier(.4,0,.2,1) both;
  will-change: opacity, transform;
}
.dj-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%);
  mix-blend-mode: multiply;
}
.dj-a { animation: dj-drift-a var(--dur,22s) ease-in-out infinite alternate; will-change: transform; }
.dj-b { animation: dj-drift-b var(--dur,26s) ease-in-out infinite alternate; will-change: transform, opacity; }
.dj-c { animation: dj-pulse   var(--dur,15s) ease-in-out infinite alternate; will-change: opacity; }
@keyframes dj-drift-a {
  from { transform: translate3d(-2%,-1%,0) scale(1.02); }
  to   { transform: translate3d(2%,1.6%,0) scale(1.08); }
}
@keyframes dj-drift-b {
  from { transform: translate3d(1.5%,-2%,0) scale(1.05) rotate(-1deg); }
  to   { transform: translate3d(-1.5%,2%,0) scale(1) rotate(1.4deg); }
}
@keyframes dj-pulse { from { opacity: .38; } to { opacity: .82; } }
@keyframes dj-enter { from { opacity: 0; transform: scale(1.05); } to { opacity: 1; transform: scale(1); } }

::view-transition-group(root) { animation-duration: .78s; }
::view-transition-old(root) { animation: .78s cubic-bezier(.66,0,.34,1) both dj-vt-old; }
::view-transition-new(root) { animation: .78s cubic-bezier(.66,0,.34,1) both dj-vt-new; }
@keyframes dj-vt-old {
  0%   { opacity: 1; transform: scale(1) rotate(0deg); }
  100% { opacity: 0; transform: scale(1.32) rotate(5deg); }
}
@keyframes dj-vt-new {
  0%   { opacity: 0; transform: scale(.74) rotate(-6deg); clip-path: circle(18% at 50% 50%); }
  55%  { opacity: 1; }
  100% { opacity: 1; transform: scale(1) rotate(0deg); clip-path: circle(150% at 50% 50%); }
}

@media (prefers-reduced-motion: reduce) {
  .dj-scene { animation: dj-lum 9s ease-in-out infinite alternate !important; }
  .dj-scene * { animation: none !important; }
  ::view-transition-old(root) { animation: .5s ease both dj-fade-out !important; }
  ::view-transition-new(root) { animation: .5s ease both dj-fade-in !important; }
}
@keyframes dj-lum { from { filter: brightness(.92); } to { filter: brightness(1.06); } }
@keyframes dj-fade-out { to { opacity: 0; } }
@keyframes dj-fade-in { from { opacity: 0; } }
`;

export default function Page() {
  const [scene, setScene] = useState<DreamScene>(() => makeScene(INITIAL_SEED));
  const [sceneKey, setSceneKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [micState, setMicState] = useState<MicState>("off");
  const [vtMode, setVtMode] = useState<VtMode>("fallback");
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Analysis>({ pitchHz: -1, energy: 0 });

  const engineRef = useRef<DreamAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const sceneRef = useRef<DreamScene>(scene);
  const seedRndRef = useRef<() => number>(mulberry32(0x1578c0de));
  const timeRndRef = useRef<() => number>(mulberry32(0x1578f00d));
  const nextTeleportRef = useRef<number>(0);
  const cooldownRef = useRef<number>(0);
  const loudSinceRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const micOnRef = useRef(false);
  const hudTickRef = useRef<number>(0);

  // ── teleport: swap to a new deterministic scene, morphing via the browser ──
  const teleport = useCallback((seed: number) => {
    const next = makeScene(seed);
    sceneRef.current = next;
    const apply = () => {
      // flushSync forces the DOM to the new scene *inside* the transition
      // callback so the View Transitions API captures the correct "new" frame.
      flushSync(() => {
        setScene(next);
        setSceneKey((k) => k + 1);
      });
    };
    const doc = document as DocWithVT;
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(apply);
    } else {
      apply();
    }
    const eng = engineRef.current;
    if (eng && runningRef.current) {
      eng.retune(next.rootHz);
      eng.whoosh(seed);
    }
  }, []);

  // ── the always-on frame loop: idle self-demo + mic analysis + audio nudge ──
  const frame = useCallback(() => {
    const now = performance.now();
    const eng = engineRef.current;

    if (micOnRef.current && eng) {
      const a = eng.analyse();
      if (a) {
        eng.nudge(a);
        const loud =
          a.energy > ENERGY_THRESHOLD && a.pitchHz > 60 && a.pitchHz < 1200;
        if (loud) {
          if (loudSinceRef.current === null) loudSinceRef.current = now;
          else if (
            now - loudSinceRef.current > 400 &&
            now > cooldownRef.current
          ) {
            const semis = Math.round(12 * Math.log2(a.pitchHz / 55));
            const seed =
              (Math.imul(semis + 128, 2654435761) >>> 0) ^ 0x9e3779b9;
            teleport(seed >>> 0);
            cooldownRef.current = now + 1400;
            loudSinceRef.current = null;
          }
        } else {
          loudSinceRef.current = null;
        }
        if (now - hudTickRef.current > 120) {
          hudTickRef.current = now;
          setHud(a);
        }
      }
    }

    // Idle self-demo — auto-teleport every ~5–7s so the piece never stalls.
    if (now > nextTeleportRef.current) {
      const seed = Math.floor(seedRndRef.current() * 0xffffffff) >>> 0;
      teleport(seed);
      nextTeleportRef.current = now + 5000 + timeRndRef.current() * 2000;
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [teleport]);

  const startLoop = useCallback(() => {
    if (rafRef.current === null) {
      nextTeleportRef.current = performance.now() + 4200;
      rafRef.current = requestAnimationFrame(frame);
    }
  }, [frame]);

  // Mount: detect the View Transitions API and start the idle demo immediately.
  useEffect(() => {
    const doc = document as DocWithVT;
    setVtMode(
      typeof doc.startViewTransition === "function" ? "on" : "fallback",
    );
    startLoop();
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [startLoop]);

  const begin = useCallback(async () => {
    try {
      setError(null);
      let eng = engineRef.current;
      if (!eng) {
        eng = new DreamAudio();
        engineRef.current = eng;
      }
      if (!eng.ready) await eng.start(sceneRef.current.rootHz);
      runningRef.current = true;
      setRunning(true);
      startLoop();
      eng.whoosh(0x1578);
    } catch (e) {
      setError("Audio could not start: " + (e as Error).message);
    }
  }, [startLoop]);

  const enableMic = useCallback(async () => {
    try {
      setError(null);
      if (!engineRef.current || !engineRef.current.ready) await begin();
      await engineRef.current!.enableMic();
      micOnRef.current = true;
      setMicState("on");
    } catch {
      micOnRef.current = false;
      setMicState("denied");
      setError("Microphone access was denied — the idle dream demo keeps running.");
    }
  }, [begin]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    engineRef.current?.dispose();
    engineRef.current = null;
    runningRef.current = false;
    micOnRef.current = false;
    loudSinceRef.current = null;
    setRunning(false);
    setMicState("off");
    setHud({ pitchHz: -1, energy: 0 });
  }, []);

  const note = hud.pitchHz > 0 ? `${Math.round(hud.pitchHz)} Hz` : "—";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />

      {/* ── generative art layer (pure DOM/CSS), remounts per teleport ── */}
      <div
        key={sceneKey}
        aria-hidden
        className="dj-scene pointer-events-none fixed inset-0 overflow-hidden"
        style={{ background: scene.bg }}
      >
        {scene.layers.map((l) => (
          <div key={l.key} style={l.outer}>
            <div className={l.animClass} style={l.inner} />
          </div>
        ))}
        <div className="dj-vignette" />
      </div>

      {/* ── UI chrome (semantic tokens only) ── */}
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] flex-col justify-between p-6 sm:p-8">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Dream Jump
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Each sung phrase teleports you into a new dream-scene — the browser
            itself performs the liquid metamorphosis.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            ) : (
              <button
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            )}
            <button
              onClick={enableMic}
              disabled={micState === "on"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {micState === "on" ? "Mic listening" : "Sing (enable mic)"}
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>

          {error && (
            <p className="mt-4 max-w-md text-sm text-destructive">{error}</p>
          )}
          {!running && !error && (
            <p className="mt-4 text-sm text-muted-foreground">
              It already dreams on its own. Press Begin for sound, then sing a
              sustained phrase to jump.
            </p>
          )}
        </header>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground/80">
          <span>
            view-transitions:{" "}
            <span className="text-primary">{vtMode}</span>
          </span>
          <span>
            audio: {running ? <span className="text-primary">on</span> : "idle"}
          </span>
          <span>mic: {micState}</span>
          {micState === "on" && <span>pitch: {note}</span>}
          <span>root: {Math.round(scene.rootHz)} Hz</span>
          <span>scene: #{scene.seed.toString(16).slice(0, 6)}</span>
        </footer>
      </div>

      {/* ── Design notes overlay ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The morph engine is the browser&apos;s{" "}
                <span className="text-foreground">CSS View Transitions API</span>.
                Each teleport swaps the entire DOM scene inside{" "}
                <code>document.startViewTransition()</code>; customized{" "}
                <code>::view-transition-old/new(root)</code> keyframes crossfade,
                scale, rotate and iris the whole reality on the compositor. When
                the API is unavailable the swap runs directly and a CSS
                enter-animation covers it — the current path is shown live in the
                footer.
              </p>
              <p>
                Every scene is a deterministic hypnagogic &quot;room&quot; of
                nested gradient DOM — angled walls, light shafts, floating orbs, a
                faceted prism — seeded by a <code>mulberry32</code> PRNG. Sung
                pitch chooses the next seed and palette; a sustained loud phrase
                triggers the jump. A seeded scheduler auto-teleports every 5–7s
                so it is never blank or silent. Reduced-motion collapses the morph
                to a slow crossfade with a gentle luminance drift.
              </p>
              <p className="text-muted-foreground/80">
                References: the CSS View Transitions API (W3C CSS Working Group;
                Jake Archibald, &quot;Bringing page transitions to the web&quot;);
                Heinrich Klüver&apos;s form constants; and hypnagogia (Andreas
                Mavromatis, <em>Hypnagogia</em>, 1987).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <PrototypeNav slugs={["1578-dream-jump"]} />
    </div>
  );
}
