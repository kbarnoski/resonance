"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeWeather,
  getWeather,
  SAMPLE_WEATHER,
  type Weather,
  type WeatherSource,
} from "./weather";
import { startSky, type SkyHandle } from "./sky-gl";
import { startBand, type BandHandle, type FriendId } from "./band";

type Phase = "idle" | "loading" | "playing";

// Sky-friends laid out for the optional hands-free bonus taps.
const FRIENDS: { id: FriendId; label: string; emoji: string }[] = [
  { id: "sun", label: "Sun", emoji: "☀️" },
  { id: "cloud", label: "Cloud", emoji: "☁️" },
  { id: "wind", label: "Wind", emoji: "🌬️" },
  { id: "rain", label: "Rain", emoji: "💧" },
];

export default function KidsSkyBand() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bandRef = useRef<BandHandle | null>(null);
  const skyRef = useRef<SkyHandle | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [source, setSource] = useState<WeatherSource>("sample");
  const [offline, setOffline] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Apply a weather snapshot to both the sky shader and the band.
  const applyWeather = useCallback(
    (w: Weather, src: WeatherSource, isOffline: boolean) => {
      setWeather(w);
      setSource(src);
      setOffline(isOffline);
      skyRef.current?.setWeather(w);
      bandRef.current?.setWeather(w);
    },
    [],
  );

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    // AudioContext MUST be created inside the user-gesture handler.
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* best effort */
      }
    }

    // Start the sky shader with the sample first so visuals appear instantly.
    if (canvasRef.current) {
      const sky = startSky(canvasRef.current, SAMPLE_WEATHER);
      if (sky) {
        skyRef.current = sky;
      } else {
        setNoWebgl(true);
      }
    }

    // Start the band immediately with the sample so it's never silent while
    // the network call resolves.
    bandRef.current = startBand(ctx, SAMPLE_WEATHER);
    applyWeather(SAMPLE_WEATHER, "sample", false);
    setPhase("playing");

    // Then resolve the real sky (geolocation 3s timeout → Open-Meteo).
    try {
      const result = await getWeather();
      applyWeather(result.weather, result.source, result.offline);
    } catch {
      applyWeather(SAMPLE_WEATHER, "sample", true);
    }
  }, [phase, applyWeather]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      bandRef.current?.dispose();
      skyRef.current?.dispose();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const poke = useCallback((id: FriendId) => {
    bandRef.current?.poke(id);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#070912] text-foreground">
      {/* WebGL2 sky fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* readable scrim so text stays legible over any sky */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />

      {/* design-notes link, top-right corner */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/30 px-4 py-2 text-sm text-foreground backdrop-blur hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-semibold text-foreground sm:text-4xl">
          Kids&rsquo; Sky Band
        </h1>
        <p className="max-w-xl text-base text-foreground">
          A tiny band that plays the real sky outside your window right now &mdash;
          so it sounds a little different every day, because the weather is real.
        </p>

        {phase === "idle" && (
          <button
            onClick={start}
            className="min-h-[44px] rounded-2xl bg-violet-500 px-6 py-3 text-lg font-medium text-foreground shadow-lg transition hover:bg-violet-400 active:scale-[0.98]"
          >
            Start the sky band
          </button>
        )}

        {phase === "loading" && (
          <p className="text-base text-muted-foreground">Looking up at the sky&hellip;</p>
        )}

        {phase === "playing" && weather && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base text-muted-foreground sm:text-lg">
              {describeWeather(weather, source)}
            </p>

            {offline && (
              <p className="text-sm text-violet-300/95">
                Showing a sample sky &mdash; couldn&rsquo;t reach the weather.
              </p>
            )}
            {source === "fallback-location" && !offline && (
              <p className="text-sm text-violet-300/95">
                Using San Francisco &mdash; location wasn&rsquo;t shared.
              </p>
            )}

            {noWebgl && (
              <p className="max-w-md text-sm text-violet-300">
                Your device can&rsquo;t show the WebGL sky, but the band is still
                playing. Close your eyes and listen.
              </p>
            )}

            {/* Optional hands-free bonus: tap a friend to make it sing out. */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {FRIENDS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => poke(f.id)}
                  className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground backdrop-blur transition hover:bg-accent active:scale-95"
                >
                  <span aria-hidden>{f.emoji}</span>{" "}
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              You don&rsquo;t have to touch anything &mdash; the band plays itself.
              Tapping a sky-friend just makes it sing a little louder.
            </p>
          </div>
        )}
      </div>

      {/* expandable design notes panel */}
      {showNotes && (
        <div className="absolute inset-x-4 bottom-4 z-30 mx-auto max-w-2xl rounded-2xl border border-border bg-black/70 p-5 text-left backdrop-blur-md">
          <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
          <p className="mt-2 text-base text-foreground">
            The real weather above you becomes a four-voice lullaby in C-major
            pentatonic &mdash; there are no wrong notes. The{" "}
            <span className="text-violet-300">Sun</span> rings warm bells (higher
            and brighter by day), the <span className="text-violet-300">Cloud</span>{" "}
            thickens a soft pad as the sky covers over, the{" "}
            <span className="text-violet-300">Wind</span> breathes a filtered
            whoosh, and the <span className="text-violet-300">Rain</span> drips
            gentle pentatonic plinks. The sky itself is a single WebGL2 fragment
            shader driven by the same live numbers.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            In the lineage of John Luther Adams&rsquo;{" "}
            <em>The Place Where You Go to Listen</em>. Data from Open-Meteo. See
            the README in this folder for the full mapping and references.
          </p>
          <Link
            href="/dream"
            className="mt-4 inline-block text-sm text-violet-300/95 hover:underline"
          >
            &larr; Back to the dream lab
          </Link>
        </div>
      )}
    </main>
  );
}
