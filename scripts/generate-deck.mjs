import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
pptx.defineLayout({ name: "CUSTOM", width: 13.33, height: 7.5 });
pptx.layout = "CUSTOM";

const BG = "0A0A0A";
const WHITE = "FFFFFF";
const DIM = "888888";
const DIMMER = "555555";
const PURPLE = "7C5AE0";
const MONO = "Geist Mono";
const SANS = "Geist";

function label(slide, text, y = 0.6) {
  slide.addText(text, { x: 0.8, y, w: 10, h: 0.3, fontSize: 10, fontFace: MONO, color: PURPLE, charSpacing: 4, isTextBox: true });
}
function heading(slide, text, y = 0.9) {
  slide.addText(text, { x: 0.8, y, w: 11, h: 1.0, fontSize: 42, fontFace: SANS, color: WHITE, bold: false, isTextBox: true });
}
function body(slide, text, opts = {}) {
  slide.addText(text, { x: opts.x ?? 0.8, y: opts.y ?? 2.2, w: opts.w ?? 5.5, h: opts.h ?? 1.5, fontSize: opts.fontSize ?? 14, fontFace: SANS, color: opts.color ?? DIM, lineSpacingMultiple: 1.5, isTextBox: true, valign: "top" });
}

// ── 01 Title ──
{
  const s = pptx.addSlide({ bkgd: BG });
  s.addText("Resonance", { x: 0.8, y: 2.5, w: 6, h: 0.9, fontSize: 56, fontFace: SANS, color: WHITE, bold: true });
  s.addText("A new medium for sharing music.\nUpload your album. AI builds an immersive visual experience.\nShare it with a single link.", { x: 0.8, y: 3.6, w: 5.5, h: 1.2, fontSize: 15, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.6 });
  s.addText("KAREL BARNOSKI   |   APRIL 2026   |   V1.2", { x: 0.8, y: 6.4, w: 5, h: 0.3, fontSize: 9, fontFace: MONO, color: DIMMER, charSpacing: 3 });
}

// ── 02 The Problem ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "THE PROBLEM");
  heading(s, "Musicians capture ideas.\nThen forget them.");
  body(s, "Hundreds of recordings pile up unnamed in phone folders. Creative output goes unanalyzed, undeveloped, lost.\n\nThe gap between capturing an idea and understanding it is where most music dies.");
}

// ── 03 The Solution ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "THE SOLUTION");
  heading(s, "Resonance makes every\nrecording self-aware.");
  body(s, "Upload a musical recording. Resonance transcribes it, detects key, chords, tempo, and generates AI teaching summaries.\n\nBut understanding is only half. Resonance also lets you step inside your music — shaders, AI imagery, poetry, voice — and share the experience with a single link.", { h: 2 });
  // Two boxes
  s.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 5.0, w: 5.5, h: 1.2, rectRadius: 0.1, fill: { color: "141414" }, line: { color: "222222", width: 1 } });
  s.addText([{ text: "Studio", options: { fontSize: 16, bold: true, color: WHITE } }, { text: "\nAnalyze, study, and understand your music", options: { fontSize: 11, color: DIM } }], { x: 1.1, y: 5.1, w: 4.8, h: 1.0 });
  s.addShape(pptx.ShapeType.roundRect, { x: 7.0, y: 5.0, w: 5.5, h: 1.2, rectRadius: 0.1, fill: { color: "141414" }, line: { color: "222222", width: 1 } });
  s.addText([{ text: "The Room", options: { fontSize: 16, bold: true, color: WHITE } }, { text: "\nAn immersive space for music and visuals", options: { fontSize: 11, color: DIM } }], { x: 7.3, y: 5.1, w: 4.8, h: 1.0 });
}

