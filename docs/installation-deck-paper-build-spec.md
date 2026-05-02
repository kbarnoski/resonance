# Installation Deck — Paper Build Spec

Build sheet for composing the installation deck inside **Paper.app**,
slide-by-slide. Every value here is anchored to
[`docs/brand/brand-system.md`](./brand/brand-system.md) — read that first.

Workflow:
1. Open Paper. New canvas at **1440 × 900px**.
2. Set page background to `#0A0A0A`.
3. Drop in the logo SVG (`docs/brand/resonance-logo.svg`) once and
   duplicate per slide — keep size consistent at 32px tall in slide
   corners or 80–120px on hero slides.
4. For each slide below: copy the text blocks verbatim, set type per
   the spec, position per the layout diagram.

Margins are **96px L/R, 72px T/B** unless noted. Section labels live at
`y = 144`. Footer text at `y = 828`.

---

## Slide 01 — Title

**Layout**: Logo top-left of mid-block, title hero-large, subtitle below, byline at bottom. Centered vertical balance.

**Background**: `#0A0A0A`

**Elements**:

| Element  | Text                                                                                          | Family             | Size  | Weight | Color    | Position (x, y)        |
|----------|-----------------------------------------------------------------------------------------------|--------------------|-------|--------|----------|------------------------|
| Logo     | (svg)                                                                                         | —                  | 56h   | —      | t-100    | 96, 280                |
| Title    | `Resonance`                                                                                   | Cormorant Garamond | 88pt  | 300    | t-100    | 96, 360                |
| Subtitle | `A contemplative listening room.`<br>`Generative audiovisual, music-led, slow time.`           | Cormorant Garamond | 28pt  | 300 it | t-60     | 96, 488                |
| Byline   | `INSTALLATION BRIEF · KAREL BARNOSKI · MAY 2026`                                              | Geist Mono         | 11pt  | 400    | t-25     | 96, 828                |

The italic subtitle is the only italic on the slide. No accent color.

---

## Slide 02 — What it is

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                                                                                                                                                                                                                                                                                                  | Family             | Size  | Weight | Color | Position (x, y) |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------|-------|--------|-------|-----------------|
| Section label  | `WHAT IT IS`                                                                                                                                                                                                                                                                                                          | Geist Mono         | 11pt  | 400    | acc   | 96, 144          |
| Headline       | `A generative audiovisual instrument.`<br>`Music-led. Slow time.`                                                                                                                                                                                                                                                     | Cormorant Garamond | 52pt  | 300    | t-100 | 96, 200          |
| Body §1        | `A composed piece of music drives real-time audio-reactive shaders and AI-curated imagery, producing a 20–40 minute slow-moving visual landscape that never repeats verbatim.`                                                                                                                                        | Geist              | 16pt  | 400    | t-60  | 96, 440          |
| Body §2        | `Originally built for personal listening. Scales naturally to a shared room: same engine, same patience, just larger and quieter.`                                                                                                                                                                                    | Geist              | 16pt  | 400    | t-60  | 96, 540          |

Body width: **800px** (single column, left-aligned).

---

## Slide 03 — The Room

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                                                  | Family             | Size  | Weight | Color | Position (x, y) |
|----------------|-----------------------------------------------------------------------|--------------------|-------|--------|-------|-----------------|
| Section label  | `THE ROOM`                                                            | Geist Mono         | 11pt  | 400    | acc   | 96, 144          |
| Headline       | `Planetarium vibes.`<br>`A dark space, audience reclining, eyes up.` | Cormorant Garamond | 52pt  | 300    | t-100 | 96, 200          |

**Specs table** (starts at `y = 420`, row height `48px`, indent text at `x = 96`):

| Key (Geist Mono 11pt acc) | Value (Geist 14pt t-60)                                                                  |
|---------------------------|------------------------------------------------------------------------------------------|
| `SPACE`                   | `12×12 ft to 30×40 ft. Dome geometry welcome.`                                           |
| `FLOOR`                   | `Mats and pillows. No chairs.`                                                           |
| `DISPLAY`                 | `Single overhead projection, dome, or large wall display.`                               |
| `AUDIO`                   | `4-corner speaker array. Stereo as a baseline.`                                          |
| `FLOW`                    | `Visitors enter and leave on their own time. No timed entry. No headphones. No narration.` |

Key column width 144px, value column starts at `x = 240`. Hairline divider (`#1E1E22`, 1px) between rows.

---

## Slide 04 — The Piece

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                                                                          | Family             | Size  | Weight | Color | Position (x, y) |
|----------------|-----------------------------------------------------------------------------------------------|--------------------|-------|--------|-------|-----------------|
| Section label  | `THE PIECE`                                                                                   | Geist Mono         | 11pt  | 400    | acc   | 96, 144          |
| Headline       | `A single ~30 minute Path.`                                                                   | Cormorant Garamond | 52pt  | 300    | t-100 | 96, 200          |
| Subhead        | `Three to five composed tracks, threaded into one continuous arc.`                            | Geist              | 18pt  | 400    | t-60  | 96, 320          |

