"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { josephSet } from "@/lib/journeys/joseph-set";
import { createRepeatGuard } from "@/lib/audio/remote-send-guard";
import { SimpleRemote, type PresenterStatus } from "./simple-remote";

interface KioskProgram {
  id: string;
  label: string;
  journeys: { id: string; name: string; dur?: number | null }[];
}

interface KioskStatus {
  context?: "loop" | "room" | "live";
  programs?: KioskProgram[] | null;
  journey?: string | null;
  track?: string | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  /** Live Theatre: the Nord's USB MIDI line (null when MIDI isn't in use) */
  midi?: string | null;
  /** Presenter (auto-play / song by song) — loop context only */
  presenter?: PresenterStatus | null;
  /** LIVE SET (Joseph, live-theatre-client.tsx) — live context only */
  liveset?: LiveSetStatus | null;
  /** Live Theatre: what the kiosk listens to (its ?livesrc=), "set" in a live set */
  liveSrc?: LiveSrc | "set" | null;
  /** titles between tracks (track-titles.ts) — absent on an older kiosk build */
  titles?: "on" | "off";
  /** Live Theatre input (audio-engine LiveInputStatus + the live level) */
  liveinput?: { src: LiveSrc; ok: boolean; inputs: string[]; missing: string[]; note: string | null; level: number } | null;
}

interface LiveSetStatus {
  set: string;
  index: number; // 1-based
  count: number;
  title: string | null;
  state: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  next: string | null;
  world: string | null;
  tracks?: { n: number; id: string; title: string; duration: number }[];
}

/** The Joseph live set as the phone lists it (the kiosk's own list once it reports one). */
const JOSEPH_TRACKS_LOCAL = josephSet().map((t, i) => ({ n: i + 1, id: t.id, title: t.title, duration: t.duration }));


/** Phone status poll while the page is visible (GET is an in-memory read; the
 *  set + track lists only travel when they change — programsRev). */
const STATUS_POLL_MS = 500;
const PROGRAMS_CACHE_KEY = "resonance-remote-programs-v1";
const POLL_TIMEOUT_MS = 4_000;
const SEND_TIMEOUT_MS = 6_000;

/** AbortSignal.timeout where the phone's browser has it (iOS 16+), else none. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

function keyQuery(): string {
  if (typeof window === "undefined") return "";
  const k = new URLSearchParams(window.location.search).get("key");
  return k ? `key=${encodeURIComponent(k)}` : "";
}

type LiveSrc = "mic" | "laptop" | "both";

export function RemoteClient({
  initialStatus = null,
  initialAgeMs = null,
  extras = [],
}: {
  initialStatus?: Record<string, unknown> | null;
  initialAgeMs?: number | null;
  extras?: { id: string; name: string }[];
}) {
  // first paint already has the kiosk's lists (server-rendered from the bus)
  const [status, setStatus] = useState<KioskStatus | null>(initialStatus as KioskStatus | null);
  const [ageMs, setAgeMs] = useState<number | null>(initialAgeMs);
  // when this phone last heard the bus at all: a dropped hotspot / stopped
  // laptop must read as "waiting for kiosk…", not as the last status frozen
  const [heardAt, setHeardAt] = useState<number>(() => Date.now());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const repeatOk = useRef(createRepeatGuard());
  const programsRef = useRef<KioskStatus["programs"]>((initialStatus as KioskStatus | null)?.programs ?? null);
  const revRef = useRef<number>(0);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    // no lists from the server (kiosk not reporting yet)? the last ones this
    // phone saw — never an empty picker
    if (!programsRef.current) {
      try {
        const cached = window.localStorage.getItem(PROGRAMS_CACHE_KEY);
        if (cached) {
          programsRef.current = JSON.parse(cached);
          setStatus((st) => ({ ...(st ?? {}), programs: programsRef.current }));
        }
      } catch { /* storage blocked */ }
    }
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const q = [keyQuery(), `have=${revRef.current}`].filter(Boolean).join("&");
        // a dropped hotspot can hang a request for a minute: give up and retry
        const res = await fetch(`/api/pack/remote?${q}`, { cache: "no-store", signal: timeoutSignal(POLL_TIMEOUT_MS) });
        if (res.ok && !stopped) {
          const data = await res.json();
          const st = (data.status ?? null) as KioskStatus | null;
          if (st && st.programs !== undefined) {
            revRef.current = Number(data.programsRev) || 0;
            // Live Theatre / DJ mode report no lists (null): keep the last ones —
            // the set lists stay on the phone (a tap there returns to the loop
            // at that track) and the cache is never wiped to an empty picker
            if (Array.isArray(st.programs) && st.programs.length > 0) {
              programsRef.current = st.programs;
              try { window.localStorage.setItem(PROGRAMS_CACHE_KEY, JSON.stringify(st.programs)); } catch { /* ok */ }
            }
          }
          setStatus(st ? { ...st, programs: programsRef.current } : programsRef.current ? { programs: programsRef.current } : null);
          setAgeMs(data.statusAgeMs ?? null);
          setHeardAt(Date.now());
        }
      } catch { /* hotspot blip */ }
      inFlight = false;
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(() => void poll(), STATUS_POLL_MS);
    };
    // fast while looked at, silent in the pocket; instant catch-up on return
    const onVis = () => {
      if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void poll(); }
    };
    document.addEventListener("visibilitychange", onVis);
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const send = useCallback(async (command: string, guardKey: string = command) => {
    // a double tap sends once (remote-send-guard.ts); a toggle keys on what it
    // showed, so Pause → Play right after the label flips still goes through
    if (!repeatOk.current(guardKey, Date.now())) return;
    setSendError(null);
    try {
      const q = keyQuery();
      const res = await fetch(`/api/pack/remote${q ? `?${q}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: timeoutSignal(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        setSendError(`Command not accepted (HTTP ${res.status}) — try again`);
      }
    } catch {
      // Surfaced instead of silently swallowed — on a hotspot LAN a
      // dropped command looks identical to a slow kiosk otherwise.
      setSendError("Command didn't reach the kiosk — check the hotspot connection");
    }
  }, []);

  const effAgeMs = ageMs === null ? null : ageMs + Math.max(0, nowTick - heardAt);
  const stale = effAgeMs === null || effAgeMs > 10_000;
  const ls = status?.context === "live" && status?.liveset?.set === "joseph" ? status.liveset : null;
  const li = status?.liveinput ?? null;

  return (
    <SimpleRemote
      context={status?.context ?? null}
      presenter={status?.presenter ?? null}
      programs={status?.programs ?? []}
      journeyName={status?.journey ?? null}
      isPlaying={status?.isPlaying}
      currentTime={status?.currentTime}
      duration={status?.duration}
      volume={status?.volume}
      titles={status?.titles ?? null}
      joseph={ls ? { index: ls.index, count: ls.count, title: ls.title, state: ls.state, currentTime: ls.currentTime, duration: ls.duration, next: ls.next } : null}
      josephTracks={ls?.tracks?.length ? ls.tracks : JOSEPH_TRACKS_LOCAL}
      liveInput={li ? { ok: li.ok, inputs: li.inputs, note: li.note, level: li.level } : null}
      liveSrc={status?.liveSrc ?? null}
      midi={status?.midi ?? null}
      stale={stale}
      ageMs={effAgeMs}
      sendError={sendError}
      extras={extras}
      send={(c) => void send(c)}
    />
  );
}
