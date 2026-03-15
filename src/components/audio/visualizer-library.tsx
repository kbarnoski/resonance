"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getAudioEngine } from "@/lib/audio/audio-engine";

interface RecordingRow {
  id: string;
  title: string;
  duration: number | null;
  created_at: string;
  analyses: { status: string; key_signature: string | null; tempo: number | null }[] | null;
}

interface FeaturedAlbum {
  id: string;
  name: string;
  artist: string;
  tracks: { id: string; title: string; duration: number | null }[];
}

interface VisualizerLibraryProps {
  open: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function VisualizerLibrary({ open, onClose }: VisualizerLibraryProps) {
  const [recordings, setRecordings] = useState<RecordingRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const hasFetched = recordings !== null;

  // Featured content
  const [featuredAlbums, setFeaturedAlbums] = useState<FeaturedAlbum[] | null>(null);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());
  const hasFetchedFeatured = featuredAlbums !== null;

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const setAnalysis = useAudioStore((s) => s.setAnalysis);
  const setAnalysisLoading = useAudioStore((s) => s.setAnalysisLoading);
  const setQueue = useAudioStore((s) => s.setQueue);

  // Fetch recordings on first open
  useEffect(() => {
    if (!open || hasFetched) return;
    setLoading(true);

    const supabase = createClient();
    supabase
      .from("recordings")
      .select("id, title, duration, created_at, analyses(status, key_signature, tempo)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRecordings((data as RecordingRow[] | null) ?? []);
        setLoading(false);
      });
  }, [open, hasFetched]);

  // Fetch featured albums on first open
  useEffect(() => {
    if (!open || hasFetchedFeatured) return;
    fetch("/api/featured")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFeaturedAlbums(data ?? []))
      .catch(() => setFeaturedAlbums([]));
  }, [open, hasFetchedFeatured]);

  const toggleAlbumExpanded = useCallback((albumId: string) => {
    setExpandedAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!recordings) return [];
    if (!search.trim()) return recordings;
    const q = search.toLowerCase();
    return recordings.filter((r) => r.title?.toLowerCase().includes(q));
  }, [recordings, search]);

  const toTrack = useCallback((rec: RecordingRow) => ({
    id: rec.id,
    title: rec.title || "Untitled",
    audioUrl: `/api/audio/${rec.id}`,
    duration: rec.duration,
  }), []);

  const fetchAnalysis = useCallback(async (recId: string) => {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/recordings/${recId}/analysis`);
      if (res.ok) {
        setAnalysis(await res.json());
      } else {
        setAnalysis(null);
      }
    } catch {
      setAnalysis(null);
    }
    setAnalysisLoading(false);
  }, [setAnalysis, setAnalysisLoading]);

  const warmupEngine = useCallback(() => {
    try {
      const engine = getAudioEngine();
      if (engine.audioContext.state === "suspended") engine.audioContext.resume();
    } catch {}
  }, []);

  const handlePlayAlbum = useCallback((album: FeaturedAlbum) => {
    warmupEngine();
    const tracks = album.tracks.map((t) => ({
      id: t.id,
      title: t.title || "Untitled",
      audioUrl: `/api/audio/${t.id}`,
      duration: t.duration,
    }));
    setQueue(tracks, 0);
    if (album.tracks[0]) fetchAnalysis(album.tracks[0].id);
  }, [setQueue, warmupEngine, fetchAnalysis]);

  const handleSelectFeaturedTrack = useCallback((album: FeaturedAlbum, trackIndex: number) => {
    warmupEngine();
    const tracks = album.tracks.map((t) => ({
      id: t.id,
      title: t.title || "Untitled",
      audioUrl: `/api/audio/${t.id}`,
      duration: t.duration,
    }));
    setQueue(tracks, trackIndex);
    fetchAnalysis(album.tracks[trackIndex].id);
  }, [setQueue, warmupEngine, fetchAnalysis]);

  const handleSelect = useCallback(
    async (rec: RecordingRow, index: number) => {
      warmupEngine();
      const tracks = filtered.map(toTrack);
      setQueue(tracks, index);
      fetchAnalysis(rec.id);
    },
    [filtered, toTrack, setQueue, fetchAnalysis, warmupEngine]
  );

  const handlePlayAll = useCallback(async () => {
    if (filtered.length === 0) return;
    warmupEngine();
    const tracks = filtered.map(toTrack);
    setQueue(tracks, 0);
    await fetchAnalysis(filtered[0].id);
    onClose();
  }, [filtered, toTrack, setQueue, fetchAnalysis, onClose, warmupEngine]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        style={{
          backdropFilter: "blur(32px) saturate(1.4)",
          WebkitBackdropFilter: "blur(32px) saturate(1.4)",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <h2
              className="text-white/80 tracking-wide"
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Library
            </h2>
            {filtered.length > 0 && (
              <button
                onClick={handlePlayAll}
                className="text-white/40 hover:text-white/70 transition-colors"
                style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.05em",
                }}
              >
                Play All
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-lg pl-9 pr-3 py-2.5 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/8 transition-all"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            />
          </div>
        </div>

        {/* Recording list */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-thin">
          {/* Featured albums */}
          {featuredAlbums && featuredAlbums.length > 0 && (
            <div className="mb-4">
              <p
                className="text-white/30 px-3 mb-2"
                style={{
                  fontSize: "0.6rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Featured
              </p>
              {featuredAlbums.map((album) => (
                <div key={album.id} className="mb-1">
                  <button
                    onClick={() => toggleAlbumExpanded(album.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    {expandedAlbums.has(album.id) ? (
                      <ChevronDown className="h-3 w-3 text-white/30 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-white/30 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-white/85 text-sm truncate leading-tight"
                        style={{ fontFamily: "var(--font-geist-sans)" }}
                      >
                        {album.name}
                      </p>
                      <p
                        className="text-white/25 truncate"
                        style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}
                      >
                        {album.artist} · {album.tracks.length} tracks
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                      className="text-white/30 hover:text-white/60 transition-colors shrink-0"
                      style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)" }}
                    >
                      Play
                    </button>
                  </button>
                  {expandedAlbums.has(album.id) && (
                    <div className="ml-5">
                      {album.tracks.map((track, idx) => (
                        <button
                          key={track.id}
                          onClick={() => handleSelectFeaturedTrack(album, idx)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            track.id === currentTrack?.id ? "bg-white/10" : "hover:bg-white/5"
                          }`}
                        >
                          <p
                            className="text-white/70 text-sm truncate"
                            style={{ fontFamily: "var(--font-geist-sans)" }}
                          >
                            {track.title || "Untitled"}
                          </p>
                          {track.duration && (
                            <span
                              className="text-white/25"
                              style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}
                            >
                              {formatDuration(track.duration)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="mx-3 my-3 h-px bg-white/5" />
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
              <span className="text-white/20 text-xs" style={{ fontFamily: "var(--font-geist-mono)" }}>Loading</span>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16">
              <p className="text-white/20 text-sm">
                {search ? "No matches" : "No recordings yet"}
              </p>
            </div>
          )}

          {filtered.map((rec, idx) => {
            const analysis = rec.analyses?.[0];
            const isPlaying = rec.id === currentTrack?.id;

            return (
              <button
                key={rec.id}
                onClick={() => handleSelect(rec, idx)}
                className={`w-full text-left px-3 py-3 rounded-lg transition-all duration-150 group ${
                  isPlaying
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Playing indicator */}
                  <div className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    {isPlaying ? (
                      <div className="flex items-end gap-[2px] h-3">
                        <div className="w-[2px] h-full bg-white/60 rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                        <div className="w-[2px] h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                        <div className="w-[2px] h-2.5 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="text-white/85 text-sm truncate leading-tight"
                      style={{ fontFamily: "var(--font-geist-sans)" }}
                    >
                      {rec.title || "Untitled"}
                    </p>
                    <div
                      className="flex items-center gap-1.5 mt-1 text-white/30"
                      style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)" }}
                    >
                      <span>{formatDuration(rec.duration)}</span>
                      {analysis?.key_signature && (
                        <>
                          <span className="text-white/10">·</span>
                          <span>{analysis.key_signature}</span>
                        </>
                      )}
                      {analysis?.tempo && (
                        <>
                          <span className="text-white/10">·</span>
                          <span>{Math.round(analysis.tempo)}</span>
                        </>
                      )}
                      <span className="text-white/10">·</span>
                      <span>{timeAgo(rec.created_at)}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
