"use client";

import { useEffect, useState, use } from "react";
import { ShaderVisualizer, SHADERS, type VisualizerMode } from "@/components/audio/visualizer";
import { Visualizer3D, type Visualizer3DMode } from "@/components/audio/visualizer-3d";
import { PoetryOverlay } from "@/components/audio/poetry-overlay";
import { MODES_3D } from "@/lib/shaders";

interface RoomConfig {
  shaderMode: string;
  poetryEnabled?: boolean; // legacy
  textOverlayMode?: "off" | "poetry" | "story";
  whisperEnabled: boolean;
  hudVisible: boolean;
}

function decodeToken(token: string): RoomConfig | null {
  try {
    // Restore base64url padding
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    return JSON.parse(json) as RoomConfig;
  } catch {
    return null;
  }
}

export default function SharedRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);

  // Decode on mount
  useEffect(() => {
    const decoded = decodeToken(token);
    setConfig(decoded);
  }, [token]);

  // Create a silent audio context for shader data
  useEffect(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent
    const node = ctx.createAnalyser();
    node.fftSize = 256;

    osc.connect(gain);
    gain.connect(node);
    node.connect(ctx.destination);
    osc.start();

    setAnalyser(node);
    setDataArray(new Uint8Array(node.frequencyBinCount));

    return () => {
      try { osc.stop(); } catch {}
      ctx.close();
    };
  }, []);

  if (!config) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <p className="text-white/30 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
          Invalid room link
        </p>
      </div>
    );
  }

  const shaderMode = (
    Object.keys(SHADERS).includes(config.shaderMode)
      ? config.shaderMode
      : "mandala"
  ) as VisualizerMode;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      {analyser && dataArray && (
        <>
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
              fragShader={SHADERS[shaderMode]!}
            />
          )}

          {(config.textOverlayMode === "poetry" || config.poetryEnabled) && (
            <PoetryOverlay
              mood="flowing"
              whisperEnabled={config.whisperEnabled}
            />
          )}
        </>
      )}

      {/* Shared room badge */}
      <div
        className="absolute bottom-4 left-4 text-white/15"
        style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)" }}
      >
        Shared Room
      </div>
    </div>
  );
}