// ── 04 How It Works ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "HOW IT WORKS");
  heading(s, "Four steps.");
  const steps = [
    ["01", "Upload", "Drag and drop your recordings. M4A, MP3, WAV. iPhone voice memos work perfectly."],
    ["02", "Analyze", "AI transcribes notes, detects key, chords, tempo, time signature. Teaching summaries break it down."],
    ["03", "Understand", "Chat with AI about harmonic structure. Compare recordings. See patterns across your library."],
    ["04", "Experience & Share", "Step into The Room. Your music becomes visual worlds — shaders, AI imagery, poetry, voice. Share with a link."],
  ];
  steps.forEach(([num, title, desc], i) => {
    const x = 0.8 + i * 3.05;
    s.addText(num, { x, y: 2.3, w: 2.8, h: 0.4, fontSize: 28, fontFace: SANS, color: PURPLE, bold: true });
    s.addText(title, { x, y: 2.8, w: 2.8, h: 0.4, fontSize: 16, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: 3.3, w: 2.8, h: 1.5, fontSize: 11, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.5, valign: "top" });
  });
}

// ── 05 Current IA ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "CURRENT IA");
  heading(s, "The product, today.");
  // Root node
  s.addShape(pptx.ShapeType.roundRect, { x: 5.4, y: 2.1, w: 2.5, h: 0.6, rectRadius: 0.1, fill: { color: "141414" }, line: { color: "333333", width: 1 } });
  s.addText("Resonance", { x: 5.4, y: 2.1, w: 2.5, h: 0.6, fontSize: 14, fontFace: SANS, color: WHITE, align: "center", bold: true });
  // Connector lines
  s.addShape(pptx.ShapeType.line, { x: 6.65, y: 2.7, w: 0, h: 0.4, line: { color: "333333", width: 1 } });
  s.addShape(pptx.ShapeType.line, { x: 2.2, y: 3.1, w: 8.9, h: 0, line: { color: "333333", width: 1 } });
  // Three branches
  const branches = [
    { x: 0.8, label: "PUBLIC", routes: ["/", "/login · /signup", "/forgot-password", "/path/[token]", "/journey/[token]"], desc: "Shareable. No account required." },
    { x: 4.6, label: "STUDIO", routes: ["/library", "/recording/[id]", "/upload · /create", "/insights · /compare", "/collections · /settings"], desc: "Analyze and create. The thinking space." },
    { x: 8.4, label: "THE ROOM", routes: ["/room", "/room/installation", "Journeys · Paths · Shaders", "AI imagery · Poetry · Voice", "200+ shaders · 3 quality tiers"], desc: "Step inside. The feeling space." },
  ];
  branches.forEach(({ x, label: lbl, routes, desc }) => {
    s.addShape(pptx.ShapeType.line, { x: x + 1.8, y: 3.1, w: 0, h: 0.3, line: { color: "333333", width: 1 } });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.6, y: 3.4, w: 2.4, h: 0.45, rectRadius: 0.08, fill: { color: "0F0A1A" }, line: { color: "3D2E6B", width: 1 } });
    s.addText(lbl, { x: x + 0.6, y: 3.4, w: 2.4, h: 0.45, fontSize: 9, fontFace: MONO, color: PURPLE, align: "center", charSpacing: 3 });
    routes.forEach((r, i) => {
      s.addText(r, { x: x, y: 4.1 + i * 0.34, w: 3.6, h: 0.3, fontSize: 10, fontFace: MONO, color: "AAAAAA", valign: "middle" });
      s.addShape(pptx.ShapeType.line, { x, y: 4.1 + i * 0.34, w: 0.02, h: 0.28, line: { color: "3D2E6B", width: 2 } });
    });
    s.addText(desc, { x, y: 5.9, w: 3.6, h: 0.4, fontSize: 9, fontFace: SANS, color: DIMMER });
  });
}

// ── 06 Studio ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "STUDIO");
  heading(s, "Your analytical workspace.");
  const features = [
    ["AI Analysis Pipeline", "Client-side note transcription, key detection, chord detection, tempo, MIDI export."],
    ["Teaching Summaries", "AI-generated section breakdowns, harmonic vocabulary, learning insights."],
    ["Music Theory Chat", "Per-recording and library-wide AI conversations about your music."],
    ["Smart Library", "Search, tag, organize. Collections, inline editing, batch operations."],
    ["Insights Dashboard", "Musical DNA, key distribution, chord frequency, cross-recording patterns."],
    ["Visual Analysis Tools", "Waveform player, chord timeline, piano roll, synced playhead."],
  ];
  features.forEach(([title, desc], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 0.8 + col * 6;
    const y = 2.3 + row * 1.4;
    s.addText(title, { x, y, w: 5.5, h: 0.35, fontSize: 14, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: y + 0.35, w: 5.5, h: 0.7, fontSize: 11, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.4 });
  });
}

