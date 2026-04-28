# Resonance

A personal audio workspace for pianists and composers. Resonance turns a single recording into an immersive listening experience — a multi-phase narrative journey that combines custom WebGL shaders, AI-generated imagery, synchronized ambient audio, and whispered guidance text.

**Live:** [getresonance.vercel.app](https://getresonance.vercel.app)

---

## Two surfaces

### The Studio
Upload, analyze, and study your recordings. Server-side FFmpeg transcoding, HTTP range streaming, automatic AI analysis (key, tempo, chord progression, mood via Claude). Tag, collect, compare, and share recordings via UUID-based public links.

### The Room
A fullscreen visualizer where a track plays under a six-phase journey:

```
threshold  →  expansion  →  transcendence  →  illumination  →  return  →  integration
```

Each phase has its own shader pool, AI image prompt sequence, voice cadence, and color palette. The journey engine cross-fades between phases on a contiguous progress timeline. The library currently includes 18+ hand-authored built-in journeys (Ghost, Snowflake, Inferno, the 13-track Welcome Home album, etc.) plus user-created custom journeys.

## Stack

- **Next.js 15** (App Router, Server Components) + **React 19**
- **Supabase** — auth, RLS, postgres for journeys/preferences/feedback, storage for audio + photos
- **Tailwind v4** + Geist + Cormorant Garamond
- **Three.js** + **@react-three/fiber** for 3D scenes
- **Custom WebGL fragment shaders** — ~210 vetted shaders across Visionary / Cosmic / Organic / Geometry / Elemental / Dark / 3D Worlds / AI Imagery
- **fal.ai** (flux/dev) for AI image generation per phase
- **Anthropic API** (claude-sonnet-4-5) for journey scaffolding and Studio analysis summaries
- **WaveSurfer.js** for Studio waveform playback
- **Spotify Basic Pitch** + **Tonal.js** for client-side note transcription, key/chord detection
- **TensorFlow.js** for ML inference in-browser
- **FFmpeg** server-side for ALAC → AAC transcoding
- Deployed on **Vercel** (Pro tier for serverless function timeouts on AI generation)

## Notable systems

- **Journey engine.** Six contiguous phases with cross-fade interpolation. Phase definitions must be contiguous; the engine has a most-recent-phase-by-start fallback so any future phase-range edit can't introduce out-of-order firing.
- **Adaptive feedback loop.** Thumbs up/down on overall journeys and individual AI images write to `user_shader_preferences` and `journey_feedback`. Loved shaders get a +0.06 ranking bias in shader-pool ordering. Disliked image-prompt clauses get extracted and injected into negative prompts on subsequent fal.ai calls. Cross-origin synced via DB so admin's prod feedback applies on localhost on next page load.
- **Permission model.** Block (per-user, hides shader from journeys), Love (per-user, soft bias), Delete (admin-only, codebase-level removal). RLS enforces all three.
- **Aspect-preserving cover-fit AI image rendering.** fal returns 1024×1024; the canvas renderer scales by image aspect with center crop instead of stretching to viewport.
- **Multi-variant `aiPromptSequence`.** Each phase has 6–7 distinct prompt variants the engine cycles through per-phase, so a single phase produces a rich collage of distinct images instead of caching to one render.
- **Mobile-aware.** iOS audio unlock primer (`<audio>` element needs gesture-scoped `play()` once before async callbacks can start playback). iOS 16.4+ document fullscreen with webkit-prefixed fallback. Device-tier detection (modern phones with 6+ cores get the medium imagery profile, older phones stay on low). `h-dvh` viewport sizing.
- **Curation flow.** New shader candidates land in a "Review" category. Admin marks delete/block/love in the picker UI; an admin script reads Supabase preferences, kept shaders distribute to permanent categories, rejects are stripped from imports + MODE_META in code. Three rounds shipped 60+ vetted shaders.
- **Studio analysis.** Note transcription via Basic Pitch (in-browser). Krumhansl-Schmuckler key detection with confidence scoring. Chord detection with inversion awareness via Tonal.js. Tempo via autocorrelation on note onsets. Time signature via accent pattern analysis. Harmonic rhythm analysis. Claude-generated teaching summary covering key center, chord vocabulary, harmonic highlights, and relearning tips.

## Local development

```bash
# install
pnpm install

# environment
cp .env.example .env.local
# fill in Supabase URL, anon key, service role key, fal.ai key, Anthropic key, ADMIN_EMAIL

# run
pnpm dev
# → http://localhost:3000
```

Database migrations live in `supabase/migrations/`. Apply via the Supabase SQL editor or `supabase db push`.

## Project structure

```
src/
├── app/
│   ├── (room)/            The Room (visualizer + shared journey view)
│   ├── (studio)/          The Studio (library, upload, analysis, settings, compare)
│   ├── path/[token]/      Shareable journey paths
│   ├── share/[token]/     Public recording shares
│   └── api/               Audio streaming, journey CRUD, AI gen, feedback, analysis
├── components/
│   ├── audio/             Visualizer, journey selector/compositor, transport, AI image layer
│   ├── analysis/          Chord timeline, piano roll, MIDI export
│   ├── chat/              Per-recording / compare / library AI chats
│   ├── insights/          Dashboard, library stats
│   ├── journeys/          Create / edit forms
│   ├── recordings/        Library cards, recording detail
│   └── ui/                shadcn primitives
├── lib/
│   ├── audio/             Audio engine singleton, Zustand store, device-tier detection
│   ├── journeys/          Journey definitions, engine, builder, adaptive engine
│   ├── shaders/           ~210 fragment shaders organized by category
│   ├── ai/                System prompt builders
│   ├── analysis/          Cross-recording analysis
│   └── supabase/          Client + server utilities
└── middleware.ts           Auth + CSP + security headers
```

## Deploy

```bash
pnpm build
vercel deploy --prod
```

Set environment variables in the Vercel dashboard. Production deploys auto-fire on `main` push via the Vercel-GitHub integration.

## Built collaboratively with Claude Code

Roughly 90% of this codebase is Claude-authored under the project owner's direction. The pattern: plain-language descriptions of problems flow in ("Stillness phase appeared twice on Snowflake"), Claude reads the relevant files, identifies root cause, proposes both a structural fix and the immediate patch, and ships behind typecheck + Vercel deploy. The owner brings product taste and design judgment; Claude brings architectural memory and execution speed.

---

© 2026 Karel Barnoski
