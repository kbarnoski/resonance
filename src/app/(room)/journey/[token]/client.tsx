"use client";

import { useEffect, useRef, useState } from "react";
import { ShaderVisualizer, SHADERS, type VisualizerMode } from "@/components/audio/visualizer";
import { Visualizer3D, type Visualizer3DMode } from "@/components/audio/visualizer-3d";
import { PoetryOverlay } from "@/components/audio/poetry-overlay";
import { JourneyCompositor } from "@/components/audio/journey-compositor";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getRealm } from "@/lib/journeys/realms";
import { MODES_3D } from "@/lib/shaders";
import type { Journey, JourneyFrame } from "@/lib/journeys/types";
import { Play, Pause, Volume2, VolumeX, Copy, Check } from "lucide-react";

interface SharedJourneyClientProps {
  journey: Journey;
  audioUrl: string | null;
  recordingTitle: string | null;
  shareToken: string;
}

export function SharedJourneyClient({
  journey,
  audioUrl,
  recordingTitle,
  shareToken,
}: SharedJourneyClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [journeyFrame, setJourneyFrame] = useState<JourneyFrame | null>(null);
  const [copied, setCopied] = useState(false);
  const animRef = useRef<number>(0);
  const realm = getRealm(journey.realmId);

  // Setup audio + analyser
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    source.connect(node);
    node.connect(ctx.destination);

    analyserRef.current = node;
    dataArrayRef.current = new Uint8Array(node.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    setAnalyser(node);
    setDataArray(new Uint8Array(node.frequencyBinCount) as Uint8Array<ArrayBuffer>);

    audio.addEventListener("ended", () => setIsPlaying(false));

    return () => {
      audio.pause();
      ctx.close();
    };
  }, [audioUrl]);

  // Start journey engine
  useEffect(() => {
    const engine = getJourneyEngine();
    engine.start(journey);

    return () => engine.stop();
  }, [journey]);

  // Animation loop for journey frames
  useEffect(() => {
    const engine = getJourneyEngine();
    const audio = audioRef.current;

    function tick() {
      if (audio && audio.duration > 0) {
        const progress = audio.currentTime / audio.duration;
        const frame = engine.getFrame(progress);
        if (frame) setJourneyFrame(frame);
      }
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      await audio.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const copyShareUrl = async () => {
    const url = `${window.location.origin}/journey/${shareToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shaderMode = journeyFrame?.shaderMode ?? journey.phases[0]?.shaderModes[0] ?? "mandala";
  const audioFeatures = { amplitude: 0, bass: 0 };

  // Read audio features for compositor
  if (analyserRef.current && dataArrayRef.current) {
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const arr = dataArrayRef.current;
    let sum = 0;
    let bassSum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i < arr.length / 4) bassSum += arr[i];
    }
    audioFeatures.amplitude = sum / (arr.length * 255);
    audioFeatures.bass = bassSum / ((arr.length / 4) * 255);
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      {analyser && dataArray && (
        <JourneyCompositor
          frame={journeyFrame}
          audioAmplitude={audioFeatures.amplitude}
          audioBass={audioFeatures.bass}
          aiEnabled={journey.aiEnabled}
        >
          {MODES_3D.has(shaderMode) ? (
            <Visualizer3D
              analyser={analyser}
              dataArray={dataArray}
              mode={shaderMode as Visualizer3DMode}
            />
          ) : (
            <ShaderVisualizer
              analyser={analyser}
              dataArray={dataArray}
              fragShader={SHADERS[shaderMode as VisualizerMode]!}
            />
          )}

          {journeyFrame && (
            <PoetryOverlay
              mood={journeyFrame.poetryMood}
              whisperEnabled={false}
              voiceOverride={journeyFrame.voice}
              intervalOverride={journeyFrame.poetryIntervalSeconds}
              realmImagery={realm?.poetryImagery}
            />
          )}
        </JourneyCompositor>
      )}

      {/* Minimal controls */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 z-20">
        {audioUrl && (
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>
        )}
      </div>

      {/* Volume + share */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3 z-20">
        <button
          onClick={copyShareUrl}
          className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
          title="Copy share link"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        {audioUrl && (
          <button
            onClick={toggleMute}
            className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Journey info */}
      <div className="absolute top-6 left-6 z-20">
        <h1 className="text-white/60 text-sm font-medium">{journey.name}</h1>
        {recordingTitle && (
          <p className="text-white/30 text-xs mt-0.5">{recordingTitle}</p>
        )}
      </div>

      {/* CTA */}
      <div
        className="absolute bottom-6 left-6 z-20"
        style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)" }}
      >
        <a href="/" className="text-white/15 hover:text-white/30 transition-colors">
          Listen on Resonance
        </a>
      </div>
    </div>
  );
}