// ── 07 The Room ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "THE ROOM");
  heading(s, "Step inside your music.");
  const features = [
    ["200+ Shader Visualizations", "Six categories — Elemental, Visionary, Cosmic, Organic, Geometry, Dark, 3D Worlds."],
    ["Journey System", "240+ journeys across 16 realms. Six-phase emotional arcs with AI-generated themes."],
    ["AI Poetry & Voice", "Real-time poetic overlays synced to mood and phase. Whispered guidance."],
    ["Custom Journeys", "Create from a story prompt or auto-generate from audio analysis."],
    ["Shareable Paths", "Album-length experiences anyone can walk through. Welcome Home: 13 tracks."],
    ["Installation Mode", "Fullscreen kiosk mode for galleries, studios, venues. Auto-play, loop, no chrome."],
  ];
  features.forEach(([title, desc], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 0.8 + col * 6;
    const y = 2.3 + row * 1.4;
    s.addText(title, { x, y, w: 5.5, h: 0.35, fontSize: 14, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: y + 0.35, w: 5.5, h: 0.7, fontSize: 11, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.4 });
  });
}

// ── 08 Share the Experience ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "SHARING");
  heading(s, "Music was never meant\nto be a file.");
  body(s, "When you share a recording today, someone gets an audio file. With Resonance, they get an experience — five layers deep.", { y: 2.4, h: 0.8 });
  const layers = ["Your Music", "Shader Visuals", "AI Poetry", "AI Imagery", "Narrative Arc"];
  const descs = [
    "The recording itself — streamed in full quality through The Room.",
    "Multi-layer WebGL shaders composited in real time — rotating through the journey.",
    "Poetic text overlays generated from the music's mood. Whispered at phase boundaries.",
    "Real-time generated images from the journey's visual vocabulary via fal.ai Flux.",
    "A six-phase story structure — Threshold to Integration — that shapes the experience.",
  ];
  layers.forEach((l, i) => {
    s.addText(`L${i + 1}`, { x: 0.8, y: 3.5 + i * 0.68, w: 0.6, h: 0.5, fontSize: 10, fontFace: MONO, color: PURPLE });
    s.addText(l, { x: 1.5, y: 3.5 + i * 0.68, w: 2.2, h: 0.5, fontSize: 13, fontFace: SANS, color: WHITE, bold: true });
    s.addText(descs[i], { x: 3.8, y: 3.5 + i * 0.68, w: 8, h: 0.5, fontSize: 10, fontFace: SANS, color: DIM });
  });
  s.addText("One link. Five layers. A complete experience anyone can open on any device.", { x: 0.8, y: 7.0, w: 10, h: 0.3, fontSize: 12, fontFace: SANS, color: "AAAAAA" });
}

// ── 09 Installation ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "INSTALLATION MODE");
  heading(s, "Not just software. A medium.");
  body(s, "A dedicated kiosk mode designed for physical spaces — galleries, venues, studios, spas. Auto-play curated queue, fullscreen, cursor hidden, loop indefinitely.", { h: 1.0 });
  const uses = [
    ["Gallery Installation", "A pianist's recordings visualized as living art."],
    ["Live Performance", "A musician performs while The Room generates real-time visuals."],
    ["Meditation & Healing", "Spa lobbies, therapy offices, yoga studios."],
    ["Retail & Hospitality", "Hotels, restaurants, boutiques. Curated sonic-visual environments."],
    ["Museum & Cultural", "Pair historical recordings with visual journeys."],
    ["Studio Waiting Rooms", "Recording studios, music schools, creative agencies."],
  ];
  uses.forEach(([title, desc], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 0.8 + col * 6;
    const y = 3.8 + row * 1.1;
    s.addText(title, { x, y, w: 5, h: 0.3, fontSize: 13, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: y + 0.3, w: 5, h: 0.5, fontSize: 10, fontFace: SANS, color: DIM });
  });
}

