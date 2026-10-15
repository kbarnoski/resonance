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
import { getAudioEngine, ensureResumed, attachMicDrive, getAnalyserNode, liveInputLabels, type LiveSource, attachSetDrive, rampSetGain } from "@/lib/audio/audio-engine";
import { getJourney } from "@/lib/journeys/journeys";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { useKioskRemote } from "@/lib/audio/use-kiosk-remote";
import { startMidiInput } from "@/lib/audio/midi-input";
import type { Journey } from "@/lib/journeys/types";
import type { InstallationProgram, SequenceEntry } from "./installation-loop-client";
import { pickLiveWorld, liveWorldPool, LIVE_SCENE_MS, LIVE_VEIL_MS, LIVE_DARK_HOLD_MS } from "@/lib/journeys/live-theatre";
import {
  LIVE_SETS, planTrackWorlds, setWorldPool, SET_FADE_OUT_MS, SET_GAP_MS, SET_FADE_IN_MS, SET_MAX_SCENE_S,
  type PlannedScene, type SetTrackAnalysis,
} from "@/lib/journeys/live-set";
import { josephTrackUrl, JOSEPH_ANALYSIS_URL, type JosephTrack } from "@/lib/journeys/joseph-set";

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

  // LIVE SET (?liveset=joseph[&at=N], Tramokyo 2026-10-15): a set's tracks
  // play AUDIBLY in order and drive the visuals (attachSetDrive) instead of
  // the mic; worlds follow each track's analysed sections (live-set.ts).
  // Null = plain Live Theatre, unchanged.
  const setRef = useRef<{ name: string; tracks: JosephTrack[] } | null>(null);
  const setPoolRef = useRef<SequenceEntry[]>(setWorldPool(poolRef.current));
  const setElRef = useRef<HTMLAudioElement | null>(null);
  const analysesRef = useRef<Record<string, SetTrackAnalysis>>({});
  const setLevelRef = useRef(1);
  const setStateRef = useRef<{
    idx: number;
    state: "loading" | "fading" | "gap" | "playing" | "ended";
    scenes: PlannedScene<SequenceEntry>[];
    next: number;
    token: number;
  }>({ idx: -1, state: "loading", scenes: [], next: 0, token: 0 });

  const startEntryJourney = useCallback(
    (journey: Journey) => {
      if (getJourney(journey.id) ?? getCulminationJourney(journey.id)) startJourney(journey.id);
      else startCustomJourney(journey);
    },
    [startJourney, startCustomJourney],
  );

  // One scene change: dip to black, open the next world while dark, fade up.
  const nextWorld = useCallback(async (reason: string, forced?: SequenceEntry | null): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const first = sceneStartRef.current === 0;
      if (!first) {
        setVeil(1);
        await new Promise((r) => setTimeout(r, LIVE_VEIL_MS));
      }
      const entry = forced ?? pickLiveWorld(setRef.current ? setPoolRef.current : poolRef.current, historyRef.current, Math.random);
      if (!entry?.track) return true;
      historyRef.current = [...historyRef.current, entry.journey.id].slice(-12);
      if (!setRef.current) setVolume(0); // a live set keeps the store volume as ITS level (phone slider)
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
    return true;
  }, [setQueue, setVolume, setSuppressNextJourneyIntro, startEntryJourney]);

  // A world change that must happen (a new set track): waits out a change in
  // flight, then runs — unless a newer set action superseded it (token).
  const waitWorld = useCallback(async (reason: string, entry: SequenceEntry | null | undefined, token: number) => {
    for (let i = 0; i < 60 && busyRef.current; i++) await new Promise((r) => setTimeout(r, 250));
    if (token !== setStateRef.current.token) return;
    await nextWorld(reason, entry ?? null);
  }, [nextWorld]);

  // One set track: fade the playing one out under the world's dip, a short
  // gap, then the next from its start — never a cut. Any index, any time.
  const playSetTrack = useCallback(async (idx: number, reason: string) => {
    const set = setRef.current;
    const el = setElRef.current;
    if (!set || !el || set.tracks.length === 0) return;
    const st = setStateRef.current;
    const token = ++st.token;
    const i = Math.max(0, Math.min(set.tracks.length - 1, idx));
    const track = set.tracks[i];
    const wasAudible = st.state === "playing" && !el.paused;
    st.idx = i;
    st.state = "fading";
    st.scenes = planTrackWorlds(track, analysesRef.current[track.id] ?? null, poolRef.current, historyRef.current.slice(-4));
    st.next = 1;
    const world = waitWorld(`set ${i + 1} ${track.title}`, st.scenes[0]?.world, token);
    if (wasAudible) await rampSetGain(0, SET_FADE_OUT_MS);
    if (token !== st.token) return;
    el.pause();
    st.state = "gap";
    await new Promise((r) => setTimeout(r, SET_GAP_MS));
    if (token !== st.token) return;
    el.src = josephTrackUrl(track.id);
    try {
      await el.play();
    } catch (e) {
      postEvent(`liveset play FAILED ${track.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (token !== st.token) return;
    st.state = "playing";
    void rampSetGain(setLevelRef.current, SET_FADE_IN_MS);
    postEvent(`liveset-track ${set.name} ${i + 1}/${set.tracks.length} ${track.title} (${reason}) worlds: ${st.scenes.map((s) => `${Math.round(s.at)}s ${s.world.journey.name}`).join(" · ")}`);
    await world;
  }, [waitWorld]);

  // a spare world when the clock track runs out or a scene overstays:
  // the playing track's own matches first, else the whole set pool
  const spareWorld = useCallback((): SequenceEntry | null => {
    const st = setStateRef.current;
    const own = st.state === "ended" ? [] : st.scenes.map((s) => s.world);
    return pickLiveWorld(own.length > 1 ? own : setPoolRef.current, historyRef.current, Math.random);
  }, []);

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
    const setName = q.get("liveset");
    if (setName && LIVE_SETS[setName]) {
      // LIVE SET: the set is heard and drives the visuals — no mic, no MIDI.
      const tracks = LIVE_SETS[setName]();
      setRef.current = { name: setName, tracks };
      const el = new Audio();
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      setElRef.current = el;
      const gain = attachSetDrive(el);
      const w = window as unknown as Record<string, unknown>;
      w.__liveAnalyser = getAnalyserNode();
      w.__liveSetAudio = el;
      try { w.__liveClock = getAudioEngine().audioElement; } catch { /* engine warming */ }
      // the store volume is the set's level from here (phone volume slider)
      setVolume(1);
      setLevelRef.current = 1;
      const unsubVol = useAudioStore.subscribe((s, p) => {
        if (s.volume === p.volume) return;
        setLevelRef.current = s.volume;
        if (setStateRef.current.state === "playing") void rampSetGain(s.volume, 300);
      });
      const onEnded = () => {
        const st = setStateRef.current;
        if (st.idx < tracks.length - 1) void playSetTrack(st.idx + 1, "next");
        else {
          st.state = "ended";
          st.token++;
          postEvent(`liveset-end ${setName} — wandering on`);
        }
      };
      const onError = () => postEvent(`liveset audio-error ${el.currentSrc} (${el.error?.code ?? "?"})`);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
      const at = Math.max(1, Math.min(tracks.length, Math.floor(Number(q.get("at")) || 1)));
      postEvent(`liveset-start ${setName} at ${at}/${tracks.length} (${setPoolRef.current.length} worlds${gain ? "" : ", drive UNAVAILABLE"})`);
      void fetch(JOSEPH_ANALYSIS_URL, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((data: { tracks?: SetTrackAnalysis[] } | null) => {
          for (const t of data?.tracks ?? []) analysesRef.current[t.id] = t;
          if (!data) postEvent("liveset analysis missing — worlds change every 150 s");
          // the whole set's plan, for checks (on-kiosk / lab)
          const recent: string[] = [];
          w.__resonanceLiveSetPlan = tracks.map((t, n) => {
            const plan = planTrackWorlds(t, analysesRef.current[t.id] ?? null, poolRef.current, recent.slice(-4));
            recent.push(...plan.map((p) => p.world.journey.id));
            return { n: n + 1, title: t.title, arc: analysesRef.current[t.id]?.arc ?? null, worlds: plan.map((p) => `${Math.round(p.at)}s ${p.energy} ${p.world.journey.name}`) };
          });
          void playSetTrack(at - 1, "start");
        });
      return () => {
        unsubVol();
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
        setStateRef.current.token++;
        el.pause();
        setInstallationMode(false);
      };
    }
    const pre = Number(q.get("micgain"));
    let levelTimer: ReturnType<typeof setInterval> | null = null;
    let sampleTimer: ReturnType<typeof setInterval> | null = null;
    const srcQ = q.get("livesrc");
    const liveSrc: LiveSource = srcQ === "laptop" || srcQ === "both" ? srcQ : "mic";
    void attachMicDrive(Number.isFinite(pre) && pre > 0 ? pre : undefined, liveSrc).then((ok) => {
      postEvent(ok ? `live-mic on (${liveSrc}: ${liveInputLabels().join(" + ") || "default input"})` : `live-mic UNAVAILABLE (${liveSrc}${liveSrc !== "mic" ? " — is BlackHole installed?" : ""}; visuals drift on their own)`);
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
    // THE NORD OVER USB (midi-input.ts): ask for Web MIDI once; while he
    // plays it the particle features read his exact notes, velocities and
    // pedal instead of guessing from the mic (midi-drive.ts). Denied or no
    // keyboard → silently stay on the mic.
    void startMidiInput(postEvent).then((ok) => postEvent(ok ? "live-midi ready" : "live-midi unavailable (mic only)"));
    postEvent(`live-start (${poolRef.current.length} worlds)`);
    void nextWorld("start");
    return () => {
      if (levelTimer) clearInterval(levelTimer);
      if (sampleTimer) clearInterval(sampleTimer);
      setInstallationMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The phone reads this through the kiosk status (use-kiosk-remote.ts):
  // what's playing in the set, where, and what's next.
  const publishSetStatus = useCallback(() => {
    const set = setRef.current;
    if (!set) return;
    const st = setStateRef.current;
    const el = setElRef.current;
    const t = set.tracks[st.idx];
    (window as unknown as Record<string, unknown>).__resonanceLiveSet = {
      set: set.name,
      index: st.idx + 1, // 1-based, as liveset:<set>@N
      count: set.tracks.length,
      id: t?.id ?? null,
      title: t?.title ?? null,
      state: st.state,
      isPlaying: st.state === "playing" && !!el && !el.paused,
      // mid-handoff (fading / gap) the element still holds the OLD track: report the new one at 0
      currentTime: el && (st.state === "playing" || st.state === "ended") ? Math.round(el.currentTime) : 0,
      duration: el && (st.state === "playing" || st.state === "ended") && Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : (t?.duration ?? 0),
      next: set.tracks[st.idx + 1]?.title ?? null,
      world: useAudioStore.getState().activeJourney?.name ?? null,
      tracks: set.tracks.map((x, n) => ({ n: n + 1, id: x.id, title: x.title, duration: x.duration })),
    };
  }, []);

  // Scene clock: a new world every LIVE_SCENE_MS, or before its clock track runs out.
  useEffect(() => {
    const id = setInterval(() => {
      publishSetStatus();
      if (busyRef.current || !sceneStartRef.current) return;
      const s = useAudioStore.getState();
      const left = s.duration > 0 ? s.duration - s.currentTime : Infinity;
      if (setRef.current) {
        // LIVE SET: worlds change on the playing track's section boundaries
        const st = setStateRef.current;
        const el = setElRef.current;
        if (st.state === "playing" && el) {
          const sc = st.scenes[st.next];
          if (sc && el.currentTime >= sc.at) {
            st.next++;
            void nextWorld(`section @${Math.round(sc.at)}s`, sc.world);
            return;
          }
        }
        if (st.state === "playing" || st.state === "ended") {
          const cap = st.state === "ended" ? LIVE_SCENE_MS : SET_MAX_SCENE_S * 1000 + 20_000;
          if (Date.now() - sceneStartRef.current > cap) void nextWorld("scene", spareWorld());
          else if (left < (LIVE_VEIL_MS / 1000) + 4) void nextWorld("track-end", spareWorld());
        }
        return;
      }
      if (Date.now() - sceneStartRef.current > LIVE_SCENE_MS) void nextWorld("scene");
      else if (left < (LIVE_VEIL_MS / 1000) + 4) void nextWorld("track-end");
    }, 1000);
    // phone: skip / prev = next / previous set track (plain live: next world);
    // liveset:joseph@N = that track now; liveset:world = next world, same track
    const inSet = () => !!setRef.current && setStateRef.current.state !== "ended";
    const onNext = () => {
      if (inSet()) void playSetTrack(setStateRef.current.idx + 1, "remote skip");
      else void nextWorld("remote");
    };
    const onPrev = () => {
      if (setRef.current) void playSetTrack(Math.max(0, setStateRef.current.idx - (setStateRef.current.state === "ended" ? 0 : 1)), "remote prev");
    };
    const onJump = (e: Event) => {
      const n = Number((e as CustomEvent).detail);
      if (setRef.current && Number.isFinite(n)) void playSetTrack(n - 1, "remote jump");
    };
    const onWorld = () => {
      const st = setStateRef.current;
      const sc = inSet() ? st.scenes[st.next] : undefined;
      if (sc) st.next++;
      void nextWorld("remote world", sc?.world ?? (setRef.current ? spareWorld() : null));
    };
    window.addEventListener("live-next", onNext);
    window.addEventListener("live-prev", onPrev);
    window.addEventListener("liveset-jump", onJump);
    window.addEventListener("liveset-world", onWorld);
    return () => {
      clearInterval(id);
      window.removeEventListener("live-next", onNext);
      window.removeEventListener("live-prev", onPrev);
      window.removeEventListener("liveset-jump", onJump);
      window.removeEventListener("liveset-world", onWorld);
    };
  }, [nextWorld, playSetTrack, spareWorld, publishSetStatus]);

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
