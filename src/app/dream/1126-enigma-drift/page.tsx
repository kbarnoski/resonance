"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { EnigmaDrone } from "./audio";
import {
  buildRings,
  buildWedges,
  CENTER,
  MAX_R,
  VIEW,
} from "./field";

const PAPER = "#f4efe6"; // warm gallery off-white
const INK = "#0e0d0b";

export default function EnigmaDriftPage() {
  // --- illusion controls -------------------------------------------------
  const [density, setDensity] = useState(0.55); // ring/spoke density + intensity
  const [saturation, setSaturation] = useState(0.7);
  const [shimmer, setShimmer] = useState(0.35);
  const [notesOpen, setNotesOpen] = useState(false);

  // --- audio state -------------------------------------------------------
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const droneRef = useRef<EnigmaDrone | null>(null);

  // --- micro-jitter (sub-pixel, well under 3 Hz) -------------------------
  const groupRef = useRef<SVGGElement | null>(null);
  const meterRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const shimmerRef = useRef(shimmer);
  const densityRef = useRef(density);
  shimmerRef.current = shimmer;
  densityRef.current = density;

  // Derive geometry from the density control.
  const spokePairs = Math.round(46 + density * 150); // 46 .. 196 cycles
  const ringCount = Math.round(6 + density * 11); // 6 .. 17 rings
  const wedges = buildWedges(spokePairs);
  const rings = buildRings(ringCount, saturation);

  // Animation loop: sub-pixel drift of the whole field + optional audio meter.
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      // Two very slow sines (0.13 & 0.19 Hz) -> a barely-alive wander.
      // Amplitude capped at ~0.6px so it never reads as flicker.
      const amp = shimmerRef.current * 0.6;
      const dx = amp * Math.sin(t * 2 * Math.PI * 0.13);
      const dy = amp * Math.cos(t * 2 * Math.PI * 0.19);
      const g = groupRef.current;
      if (g) g.setAttribute("transform", `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`);

      // Tiny audio meter (canvas is allowed only for this).
      const drone = droneRef.current;
      const cv = meterRef.current;
      if (drone && cv) {
        const ctx2 = cv.getContext("2d");
        if (ctx2) {
          const w = cv.width;
          const h = cv.height;
          const buf = new Uint8Array(drone.analyser.fftSize);
          drone.analyser.getByteTimeDomainData(buf);
          ctx2.clearRect(0, 0, w, h);
          ctx2.strokeStyle = "rgba(14,13,11,0.55)";
          ctx2.lineWidth = 1.5;
          ctx2.beginPath();
          for (let i = 0; i < buf.length; i++) {
            const x = (i / (buf.length - 1)) * w;
            const y = (buf[i] / 255) * h;
            if (i === 0) ctx2.moveTo(x, y);
            else ctx2.lineTo(x, y);
          }
          ctx2.stroke();
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Keep the drone's intensity synced to the density control.
  useEffect(() => {
    droneRef.current?.setDensity(density);
  }, [density]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      droneRef.current?.stop();
      droneRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (droneRef.current) {
      // Toggle off.
      await droneRef.current.stop();
      droneRef.current = null;
      setPlaying(false);
      return;
    }
    setAudioError(null);
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext!;
      if (!Ctor) {
        setAudioError("Web Audio is unavailable in this browser — the illusion still works in silence.");
        return;
      }
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      const drone = new EnigmaDrone(ctx);
      drone.start(densityRef.current);
      droneRef.current = drone;
      setPlaying(true);
    } catch {
      setAudioError("Could not start audio — the illusion still works in silence.");
    }
  }, []);

  return (
    <main
      className="min-h-screen w-full px-5 py-8 sm:px-8"
      style={{ background: PAPER, color: INK }}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <header className="w-full text-center">
          <h1 className="font-serif text-3xl font-semibold text-neutral-900 sm:text-4xl">
            Enigma Drift
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-relaxed text-neutral-700">
            A completely still field that streams. Fixate the black dot at the
            centre and let your gaze relax — the coloured rings will seem to
            rotate and flow. Nothing on screen is actually moving.
          </p>
        </header>

        {/* Controls */}
        <div className="mt-6 flex w-full flex-col items-center gap-4">
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-neutral-900 px-6 py-2.5 text-base font-medium text-neutral-50 shadow-sm transition-colors hover:bg-neutral-700"
          >
            {playing ? "Stop the drone" : "Begin"}
          </button>
          {audioError && (
            <p className="max-w-md text-center text-base text-rose-600">
              {audioError}
            </p>
          )}
        </div>

        {/* The field */}
        <div className="relative mt-6 w-full max-w-[600px]">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block w-full rounded-lg"
            style={{ background: PAPER }}
            role="img"
            aria-label="Concentric coloured rings crossed by fine radial black spokes — a static Enigma illusion field."
          >
            {/* Clip everything to the disc. */}
            <defs>
              <clipPath id="disc">
                <circle cx={CENTER} cy={CENTER} r={MAX_R} />
              </clipPath>
            </defs>

            {/* Drifting group: spoke grating + coloured annuli. */}
            <g clipPath="url(#disc)">
              <g ref={groupRef}>
                {/* paper base so spokes read as black-on-paper */}
                <circle cx={CENTER} cy={CENTER} r={MAX_R} fill={PAPER} />
                {/* radial spoke grating */}
                {wedges.map((w, i) => (
                  <path key={i} d={w.d} fill={INK} />
                ))}
                {/* semi-transparent coloured annuli */}
                {rings.map((r, i) => (
                  <circle
                    key={i}
                    cx={CENTER}
                    cy={CENTER}
                    r={r.r}
                    fill="none"
                    stroke={r.color}
                    strokeWidth={r.width}
                  />
                ))}
              </g>
            </g>

            {/* Fixation target — sits still, above the drift. */}
            <circle cx={CENTER} cy={CENTER} r={9} fill={PAPER} />
            <circle
              cx={CENTER}
              cy={CENTER}
              r={9}
              fill="none"
              stroke={INK}
              strokeWidth={2}
            />
            <circle cx={CENTER} cy={CENTER} r={3.2} fill={INK} />
          </svg>

          <p className="mt-2 text-center text-sm text-neutral-600">
            The streaming is a perceptual illusion generated by your own eye
            movements — nothing here flashes or moves quickly.
          </p>
        </div>

        {/* Sliders */}
        <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-5 sm:grid-cols-3">
          <Slider
            label="Density / intensity"
            value={density}
            onChange={setDensity}
            hint="rings + spokes, and the drone"
          />
          <Slider
            label="Saturation"
            value={saturation}
            onChange={setSaturation}
            hint="colour of the annuli"
          />
          <Slider
            label="Shimmer"
            value={shimmer}
            onChange={setShimmer}
            hint="sub-pixel micro-drift"
          />
        </div>

        {/* Audio meter */}
        <div className="mt-5 flex flex-col items-center">
          <canvas
            ref={meterRef}
            width={220}
            height={34}
            className="rounded border border-neutral-300"
            style={{ background: "rgba(0,0,0,0.02)" }}
          />
          <span className="mt-1 text-sm text-neutral-600">
            {playing ? "additive high-partial drone — the beating tracks the density"
              : "audio idle"}
          </span>
        </div>

        {/* Design-notes toggle */}
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className="mt-8 min-h-[44px] rounded-full border border-neutral-400 px-4 py-2.5 text-base font-medium text-neutral-800 transition-colors hover:bg-neutral-900/5"
        >
          {notesOpen ? "Hide design notes" : "Read the design notes"}
        </button>

        {notesOpen && <DesignNotes />}
      </div>

      <PrototypeNav slugs={["1126-enigma-drift"]} />
    </main>
  );
}