// ── 10 Insights ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "INSIGHTS");
  heading(s, "Your musical DNA.");
  body(s, "See patterns across your entire creative output.", { y: 2.0, h: 0.4, fontSize: 15 });
  const items = [
    ["Key Distribution", "Which keys you gravitate toward. Major vs minor tendencies."],
    ["Chord Vocabulary", "Frequency analysis of every chord across your library."],
    ["Recurring Progressions", "Chord sequences that appear across multiple recordings."],
    ["Recording Similarity", "Pairwise comparison by key, tempo, and chord overlap."],
    ["AI Library Portrait", "Claude analyzes your library and writes a musical portrait."],
    ["Compare Mode", "Side-by-side analysis of any two recordings."],
  ];
  items.forEach(([title, desc], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i % 3;
    const x = 0.8 + col * 6;
    const y = 2.8 + row * 1.3;
    s.addText(title, { x, y, w: 5.5, h: 0.3, fontSize: 14, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: y + 0.35, w: 5.5, h: 0.6, fontSize: 11, fontFace: SANS, color: DIM });
  });
}

// ── 11 Technology ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "TECHNOLOGY");
  heading(s, "Built for musicians,\npowered by AI.");
  const stack = [
    ["Frontend", "Next.js 15, React 19, TypeScript, Tailwind v4"],
    ["AI", "Claude (Anthropic) via Vercel AI SDK"],
    ["Audio Intelligence", "Spotify Basic Pitch, tonal.js"],
    ["Visualization", "WebGL (200+ shaders), Three.js (3D)"],
    ["Audio Engine", "Web Audio API, WaveSurfer.js"],
    ["Image Generation", "FAL Flux Schnell (real-time AI imagery)"],
    ["Backend", "Supabase (Auth, PostgreSQL, Storage)"],
    ["Hosting", "Vercel (serverless, edge)"],
  ];
  stack.forEach(([cat, detail], i) => {
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const x = 0.8 + col * 6;
    const y = 2.8 + row * 1.0;
    s.addText(cat, { x, y, w: 2, h: 0.35, fontSize: 12, fontFace: SANS, color: WHITE, bold: true });
    s.addText(detail, { x: x + 2.1, y, w: 3.5, h: 0.35, fontSize: 11, fontFace: MONO, color: DIM });
  });
}

// ── 12 Future IA ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "FUTURE IA");
  heading(s, "Where it's headed.");
  // Root node
  s.addShape(pptx.ShapeType.roundRect, { x: 5.4, y: 2.1, w: 2.5, h: 0.6, rectRadius: 0.1, fill: { color: "141414" }, line: { color: "333333", width: 1 } });
  s.addText("Resonance", { x: 5.4, y: 2.1, w: 2.5, h: 0.6, fontSize: 14, fontFace: SANS, color: WHITE, align: "center", bold: true });
  s.addShape(pptx.ShapeType.line, { x: 6.65, y: 2.7, w: 0, h: 0.4, line: { color: "333333", width: 1, dashType: "dash" } });
  s.addShape(pptx.ShapeType.line, { x: 2.2, y: 3.1, w: 8.9, h: 0, line: { color: "333333", width: 1, dashType: "dash" } });
  const branches = [
    { x: 0.8, label: "CREATE", routes: ["/create/chat", "/create/photo-source", "/arrange", "/settings/local-llm"], desc: "Chat-based creation. Local LLM. Offline." },
    { x: 4.6, label: "SOCIAL", routes: ["/discover", "/artist/[username]", "/session/[id]", "/marketplace"], desc: "Public profiles, discovery, collaboration." },
    { x: 8.4, label: "PLATFORM", routes: ["/practice · /learn", "/api/v1/*", "/export/daw", "/education"], desc: "Practice mode, API, DAW export, education." },
  ];
  branches.forEach(({ x, label: lbl, routes, desc }) => {
    s.addShape(pptx.ShapeType.line, { x: x + 1.8, y: 3.1, w: 0, h: 0.3, line: { color: "333333", width: 1, dashType: "dash" } });
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.6, y: 3.4, w: 2.4, h: 0.45, rectRadius: 0.08, fill: { color: "0A0718" }, line: { color: "3D2E6B", width: 1, dashType: "dash" } });
    s.addText(lbl, { x: x + 0.6, y: 3.4, w: 2.4, h: 0.45, fontSize: 9, fontFace: MONO, color: "6B52B0", align: "center", charSpacing: 3 });
    routes.forEach((r, i) => {
      s.addText(r, { x, y: 4.1 + i * 0.34, w: 3.6, h: 0.3, fontSize: 10, fontFace: MONO, color: "777777" });
    });
    s.addText(desc, { x, y: 5.6, w: 3.6, h: 0.4, fontSize: 9, fontFace: SANS, color: DIMMER });
  });
}

