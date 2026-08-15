*Historical (2026-02): original v1.0 PRD — superseded by shipped product; kept for record.*

# Resonance (Resonance) -- Product Requirements Document

**Version:** 1.0
**Date:** February 16, 2026
**Author:** Karel Barnoski

---

## 1. Product Overview

**Resonance** is an AI-powered piano voice memo platform that transforms raw musical recordings into structured, analyzable, and developable musical ideas. Built for pianists who capture ideas at the keyboard, it bridges the gap between "I played something cool" and "I understand what I played and where to take it."

**Core thesis:** Every musical idea deserves to be understood, not just stored.

---

## 2. Problem Statement

Pianists and composers capture hundreds of voice memos -- quick recordings of ideas, progressions, fragments. These recordings pile up in phone folders, unnamed and forgotten. The musician knows there's gold in there but has no way to:

- Remember what key they were in or what chords they played
- Find that "jazzy thing from last Tuesday"
- Understand the harmonic structure without sitting back at the piano
- Get intelligent feedback on their ideas
- See patterns across their creative output over time

**Resonance solves this by making every recording self-aware.**

---

## 3. Target User

**Primary:** Pianists who record voice memos of their playing -- hobbyists, singer-songwriters, jazz players, composers, and students who want to capture and develop ideas.

**Secondary:** Music teachers analyzing student recordings; producers reviewing sketch ideas.

---

## 4. Current Feature Set (v1.0)

### 4.1 Recording Management
| Feature | Status | Description |
|---------|--------|-------------|
| Multi-file upload | Shipped | Drag-and-drop or file browser. M4A, MP3, WAV. Per-file descriptions. |
| Library | Shipped | Searchable, filterable list of all recordings with metadata. |
| Tags | Shipped | User-defined tags for organization. AND-logic filtering. |
| Collections | Shipped | Named groups of recordings with drag-and-drop reordering. |
| Inline editing | Shipped | Title and description editable in-place, autosaves. |
| Delete | Shipped | Removes file from storage + all related data (analysis, markers, chat). |

### 4.2 Audio Playback
| Feature | Status | Description |
|---------|--------|-------------|
| Waveform player | Shipped | wavesurfer.js with bar-style visualization, seek, skip +/-10s. |
| ALAC transcoding | Shipped | Server-side ffmpeg converts iPhone Lossless to AAC for browser playback. |
| Range requests | Shipped | HTTP 206 partial content for proper streaming. |
| Visualizer | Shipped | Full-screen WebGL canvas with 8 shader modes (Mandala, Cosmos, Neon, Liquid, Sacred, Ethereal, Fractal, Warp). |

### 4.3 AI Music Analysis
| Feature | Status | Description |
|---------|--------|-------------|
| Note transcription | Shipped | @spotify/basic-pitch client-side MIDI detection. |
| Key detection | Shipped | Krumhansl-Schmuckler algorithm with duration-weighted histogram. |
| Chord detection | Shipped | Inversion-aware chord identification using tonal.js. |
| Tempo estimation | Shipped | BPM detection from note onset patterns. |
| Time signature | Shipped | Detected from rhythmic groupings. |
| Recurring progressions | Shipped | Pattern matching across chord sequences. |
| AI teaching summary | Shipped | Claude-generated structured summary: overview, sections, chord vocabulary, harmonic highlights, relearning tips. |
| MIDI export | Shipped | Download transcribed notes as .mid file. |

### 4.4 Visualization
| Feature | Status | Description |
|---------|--------|-------------|
| Chord timeline | Shipped | Color-coded horizontal bar showing chord blocks across duration, synced playhead. |
| Piano roll | Shipped | SVG note display with velocity-scaled opacity and active note highlighting. |
| Markers | Shipped | Time-stamped bookmarks overlaid on waveform, clickable to seek. |

### 4.5 AI Chat
| Feature | Status | Description |
|---------|--------|-------------|
| Per-recording chat | Shipped | Streaming conversation grounded in the recording's analysis data. Music theory coaching, development suggestions, style identification. |
| Compare chat | Shipped | Side-by-side analysis of two recordings with AI that identifies shared progressions, key relationships, compatibility as song sections. |
| Library chat | Shipped | Cross-library conversation about patterns, tendencies, and development opportunities across all recordings. |

### 4.6 Insights Dashboard
| Feature | Status | Description |
|---------|--------|-------------|
| Quick stats | Shipped | Total recordings, analyzed count, most common key, avg tempo, unique chords, total recording time. |
| Musical DNA | Shipped | Favorite keys, chord vocabulary, tempo range, harmonic tendencies (jazz-influenced, minor-key driven, etc.). |
| Key distribution | Shipped | Bar chart of keys across library (2+ recordings). |
| Chord frequency | Shipped | Top chords across all recordings (2+ recordings). |
| Progression patterns | Shipped | Recurring chord sequences found across multiple recordings (2+ recordings). |
| Similar recordings | Shipped | Pairwise similarity scoring by key, tempo, and chord overlap (3+ recordings). |
| AI library summary | Shipped | Claude-generated overview with musical clusters, standout pieces, development suggestions. Cached in localStorage. |

### 4.7 Sharing
| Feature | Status | Description |
|---------|--------|-------------|
| Share links | Shipped | UUID-based public URLs. No login required to view. |
| Public view | Shipped | Shows recording metadata, audio player, analysis summary. |

### 4.8 Infrastructure
| Component | Technology |
|-----------|-----------|
| Framework | Next.js 15 (App Router, TypeScript, Tailwind) |
| UI | shadcn/ui component library |
| Auth | Supabase Auth (email/password) |
| Database | Supabase PostgreSQL |
| Storage | Supabase Storage |
| AI | Vercel AI SDK v4 + Claude |
| Audio | wavesurfer.js, @spotify/basic-pitch, tonal.js, ffmpeg-static |
| Hosting | Vercel |

---

## 5. Key Metrics (North Star)

| Metric | Definition |
|--------|-----------|
| Recordings analyzed | % of uploaded recordings that get analyzed |
| Chat engagement | Messages sent per analyzed recording |
| Return rate | Users who return within 7 days of uploading |
| Library depth | Average recordings per active user |

---

## 6. Known Limitations

- Analysis runs client-side -- large files can be slow on mobile
- Transcription accuracy depends on recording quality (background noise, multiple instruments)
- No real-time recording (upload-only flow)
- Single-instrument focus (piano)
- No collaborative features yet
- No mobile-native app
