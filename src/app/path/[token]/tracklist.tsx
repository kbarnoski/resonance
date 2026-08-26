"use client";

/**
 * Client-side tracklist with hover/touch audio preload.
 *
 * Moving the list out of the server page so we can attach pointer
 * handlers that warm the browser cache for a track's audio file
 * before the user actually clicks. By the time they commit, the
 * file is usually already downloaded, so the transition from path
 * screen → in-room journey feels instant.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { usePathProgressStore } from "@/lib/journeys/path-progress-store";
import { Eyebrow, DisplayTitle, MonoLabel } from "@/components/ui/typography";

interface TrackRow {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  share_token: string | null;
  recording_id: string | null;
}

interface TracklistProps {
  journeys: TrackRow[];
  isInAppContext: boolean;
  pathToken: string;
  accent: string;
  glow: string;
}

export function Tracklist({ journeys, isInAppContext, pathToken, accent, glow }: TracklistProps) {
  const router = useRouter();
  const preloadedRef = useRef(new Set<string>());

  // Hydration guard — the progress store reads from localStorage on
  // client only. Render the list with no dots lit on the first paint,
  // then reconcile once we're mounted. This matches CulminationCard's
  // approach and avoids SSR/client mismatch warnings.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const completedIds = usePathProgressStore((s) => s.completedJourneyIds);
  const completedSet = mounted ? new Set(completedIds) : new Set<string>();

  // Prefetch the back destination as soon as the path screen mounts.
  // /room is dynamic (reads auth cookies) so Next.js skips viewport
  // prefetch for it — we have to ask explicitly. By the time the user
  // clicks ← back, the RSC payload is already cached and the transition
  // back to The Room feels instant.
  useEffect(() => {
    if (!isInAppContext) return;
    try { router.prefetch("/room"); } catch {}
  }, [isInAppContext, router]);

  const preloadTrack = useCallback(
    (journey: TrackRow) => {
      if (!journey.recording_id) return;
      const key = journey.id;
      if (preloadedRef.current.has(key)) return;
      preloadedRef.current.add(key);

      // Warm the audio file cache. /api/audio/[id] returns a signed URL
      // (JSON) — we follow it to actually fetch the audio bytes so they
      // sit in the browser cache ready for the real <audio> play().
      (async () => {
        try {
          const res = await fetch(`/api/audio/${journey.recording_id}`);
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.url === "string") {
            // Small range request is enough for the browser to warm the
            // connection and the first couple of audio frames. We use a
            // low-priority fetch so it doesn't block interaction.
            fetch(data.url, { priority: "low" as RequestPriority }).catch(() => {});
          }
        } catch {
          // Best-effort preload — silently ignore failures
        }
      })();

      // Prefetch the destination route too so Next.js has the RSC
      // payload ready. Links already get viewport-prefetched but
      // hover/touch is an even stronger intent signal.
      try {
        if (isInAppContext) {
          router.prefetch(`/room?customJourneyId=${journey.id}&pathToken=${pathToken}`);
        } else if (journey.share_token) {
          router.prefetch(`/journey/${journey.share_token}?pathToken=${pathToken}`);
        }
      } catch {}
    },
    [isInAppContext, pathToken, router],
  );

  const total = journeys.length;
  const completedCount = journeys.filter((j) => completedSet.has(j.id)).length;

  return (
    <>
      {/* Progress ribbon — stepper dots above the tracklist so users
          see where they are in the path at a glance. Each dot is
          clickable and shows an instant name tooltip on hover. */}
      <div
        className="mb-5 flex items-center justify-center gap-2 flex-wrap"
        style={{ opacity: mounted ? 1 : 0, transition: "opacity var(--duration-fast) ease" }}
      >
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {journeys.map((j, i) => {
            const done = completedSet.has(j.id);
            const href = isInAppContext
              ? `/room?customJourneyId=${j.id}&pathToken=${pathToken}`
              : j.share_token
                ? `/journey/${j.share_token}?pathToken=${pathToken}`
                : "#";
            const label = `${String(i + 1).padStart(2, "0")} · ${j.name}`;
            return (
              <Link
                key={j.id}
                href={href}
                prefetch
                onMouseEnter={() => preloadTrack(j)}
                onFocus={() => preloadTrack(j)}
                onTouchStart={() => preloadTrack(j)}
                aria-label={j.name}
                className="group relative inline-flex items-center justify-center"
                style={{
                  width: "28px",
                  height: "28px",
                }}
              >
                {/* Expanded hit area — 44×44 effective touch target while
                    the visual dot stays 14px. Adjacent targets overlap a
                    little; the layout pitch (28px + 8px gap) keeps each
                    dot's exclusive zone comfortably tappable. */}
                <span aria-hidden className="absolute" style={{ inset: "-8px" }} />
                <span
                  className="block transition-[background,box-shadow] duration-instant"
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: done ? accent : "rgba(255,255,255,0.15)",
                    boxShadow: done ? `0 0 8px ${glow}55` : "none",
                  }}
                />
                {/* Custom instant tooltip — shows immediately on hover,
                    no 1.5s native title delay. */}
                <span
                  className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-instant"
                  style={{
                    top: "calc(100% + 10px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(0,0,0,0.92)",
                    color: "#fff",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    whiteSpace: "nowrap",
                    fontSize: "0.78rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.03em",
                    border: "1px solid rgba(255,255,255,0.12)",
                    zIndex: 50,
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
        <Eyebrow as="span" className="ml-1 tracking-[0.08em] text-ink-faint">
          {completedCount} of {total}
        </Eyebrow>
      </div>

      <div className="space-y-2">
        {journeys.map((j, idx) => {
          const num = String(idx + 1).padStart(2, "0");
          const done = completedSet.has(j.id);
          const href = isInAppContext
            ? `/room?customJourneyId=${j.id}&pathToken=${pathToken}`
            : j.share_token
              ? `/journey/${j.share_token}?pathToken=${pathToken}`
              : "#";
          return (
            <Link
              key={j.id}
              href={href}
              prefetch
              onMouseEnter={() => preloadTrack(j)}
              onTouchStart={() => preloadTrack(j)}
              onFocus={() => preloadTrack(j)}
              className="group block rounded-xl px-5 py-4 transition-colors duration-instant hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{
                border: done
                  ? `1px solid ${accent}45`
                  : "1px solid rgba(255,255,255,0.07)",
                backgroundColor: done ? `${accent}08` : "rgba(255,255,255,0.015)",
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0 pt-0.5 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.1em",
                    color: done ? accent : "rgba(255,255,255,0.45)",
                    minWidth: "1.75rem",
                  }}
                >
                  {num}
                </div>
                <div className="flex-1 min-w-0">
                  <DisplayTitle
                    as="div"
                    className="flex items-center gap-2 font-normal text-[1.35rem] leading-[1.3] tracking-normal text-white/90 transition-colors duration-instant group-hover:text-white"
                  >
                    {j.name}
                    {done && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: accent, opacity: 0.9 }}
                      />
                    )}
                  </DisplayTitle>
                  {j.subtitle && (
                    <MonoLabel className="mt-0.5 text-[0.7rem] tracking-[0.03em] text-white/40">
                      {j.subtitle}
                    </MonoLabel>
                  )}
                  {j.description && (
                    <p
                      className="mt-2"
                      style={{
                        fontFamily: "var(--font-geist-sans)",
                        fontSize: "0.8rem",
                        color: "rgba(255,255,255,0.55)",
                        lineHeight: 1.55,
                      }}
                    >
                      {j.description}
                    </p>
                  )}
                </div>
                <Eyebrow
                  className="flex-shrink-0 self-center tracking-[0.15em] opacity-40 transition-opacity duration-instant group-hover:opacity-100"
                  style={{ color: accent }}
                >
                  {done ? "Replay →" : "Play →"}
                </Eyebrow>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