// ── 13 Roadmap ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "ROADMAP");
  heading(s, "Where we're going.");
  const quads = [
    { x: 0.8, y: 2.4, time: "Q1 2026", status: "SHIPPED", title: "Foundation + The Room", items: ["Full analysis pipeline (key, chords, tempo, MIDI)", "AI teaching summaries and chat", "200+ shaders, 240+ journeys, 16 realms", "Poetry, voice, story overlays", "Installation mode, shared journeys, stable shaders"] },
    { x: 6.8, y: 2.4, time: "Q2 2026", status: "SHIPPED", title: "Generation + Sharing", items: ["AI journey generation from story + music analysis", "Real-time AI imagery per phase (fal.ai Flux Schnell)", "Shareable album paths (Welcome Home — 13 tracks)", "Per-device quality tiers (high / medium / low)", "Photographer collab, Tauri desktop app, batch analysis"] },
    { x: 0.8, y: 5.0, time: "Q3–Q4 2026", status: "NOW", title: "Creator Tools + Social", items: ["Chat-based journey creation (local LLM)", "Public artist profiles and journey discovery feed", "Collaborative listening sessions", "Mobile app (PWA) with offline mode", "Marketplace for shaders and journey templates"] },
    { x: 6.8, y: 5.0, time: "2027+", status: "FUTURE", title: "Ecosystem", items: ["Live transcription as you play", "AI arrangement and song builder", "Practice mode with looping + metronome", "Education platform and curriculum", "DAW export, developer API, style DNA matching"] },
  ];
  quads.forEach(({ x, y, time, status, title, items }) => {
    const filled = status === "SHIPPED";
    s.addText(`${time}  `, { x, y, w: 2, h: 0.25, fontSize: 9, fontFace: MONO, color: PURPLE, charSpacing: 2 });
    s.addText(status, { x: x + 1.6, y, w: 1.5, h: 0.25, fontSize: 9, fontFace: MONO, color: filled ? DIM : DIMMER, charSpacing: 2 });
    s.addText(title, { x, y: y + 0.35, w: 5.5, h: 0.35, fontSize: 15, fontFace: SANS, color: WHITE, bold: true });
    items.forEach((item, i) => {
      s.addText(item, { x, y: y + 0.85 + i * 0.3, w: 5.5, h: 0.26, fontSize: 10, fontFace: SANS, color: filled ? DIM : DIMMER, valign: "middle" });
    });
  });
}

// ── 14 Market & Why Now ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "MARKET · WHY NOW");
  heading(s, "A market ready to\nunderstand itself.");
  const nums = [
    ["50M+", "amateur and working musicians worldwide\nrecord ideas monthly"],
    ["$8B", "music learning + creation tools\n(DAWs, notation, theory, practice apps)"],
    ["0", "products that analyze, visualize, and make\nmusic shareable as an experience"],
  ];
  nums.forEach(([n, desc], i) => {
    const x = 0.8 + i * 4;
    s.addText(n, { x, y: 2.6, w: 3.5, h: 0.8, fontSize: 48, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x, y: 3.5, w: 3.5, h: 0.8, fontSize: 10, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.4 });
  });
  const whys = [
    ["WHY NOW · 01", "Real-time generative imagery is cheap", "Flux Schnell renders a 1024px frame in ~400ms for $0.003. Live visual worlds are no longer a research demo."],
    ["WHY NOW · 02", "Client-side music analysis caught up", "Basic Pitch + tonal.js run in-browser. Pipeline cost near zero. Privacy is a feature — audio never leaves the device."],
    ["WHY NOW · 03", "Share-link culture killed installs", "Every experience now competes on friction. A URL that opens an immersive world beats an app store in every consumer metric."],
  ];
  whys.forEach(([tag, title, desc], i) => {
    const x = 0.8 + i * 4;
    s.addText(tag, { x, y: 4.8, w: 3.5, h: 0.25, fontSize: 9, fontFace: MONO, color: PURPLE, charSpacing: 2 });
    s.addText(title, { x, y: 5.15, w: 3.5, h: 0.5, fontSize: 14, fontFace: SANS, color: WHITE });
    s.addText(desc, { x, y: 5.7, w: 3.5, h: 1.2, fontSize: 10, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.4 });
  });
}

