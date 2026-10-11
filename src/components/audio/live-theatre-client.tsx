"use client";

// LIVE THEATRE (Karel 2026-10-11: "ill also have my nord and live performance
// mixed in ... i need you to create a collage of everything that goes on as i
// play endlessly"). Karel plays the Nord through the Hyperboom; the kiosk only
// LISTENS (built-in mic) and wanders the whole catalogue: every ~2.5 min it
// dips to black and opens another journey's world — its stills, clips,
// shaders, palette, particles — driven by his playing. Endless, no titles.
//
// Isolated from the attract loop on purpose: the loop's watchdogs (skip,
// stall-reload, wedge-reload) would end a world that has no audible track.
// Here each world's REAL track plays at volume 0 as the clock (so images,
// particles and shader rotation advance exactly as tested in the loop) while
// the analyser hears only the mic (audio-engine attachMicDrive). Entering and
// leaving are full page loads (phone: "Live" / "Back to loop").

import { useCallback, useEffect, useRef, useState } from "react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed, attachMicDrive, getAnalyserNode } from "@/lib/audio/audio-engine";
import { getJourney } from "@/lib/journeys/journeys";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { useKioskRemote } from "@/lib/audio/use-kiosk-remote";
import type { Journey } from "@/lib/journeys/types";
import type { InstallationProgram, SequenceEntry } from "./installation-loop-client";
import { pickLiveWorld, liveWorldPool, LIVE_SCENE_MS, LIVE_VEIL_MS, LIVE_DARK_HOLD_MS } from "@/lib/journeys/live-theatre";

function postEvent(event: string) {
  try {
    void fetch("/api/pack/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never let logging hurt the show */ }
}

export function LiveTheatreClient({ programs }: { programs: InstallationProgram[] }) {
  useKioskRemote("live");
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const setVolume = useAudioStore((s) => s.setVolume);
  const startJourney = useAudioStore((s) => s.startJourney);
  const startCustomJourney = useAudioStore((s) => s.startCustomJourney);
  const setSuppressNextJourneyIntro = useAudioStore((s) => s.setSuppressNextJourneyIntro);

  const poolRef = useRef<SequenceEntry[]>(liveWorldPool(programs));
  const historyRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const sceneStartRef = useRef(0);
  const [veil, setVeil] = useState(1); // starts black, fades up on the first world

  const startEntryJourney = useCallback(
    (journey: Journey) => {
      if (getJourney(journey.id) ?? getCulminationJourney(journey.id)) startJourney(journey.id);
      else startCustomJourney(journey);
    },
    [startJourney, startCustomJourney],
  );

  // One scene change: dip to black, open the next world while dark, fade up.
  const nextWorld = useCallback(async (reason: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const first = sceneStartRef.current === 0;
      if (!first) {
        setVeil(1);
        await new Promise((r) => setTimeout(r, LIVE_VEIL_MS));
      }
      const entry = pickLiveWorld(poolRef.current, historyRef.current, Math.random);
      if (!entry?.track) return;
      historyRef.current = [...historyRef.current, entry.journey.id].slice(-12);
      setVolume(0);
      setSuppressNextJourneyIntro(true); // no journey titles — it's Karel's music, not the track's
      setQueue([entry.track], 0);
      startEntryJourney(entry.journey);
      (window as unknown as Record<string, unknown>).__resonanceKioskPhaseLabel = `LIVE · ${entry.journey.name}`;
      postEvent(`live-world ${entry.journey.name} (${reason})`);
      sceneStartRef.current = Date.now();
      // the handoff (stills, parallax, shader crossfade) settles under black
      await new Promise((r) => setTimeout(r, LIVE_DARK_HOLD_MS));
      setVeil(0);
      await new Promise((r) => setTimeout(r, LIVE_VEIL_MS));
    } finally {
      busyRef.current = false;
    }
  }, [setQueue, setVolume, setSuppressNextJourneyIntro, startEntryJourney]);

  // Mount: kiosk mode, the mic, the first world.
  useEffect(() => {
    setInstallationMode(true);
    setVolume(0);
    try {
      const eng = getAudioEngine();
      eng.audioElement.muted = true; // belt and braces: the clock track is never heard
      ensureResumed();
    } catch { /* engine warming */ }
    const q = new URLSearchParams(window.location.search);
    const pre = Number(q.get("micgain"));
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    let sampleTimer: ReturnType<typeof setInterval> | null = null;
    void attachMicDrive(Number.isFinite(pre) && pre > 0 ? pre : undefined).then((ok) => {
      postEvent(ok ? "live-mic on" : "live-mic UNAVAILABLE (visuals drift on their own)");
      const an = getAnalyserNode();
      // diagnostics handles (on-kiosk check script) + a level line every 30 s
      // in the events log, so the mic drive can be tuned from real show levels
      const w = window as unknown as Record<string, unknown>;
      w.__liveAnalyser = an;
      try { w.__liveClock = getAudioEngine().audioElement; } catch { /* engine warming */ }
      if (ok && an) {
        const d = new Uint8Array(an.frequencyBinCount);
        let peak = 0, sum = 0, n = 0;
        sampleTimer = setInterval(() => {
          an.getByteFrequencyData(d);
          const v = d.reduce((a, x) => a + x, 0) / d.length / 255;
          peak = Math.max(peak, v); sum += v; n++;
        }, 500);
        levelTimer = setInterval(() => {
          postEvent(`live-mic level avg=${(sum / Math.max(1, n)).toFixed(3)} peak=${peak.toFixed(3)}`);
          peak = 0; sum = 0; n = 0;
        }, 30_000);
      }
    });
    postEvent(`live-start (${poolRef.current.length} worlds)`);
    void nextWorld("start");
    return () => {
      if (levelTimer) clearInterval(levelTimer);
      if (sampleTimer) clearInterval(sampleTimer);
      setInstallationMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scene clock: a new world every LIVE_SCENE_MS, or before its clock track runs out.
  useEffect(() => {
    const id = setInterval(() => {
      if (busyRef.current || !sceneStartRef.current) return;
      const s = useAudioStore.getState();
      const left = s.duration > 0 ? s.duration - s.currentTime : Infinity;
      if (Date.now() - sceneStartRef.current > LIVE_SCENE_MS) void nextWorld("scene");
      else if (left < (LIVE_VEIL_MS / 1000) + 4) void nextWorld("track-end");
    }, 1000);
    const onNext = () => void nextWorld("remote");
    window.addEventListener("live-next", onNext);
    return () => {
      clearInterval(id);
      window.removeEventListener("live-next", onNext);
    };
  }, [nextWorld]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void" style={{ cursor: "none" }}>
      <VisualizerClient />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[200] bg-black"
        style={{ opacity: veil, transition: `opacity ${LIVE_VEIL_MS}ms ease-in-out` }}
      />
    </div>
  );
}