**Phase cards** (4 cards across, `y = 460`, card size `280×260`, gap `24px`, border `1px #1E1E22`, BG `#111113`, padding `24px`):

| Number     | Name        | Description                                                       |
|------------|-------------|-------------------------------------------------------------------|
| `01` (acc) | `Threshold` | `Open in near-silence. Single tone. Near-black field.`            |
| `02` (acc) | `Expansion` | `Imagery surfaces. Music builds. Caustics, mandalas, figures.`    |
| `03` (acc) | `Apex`      | `Full motion and color. The room is loud and alive.`              |
| `04` (acc) | `Return`    | `Settle back toward stillness. Cycle resolves and begins again.`  |

Number: Geist Mono 11pt, acc, tracking 0.1em.
Name: Geist 18pt 600, t-100.
Description: Geist 13pt 400, t-40, line-height 1.55.

---

## Slide 05 — Shape of the work

Full-bleed image slide. Use the captured Welcome Home path screenshot:

- Image: `public/installation-stills/01-welcome-home-path.png`
- Position: centered, `1280×720` (or 16:10 close to it), 8px corner radius, 1px `#1E1E22` border
- Section label `SHAPE OF THE WORK` at `(96, 96)`
- Caption beneath image, centered: `Welcome Home — thirteen tracks, one ~30-minute path through the album` — Geist 13pt italic t-40

---

## Slide 06 — What a visitor experiences

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                                                                                                                                                                                                                                                                                                                                                                                                       | Family             | Size  | Weight | Color | Position           |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------|-------|--------|-------|--------------------|
| Section label  | `WHAT A VISITOR EXPERIENCES`                                                                                                                                                                                                                                                                                                                                                                                                | Geist Mono         | 11pt  | 400    | acc   | 96, 144             |
| Quote          | `Enters a dark room. Lies back. The first phase opens with a single low tone and a near-black field — slow caustics, the faint hint of a mandalic form. Imagery surfaces gradually as the music builds: water, light, figures that resolve and dissolve. Around the apex the room is full of motion and color; then everything settles back toward stillness. The visitor leaves when ready.` | Cormorant Garamond | 28pt  | 300 it | t-75  | centered, max 1100w |

Optional decorative left-edge rule: `4px × full quote height`, fill `#8B5CF6`, positioned at quote's left edge.

---

## Slide 07 — References

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                | Family             | Size  | Weight | Color | Position (x, y) |
|----------------|---------------------|--------------------|-------|--------|-------|-----------------|
| Section label  | `REFERENCES`        | Geist Mono         | 11pt  | 400    | acc   | 96, 144          |
| Headline       | `A small canon.`    | Cormorant Garamond | 52pt  | 300    | t-100 | 96, 200          |

**Three reference cards** (across, `y = 360`, card size `400×320`, gap `24px`, border `1px #1E1E22`, BG `#111113`, padding `28px`):

| Card | Artist (18pt 600 t-100) | Work (Geist Mono 12pt acc-light) | Description (13pt t-60) |
|------|-------------------------|-----------------------------------|--------------------------|
| 1    | `Brian Eno`             | `77 Million Paintings`            | `Generative visual companion to ambient music. Proof that slow time finds an audience.` |
| 2    | `James Turrell`         | `Skyspaces (1974— )`              | `The dark contemplative room as primary form. No narrative scaffolding. Pure perception.` |
| 3    | `Ryoji Ikeda`           | `test pattern · data.matrix`      | `Sound and light as total sensorium. Room-scale, durational, austere.` |

---

## Slide 08 — Where it differs

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                                                                                                                                                                                                                                                       | Family             | Size  | Weight   | Color | Position (x, y) |
|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------|-------|----------|-------|-----------------|
| Section label  | `WHERE IT DIFFERS`                                                                                                                                                                                                                                                         | Geist Mono         | 11pt  | 400      | acc   | 96, 144          |
| Headline       | `Composed first.`<br>`AI second.`                                                                                                                                                                                                                                          | Cormorant Garamond | 88pt  | 300      | t-100 | 96, 200          |
| Body §1        | `The AI-image installation has become a genre — Anadol-flavored generative spectacle, large-format, often impressive, often hollow.`                                                                                                                                       | Geist              | 16pt  | 400      | t-50  | 96, 540          |
| Body §2        | `Resonance is the inverse. Each track is a written piece of music with intent. The visuals serve the music, not the other way around. AI sits inside the journey as a tool. It is not the headline.`                                                                       | Geist              | 16pt  | 400      | t-60  | 96, 640          |

The "AI second." line: italicize the words `AI second.` and color `acc` (`#8B5CF6`).

---

## Slide 09 — Why now

**Background**: `#0A0A0A`

**Elements**:

