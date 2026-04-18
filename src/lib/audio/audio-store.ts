import { create } from "zustand";
import { getAudioEngine } from "./audio-engine";
import { isDesktopApp, nativeAudioSeek } from "@/lib/tauri";
import type { Journey, JourneyPhaseId, JourneyTheme } from "@/lib/journeys/types";
import type { Realm } from "@/lib/journeys/types";
import { getJourney } from "@/lib/journeys/journeys";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { getRealm } from "@/lib/journeys/realms";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { MODE_META, MODES_3D } from "@/lib/shaders";

/** Pick a random 3D World shader for the welcome screen ambient viz */
const AMBIENT_3D_MODES = Array.from(MODES_3D);
function randomAmbientMode(): string {
  return AMBIENT_3D_MODES[Math.floor(Math.random() * AMBIENT_3D_MODES.length)];
}

export interface Track {
  id: string;
  title: string;
  audioUrl: string;
  duration?: number | null;
  artist?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnalysisData = any;

interface AudioState {
  // Playback
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  volume: number;

  // Queue
  queue: Track[];
  queueIndex: number;

  // Analysis
  analysis: AnalysisData | null;
  analysisLoading: boolean;
  /** In-flight analysis progress (survives route changes) */
  analysisInProgress: { recordingId: string; stage: string; progress: number } | null;
  /** Completed analysis waiting to be picked up by the detail page */
  analysisComplete: { recordingId: string; data: AnalysisData } | null;

  // The Room UI
  roomOpen: boolean;
  vizMode: string;
  textOverlayMode: "off" | "poetry" | "story";
  vizWhisper: boolean;

  // Story Mode
  storyData: { title: string; paragraphs: { phaseId: string; text: string; imagePrompt: string; mood: string }[] } | null;
  storyLoading: boolean;
  storyCurrentParagraphIndex: number;

  // Installation mode
  installationMode: boolean;
  vizModeSequence: string[] | null;
  vizModeSequenceIndex: number;

  // Journey system
  activeJourney: Journey | null;
  activeRealm: Realm | null;
  activeTheme: JourneyTheme | null;
  journeyPhase: JourneyPhaseId | null;
  journeyProgress: number;
  aiImageEnabled: boolean;
  ambientEnabled: boolean;

  /** Active custom journey_path context. When a user plays a journey that
   *  belongs to a custom path (e.g. Welcome Home album), this is populated so
   *  the journey end overlay can render path-aware continue/culmination UI
   *  identical to built-in paths. Persists across journey transitions within
   *  the same path; cleared when the user explicitly leaves the path. */
  activePath: {
    id: string;
    name: string;
    subtitle: string | null;
    shareToken: string | null;
    journeyIds: string[];
    culminationJourneyId: string | null;
    accent: string;
    glow: string;
  } | null;

  // Cue markers for The Room
  cueMarkers: { time: number; label: string }[];

  // Room mode preference (persists across navigation)
  roomMode: "journey" | "viz";

  // Language
  language: string;

  // Internal — tells AudioProvider to skip reloading (WaveSurfer already loaded)
  _skipLoad: boolean;

  // Actions
  play: (track: Track, startTime?: number, skipLoad?: boolean) => void;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setAnalysis: (analysis: AnalysisData | null) => void;
  setAnalysisLoading: (loading: boolean) => void;
  setAnalysisInProgress: (info: { recordingId: string; stage: string; progress: number } | null) => void;
  setAnalysisComplete: (result: { recordingId: string; data: AnalysisData } | null) => void;
  openRoom: () => void;
  closeRoom: () => void;
  setVizMode: (mode: string) => void;
  setTextOverlayMode: (mode: "off" | "poetry" | "story") => void;
  setVizWhisper: (enabled: boolean) => void;
  setStoryData: (data: AudioState["storyData"]) => void;
  setStoryLoading: (loading: boolean) => void;
  setStoryCurrentParagraphIndex: (index: number) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  playNext: () => void;
  playPrev: () => void;
  clearQueue: () => void;
  clear: () => void;
  setInstallationMode: (enabled: boolean) => void;
  setVizModeSequence: (sequence: string[] | null) => void;
  cycleVizMode: () => void;
  cycleVizModePrev: () => void;

  // Cue marker actions
  setCueMarkers: (markers: { time: number; label: string }[]) => void;

