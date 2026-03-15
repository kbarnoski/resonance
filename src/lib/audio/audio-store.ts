import { create } from "zustand";
import { getAudioEngine } from "./audio-engine";
import type { Journey, JourneyPhaseId } from "@/lib/journeys/types";
import type { Realm } from "@/lib/journeys/types";
import { getJourney } from "@/lib/journeys/journeys";
import { getRealm } from "@/lib/journeys/realms";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";

export interface Track {
  id: string;
  title: string;
  audioUrl: string;
  duration?: number | null;
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

  // The Room UI
  roomOpen: boolean;
  vizMode: string;
  vizPoetry: boolean;
  vizWhisper: boolean;

  // Installation mode
  installationMode: boolean;
  vizModeSequence: string[] | null;
  vizModeSequenceIndex: number;

  // Journey system
  activeJourney: Journey | null;
  activeRealm: Realm | null;
  journeyPhase: JourneyPhaseId | null;
  journeyProgress: number;
  aiImageEnabled: boolean;
  ambientEnabled: boolean;

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
  openRoom: () => void;
  closeRoom: () => void;
  setVizMode: (mode: string) => void;
  setVizPoetry: (enabled: boolean) => void;
  setVizWhisper: (enabled: boolean) => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  playNext: () => void;
  playPrev: () => void;
  clearQueue: () => void;
  clear: () => void;
  setInstallationMode: (enabled: boolean) => void;
  setVizModeSequence: (sequence: string[] | null) => void;
  cycleVizMode: () => void;

  // Journey actions
  startJourney: (journeyId: string) => void;
  stopJourney: () => void;
  setJourneyPhase: (phase: JourneyPhaseId) => void;
  setAiImageEnabled: (enabled: boolean) => void;
  setAmbientEnabled: (enabled: boolean) => void;
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
  roomOpen: false,
  vizMode: "orb",
  vizPoetry: true,
  vizWhisper: false,
  installationMode: false,
  vizModeSequence: null,
  vizModeSequenceIndex: 0,
  activeJourney: null,
  activeRealm: null,
  journeyPhase: null,
  journeyProgress: 0,
  aiImageEnabled: true,
  ambientEnabled: true,
  _skipLoad: false,

  play: (track, startTime, skipLoad) => {
    const current = get().currentTrack;
    if (current?.id === track.id && get().isPlaying) return; // already playing this track
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

  seek: (time) => set({ currentTime: time }),
  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setAnalysis: (analysis) => set({ analysis }),
  setAnalysisLoading: (loading) => set({ analysisLoading: loading }),
  openRoom: () => set({ roomOpen: true }),
  closeRoom: () => set({ roomOpen: false }),
  setVizMode: (mode) => set({ vizMode: mode }),
  setVizPoetry: (enabled) => set({ vizPoetry: enabled }),
  setVizWhisper: (enabled) => set({ vizWhisper: enabled }),

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
    const { queue, queueIndex, installationMode } = get();
    if (queueIndex < queue.length - 1) {
      const nextIdx = queueIndex + 1;
      const next = queue[nextIdx];
      set({
        queueIndex: nextIdx,
        currentTrack: next,
        isPlaying: true,
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
    const { queue, queueIndex, currentTime } = get();
    // If more than 3s in, restart current track
    if (currentTime > 3) {
      try { getAudioEngine().audioElement.currentTime = 0; } catch {}
      set({ currentTime: 0 });
      return;
    }
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      const prev = queue[prevIdx];
      set({
        queueIndex: prevIdx,
        currentTrack: prev,
        isPlaying: true,
        currentTime: 0,
        duration: prev.duration ?? 0,
        analysis: null,
      });
    }
  },

  clearQueue: () => set({ queue: [], queueIndex: -1 }),

  clear: () =>
    set({
      isPlaying: false,
      currentTrack: null,
      currentTime: 0,
      duration: 0,
      analysis: null,
      queue: [],
      queueIndex: -1,
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
      // Cycle through all modes
      const allModes = [
        "mandala", "cosmos", "neon", "liquid", "sacred", "ethereal",
        "fractal", "warp", "prismatic", "void", "mycelium", "tesseract",
        "dissolution", "astral", "orb", "field", "rings", "aurora",
        "totem", "wormhole", "dreamscape", "visions", "morphic",
      ];
      const currentIdx = allModes.indexOf(get().vizMode);
      const nextIdx = (currentIdx + 1) % allModes.length;
      set({ vizMode: allModes[nextIdx] });
    }
  },

  startJourney: (journeyId) => {
    const journey = getJourney(journeyId);
    if (!journey) return;
    const realm = getRealm(journey.realmId);
    const engine = getJourneyEngine();
    engine.start(journey);

    // Set initial shader from journey's first phase
    const firstMode = journey.phases[0]?.shaderModes[0] ?? "mandala";

    set({
      activeJourney: journey,
      activeRealm: realm ?? null,
      journeyPhase: null,
      journeyProgress: 0,
      vizMode: firstMode,
      vizPoetry: true,
      vizWhisper: false,
      vizModeSequence: null, // Journey engine handles mode switching
    });
  },

  stopJourney: () => {
    const engine = getJourneyEngine();
    engine.stop();
    set({
      activeJourney: null,
      activeRealm: null,
      journeyPhase: null,
      journeyProgress: 0,
    });
  },

  setJourneyPhase: (phase) => set({ journeyPhase: phase }),

  setAiImageEnabled: (enabled) => set({ aiImageEnabled: enabled }),
  setAmbientEnabled: (enabled) => set({ ambientEnabled: enabled }),
}));
