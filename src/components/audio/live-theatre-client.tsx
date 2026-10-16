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
import { getAudioEngine, ensureResumed, attachMicDrive, getAnalyserNode, liveInputLabels, getLiveInputStatus, type LiveSource, attachSetDrive, rampSetGain } from "@/lib/audio/audio-engine";
import { getJourney } from "@/lib/journeys/journeys";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { useKioskRemote, markKioskStatusDirty } from "@/lib/audio/use-kiosk-remote";
import { startMidiInput } from "@/lib/audio/midi-input";
import type { Journey } from "@/lib/journeys/types";
import type { InstallationProgram, SequenceEntry } from "./installation-loop-client";
import { createWorldRequester } from "@/lib/journeys/live-world-queue";
import { pickLiveWorld, liveWorldPool, LIVE_SCENE_MS, LIVE_VEIL_MS, LIVE_DARK_HOLD_MS, LIVE_SONG_TITLE_MS, SET_TITLE_CARD_MS } from "@/lib/journeys/live-theatre";
import { trackTitlesHidden } from "@/lib/journeys/track-titles";
import { HorizonTitle } from "./horizon-title";
import { ExperienceTextInner } from "./installation-intro";
import {
  LIVE_SETS, planTrackWorlds, worldEntryFraction, setWorldPool, SET_FADE_OUT_MS, SET_GAP_MS, SET_FADE_IN_MS, SET_MAX_SCENE_S,
  type PlannedScene, type SetTrackAnalysis,
} from "@/lib/journeys/live-set";
import { setLiveSetDrive } from "@/lib/journeys/live-drive";
import { josephTrackUrl, josephTrackGain, JOSEPH_ANALYSIS_URL, type JosephTrack } from "@/lib/journeys/joseph-set";

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

/** Seek the world's (silent) clock track to `frac` of its length once its
 *  new source has loaded — the journey's phase follows the clock. Resolves to
 *  the time sought, or null if it never loaded (the world then plays from 0). */