  // Journey actions
  startJourney: (journeyId: string) => void;
  startCustomJourney: (journey: Journey) => void;
  stopJourney: () => void;
  setActivePath: (path: AudioState["activePath"]) => void;
  setJourneyPhase: (phase: JourneyPhaseId) => void;
  setAiImageEnabled: (enabled: boolean) => void;
  setAmbientEnabled: (enabled: boolean) => void;
  setRoomMode: (mode: "journey" | "viz") => void;
  setLanguage: (lang: string) => void;
}

export const useAudioStore = create<AudioState>()((set, get) => ({
  isPlaying: false,
  currentTrack: null,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  queue: [],
  queueIndex: -1,
  analysis: null,
  analysisLoading: false,
  analysisInProgress: null,
  analysisComplete: null,
  roomOpen: false,
  vizMode: randomAmbientMode(),
  textOverlayMode: "off",
  vizWhisper: false,
  storyData: null,
  storyLoading: false,
  storyCurrentParagraphIndex: 0,
  installationMode: false,
  vizModeSequence: null,
  vizModeSequenceIndex: 0,
  activeJourney: null,
  activeRealm: null,
  activeTheme: null,
  journeyPhase: null,
  journeyProgress: 0,
  aiImageEnabled: true,
  ambientEnabled: true,
  activePath: null,
  cueMarkers: [],
  roomMode: "journey" as const,
  language: "en",
  _skipLoad: false,

  play: (track, startTime, skipLoad) => {
    const current = get().currentTrack;
    // Skip only if same track is already playing and no explicit startTime
    if (current?.id === track.id && get().isPlaying && startTime === undefined) return;
    set({
      currentTrack: track,
      isPlaying: true,
      currentTime: startTime ?? 0,
      duration: track.duration ?? 0,
      _skipLoad: skipLoad ?? false,
    });
  },

  pause: () => set({ isPlaying: false }),
  resume: () => set({ isPlaying: true }),

  togglePlayPause: () => {
    const { isPlaying, currentTrack } = get();
    if (!currentTrack) return;
    set({ isPlaying: !isPlaying });
  },

  seek: (time) => {
    set({ currentTime: time });
    if (isDesktopApp()) {
      nativeAudioSeek(time).catch(() => {});
    }
  },
  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => {
    set({ duration });
    // Update journey engine if active — recomputes shader schedule for accurate timing
    const engine = getJourneyEngine();
    if (engine.isActive()) {
      engine.updateTrackDuration(duration);
    }
  },
  setAnalysis: (analysis) => set({ analysis }),
  setAnalysisLoading: (loading) => set({ analysisLoading: loading }),
  setAnalysisInProgress: (info) => set({ analysisInProgress: info }),
  setAnalysisComplete: (result) => set({ analysisComplete: result }),
  openRoom: () => set({ roomOpen: true }),
  closeRoom: () => set({ roomOpen: false }),
  setVizMode: (mode) => set({ vizMode: mode }),
  setTextOverlayMode: (mode) => set({ textOverlayMode: mode }),
  setVizWhisper: (enabled) => set({ vizWhisper: enabled }),
  setStoryData: (data) => set({ storyData: data }),
  setStoryLoading: (loading) => set({ storyLoading: loading }),
  setStoryCurrentParagraphIndex: (index) => set({ storyCurrentParagraphIndex: index }),

  setQueue: (tracks, startIndex) => {
    const idx = startIndex ?? 0;
    set({
      queue: tracks,
      queueIndex: idx,
      currentTrack: tracks[idx],
      isPlaying: true,
      currentTime: 0,
      duration: tracks[idx]?.duration ?? 0,
      analysis: null,
    });
  },

  addToQueue: (track) => {
    set((s) => ({ queue: [...s.queue, track] }));
  },

  playNext: () => {
    const { queue, queueIndex, installationMode, isPlaying } = get();
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      const next = queue[nextIdx];
      set({
        queueIndex: nextIdx,
        currentTrack: next,
        isPlaying,
        currentTime: 0,
        duration: next.duration ?? 0,
        analysis: null,
      });
    } else if (installationMode && queue.length > 0) {
      // Wrap to beginning in installation mode
      const next = queue[0];
      set({
        queueIndex: 0,
        currentTrack: next,
        isPlaying: true,
        currentTime: 0,
        duration: next.duration ?? 0,
        analysis: null,
      });
    } else {
      set({ isPlaying: false });
    }
  },

  playPrev: () => {
    const { queue, queueIndex, currentTime, isPlaying } = get();
    // If more than 3s in, restart current track
    if (currentTime > 3) {
      if (isDesktopApp()) {
        nativeAudioSeek(0).catch(() => {});
      } else {
        try { getAudioEngine().audioElement.currentTime = 0; } catch {}
      }
      set({ currentTime: 0 });
      return;
    }
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      const prev = queue[prevIdx];
      set({
        queueIndex: prevIdx,
        currentTrack: prev,
        isPlaying,
        currentTime: 0,
        duration: prev.duration ?? 0,
        analysis: null,
      });
    }
  },

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  setCueMarkers: (markers) => set({ cueMarkers: markers }),

  clear: () =>
    set({
      isPlaying: false,
      currentTrack: null,
      currentTime: 0,
      duration: 0,
      analysis: null,
      queue: [],
      queueIndex: -1,
      cueMarkers: [],
    }),

  setInstallationMode: (enabled) => set({ installationMode: enabled }),

  setVizModeSequence: (sequence) => set({ vizModeSequence: sequence, vizModeSequenceIndex: 0 }),

  cycleVizMode: () => {
    const { vizModeSequence, vizModeSequenceIndex } = get();
    if (vizModeSequence && vizModeSequence.length > 0) {
      const nextIdx = (vizModeSequenceIndex + 1) % vizModeSequence.length;
      set({
        vizMode: vizModeSequence[nextIdx],
        vizModeSequenceIndex: nextIdx,
      });
    } else {
      const allModes = MODE_META.map((m) => m.mode as string);
      const currentIdx = allModes.indexOf(get().vizMode);
      const nextIdx = (currentIdx + 1) % allModes.length;
      set({ vizMode: allModes[nextIdx] });
    }
  },

  cycleVizModePrev: () => {
    const { vizModeSequence, vizModeSequenceIndex } = get();
    if (vizModeSequence && vizModeSequence.length > 0) {
      const prevIdx = (vizModeSequenceIndex - 1 + vizModeSequence.length) % vizModeSequence.length;
      set({
        vizMode: vizModeSequence[prevIdx],
        vizModeSequenceIndex: prevIdx,
      });
    } else {
      const allModes = MODE_META.map((m) => m.mode as string);
      const currentIdx = allModes.indexOf(get().vizMode);
      const prevIdx = (currentIdx - 1 + allModes.length) % allModes.length;
      set({ vizMode: allModes[prevIdx] });
    }
  },

  startJourney: (journeyId) => {
    const journey = getJourney(journeyId) ?? getCulminationJourney(journeyId);
    if (!journey) return;
    const realm = getRealm(journey.realmId);
    const engine = getJourneyEngine();
    const { duration } = get();
    engine.start(journey, { trackDuration: duration > 0 ? duration : undefined });

    // Read initial shader from the engine (after regeneration) to avoid
    // a flash where the store has a different shader than the engine
    const firstMode = engine.getCurrentShaderMode();

    set({
      activeJourney: journey,
      activeRealm: realm ?? null,
      activeTheme: journey.theme ?? null,
      journeyPhase: null,
      journeyProgress: 0,
      vizMode: firstMode,
      vizWhisper: false,
      vizModeSequence: null, // Journey engine handles mode switching
      storyData: null,
      storyLoading: false,
      storyCurrentParagraphIndex: 0,
      aiImageEnabled: true,
      textOverlayMode: "off",
      // Ensure playback is active if a track is loaded
      isPlaying: !!get().currentTrack ? true : get().isPlaying,
    });
  },

  startCustomJourney: (journey) => {
    const realm = getRealm(journey.realmId);
    const engine = getJourneyEngine();
    const { duration } = get();
    engine.start(journey, { trackDuration: duration > 0 ? duration : undefined });
    const firstMode = engine.getCurrentShaderMode();
    set({
      activeJourney: journey,
      activeRealm: realm ?? null,
      activeTheme: journey.theme ?? null,
      journeyPhase: null,
      journeyProgress: 0,
      vizMode: firstMode,
      vizWhisper: false,
      storyData: null,
      storyLoading: false,
      storyCurrentParagraphIndex: 0,
      vizModeSequence: null,
      aiImageEnabled: true,
      textOverlayMode: "off",
      isPlaying: !!get().currentTrack ? true : get().isPlaying,
    });
  },

  stopJourney: () => {
    const engine = getJourneyEngine();
    engine.stop();
    // Clean up the AI image service so orphaned connections and
    // in-flight requests don't accumulate across journey switches.
    try {
      const service = getRealtimeImageService();
      service.cancelInFlight();
      service.clearFrameCallback();
    } catch {}
    set({
      activeJourney: null,
      activeRealm: null,
      activeTheme: null,
      journeyPhase: null,
      journeyProgress: 0,
      isPlaying: false,
      vizMode: randomAmbientMode(),
    });
  },

  setActivePath: (path) => set({ activePath: path }),

  setJourneyPhase: (phase) => set({ journeyPhase: phase }),

  setAiImageEnabled: (enabled) => set({ aiImageEnabled: enabled }),
  setAmbientEnabled: (enabled) => set({ ambientEnabled: enabled }),
  setRoomMode: (mode) => set({ roomMode: mode }),
  setLanguage: (lang) => set({ language: lang }),
}));
