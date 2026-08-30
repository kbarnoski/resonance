"use client";

/* ── 16464 · Drift Choir ──────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if one of Karel's piano takes grew itself into an endless
 *  ghost choir you LISTEN to with your eyes closed — no primary visual — where
 *  the moments the voices drift into phase-alignment are FELT in your hand
 *  (haptic) and HEARD as a soft swell, not watched on a screen?
 *
 *  This is an AUDIO-ONLY / HAPTIC piece. The art is the SOUND FIELD. There is
 *  deliberately no canvas visualizer, no shader — the screen carries only a spare
 *  "witness": a press-and-hold conductor's target and a thin instrument strip
 *  (one bar per living voice, its phase marker + its age) so you can glance, not
 *  stare. Close your eyes, put in headphones, and listen.
 *
 *  MECHANISM (see engine.ts): one decoded recording, a ~7.5s window copied across
 *  voices at incommensurate loop lengths (Eno *Music for Airports*); each voice
 *  ages like a Basinski *Disintegration Loop*. A phase-coincidence detector fires
 *  a swell of Karel's OWN sound (heard everywhere) + a haptic pulse (felt on
 *  mobile) whenever voices align. Press-and-hold blooms a voice; release fades
 *  the most-aged one — you conduct the choir's density by hand.
 *
 *  AUDIO is Karel's ONE decoded recording only, routed through safeMaster — no
 *  oscillator/synth/noise anywhere; nothing reaches ctx.destination directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WELCOME_HOME_TRACKS,
  COLLECTIONS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { Ensemble } from "./engine";

type Status = "idle" | "loading" | "running" | "error";

// canvas literals matched to the semantic tokens (violet brand accent + neutrals)
const C_PRIMARY = "140,110,255"; // --primary violet, as r,g,b
const C_FORE = "232,233,238"; // foreground-ish light neutral
const C_MUTED = "120,124,134"; // muted-foreground

const ROW_H = 30; // px per voice row in the instrument strip
const MAX_ROWS = 6; // matches the engine's live cap

export default function DriftChoir() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [title, setTitle] = useState<string>(WELCOME_HOME_TRACKS[0].title);
  const [voiceCount, setVoiceCount] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [hapticSupported, setHapticSupported] = useState(false);
  const [hapticOn, setHapticOn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const rafRef = useRef<number>(0);
  const coincidePulseRef = useRef(0); // 0..1, decays each frame; pulses the indicator
  const lastVibrateRef = useRef(0); // perf.now() of last haptic — throttles to ~1/s
  const lastCountRef = useRef(-1);
  const hapticOnRef = useRef(true);

  useEffect(() => {
    hapticOnRef.current = hapticOn;
  }, [hapticOn]);

  useEffect(() => {
    // feature-detect vibration once, client-side
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      setHapticSupported(true);
    }
  }, []);

  // ── instrument-strip sizing (DPR aware) ─────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }, []);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  // ── the witness render loop (spare instrument strip — NOT an art field) ──────
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ens = ensembleRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !ens || !g) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    ens.step();

    // drain coincidence events → haptic (throttled) + witness pulse + swell readout
    const events = ens.drainCoincidences();
    if (events.length > 0) {
      let strongest = 0;
      for (const e of events) strongest = Math.max(strongest, e.strength);
      coincidePulseRef.current = Math.min(1, coincidePulseRef.current + strongest);
      const nowMs = performance.now();
      if (
        hapticOnRef.current &&
        typeof navigator !== "undefined" &&
        "vibrate" in navigator &&
        nowMs - lastVibrateRef.current > 1000
      ) {
        lastVibrateRef.current = nowMs;
        try {
          navigator.vibrate(Math.round(20 + strongest * 45));
        } catch {
          /* unsupported — degrade silently */
        }
      }
    }

    // newest live voice = smallest age; oldest = largest
    const views = ens.getViews().filter((v) => !v.retiring || v.level > 0.01);
    const live = ens.liveCount;
    if (live !== lastCountRef.current) {
      lastCountRef.current = live;
      setVoiceCount(live);
    }

    const W = canvas.width;
    const H = canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const padX = 14 * dpr;
    const trackW = W - padX * 2;

    // calm dark ground
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(10,10,14,0)";
    g.fillRect(0, 0, W, H);

    // sort so the oldest sit at the bottom, newest at the top (choir depth)
    const ordered = [...views].sort((a, b) => a.age - b.age);

    for (let i = 0; i < ordered.length && i < MAX_ROWS; i++) {
      const v = ordered[i];
      const y = (i + 0.5) * ROW_H * dpr + 4 * dpr;

      // the loop track — one thin bar per living voice
      g.strokeStyle = `rgba(${C_MUTED},${0.16 + (1 - v.ageNorm) * 0.12})`;
      g.lineWidth = 1 * dpr;
      g.beginPath();
      g.moveTo(padX, y);
      g.lineTo(padX + trackW, y);
      g.stroke();

      // faint age fill from the left — grows as the voice disintegrates
      g.fillStyle = `rgba(${C_MUTED},0.08)`;
      g.fillRect(padX, y - 1.5 * dpr, trackW * v.ageNorm, 3 * dpr);

      // the phase marker — a soft dot sweeping the track at this voice's rate.
      // brightens with level, dims with age; blooms violet during a swell.
      const mx = padX + v.phase01 * trackW;
      const isNew = i === 0;
      const baseA = (0.28 + v.level * 0.6) * (v.retiring ? 0.4 : 1);
      const swellA = v.swell;

      // swell halo (Karel's own sound audibly blooming — mirrored faintly here)
      if (swellA > 0.02) {
        const hr = (5 + swellA * 9) * dpr;
        const grad = g.createRadialGradient(mx, y, 0, mx, y, hr);
        grad.addColorStop(0, `rgba(${C_PRIMARY},${0.34 * swellA})`);
        grad.addColorStop(1, `rgba(${C_PRIMARY},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(mx, y, hr, 0, Math.PI * 2);
        g.fill();
      }

      const dotR = (isNew ? 3.4 : 2.4 + (1 - v.ageNorm) * 1.2) * dpr;
      const col = swellA > 0.15 ? C_PRIMARY : isNew ? C_FORE : C_MUTED;
      g.fillStyle = `rgba(${col},${Math.min(1, baseA + swellA * 0.4)})`;
      g.beginPath();
      g.arc(mx, y, dotR, 0, Math.PI * 2);
      g.fill();
    }

    // ── coincidence indicator: a single ring at the right that pulses on align ──
    const p = coincidePulseRef.current;
    const ix = W - padX - 4 * dpr;
    const iy = 12 * dpr;
    g.strokeStyle = `rgba(${C_PRIMARY},${0.25 + p * 0.7})`;
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.arc(ix, iy, (4 + p * 7) * dpr, 0, Math.PI * 2);
    g.stroke();
    if (p > 0.02) {
      g.fillStyle = `rgba(${C_PRIMARY},${p * 0.5})`;
      g.beginPath();
      g.arc(ix, iy, 2.5 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    coincidePulseRef.current *= 0.93;

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── build / rebuild the ensemble ────────────────────────────────────────────
  const build = useCallback(
    async (id: string) => {
      setStatus("loading");
      setError("");
      cancelAnimationFrame(rafRef.current);
      ensembleRef.current?.dispose();
      coincidePulseRef.current = 0;
      lastCountRef.current = -1;

      try {
        let ctx = ctxRef.current;
        if (!ctx) {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (!AC) throw new Error("no-webaudio");
          ctx = new AC();
          ctxRef.current = ctx;
        }
        if (ctx.state === "suspended") await ctx.resume();

        if (!masterRef.current) masterRef.current = createSafeMaster(ctx);

        const { buffer, title: t } = await loadRealTrackBuffer(ctx, id);
        setTitle(t);

        const ens = new Ensemble(ctx, buffer, masterRef.current);
        ensembleRef.current = ens;
        ens.start();

        sizeCanvas();
        setStatus("running");
        rafRef.current = requestAnimationFrame(runFrame);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg === "no-webaudio"
            ? "This browser has no Web Audio support — the choir cannot sound."
            : "Could not load the recording. Please try again.",
        );
        setStatus("error");
      }
    },
    [runFrame, sizeCanvas],
  );

  // ── cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      ensembleRef.current?.dispose();
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── the load-bearing active verb: press-and-hold to conduct density ──────────
  const pressActive = useRef(false);

  const onPressStart = useCallback(() => {
    if (status === "loading") return;
    if (status !== "running") {
      // first gesture doubles as the autoplay-policy start
      build(trackId);
      return;
    }
    if (pressActive.current) return;
    pressActive.current = true;
    setPressing(true);
    ensembleRef.current?.addVoice(); // bloom a new voice on press
  }, [status, trackId, build]);

  const onPressEnd = useCallback(() => {
    if (!pressActive.current) return;
    pressActive.current = false;
    setPressing(false);
    ensembleRef.current?.releaseOldest(); // let the most-aged voice fade on release
  }, []);

  // keyboard: hold a key to conduct too (accessibility / desktop-without-pointer)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.key.toLowerCase() === "b") {
        e.preventDefault();
        onPressStart();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key.toLowerCase() === "b") {
        e.preventDefault();
        onPressEnd();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onPressStart, onPressEnd]);

  const running = status === "running";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16464 · audio-only / haptic · cycle 4
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Drift Choir</h1>
          <p className="text-base text-muted-foreground">
            One of Karel&rsquo;s piano takes, grown into an endless ghost choir
            you listen to with your eyes closed. When the drifting voices fall
            into phase you hear a soft swell and — on a phone — feel it in your
            hand. There is nothing to watch. Headphones on, eyes closed.
          </p>
        </header>

        {/* the press-and-hold conductor — the primary element */}
        <div
          role="button"
          tabIndex={0}
          aria-label={
            running
              ? "Press and hold to bloom a voice; release to let the oldest fade"
              : "Press to begin listening"
          }
          onPointerDown={(e) => {
            e.preventDefault();
            onPressStart();
          }}
          onPointerUp={onPressEnd}
          onPointerLeave={onPressEnd}
          onPointerCancel={onPressEnd}
          className={`relative flex min-h-[240px] select-none flex-col items-center justify-center gap-3 rounded-lg border text-center transition-colors ${
            pressing
              ? "border-primary bg-primary/20"
              : "border-border bg-background/60 hover:bg-accent/40"
          }`}
          style={{ touchAction: "none", cursor: "pointer" }}
        >
          {status === "error" ? (
            <p className="max-w-sm px-6 text-sm text-destructive">{error}</p>
          ) : status === "loading" ? (
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              loading the take&hellip;
            </p>
          ) : running ? (
            <>
              <span
                className={`h-16 w-16 rounded-full transition-transform ${
                  pressing ? "scale-110 bg-primary/60" : "bg-primary/25"
                }`}
                aria-hidden
              />
              <p className="text-base text-foreground">
                {pressing ? "blooming a voice…" : "press & hold to conduct"}
              </p>
              <p className="max-w-sm px-6 text-sm text-muted-foreground">
                Hold to bloom a new voice into the choir; release to let the
                most-aged voice fade. Or leave it — it sings on its own.
              </p>
            </>
          ) : (
            <>
              <span className="h-16 w-16 rounded-full bg-primary/30" aria-hidden />
              <p className="text-base text-foreground">Press to begin listening</p>
              <p className="max-w-sm px-6 text-sm text-muted-foreground">
                The choir builds itself hands-off — a fresh voice enters every
                few seconds until five are singing. Then press &amp; hold to
                conduct its density.
              </p>
            </>
          )}
        </div>

        {/* the spare instrument strip — one bar per living voice */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              instrument strip · phase &amp; age
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {voiceCount} {voiceCount === 1 ? "voice" : "voices"} drifting
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-black/30">
            <canvas
              ref={canvasRef}
              className="block w-full"
              style={{ height: `${MAX_ROWS * ROW_H + 8}px`, maxWidth: "100%" }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Each bar is one voice; the dot is where it sits in its loop, dimming
            as it ages. The ring at the right pulses — and your sound swells —
            when two voices fall into phase.
          </p>
        </section>

        {/* controls: haptic toggle, voice readout, take, notes */}
        <section className="flex flex-wrap items-center gap-3">
          {hapticSupported ? (
            <button
              onClick={() => setHapticOn((h) => !h)}
              aria-pressed={hapticOn}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                hapticOn
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Haptic {hapticOn ? "on" : "off"}
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              haptic unavailable on this device
            </span>
          )}

          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              take — {title}
            </span>
            <select
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                if (running || status === "error") build(e.target.value);
              }}
              className="min-h-[44px] w-full max-w-sm rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
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
        </section>

        <div className="flex items-center justify-between">
          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            ← back to the index
          </Link>
          <button
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            Read the design notes →
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight">
              Drift Choir
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single one of Karel&rsquo;s piano takes answers itself. A
                ~7.5-second window is copied across many voices, each played on
                its own looping node at a slightly different, incommensurate
                length (ratios ~1.000, 1.037, 1.081, 1.129, 1.181, 1.237).
                Because the lengths never share a common multiple, no two voices
                re-sync — they drift through phase forever. This is the mechanism
                of Brian Eno&rsquo;s <em>Music for Airports</em> (1978), built
                from seven tape loops of incommensurate length, and of Steve
                Reich&rsquo;s <em>Piano Phase</em>. The drift is the composition.
              </p>
              <p>
                Each voice also <em>ages</em>: its lowpass slowly closes and its
                gain dims over minutes, so the oldest voices recede into a dark
                wash while new bright ones enter — the erosion of William
                Basinski&rsquo;s <em>The Disintegration Loops</em>. The choir at
                minute five is genuinely not the choir at minute one.
              </p>
              <p>
                The piece has no primary visual on purpose — it tests our screen
                bias. When two voices fall into phase, a detector blooms the gain
                and re-opens the lowpass of the coinciding voices: a soft swell
                of Karel&rsquo;s <em>own</em> sound, so the alignment is heard on
                any device with no phone. On a phone the same moment fires a short
                haptic pulse. The screen only witnesses: a thin bar per voice
                showing its loop-phase and age, and a ring that pulses on
                alignment.
              </p>
              <p>
                Your hand conducts density: <strong>press &amp; hold</strong>{" "}
                (or hold Space) blooms a new voice; <strong>release</strong> lets
                the most-aged voice fade. Or walk away — it self-builds to five
                voices and drifts on its own.
              </p>
              <p className="text-muted-foreground/80">
                Honest novelty note: haptic feedback, audio-only pieces, and
                incommensurate loops all have priors in the lab. This piece
                doesn&rsquo;t claim a first — its honesty is that it&rsquo;s a
                disciplined composition of three real subsystems (incommensurate
                loop ensemble · Basinski aging · phase-coincidence → swell +
                haptic) around one restraint: no screen to look at.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