// ── 15 Traction ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "TRACTION · SHIPPED");
  heading(s, "Already real.");
  const stats = [["200+", "SHADER VISUALIZATIONS"], ["240+", "CURATED JOURNEYS"], ["16", "REALMS / WORLDS"], ["v1.2", "STABLE · SHIPPED APR 2026"]];
  stats.forEach(([n, lbl], i) => {
    const x = 0.8 + i * 3;
    const isVersion = i === 3;
    s.addText(n, { x, y: 2.3, w: 2.8, h: 0.8, fontSize: 48, fontFace: SANS, color: isVersion ? PURPLE : WHITE, bold: true });
    s.addText(lbl, { x, y: 3.2, w: 2.8, h: 0.3, fontSize: 9, fontFace: MONO, color: DIMMER, charSpacing: 3 });
  });
  const milestones = [
    ["MAR 31, 2026", "v1.0 — The Room ships", "Full journey system, shader viz, poetry + voice, mobile controls, library queue."],
    ["APR 9, 2026", "v1.1 — Shader stability", "A/B crossfade rewrite, async compilation, consistent opacity across transitions."],
    ["APR 13, 2026", "Welcome Home album", "13-track shareable album path with culmination journey, per-device quality tiers."],
    ["APR 14, 2026", "v1.2 — Paths & sharing", "Shareable album paths, anonymous walkthrough, progress tracking, instant nav."],
  ];
  milestones.forEach(([date, title, desc], i) => {
    const y = 4.0 + i * 0.7;
    s.addShape(pptx.ShapeType.line, { x: 0.8, y: y + 0.55, w: 11.7, h: 0, line: { color: "1A1A1A", width: 1 } });
    s.addText(date, { x: 0.8, y, w: 1.5, h: 0.5, fontSize: 9, fontFace: MONO, color: PURPLE, charSpacing: 2 });
    s.addText(title, { x: 2.5, y, w: 3, h: 0.5, fontSize: 13, fontFace: SANS, color: WHITE, bold: true });
    s.addText(desc, { x: 5.8, y, w: 6.5, h: 0.5, fontSize: 10, fontFace: SANS, color: DIM });
  });
}

// ── 16 Model & Ask ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "BUSINESS MODEL · ASK");
  heading(s, "How it earns.\nWhat we need.");
  // Revenue lines
  s.addText("THREE REVENUE LINES", { x: 0.8, y: 2.6, w: 5, h: 0.25, fontSize: 9, fontFace: MONO, color: PURPLE, charSpacing: 3 });
  s.addShape(pptx.ShapeType.line, { x: 0.8, y: 2.9, w: 5.5, h: 0, line: { color: "222222", width: 1 } });
  const rev = [
    ["$12/mo", "Pro musician", "Unlimited recordings, journeys, AI imagery credits, chat-based creation, insights. Free tier caps at 10 recordings."],
    ["$1.5k/yr", "Installation license", "Galleries, studios, cultural venues. Offline kiosk mode, curated queue, custom branding."],
    ["B2B", "Education seats", "Conservatories and music schools. Teaching summaries + insights + shared classrooms. Volume pricing."],
  ];
  rev.forEach(([price, tier, desc], i) => {
    const y = 3.2 + i * 1.2;
    s.addText(price, { x: 0.8, y, w: 2, h: 0.45, fontSize: 26, fontFace: SANS, color: WHITE, bold: true });
    s.addText(tier, { x: 2.9, y: y + 0.05, w: 2, h: 0.35, fontSize: 13, fontFace: SANS, color: "AAAAAA" });
    s.addText(desc, { x: 0.8, y: y + 0.5, w: 5.5, h: 0.5, fontSize: 10, fontFace: SANS, color: DIM, lineSpacingMultiple: 1.3 });
  });
  // The Ask
  s.addShape(pptx.ShapeType.roundRect, { x: 7, y: 2.6, w: 5.5, h: 4.5, rectRadius: 0.15, fill: { color: "0E0B18" }, line: { color: "1F1A30", width: 1 } });
  s.addText("THE ASK", { x: 7.4, y: 2.9, w: 3, h: 0.25, fontSize: 9, fontFace: MONO, color: PURPLE, charSpacing: 3 });
  s.addText("$500K seed", { x: 7.4, y: 3.3, w: 4.5, h: 0.8, fontSize: 40, fontFace: SANS, color: WHITE, bold: true });
  s.addText("12 months of runway to ship v2 and validate revenue.", { x: 7.4, y: 4.1, w: 4.5, h: 0.4, fontSize: 12, fontFace: SANS, color: DIM });
  const alloc = [["40%", "ML/audio engineer — live transcription, harmonic search"], ["30%", "Growth + social features — public profiles, discovery"], ["20%", "Infrastructure — offline mode, local LLM, AI credits"], ["10%", "Runway buffer + installation pilot deployments"]];
  alloc.forEach(([pct, desc], i) => {
    s.addText(pct, { x: 7.4, y: 4.8 + i * 0.45, w: 0.8, h: 0.35, fontSize: 11, fontFace: MONO, color: PURPLE });
    s.addText(desc, { x: 8.3, y: 4.8 + i * 0.45, w: 3.8, h: 0.35, fontSize: 10, fontFace: SANS, color: DIM });
  });
}