function Slider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-base font-medium text-neutral-900">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-neutral-900"
      />
      <span className="text-sm text-neutral-600">{hint}</span>
    </label>
  );
}

function DesignNotes() {
  return (
    <div className="mt-5 max-w-2xl text-left text-base leading-relaxed text-neutral-800">
      <h2 className="font-serif text-xl font-semibold text-neutral-900">
        What you are looking at
      </h2>
      <p className="mt-2">
        This is the <em>Enigma</em> illusion — a static high-contrast geometry
        that composes intense streaming motion inside your own visual system.
        The colour bands appear to rotate and flow, yet every element on screen
        is perfectly still.
      </p>
      <h2 className="mt-5 font-serif text-xl font-semibold text-neutral-900">
        How it works
      </h2>
      <p className="mt-2">
        Fine radial black spokes supply high-contrast structure; your
        involuntary fixational eye movements (microsaccades) sweep that contrast
        across your retina, and the coloured annuli give the resulting jitter a
        direction to &ldquo;flow&rdquo; in. Turn up <em>Density</em> for more
        rings and spokes — a stronger, more vertiginous percept — and the drone&rsquo;s
        beating quickens to match. <em>Shimmer</em> adds a barely-perceptible
        sub-pixel drift of the whole field to seed microsaccade-like reversals.
      </p>
      <h2 className="mt-5 font-serif text-xl font-semibold text-neutral-900">
        References
      </h2>
      <ul className="mt-2 list-disc pl-5">
        <li>Isia Leviant, <em>Enigma</em> (1981).</li>
        <li>
          Troncoso, Macknik &amp; Martinez-Conde, &ldquo;Microsaccades drive
          illusory motion in the Enigma illusion,&rdquo; PNAS 2008.
        </li>
        <li>Faubert &amp; Herbert, &ldquo;The peripheral drift illusion,&rdquo; 1999.</li>
        <li>Bridget Riley — Op-art.</li>
      </ul>
      <h2 className="mt-5 font-serif text-xl font-semibold text-neutral-900">
        Safety &amp; honesty
      </h2>
      <p className="mt-2">
        There is no strobe and no flicker: the field is static and any drift is
        sub-pixel and far below 3&nbsp;Hz. The strength of the percept varies a
        lot from viewer to viewer, is strongest in peripheral vision, and fades
        if you track a moving point instead of holding the central dot.
      </p>
    </div>
  );
}
