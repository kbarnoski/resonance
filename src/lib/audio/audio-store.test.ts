/**
 * Tests for the global audio Zustand store — the source of truth for
 * playback state across the app.
 *
 * The store is a module-level singleton, so we snapshot the initial
 * state at import time and restore it before each test. The audio
 * engine, journey engine, tauri bridge, and realtime image service are
 * side-effectful browser modules — mocked with minimal stubs so we can
 * assert pure state transitions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const audioElement = { currentTime: 0, pause: vi.fn() };
  return {
    audioElement,
    engine: { audioElement },
    journeyEngine: {
      start: vi.fn(),
      stop: vi.fn(),
      isActive: vi.fn(() => false),
      getCurrentShaderMode: vi.fn(() => "orb"),
      updateTrackDuration: vi.fn(),
    },
    imageService: {
      cancelInFlight: vi.fn(),
      clearFrameCallback: vi.fn(),
    },
  };
});

vi.mock("./audio-engine", () => ({
  getAudioEngine: () => mocks.engine,
  // Gain-ramp fade before pause — modeled as a microtask so tests can
  // await the "ramp" without real timers.
  fadeOutThen: vi.fn(async (action: () => void) => {
    await Promise.resolve();
    action();
  }),
}));
vi.mock("@/lib/tauri", () => ({
  isDesktopApp: () => false,
  nativeAudioSeek: vi.fn(async () => {}),
}));
vi.mock("@/lib/journeys/journey-engine", () => ({
  getJourneyEngine: () => mocks.journeyEngine,
}));
vi.mock("@/lib/journeys/realtime-image-service", () => ({
  getRealtimeImageService: () => mocks.imageService,
}));

// Import AFTER vi.mock has been registered.
import { useAudioStore, type Track } from "./audio-store";
import { MODES_3D } from "@/lib/shaders";
import type { Journey } from "@/lib/journeys/types";

const initialState = useAudioStore.getState();

const trackA: Track = { id: "a", title: "Welcome Home", audioUrl: "/a.mp3", duration: 240 };
const trackB: Track = { id: "b", title: "Ghost", audioUrl: "/b.mp3", duration: 300 };

const fakeJourney = { id: "test", name: "Test", realmId: "garden", phases: [] } as unknown as Journey;

beforeEach(() => {
  useAudioStore.setState(initialState);
  mocks.audioElement.currentTime = 0;
  vi.clearAllMocks();
  mocks.journeyEngine.getCurrentShaderMode.mockReturnValue("orb");
  mocks.journeyEngine.isActive.mockReturnValue(false);
});

describe("initial state", () => {
  it("starts idle with sane defaults", () => {
    const s = useAudioStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.currentTrack).toBeNull();
    expect(s.currentTime).toBe(0);
    expect(s.duration).toBe(0);
    expect(s.volume).toBe(0.8);
    expect(s.queue).toEqual([]);
    expect(s.queueIndex).toBe(-1);
    expect(s.activePath).toBeNull();
    expect(s.activeJourney).toBeNull();
    expect(s.installationMode).toBe(false);
    expect(s.roomMode).toBe("journey");
    expect(s._skipLoad).toBe(false);
  });

  it("picks a 3D World shader for the ambient welcome viz", () => {
    expect(MODES_3D.has(useAudioStore.getState().vizMode)).toBe(true);
  });
});

describe("play / pause / resume", () => {
  it("play() loads the track and starts playback from 0", () => {
    useAudioStore.getState().play(trackA);
    const s = useAudioStore.getState();
    expect(s.currentTrack).toEqual(trackA);
    expect(s.isPlaying).toBe(true);
    expect(s.currentTime).toBe(0);
    expect(s.duration).toBe(240);
    expect(s._skipLoad).toBe(false);
  });

  it("play() with skipLoad=true sets the _skipLoad flag for AudioProvider", () => {
    useAudioStore.getState().play(trackA, 12, true);
    expect(useAudioStore.getState()._skipLoad).toBe(true);
    expect(useAudioStore.getState().currentTime).toBe(12);
  });

  it("play() of the already-playing track without startTime is a no-op", () => {
    useAudioStore.getState().play(trackA);
    useAudioStore.getState().setCurrentTime(42);
    useAudioStore.getState().play(trackA);
    expect(useAudioStore.getState().currentTime).toBe(42);
  });

  it("play() of the same track WITH startTime restarts at that time", () => {
    useAudioStore.getState().play(trackA);
    useAudioStore.getState().setCurrentTime(42);
    useAudioStore.getState().play(trackA, 5);
    expect(useAudioStore.getState().currentTime).toBe(5);
  });

  it("pause and resume flip isPlaying", () => {
    useAudioStore.getState().play(trackA);
    useAudioStore.getState().pause();
    expect(useAudioStore.getState().isPlaying).toBe(false);
    useAudioStore.getState().resume();
    expect(useAudioStore.getState().isPlaying).toBe(true);
  });

  it("togglePlayPause is a no-op with no track loaded", () => {
    useAudioStore.getState().togglePlayPause();
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });
});

describe("seek and volume", () => {
  it("seek() propagates to the underlying audio element", () => {
    mocks.audioElement.currentTime = 100;
    useAudioStore.getState().seek(5);
    expect(useAudioStore.getState().currentTime).toBe(5);
    expect(mocks.audioElement.currentTime).toBe(5);
  });

  it("setVolume clamps to [0, 1]", () => {
    useAudioStore.getState().setVolume(1.7);
    expect(useAudioStore.getState().volume).toBe(1);
    useAudioStore.getState().setVolume(-0.3);
    expect(useAudioStore.getState().volume).toBe(0);
  });
});

describe("queue", () => {
  it("setQueue loads the start track, resets time, and clears stale analysis", () => {
    useAudioStore.setState({ analysis: { bpm: 92 } });
    useAudioStore.getState().setQueue([trackA, trackB], 1);
    const s = useAudioStore.getState();
    expect(s.queue).toEqual([trackA, trackB]);
    expect(s.queueIndex).toBe(1);
    expect(s.currentTrack).toEqual(trackB);
    expect(s.isPlaying).toBe(true);
    expect(s.currentTime).toBe(0);
    expect(s.analysis).toBeNull();
  });

  it("playNext advances and resets time; stops at the end outside installation", () => {
    useAudioStore.getState().setQueue([trackA, trackB], 0);
    useAudioStore.getState().setCurrentTime(120);
    useAudioStore.getState().playNext();
    let s = useAudioStore.getState();
    expect(s.queueIndex).toBe(1);
    expect(s.currentTrack).toEqual(trackB);
    expect(s.currentTime).toBe(0);
    // At the end: no wrap, just stop
    useAudioStore.getState().playNext();
    s = useAudioStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.queueIndex).toBe(1);
  });

  it("playNext wraps to the first track in installation mode", () => {
    useAudioStore.getState().setQueue([trackA, trackB], 1);
    useAudioStore.getState().setInstallationMode(true);
    useAudioStore.getState().playNext();
    const s = useAudioStore.getState();
    expect(s.queueIndex).toBe(0);
    expect(s.currentTrack).toEqual(trackA);
    expect(s.isPlaying).toBe(true);
  });

  it("playPrev restarts the current track when more than 3s in", () => {
    useAudioStore.getState().setQueue([trackA, trackB], 1);
    useAudioStore.getState().setCurrentTime(30);
    useAudioStore.getState().playPrev();
    const s = useAudioStore.getState();
    expect(s.currentTime).toBe(0);
    expect(s.queueIndex).toBe(1); // same track, not previous
    expect(mocks.audioElement.currentTime).toBe(0);
  });

  it("playPrev steps back when near the start of a track", () => {
    useAudioStore.getState().setQueue([trackA, trackB], 1);
    useAudioStore.getState().setCurrentTime(1);
    useAudioStore.getState().playPrev();
    const s = useAudioStore.getState();
    expect(s.queueIndex).toBe(0);
    expect(s.currentTrack).toEqual(trackA);
  });

  it("addToQueue appends without touching the current track", () => {
    useAudioStore.getState().setQueue([trackA], 0);
    useAudioStore.getState().addToQueue(trackB);
    const s = useAudioStore.getState();
    expect(s.queue).toEqual([trackA, trackB]);
    expect(s.currentTrack).toEqual(trackA);
    expect(s.queueIndex).toBe(0);
  });

  it("clear() resets playback, queue, and analysis", () => {
    useAudioStore.getState().setQueue([trackA, trackB], 0);
    useAudioStore.getState().setCueMarkers([{ time: 10, label: "verse" }]);
    useAudioStore.getState().clear();
    const s = useAudioStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.currentTrack).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.queueIndex).toBe(-1);
    expect(s.cueMarkers).toEqual([]);
  });
});

describe("activePath", () => {
  it("setActivePath sets and clears the custom path context", () => {
    const path = {
      id: "wh",
      name: "Welcome Home",
      subtitle: null,
      shareToken: "d2c79111528a46cf",
      journeyIds: ["j1", "j2"],
      culminationJourneyId: "cosmic-homecoming",
      accent: "#fff",
      glow: "#888",
    };
    useAudioStore.getState().setActivePath(path);
    expect(useAudioStore.getState().activePath).toEqual(path);
    useAudioStore.getState().setActivePath(null);
    expect(useAudioStore.getState().activePath).toBeNull();
  });
});

describe("stopJourney", () => {
  it("clears journey state, stops engines, and pauses the audio element after the fade", async () => {
    // stopJourney only touches the audio element behind a window guard
    vi.stubGlobal("window", {});
    useAudioStore.setState({ activeJourney: fakeJourney, isPlaying: true, journeyProgress: 0.5 });
    useAudioStore.getState().stopJourney();
    vi.unstubAllGlobals();
    const s = useAudioStore.getState();
    expect(s.activeJourney).toBeNull();
    expect(s.journeyPhase).toBeNull();
    expect(s.journeyProgress).toBe(0);
    expect(s.isPlaying).toBe(false);
    expect(mocks.journeyEngine.stop).toHaveBeenCalledOnce();
    expect(mocks.imageService.cancelInFlight).toHaveBeenCalledOnce();
    // The pause rides a ~200ms gain ramp (never-abrupt law) — mocked as a
    // microtask here. It must NOT have fired synchronously...
    expect(mocks.audioElement.pause).not.toHaveBeenCalled();
    // ...but lands once the fade settles.
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.audioElement.pause).toHaveBeenCalledOnce();
    // Outside installation mode, falls back to a random ambient 3D shader
    expect(MODES_3D.has(s.vizMode)).toBe(true);
  });

  it("does not pause if a new journey resumed playback during the fade", async () => {
    vi.stubGlobal("window", {});
    useAudioStore.setState({ activeJourney: fakeJourney, isPlaying: true });
    useAudioStore.getState().stopJourney();
    // A rapid path-dot click starts the next journey mid-ramp
    useAudioStore.setState({ isPlaying: true });
    vi.unstubAllGlobals();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.audioElement.pause).not.toHaveBeenCalled();
  });

  it("in installation mode keeps the engine's last shader (no flash)", () => {
    mocks.journeyEngine.getCurrentShaderMode.mockReturnValue("galaxy");
    useAudioStore.setState({ activeJourney: fakeJourney, installationMode: true });
    useAudioStore.getState().stopJourney();
    expect(useAudioStore.getState().vizMode).toBe("galaxy");
  });
});