// ── 17 Vision ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "NORTH STAR");
  heading(s, "The musical brain\nyou've always wanted.");
  body(s, "Imagine picking up your instrument. You play something — 30 seconds, two minutes, whatever comes out. Before you even set it down, the chords appear on screen in real time. The app recognizes this is a variation of something you played three months ago.", { y: 2.4, w: 6, h: 1.5 });
  body(s, "And when you're done — you step into The Room. Your music becomes a world. Shaders paint the harmonic structure in light. AI-generated imagery emerges from the mood. You build a 13-track album path. Share it with a single link. A friend opens it on their phone. They're inside your music.", { y: 4.0, w: 6, h: 1.5 });
  s.addText("Resonance turns music-sharing into an experience. Not a file. Not a stream.\nVisual, poetic, immersive — open with one link.", { x: 0.8, y: 5.8, w: 10, h: 0.7, fontSize: 14, fontFace: SANS, color: "AAAAAA", bold: true, lineSpacingMultiple: 1.4 });
  s.addText("Not a DAW. Not a notation app. Not a screensaver. A creative partner that turns every idea into something you can understand, inhabit, and share with the world.", { x: 0.8, y: 6.6, w: 10, h: 0.5, fontSize: 11, fontFace: SANS, color: DIMMER });
}

// ── 18 About ──
{
  const s = pptx.addSlide({ bkgd: BG });
  label(s, "ABOUT");
  heading(s, "Karel Barnoski");
  body(s, "Design Director at Workday. 15+ years leading UX for enterprise products used by millions.\n\nFounder of 2octave, an audio design studio specializing in product sound design.\n\nPianist and composer. Released Welcome Home, a solo piano album — and built Resonance to share it.\n\nResonance exists because Karel is both the designer and the user. Every feature was born from a real creative need.", { y: 2.2, w: 6.5, h: 4, fontSize: 13, lineSpacingMultiple: 1.6 });
}

// ── 19 Experience It ──
{
  const s = pptx.addSlide({ bkgd: BG });
  s.addText("Resonance", { x: 0.8, y: 2.5, w: 10, h: 1.0, fontSize: 56, fontFace: SANS, color: WHITE, bold: true });
  s.addText("Analyze. Visualize. Experience. Share.", { x: 0.8, y: 3.6, w: 8, h: 0.5, fontSize: 18, fontFace: SANS, color: DIM });
  s.addText("getresonance.vercel.app", { x: 0.8, y: 4.5, w: 6, h: 0.5, fontSize: 14, fontFace: MONO, color: PURPLE });
  s.addText("Karel Barnoski · April 2026", { x: 0.8, y: 6.4, w: 5, h: 0.3, fontSize: 10, fontFace: MONO, color: DIMMER, charSpacing: 2 });
}

await pptx.writeFile({ fileName: "Resonance-Pitch-Deck.pptx" });
console.log("✓ Resonance-Pitch-Deck.pptx created");