| Element        | Text                                  | Family             | Size  | Weight | Color | Position (x, y) |
|----------------|---------------------------------------|--------------------|-------|--------|-------|-----------------|
| Section label  | `WHY NOW`                             | Geist Mono         | 11pt  | 400    | acc   | 96, 144          |
| Headline       | `Slow attention is having a moment.`  | Cormorant Garamond | 52pt  | 300    | t-100 | 96, 200          |

**Three evidence rows** (start `y = 380`, `100px` row height, hairline divider `#1E1E22`):

| Bullet | Evidence text (Geist 14pt t-60, line-height 1.65)                                                                                          |
|--------|--------------------------------------------------------------------------------------------------------------------------------------------|
| ●      | `Hiroshi Yoshimura's Music for Nine Post Cards hit the Billboard charts in 2024 — fifty years after release. Ambient music is mainstream again.` |
| ●      | `Planetariums are reclaiming a cultural foothold. Hayden, Adler, and Morrison have all renovated and reopened their domes for contemporary programming.` |
| ●      | `Sleep No More–era audiences trained themselves on long-form, low-direction experiences. The patience is back.`                            |

Bullet: 8px purple circle, vertical-aligned with first line.

Italicize `Music for Nine Post Cards`, `Sleep No More`.

---

## Slide 10 — Who

**Background**: `#0A0A0A`

**Elements**:

| Element         | Text                                       | Family             | Size  | Weight | Color    | Position (x, y) |
|-----------------|--------------------------------------------|--------------------|-------|--------|----------|-----------------|
| Section label   | `WHO`                                      | Geist Mono         | 11pt  | 400    | acc      | 96, 96           |
| Name            | `Karel Barnoski`                           | Cormorant Garamond | 52pt  | 300    | t-100    | 96, 152          |
| Subtitle        | `Pianist · Composer · Designer`            | Cormorant Garamond | 18pt  | 300 it | acc-light| 96, 240          |

**Bio** — two columns, each `560px` wide, gap `48px`, starts at `y = 320`:

**Left column** (Geist 13pt 400 t-60, line-height 1.7):
- `Pianist and composer. Released *Welcome Home*, a solo piano album self-produced during quarantine — the source material for many of the journeys in Resonance.`
- `Design Director at Workday. 15+ years leading UX for enterprise products at Workday, GE, and Kodak. BFA Illustration and MFA Computer Graphics from RIT, with classical training from Barnstone Studios.`

**Right column**:
- `Founder of 2octave, an audio design studio specializing in product sonification. Award-winning sounds for products from digital cameras to kitchen appliances. Published in UX Magazine on the science of sound in product design.`
- `Resonance is the current shape of a multi-year practice translating composed music into shared visual experience. The installation is the natural next room.`

Italicize `Welcome Home`.

---

## Slide 11 — The ask

**Background**: `#0A0A0A` with subtle linear gradient diagonal — top-left to bottom-right, from `rgba(139,92,246,0.08)` fading to transparent over 120% canvas distance. Optional 1px `rgba(139,92,246,0.25)` border around the entire slide content if you want to box it.

**Elements (all centered)**:

| Element       | Text                                                                                                                                                                              | Family             | Size  | Weight | Color | y    |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------|-------|--------|-------|------|
| Section label | `THE ASK`                                                                                                                                                                         | Geist Mono         | 11pt  | 400    | acc   | 200   |
| Hero          | `Let's talk.`                                                                                                                                                                     | Cormorant Garamond | 96pt  | 300    | t-100 | 260   |
| Body          | `A one-night event. A multi-week run. A residency.`<br>`A slot in an existing program. A conversation. Whatever shape the fit takes.`                                              | Geist              | 18pt  | 400    | t-60  | 460   |
| Small note    | `Happy to ship a working prototype, or install in person.`                                                                                                                        | Geist              | 14pt  | 400 it | t-40  | 600   |
| Email         | `kbarnoski@gmail.com`                                                                                                                                                             | Geist Mono         | 14pt  | 400    | acc   | 720   |
| URL           | `getresonance.vercel.app`                                                                                                                                                         | Geist Mono         | 11pt  | 400    | t-30  | 760   |

---

## After Paper — export workflow

1. Paper → File → Export → PDF (`Resonance-Installation-Deck.pdf`)
2. Replace the file at `~/Desktop/Resonance-Installation-Deck.pdf` and `public/Resonance-Installation-Deck.pdf` (the second is what curators see when they download via the website)
3. Optional: PNG export of each slide → drop into `public/installation-stills/deck-slides/` for use as social previews
4. Update `docs/brand/brand-system.md`'s "Decks currently in the repo" table — flip "Paper canvas — Installation" status to **Live**

When the YC deck is next touched, follow the same migration: extract the canonical brand into Paper, rebuild slides with the SVG logo (replace the "⌇" placeholder) and the `#8B5CF6` accent (replace `#7C3AED`).
