"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createDualField, type DualField } from "./gl";
import { separateHPSS, type Separation } from "./hpss";

type Phase = "idle" | "loading" | "separating" | "playing" | "error";
type Solo = "none" | "harm" | "perc";

const MAX_SECONDS = 30; // processed/looped window — keeps memory bounded on phones
const DEMO_DURATION = 11; // seconds of the auto fader-sweep self-demo

/** Effective fader targets during the opening self-demo (harmonic up / perc down,
 *  then reverse, then settle). Returns null once the demo is over. */
function demoGains(elapsed: number): { h: number; p: number } | null {
  if (elapsed >= DEMO_DURATION) return null;
  if (elapsed < 4) {
    const k = elapsed / 4; // ramp harmonic up, perc down
    return { h: 0.4 + k * 0.9, p: 0.9 - k * 0.75 };
  }
  if (elapsed < 8) {
    const k = (elapsed - 4) / 4; // reverse
    return { h: 1.3 - k * 1.1, p: 0.15 + k * 1.15 };
  }
  const k = (elapsed - 8) / 3; // settle to a balanced mix
  return { h: 0.2 + k * 0.8, p: 1.3 - k * 0.4 };
}

export default function UnmixerPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glOk, setGlOk] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [title, setTitle] = useState<string>(REAL_TRACKS[0].title);

  // faders (UI mirrors + authoritative refs the animation loop reads)
  const [harmUi, setHarmUi] = useState(1.0);
  const [percUi, setPercUi] = useState(0.9);
  const [solo, setSolo] = useState<Solo>("none");

  const harmRef = useRef(1.0);
  const percRef = useRef(0.9);
  const soloRef = useRef<Solo>("none");
  const autoRef = useRef(true); // opening self-demo active?

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<DualField | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const harmGainRef = useRef<GainNode | null>(null);
  const percGainRef = useRef<GainNode | null>(null);
  const harmSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const percSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserHRef = useRef<AnalyserNode | null>(null);
  const analyserPRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef(0);
  const playStartRef = useRef(0);
  const uiSyncRef = useRef(0);

  useEffect(() => {
    soloRef.current = solo;
  }, [solo]);

  const setHarm = useCallback((v: number) => {
    autoRef.current = false; // user touched → cancel self-demo
    harmRef.current = v;
    setHarmUi(v);
  }, []);
  const setPerc = useCallback((v: number) => {
    autoRef.current = false;
    percRef.current = v;
    setPercUi(v);
  }, []);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    try {
      harmSrcRef.current?.stop();
    } catch {
      /* not started */
    }
    try {
      percSrcRef.current?.stop();
    } catch {
      /* not started */
    }
    harmSrcRef.current = null;
    percSrcRef.current = null;
    safeRef.current?.disconnect();
    fieldRef.current?.dispose();
    fieldRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardown, [teardown]);

  const rms = useCallback((analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) => {
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }, []);

  const start = useCallback(async () => {
    if (phase === "loading" || phase === "separating" || phase === "playing") return;

    // ── set up GL first so we can show a fail notice before touching audio ──
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const field = createDualField(canvas);
        if (!field) {
          setGlOk(false);
        } else {
          fieldRef.current = field;
          setGlOk(true);
        }
      } catch {
        setGlOk(false);
      }
    }

    setPhase("loading");
    setErrMsg("");
    setProgress(0);
    setProgressLabel("fetching Karel's recording");

    let ctx: AudioContext;
    let safe: SafeMaster;
    let sep: Separation;
    let loadedTitle: string;
    try {
      ctx = new AudioContext();
      await ctx.resume();
      safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;

      const loaded = await loadRealTrackBuffer(ctx, trackId);
      loadedTitle = loaded.title;
      setTitle(loaded.title);

      setPhase("separating");
      sep = await separateHPSS(ctx, loaded.buffer, {
        maxSeconds: MAX_SECONDS,
        onProgress: (frac, label) => {
          setProgress(frac);
          setProgressLabel(label);
        },
      });
    } catch (e) {
      setErrMsg(
        e instanceof Error ? e.message : "could not load or separate the track",
      );
      setPhase("error");
      teardown();
      return;
    }

    // ── wire up the two separated layers, each on its own gain → safe.input ──
    const harmGain = ctx.createGain();
    const percGain = ctx.createGain();
    harmGain.gain.value = 0.4;
    percGain.gain.value = 0.9;

    const analyserH = ctx.createAnalyser();
    analyserH.fftSize = 256;
    const analyserP = ctx.createAnalyser();
    analyserP.fftSize = 256;

    harmGain.connect(safe.input);
    harmGain.connect(analyserH);
    percGain.connect(safe.input);
    percGain.connect(analyserP);

    const harmSrc = ctx.createBufferSource();
    harmSrc.buffer = sep.harmonic;
    harmSrc.loop = true;
    harmSrc.connect(harmGain);
    const percSrc = ctx.createBufferSource();
    percSrc.buffer = sep.percussive;
    percSrc.loop = true;
    percSrc.connect(percGain);

    harmGainRef.current = harmGain;
    percGainRef.current = percGain;
    analyserHRef.current = analyserH;
    analyserPRef.current = analyserP;
    harmSrcRef.current = harmSrc;
    percSrcRef.current = percSrc;

    const t0 = ctx.currentTime + 0.06;
    harmSrc.start(t0);
    percSrc.start(t0);
    playStartRef.current = performance.now();
    autoRef.current = true; // run the opening self-demo
    harmRef.current = 1.0;
    percRef.current = 0.9;

    setPhase("playing");
    fieldRef.current?.resize();

    const bufH = new Float32Array(analyserH.fftSize);
    const bufP = new Float32Array(analyserP.fftSize);

    const loop = () => {
      const now = performance.now();
      const elapsed = (now - playStartRef.current) / 1000;

      // resolve effective fader values
      let h = harmRef.current;
      let p = percRef.current;
      if (autoRef.current) {
        const g = demoGains(elapsed);
        if (g) {
          h = g.h;
          p = g.p;
          harmRef.current = h;
          percRef.current = p;
          if (now - uiSyncRef.current > 90) {
            uiSyncRef.current = now;
            setHarmUi(h);
            setPercUi(p);
          }
        } else {
          autoRef.current = false;
          setHarmUi(h);
          setPercUi(p);
        }
      }
      const s = soloRef.current;
      const hg = s === "perc" ? 0 : h;
      const pg = s === "harm" ? 0 : p;
      harmGain.gain.setTargetAtTime(hg, ctx.currentTime, 0.05);
      percGain.gain.setTargetAtTime(pg, ctx.currentTime, 0.05);

      // live per-layer levels drive the visual
      const lh = Math.min(1, rms(analyserH, bufH) * 6);
      const lp = Math.min(1, rms(analyserP, bufP) * 9);
      const field = fieldRef.current;
      if (field) {
        field.setLevels(lh, lp);
        field.render(elapsed);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, trackId, teardown, rms]);

  // keep the canvas sized to its box
  useEffect(() => {
    const onResize = () => fieldRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPickTrack = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setTrackId(id);
    const t = REAL_TRACKS.find((x) => x.id === id);
    if (t) setTitle(t.title);
  };

  const busy = phase === "loading" || phase === "separating";
  const live = phase === "playing";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!glOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center">
          <p className="max-w-md text-base text-destructive">
            This prototype needs WebGL2, which your browser or device does not
            appear to support. The audio un-mixer still works, but the visual
            field cannot render here.
          </p>
        </div>
      )}

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-5 sm:p-7">
        <div className="max-w-xl">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Un-mixer
          </h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            Lift the melody off the pulse — pull Karel&rsquo;s piano into its
            harmonic and percussive layers and re-balance them live.
          </p>
        </div>
        <button
          onClick={() => setNotesOpen(true)}
          className="pointer-events-auto shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* idle / loading centre panel */}
      {(phase === "idle" || busy || phase === "error") && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-background/80 p-6 shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Live HPSS studio instrument
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Median-filter Harmonic/Percussive Source Separation runs on the
              real recording, then two faders let you rebalance the sustained
              chords against the attack transients. First ~{MAX_SECONDS}s of the
              track are separated and looped.
            </p>

            <label className="mt-5 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Track
            </label>
            <select
              value={trackId}
              onChange={onPickTrack}
              disabled={busy}
              className="mt-2 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>

            {phase === "error" && (
              <p className="mt-4 text-sm text-destructive">
                {errMsg || "Could not load the audio."} Tap Play to try again.
              </p>
            )}

            {busy ? (
              <div className="mt-6">
                <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {progressLabel}… {Math.round(progress * 100)}%
                </p>
              </div>
            ) : (
              <button
                onClick={start}
                className="mt-6 min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Play
              </button>
            )}
          </div>
        </div>
      )}

      {/* live fader console */}
      {live && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-4 pb-16 sm:p-7 sm:pb-20">
          <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-background/70 p-5 shadow-lg backdrop-blur-md">
            <div className="flex items-center justify-between">
              <p className="text-base font-medium text-foreground">{title}</p>
              <div className="flex gap-2">
                <SoloButton
                  label="Solo harmonic"
                  active={solo === "harm"}
                  onClick={() => setSolo(solo === "harm" ? "none" : "harm")}
                />
                <SoloButton
                  label="Solo percussive"
                  active={solo === "perc"}
                  onClick={() => setSolo(solo === "perc" ? "none" : "perc")}
                />
              </div>
            </div>

            <Fader
              label="Harmonic — sustained chords"
              hint="ice / cyan ridges"
              value={harmUi}
              dimmed={solo === "perc"}
              onChange={setHarm}
            />
            <Fader
              label="Percussive — attack & pedal"
              hint="violet sparks"
              value={percUi}
              dimmed={solo === "harm"}
              onChange={setPerc}
            />
            {autoRef.current && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                self-demo sweeping the faders — grab either one to take over
              </p>
            )}
          </div>
        </div>
      )}

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Un-mixer — design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                The question
              </span>
              <br />
              What if you could reach into your own recording and lift the melody
              off the pulse — pull it into its harmonic (sustained chords) and
              percussive (attack / pedal transients) layers and re-balance them
              live with faders?
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                How it works
              </span>
              <br />
              A hand-rolled STFT (2048-pt FFT, 512 hop, Hann window) builds the
              magnitude spectrogram of Karel&rsquo;s piano. A median filter{" "}
              <em>across time</em> keeps the sustained tones (harmonic); a median
              filter <em>across frequency</em> keeps the broadband attacks
              (percussive). Soft Wiener masks Mh = H²/(H²+P²+ε) and Mp =
              P²/(H²+P²+ε) are applied to the original complex spectrum and
              inverted with overlap-add ISTFT into two audio buffers. The faders
              set each layer&rsquo;s gain into the shared safe-master bus.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                Reference
              </span>
              <br />
              D. FitzGerald, &ldquo;Harmonic/Percussive Separation using Median
              Filtering,&rdquo; Proc. of the 13th Int. Conf. on Digital Audio
              Effects (DAFx-10), Graz, 2010.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                Limitations
              </span>
              <br />
              True offline HPSS resynthesis is shipped (not the filter-bus
              simplification). To stay light on a phone, only the first{" "}
              {MAX_SECONDS}s are separated and looped, and the spectrogram is
              mono-summed. Separation runs once at load and can take a couple of
              seconds. Piano is nearly all harmonic, so the percussive layer is
              mostly hammer/key attacks and pedal thumps — soloing it is meant to
              sound like the skeleton of the touch, not a drum kit.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13904-unmixer"]} />
    </main>
  );
}

function SoloButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "min-h-[44px] rounded-md px-3 text-xs font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function Fader({
  label,
  hint,
  value,
  dimmed,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  dimmed: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={"mt-5 " + (dimmed ? "opacity-40" : "")}>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className="font-mono text-xs text-muted-foreground">
          {hint} · {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-3 h-11 w-full cursor-pointer accent-primary"
        aria-label={label}
      />
    </div>
  );
}