function seekClockWhenReady(frac: number): Promise<number | null> {
  return new Promise((resolve) => {
    let el: HTMLAudioElement;
    try { el = getAudioEngine().audioElement; } catch { resolve(null); return; }
    let done = false;
    const go = () => {
      if (done) return;
      if (!Number.isFinite(el.duration) || el.duration <= 0) return;
      done = true;
      el.removeEventListener("loadedmetadata", go);
      const at = Math.max(0, Math.min(el.duration - 25, el.duration * frac));
      try { el.currentTime = at; } catch { resolve(null); return; }
      resolve(at);
    };
    // the src swap lands a beat after setQueue: wait for ITS metadata
    el.addEventListener("loadedmetadata", go);
    setTimeout(() => { if (!done) { done = true; el.removeEventListener("loadedmetadata", go); resolve(null); } }, 8_000);
  });
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
  // a set's song title, between songs (titles on — track-titles.ts)
  const [songTitle, setSongTitle] = useState<{ name: string; key: number } | null>(null);
  const songTitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the Resonance Theatre title card between a set's end and its next pass
  const [titleCard, setTitleCard] = useState<"in" | "out" | null>(null);
  const titleCardRef = useRef(false);
  useEffect(() => { titleCardRef.current = titleCard !== null; }, [titleCard]);
  useEffect(() => () => { if (songTitleTimer.current) clearTimeout(songTitleTimer.current); }, []);

  // LIVE SET (?liveset=joseph[&at=N], Tramokyo 2026-10-15): a set's tracks
  // play AUDIBLY in order and drive the visuals (attachSetDrive) instead of
  // the mic; worlds follow each track's analysed sections (live-set.ts).
  // Null = plain Live Theatre, unchanged.
  const setRef = useRef<{ name: string; tracks: JosephTrack[] } | null>(null);
  const setPoolRef = useRef<SequenceEntry[]>(setWorldPool(poolRef.current));
  const setElRef = useRef<HTMLAudioElement | null>(null);
  const analysesRef = useRef<Record<string, SetTrackAnalysis>>({});
  const setLevelRef = useRef(1);
  /** the playing track's level-match trim (joseph-set.ts josephTrackGain) */
  const trimRef = useRef(1);
  /** a track that can't play moves the set on (once per attempt) — never a silent stall */
  const failRef = useRef<((token: number) => void) | null>(null);
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

  // PUSH the status on every change (QA 2026-10-15: the phone trailed ~2 s
  // behind the 1 Hz heartbeat) — a world, a set track, a state.
  const statusChanged = useCallback(() => {
    publishSetStatus();
    markKioskStatusDirty();
  }, [publishSetStatus]);

  // "Next world" taps that land while a change is in flight (QA 2026-10-15:
  // they were silently dropped for ~3-4 s after every change, including
  // right after entering Live) are QUEUED and run once the dip completes.
  const worldQueueRef = useRef(createWorldRequester(() => busyRef.current));

  // One scene change: the next world hands over in view, like the loop's journeys.
  const nextWorld = useCallback(async (reasonIn: string | (() => string), forcedIn?: SequenceEntry | null | (() => SequenceEntry | null | undefined), energy?: "low" | "mid" | "high" | null): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      const first = sceneStartRef.current === 0;
      // NO DIP (Karel 2026-10-16: "your transitions for josephs set should be
      // like other sets … all others have perfectly smooth transitions visually
      // not a fade to black"): the next world hands over exactly as the loop's
      // journeys do — stills, parallax and the shader crossfade carry it.
      const reason = typeof reasonIn === "function" ? reasonIn() : reasonIn;
      const forced = typeof forcedIn === "function" ? forcedIn() : forcedIn;
      const entry = forced ?? pickLiveWorld(setRef.current ? setPoolRef.current : poolRef.current, historyRef.current, Math.random);
      if (!entry?.track) return true;
      historyRef.current = [...historyRef.current, entry.journey.id].slice(-400); // a whole pass of the catalogue
      if (!setRef.current) setVolume(0); // a live set keeps the store volume as ITS level (phone slider)
      setSuppressNextJourneyIntro(true); // no journey titles — it's Karel's music, not the track's
      setQueue([entry.track], 0);
      startEntryJourney(entry.journey);
      // open the world where its journey matches the music (live-set.ts
      // worldEntryFraction) — its body, not its opening, every time
      const frac = worldEntryFraction(energy);
      void seekClockWhenReady(frac).then((at) => { if (at !== null) postEvent(`live-world-entry ${entry.journey.name} @${Math.round(at)}s (${Math.round(frac * 100)}%, ${energy ?? "any"})`); });
      (window as unknown as Record<string, unknown>).__resonanceKioskPhaseLabel = `LIVE · ${entry.journey.name}`;
      postEvent(`live-world ${entry.journey.name} (${reason})`);
      sceneStartRef.current = Date.now();
      statusChanged();
      // the first world fades up from black; every later one hands over in
      // view — the hold only spaces changes so two never stack
      if (first) {
        await new Promise((r) => setTimeout(r, LIVE_DARK_HOLD_MS));
        setVeil(0);
      }
      await new Promise((r) => setTimeout(r, LIVE_VEIL_MS));
    } finally {
      busyRef.current = false;
      const queued = worldQueueRef.current.next();
      if (queued) setTimeout(queued, 0);
    }
    return true;
  }, [setQueue, setVolume, setSuppressNextJourneyIntro, startEntryJourney, statusChanged]);

  // A world change that must happen (a new set track): waits out a change in
  // flight, then runs — unless a newer set action superseded it (token).
  // QA 2026-10-15: a jump during another jump's dip opened the superseded
  // track's world, then dipped AGAIN for the new one — the opening world is
  // now resolved under black (the newest track's), and a change whose world
  // is already on screen is skipped.
  const waitWorld = useCallback(async (reason: string, entry: SequenceEntry | null | undefined, token: number) => {
    for (let i = 0; i < 60 && busyRef.current; i++) await new Promise((r) => setTimeout(r, 250));
    const st = setStateRef.current;
    if (token !== st.token) return;
    if (entry && historyRef.current[historyRef.current.length - 1] === entry.journey.id) return;
    const set = setRef.current;
    await nextWorld(
      () => (token === st.token || !set ? reason : `set ${st.idx + 1} ${set.tracks[st.idx]?.title ?? ""}`),
      () => (token === st.token ? entry ?? null : st.scenes[0]?.world ?? entry ?? null),
      st.scenes[0]?.energy,
    );
  }, [nextWorld]);

  // One set track: fade the playing one out under the world's dip, a short
  // gap, then the next from its start — never a cut. Any index, any time.
  // Past the last track = the end of the set (fade out, wander on).
  const playSetTrack = useCallback(async (idx: number, reason: string) => {
    const set = setRef.current;
    const el = setElRef.current;
    if (!set || !el || set.tracks.length === 0) return;
    const st = setStateRef.current;
    const token = ++st.token;
    // QA 2026-10-15: "audible" was state === "playing" — a jump during a
    // fade-in or a fade-out paused a half-loud track outright (a click / cut).
    // Whatever is sounding now fades from where it is.
    const wasAudible = !el.paused;
    if (idx >= set.tracks.length) {
      // QA 2026-10-15: skip on the last track restarted it — it ends the set
      st.state = "fading";
      statusChanged();
      if (wasAudible) await rampSetGain(0, SET_FADE_OUT_MS);
      if (token !== st.token) return;
      el.pause();
      st.state = "ended";
      statusChanged();
      // THE SET LOOPS through the title card (Karel 2026-10-16: "any time a set
      // completes you go to title card for a good 10 seconds then loop the set
      // with the resonance theatre title always there as a point between
      // starting again"): dip to black, the Resonance Theatre card, then track 1
      // (the next track's own world fades up from the black).
      postEvent(`liveset-end ${set.name} (${reason}) — title card, then the set again`);
      setVeil(1);
      await new Promise((r) => setTimeout(r, LIVE_VEIL_MS));
      if (token !== st.token) return setVeil(0);
      setTitleCard("in");
      await new Promise((r) => setTimeout(r, SET_TITLE_CARD_MS - LIVE_DARK_HOLD_MS));
      if (token !== st.token) { setTitleCard(null); return setVeil(0); }
      // track 1 and its world start BEHIND the card; the card then lifts
      // straight onto them (no black beat after it)
      titleCardRef.current = false;
      void playSetTrack(0, "set loop");
      await new Promise((r) => setTimeout(r, LIVE_DARK_HOLD_MS));
      setVeil(0);
      setTitleCard("out");
      setTimeout(() => setTitleCard((c) => (c === "out" ? null : c)), 1_500);
      return;
    }
    const i = Math.max(0, idx);
    const track = set.tracks[i];
    st.idx = i;
    st.state = "fading";
    statusChanged();
    st.scenes = planTrackWorlds(track, analysesRef.current[track.id] ?? null, poolRef.current, historyRef.current.slice(-Math.max(1, setPoolRef.current.length - 1)));
    st.next = 1;
    const world = waitWorld(`set ${i + 1} ${track.title}`, st.scenes[0]?.world, token);
    if (wasAudible) await rampSetGain(0, SET_FADE_OUT_MS);
    if (token !== st.token) return;
    el.pause();
    st.state = "gap";
    statusChanged();
    // the next file loads DURING the gap, so the silence is the designed gap, not gap + load
    el.src = josephTrackUrl(track.id);
    try { el.load(); } catch { /* loads on play */ }
    trimRef.current = josephTrackGain(track.id);
    await new Promise((r) => setTimeout(r, SET_GAP_MS));
    if (token !== st.token) return;
    try {
      await el.play();
    } catch (e) {
      if (token !== st.token) return; // superseded mid-start (AbortError) — not a failure
      postEvent(`liveset play FAILED ${track.id}: ${e instanceof Error ? e.message : String(e)} — on to the next`);
      failRef.current?.(token);
      return;
    }
    if (token !== st.token) return;
    st.state = "playing";
    statusChanged();
    void rampSetGain(setLevelRef.current * trimRef.current, SET_FADE_IN_MS);
    // the song's title rises as its world does (titles on, from the phone)
    if (!trackTitlesHidden()) {
      if (songTitleTimer.current) clearTimeout(songTitleTimer.current);
      setSongTitle((t) => ({ name: track.title, key: (t?.key ?? 0) + 1 }));
      songTitleTimer.current = setTimeout(() => setSongTitle(null), LIVE_SONG_TITLE_MS);
    }
    postEvent(`liveset-track ${set.name} ${i + 1}/${set.tracks.length} ${track.title} (${reason}) trim ${(20 * Math.log10(trimRef.current)).toFixed(1)} dB worlds: ${st.scenes.map((s) => `${Math.round(s.at)}s ${s.world.journey.name}`).join(" · ")}`);
    await world;
  }, [waitWorld, statusChanged]);

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
      setLiveSetDrive(true); // every world answers the set's beats harder (live-drive.ts)
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
        if (setStateRef.current.state === "playing") void rampSetGain(s.volume * trimRef.current, 300);
      });
      const onEnded = () => {
        const st = setStateRef.current;
        if (st.state === "playing") void playSetTrack(st.idx + 1, "next"); // past the last = the set ends
      };
      let failedToken = -1;
      failRef.current = (token: number) => {
        const st = setStateRef.current;
        if (token !== st.token || failedToken === token) return;
        failedToken = token;
        st.state = "ended"; // nothing audible; the world keeps wandering until the next track starts
        statusChanged();
        setTimeout(() => { if (token === setStateRef.current.token) void playSetTrack(st.idx + 1, "after a failed track"); }, 2_000);
      };
      const onError = () => {
        postEvent(`liveset audio-error ${el.currentSrc} (${el.error?.code ?? "?"})`);
        // a decode/network failure MID-track: on to the next (a failed start is handled by play())
        if (setStateRef.current.state === "playing") failRef.current?.(setStateRef.current.token);
      };
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
            const plan = planTrackWorlds(t, analysesRef.current[t.id] ?? null, poolRef.current, recent.slice(-Math.max(1, setPoolRef.current.length - 1)));
            recent.push(...plan.map((p) => p.world.journey.id));
            return { n: n + 1, title: t.title, arc: analysesRef.current[t.id]?.arc ?? null, worlds: plan.map((p) => `${Math.round(p.at)}s ${p.energy} ${p.world.journey.name}`) };
          });
          void playSetTrack(at - 1, "start");
        });
      return () => {
        setLiveSetDrive(false);
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
      const status = getLiveInputStatus();
      postEvent(ok
        ? `live-mic on (${liveSrc}: ${liveInputLabels().join(" + ") || "default input"})${status?.note ? ` — ${status.note}` : ""}`
        : `live-mic UNAVAILABLE (${liveSrc}${status?.note ? `: ${status.note}` : "; visuals drift on their own"})`);
      const an = getAnalyserNode();
      // diagnostics handles (on-kiosk check script) + a level line every 30 s
      // in the events log, so the mic drive can be tuned from real show levels
      const w = window as unknown as Record<string, unknown>;
      // the phone reads what live mode hears (kiosk status "liveinput")
      w.__resonanceLiveInput = status ?? { src: liveSrc, ok, inputs: [], missing: [], note: ok ? null : "unavailable" };
      w.__liveAnalyser = an;
      try { w.__liveClock = getAudioEngine().audioElement; } catch { /* engine warming */ }
      if (ok && an) {
        const d = new Uint8Array(an.frequencyBinCount);
        let peak = 0, sum = 0, n = 0;
        sampleTimer = setInterval(() => {
          an.getByteFrequencyData(d);
          const v = d.reduce((a, x) => a + x, 0) / d.length / 255;
          peak = Math.max(peak, v); sum += v; n++;
          // status refresh (an input lost mid-show shows up on the phone) + the live level
          const cur = getLiveInputStatus();
          if (cur) w.__resonanceLiveInput = { ...cur, level: Math.round(v * 1000) / 1000 };
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
      setLiveSetDrive(false);
      setInstallationMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scene clock: a new world every LIVE_SCENE_MS, or before its clock track runs out.
  useEffect(() => {
    const id = setInterval(() => {
      publishSetStatus();
      // no world change behind the set-loop title card
      if (busyRef.current || !sceneStartRef.current || titleCardRef.current) return;
      const s = useAudioStore.getState();
      const left = s.duration > 0 ? s.duration - s.currentTime : Infinity;
      if (setRef.current) {
        // LIVE SET: worlds change on the playing track's section boundaries
        const st = setStateRef.current;
        const el = setElRef.current;
        if (st.state === "playing" && el) {
          // QA 2026-10-15: after a seek / stall every passed section fired in
          // turn (three dips in 20 s) — jump to the LATEST due one, and none
          // in a track's last 20 s (the next track brings its own world)
          let k = st.next;
          while (st.scenes[k] && el.currentTime >= st.scenes[k].at) k++;
          if (k > st.next) {
            const sc = st.scenes[k - 1];
            st.next = k;
            const tail = Number.isFinite(el.duration) ? el.duration - el.currentTime : Infinity;
            if (tail >= 20) {
              void nextWorld(`section @${Math.round(sc.at)}s`, sc.world, sc.energy);
              return;
            }
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
    // a "next world" now, or — mid-change — queued for right after it (≤ 3)
    // a "next world" now, or — mid-change — queued for right after it (≤ 3);
    // a queued one that still finds a change in flight (a set track's world
    // got there first) queues again — never dropped
    const requestWorld = (attempt: () => Promise<boolean>) => {
      const run = () => { void attempt().then((ok) => { if (!ok) requestWorld(attempt); }); };
      const r = worldQueueRef.current.request(run);
      if (r !== "ran") postEvent(`live remote world ${r} (${worldQueueRef.current.pending} waiting)`);
    };
    const onNext = () => {
      if (inSet()) void playSetTrack(setStateRef.current.idx + 1, "remote skip");
      else requestWorld(() => nextWorld("remote"));
    };
    const onPrev = () => {
      if (setRef.current) void playSetTrack(Math.max(0, setStateRef.current.idx - (setStateRef.current.state === "ended" ? 0 : 1)), "remote prev");
    };
    const onJump = (e: Event) => {
      const n = Number((e as CustomEvent).detail);
      if (setRef.current && Number.isFinite(n)) void playSetTrack(n - 1, "remote jump");
    };
    const onWorld = () => requestWorld(async () => {
      if (busyRef.current) return false;
      // resolved when it RUNS (a queued tap takes the scene due then)
      const st = setStateRef.current;
      const sc = inSet() ? st.scenes[st.next] : undefined;
      if (sc) st.next++;
      return nextWorld("remote world", sc?.world ?? (setRef.current ? spareWorld() : null), sc?.energy);
    });
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
      {titleCard && (
        // the loop's own statement card (installation-loop-client "statement"
        // phase) — the same component, untouched; this only fades it
        <div
          className="pointer-events-none absolute inset-0 z-[205] flex flex-col items-center justify-center bg-void px-8 text-center"
          style={{ opacity: titleCard === "in" ? 1 : 0, transition: "opacity 1500ms ease-out" }}
        >
          <div style={{ animation: "liveTitleCardFade 1400ms ease-out forwards", opacity: 0 }}>
            <ExperienceTextInner animate={false} />
          </div>
          <style jsx>{`
            @keyframes liveTitleCardFade {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
        </div>
      )}
      {songTitle && (
        <div
          key={songTitle.key}
          className="pointer-events-none absolute inset-0 z-[210] flex items-center justify-center"
          style={{ animation: `journeyIntroAnim ${LIVE_SONG_TITLE_MS}ms ease-in-out forwards` }}
        >
          <HorizonTitle name={songTitle.name} under={setRef.current?.name === "joseph" ? "Music by Joseph" : null} fit />
        </div>
      )}
    </div>
  );
}
