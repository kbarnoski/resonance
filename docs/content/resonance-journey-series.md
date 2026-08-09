# Resonance — the journey series

A seven-post content series tracing the full arc of building Resonance and its
autonomous Dream Lab — from the first commit (**Feb 15, 2026**) to now
(**Jul 11, 2026**): 5 months, 1,141 commits, one person going from zero code to a
production product, a physical-installation plan, and a fleet of AI agents.

**Dual purpose.** This works as (1) a public content series, and (2) a portfolio
artifact — the thing you send a hiring manager with *"here's a personal project,
rooted in AI, that I designed, built, and shipped end-to-end."* It should read as
proof of range: **maker, designer, builder, composer, artist — and someone who can
author AI agent behavior.** No single identity dominates; the point is that one
person spanned all of them, and AI is the lever that made it possible.

**Voice** (per `brand/brand-system.md` §Voice and your own edits): confident, plain,
considered. Never markety. Short sentences. Anglo-Saxon over Latinate. *Italic* for
emphasis. Humble but shows the growth. No exaggeration — every fact is real and dated.
Pull live counts before posting so nothing ages wrong.

**The arc** (a loop, not a ladder): a maker builds the tool he needs → it becomes a
mirror on his own craft → then a room you disappear inside → then an art-directed
world → then a shared installation → then an autonomous, design-governed AI studio →
and all of it proves one thing: *taste is the durable skill, and it just got a much
longer reach.*

**Cadence:** one every 4–5 days. ~5 weeks total.

---

## Post 1 — I build the tools I wish existed

### Substack

I'm a designer and a maker. I've spent my career leading design, and my whole life
making things — I draw, I compose, I've released a solo piano record. The one thing
I'd never done, until this year, was write code.

The record is called *Welcome Home* — thirteen piano pieces I made alone in my house
during the lockdown, most of them written and recorded in a single sitting. And like
every maker I know, I had a problem I couldn't design my way out of: the ideas pile up
and disappear. Hundreds of voice memos in a phone, unnamed, forgotten. I could never
find *that jazzy thing from last Tuesday*, or tell you what key I'd been in without
going back to the piano to hunt for it.

So in February I did the thing makers do. Instead of complaining about the missing
tool, I built it. For the first time in my life I opened a code editor — not to become
an engineer, but to make the one thing I wished existed: something that would *listen*
to a recording of my playing and hand it back understood. The key. The chords. The
tempo. The shape of the idea. I wrote the thesis on day two and it still holds: *every
idea deserves to be understood, not just stored.*

Ten days later it worked — a full analysis workspace, running right in the browser. I
want to be honest about what that was. I wasn't a prodigy who cracked programming. I
was a designer who already knew how to *direct* — to hold a sharp picture of the thing
and steer toward it, one decision at a time. It turns out that's most of the job. The
taste and the judgment were mine. The syntax, increasingly, is something you can
direct an AI to handle. That single realization is what this whole project is really
about.

I'll say plainly why I was building at all. The last year had been hard — I lost my
father, and much of this was made in the quiet after. *Welcome Home* was made alone in
a hard year; Resonance was made the same way, about the same thing. I wasn't chasing a
product. I was building a place to be still.

What I didn't expect was how far a maker's instinct plus AI could actually go. That
little tool became a mirror on my own craft. Then a room you could step inside your
music and disappear. Then a whole album you could walk through, a plan for a physical
installation, and finally a studio of AI agents that make their own work while I sleep
— all of it held together by a single design system. Five months. Eleven hundred
commits. One person.

This series is that whole build. It starts here, with a simple belief that's served me
across every discipline I work in: *if the tool you need doesn't exist, make it.*

### LinkedIn teaser

I'm a designer and a maker. I've led design my whole career and made things my whole
life — I draw, I compose, I've released a piano record. The one thing I'd never done
was write code.

In February I opened a code editor for the first time. Not to become an engineer — to
build a tool I wished existed: something that could *listen* to my piano playing and
hand it back understood.

Ten days later it worked. Five months later it's a product, an installation plan, and
a fleet of AI agents — designed, built, and shipped by one person.

New series on the whole build. Part 1 is up. 👇

---

## Post 2 — The mirror: instrumenting my own craft

### Substack

The first real thing I built pointed the tool back at myself — and it taught me
something I think generalizes far past music.

I fed my own album into the analyzer I'd made. And it showed me things about my
playing I had never consciously known. I'd played piano for decades on instinct — I
knew *what* I liked, I just couldn't have told you *why* in any precise language. Then
the analysis came back, laid out like a fingerprint. It read one of my pieces and
described it better than I could: extended chords hovering over a held bass note,
color chosen over resolution, a dreamy suspended thing that never quite lands. And I
thought: *that's not one piece. That's all of them. That's me.*

Here's why that matters beyond music, and why it's a *designer's* move as much as a
musician's. What I'd done was instrument my own practice — build a system that makes
an invisible thing visible, without flattening it. That's the core of good design and
good tooling: you don't tell someone what to do, you give them a clear view of what
they're already doing, and let them decide. The dashboard of my "musical DNA" — my
favorite keys, my chord vocabulary, my habits — wasn't a critique. It was a portrait.
An information-design problem: take something dense and felt, and render it legible
without killing the feeling.

And it changed how I work. Once you can *see* a habit, you get to choose whether to
keep it. I now know, plainly, that I reach for the same suspended voicing when I don't
know where a piece wants to go. Sometimes that's the sound. Sometimes it's a crutch.
Naming it means I get to choose — lean in when it's right, push past it when I'm
hiding. The tool that started as a way to *remember* my ideas became a way to
*understand* them, and understanding them makes me better.

We talk about AI mostly as a thing that *generates* — that makes new stuff. But the
most valuable thing it did for me first was the opposite. It *reflected*. It's the
same instinct I bring to any product: the highest-leverage feature is often the one
that shows people their own work clearly, so their judgment has something to stand on.
Generation is cheap now. A clear mirror is rare.

### LinkedIn teaser

I fed my own piano album into the tool I'd built. It showed me things about my playing
I'd never consciously known — laid out like a fingerprint.

That's a designer's move as much as a musician's: instrument your own practice. Build a
system that makes an invisible thing visible without flattening it, then let judgment
decide.

We talk about AI as a thing that *generates.* The most valuable thing it did for me
first was the opposite — it *reflected.* Generation is cheap now. A clear mirror is rare.

New post on the highest-leverage feature in any tool you build. 👇

---

## Post 3 — Music leads, light follows

### Substack

At some point I stopped wanting a tool that *analyzed* music and started wanting one
that let you *disappear* into it. So I built The Room — a full-screen space where a
piece plays and the whole screen becomes a slow, living visual, moving with the music
through a quiet arc. It shipped end of March.

Building it forced the most important design decision in the whole project, and it cuts
against nearly every music visualizer ever made: I decided the visuals would *not*
dance to the beat.

It sounds backwards. Every music visual you've seen jumps and pulses on the audio —
bars bouncing, particles bursting on the kick. Thrilling for thirty seconds, then
exhausting, and worse, it *fights* the music. A twitchy visual chasing every note turns
a contemplative piece into a screensaver. So I made the opposite call. In Resonance the
visuals breathe on slow, independent curves. The music leads; the light *follows*, at
its own patient pace. There's a single flag in the code that says, in effect, *don't
chase the audio* — on for every journey. That one restraint is the whole difference
between spectacle and stillness. Knowing what to leave out is the job.

The rest of that stretch taught me that taste and engineering aren't two jobs — they're
the same job. I had 170 shader visuals at one point and deleted more than a hundred of
them in a single commit, not because they were broken, but because a hundred mediocre
things drown the ten great ones. When transitions between visuals flashed, my first fix
was clever — a detector to catch the glitch. It made everything worse. So I threw it out
and did the plain thing, and it worked. The lesson stuck: *the clever fix is often the
tell that you haven't understood the problem yet.*

Underneath it all I kept one law, four words I repeated until everything answered to
them: *ever changing, but never abrupt.* Every transition slow. Nothing allowed to pop.
An abrupt cut breaks the spell the music is casting, and the spell is the point. I spent
whole days hunting single-frame flashes nobody would ever consciously see — they'd only
*feel* them. Which is exactly why they mattered. Design at the level of frames.

This is the unglamorous middle of building anything real. But it's where I stopped being
a designer *using* code and became someone who could *build* — taste and craft and
engineering pointed at one goal: a place where a piece of music can be felt, not just
heard.

### LinkedIn teaser

Every music visualizer dances to the beat — bars bouncing, particles bursting on the
kick. Exciting for thirty seconds, exhausting after, and it *fights* the music.

When I built The Room, I made the opposite call: the visuals do *not* chase the audio.
The music leads; the light follows, slowly. One flag in the code. That single restraint
is the difference between spectacle and stillness — knowing what to leave out is the job.

That season taught me taste and engineering aren't two jobs. They're the same job.

New post on deleting your own work, killing the clever fix, and designing at the level
of single frames. 👇

---

## Post 4 — A composition becomes a room of light

### Substack

Here's a problem I didn't expect to spend months on: how do you turn a *specific* piece
of music into a *specific* world — a room of light that belongs to this piece and no
other? This is art direction, and it turned out to be the deepest craft in the project.

It starts with the music itself. When Resonance builds a journey for a track, it reads
the harmony first. A minor key pulls the world cooler and darker. A slow tempo pulls it
toward the melancholic. A piece that vamps on four chords reads as *hypnotic* — a trance
— and gets a trance's visuals. Chromatic, unresolved chords read as *mystical*, and the
light turns strange. The harmony literally tints the room. Then the mood pours into a
fixed six-part arc — a rise, a peak, a coming home — the shape contemplative music seems
to want.

The deepest work is a single journey I call *Ghost*, and directing it taught me what it
means to point a very capable AI at a real work of art.

Ghost has a written constitution. Before a single image was generated, I wrote a
document that governs everything, with a rule at the top: *nothing about this imagery
changes without editing this file first.* If you've ever maintained a design system,
you'll recognize the move — a single source of truth, versioned, that every output must
answer to. Ghost is the story of a fallen angel across six phases: she appears in a
stone chamber, descends through a portal of living roots into an underground cathedral,
finds her wings, emerges into open cosmos, touches a dead tree until flowers bloom from
the point of contact and she dissolves into it, then soars, released, into gold.

And it has laws, each hard-won:

- *You never see her face. Eyes closed the whole journey.* The moment you see a spirit's
  face, she becomes a person and the mystery dies.
- *Every frame carries two or three translucent echoes of her, offset slightly* — like a
  long exposure. That's what makes a ghost read as a ghost: the motion-trails of one
  soul, not a crowd.
- The track has two bass hits, and I tied the story to them. On the first, her dress and
  wings go jet black while her hair stays snow white — the possession. On the second, she
  turns white again, arms out, soaring — the release. The structure of the music recolors
  the character.

I iterated for weeks. The crossfade between images started at two seconds and I kept
slowing it — four, then six — because faster *felt* abrupt between major moments, and
abrupt was forbidden. When I finally got it exactly right, I did something I'd never done
before: I froze that version in the project's history, labeled it the *mature baseline*,
and wrote next to it, simply, *it's perfect.* A design bookmark in time, so I could
always find my way back to the moment the art was true.

That's the craft, and it surprised me: directing a machine toward real art isn't about
clever prompts. It's about *constitution* — knowing exactly what the thing is, writing
it down, and holding everything, including a fast and fluent AI, to that standard. Frame
by frame. Same discipline as any design system I've ever run; higher stakes, because the
output is feeling.

### LinkedIn teaser

How do you turn a *specific* piece of music into a *specific* world — a room of light
that belongs to this piece and no other? It's art direction, and it was the deepest
craft in the project.

The harmony tints the room: a minor key pulls it cooler, a four-chord vamp reads as a
trance, chromatic chords turn the light strange. The deepest piece — a journey called
*Ghost* — has a written *constitution.* You never see her face. Every frame carries
translucent echoes of her. Two bass hits recolor the whole story.

Directing an AI toward real art isn't clever prompting. It's constitution — the same
discipline as running a design system, with feeling as the output.

New post. 👇

---

## Post 5 — The whole album as one path home

### Substack

Once I could turn one piece into a room, I built the thing I'd been quietly aiming at:
my *whole album* as a place you could walk through.

*Welcome Home* is thirteen pieces about exactly that — coming home. To a place, a self,
a state that was always waiting. I threaded all thirteen into a single path. Each track
became its own journey, its own world, tinted by its own harmony — thirteen visual
dialects of one album. You walk them in order, one piece flowing into the next, the way
the record was meant to be heard.

Then I designed the ending I'd wanted from the start. After all thirteen, a fourteenth
journey unlocks that you can't reach any other way. I call it *Cosmic Homecoming* — the
album distilled into one final passage: *the moment after a long journey when you stand
at your own front door and realize you've arrived.* One detail I love, and it's an
interaction-design choice: the visual arc of that ending is fixed, but the piece of music
under it is drawn at random from the whole album. The homecoming is always the same
shape, always a different song. The unlock, the progress, the in-app versus shared-link
experience — all of it designed so the reward means something when you reach it.

That's when I understood what Resonance actually wanted to become. Not an app. A *room*.

So I've started designing it as a physical installation. A dark space, floor mats and
pillows, no chairs. A single overhead projection, sound in four corners. People come in,
lie back, look up, stay as long as they like. A thirty-minute path of my music loops. No
headphones, no wall text, no narration, no timed entry. Planetarium vibes. You watch a
phase or two and leave, or stay for the whole cycle. Both are right. This is experience
design at architectural scale — the same practice as any product, just measured in a room
instead of a screen.

I want to be clear where this sits, because AI art installations are everywhere right now
and most are spectacle — walls of generated imagery, dazzling, loud, and *about the
technology.* Resonance is the opposite, on purpose. It's *composed first.* Every track is
a real piece of music, written with intent, and the visuals serve the music — never the
reverse. The AI sits *inside* the piece as a tool; it's never the headline. The lineage I
care about isn't the spectacle crowd — it's Brian Eno's generative paintings, James
Turrell's contemplative rooms, Ryoji Ikeda's sound and light as one sense. Slow attention.
Composed intent. A room that trusts you to sit still.

There's a real technical road to make that work at scale — native rendering, feeding the
visuals to projectors and domes and, one day, something Sphere-sized. But the vision is
simple and hasn't changed since the first ten days: take music made alone in a quiet
room, and design a place where other people can be quiet inside it too.

### LinkedIn teaser

*Welcome Home* is thirteen piano pieces about coming home. I turned the whole album into
a place you can walk through — each track its own world, threaded into one path.

After all thirteen, a hidden fourteenth journey unlocks: the album distilled into one
ending. Its visual arc is fixed, but the song under it is drawn at random — the homecoming
is always the same shape, always a different piece.

Now I'm designing it as a physical installation. Dark room, floor mats, look up. Not
spectacle — *composed first.* The visuals serve the music, never the reverse. Experience
design at the scale of a room.

New post on scaling a private tool into a shared space. 👇

---

## Post 6 — Teaching a machine to make — and giving it a design system

### Substack

Building all those worlds taught me a vocabulary — hundreds of ways sound, light, and
motion can lock together. I wanted to know how far it could go. So I built something that
changed what this project is: a studio of AI agents that make new work on their own.

The loop is exactly as strange as it sounds. Every two hours an agent wakes up, reads its
own notes, picks an audiovisual idea it hasn't tried, spins up two or three builders in
parallel, ships the best one to the live site, writes down what it learned, and goes back
to sleep. I don't watch. Its very first autonomous act, at 12:19 one morning in May, was
to build *itself* a dashboard to review its own work. It's run over 740 times since and
shipped around 700 small instruments — each one a tiny experiment in a new relationship
between a person and a sound.

But this is where my two disciplines collided in the most useful way. Because here's the
problem nobody warns you about with a machine that makes a thousand things: they don't get
*bad*. They get *the same*. And separately — they drift. Left alone, one page reaches for
amber, the next for emerald, borders at whatever opacity the machine felt that day. Each
is fine. Together they read as *many hands*, and the moment a user can feel the seams, the
whole thing stops feeling like a product.

So I did the two things I know how to do. As a builder, I gave the machine a *critic* — a
second agent that reads the last two weeks of work every day and, instead of scoring it,
*bans* whatever pattern the lab is overusing. It's blunt. It caught one structural trick
used seven times running and killed it. It caught the maker ignoring a previous week's ban
and called it out by name. The machine gets scolded, in writing, by the machine.

And as a designer, I gave it a *design system* — and this is the part I'm proudest of. I
didn't hand the AI a color picker. I wrote the system down once — one violet, a single
family of light, semantic tokens for every surface, hard rules for type and spacing and
rounding — and then built a normalizer that sweeps every machine-made page through it
before it ships. The rule I gave it wasn't "use this color." It was *vary by light, not by
hue.* One family, any brightness. The result: roughly 700 pages, none of them touched by
human hands, that still read as one hand made them. Zero off-brand colors. No visible
seams. The interface around the art became invisible, which is exactly what interface is
for.

That's the whole thing in one project: an autonomous system that *makes*, a critic that
keeps its taste honest, and a design system that keeps a thousand machine-made pages
coherent. Building the maker is engineering. Keeping it from going stale is judgment.
Keeping it visually one is design. I got to use all three at once, and watch them hold.

### LinkedIn teaser

I built a studio of AI agents that make new work on their own — every two hours, shipped
live, no human in the loop. Over 700 pieces so far.

Two problems show up fast, and they're exactly my two disciplines. As a *builder*, I gave
it a critic — a second agent that reads the work and *bans* whatever pattern is going
stale (it once caught the maker ignoring last week's ban and called it out by name). As a
*designer*, I gave it a design system — one violet, one rule: *vary by light, not by hue*
— and swept 700 machine-made pages through it. Zero off-brand colors. No visible seams.

An autonomous maker, a critic that keeps its taste honest, a design system that keeps it
all one hand. New post. 👇

---

## Post 7 — A designer can author agent behavior

### Substack

I want to close where I started: with the belief that if the tool you need doesn't
exist, you make it — and with what five months of doing that taught me about this moment
we're all in.

I started the year as a designer who couldn't code, quietly worried — like a lot of
people — that the ground was shifting under my whole profession. I could have spent the
year anxious. Instead I answered the question by building, and the arc that came out is
the real lesson.

It went in four steps. First an *artifact* — a tool I made by hand to understand my own
craft. Then a *product* — that tool hardened into a room you can share, with auth,
storage, a full analysis pipeline, security, the works. Then an *agent* — a system that
makes those experiences on its own. And now a *fleet* — many agents, one of them a critic
of the others, all governed by a single design system, running while I sleep, with me
supervising and curating rather than typing.

At no point did my actual job change. It was always taste and judgment — knowing what
*good* looks and sounds like, and holding everything to it. What changed is the *leverage.*
In February my judgment could shape one recording at a time. By July it shapes a product,
a physical-installation plan, and a studio of AI agents shipping work I never personally
touched. I didn't become a better typist. I became a better *director.*

That's the sentence I'd put in front of any hiring manager, and I mean it literally: *a
designer can author agent behavior.* The critic that bans stale patterns, the design
system an AI can't drift out of, the constitution that holds a generative artwork to a
standard — those aren't engineering artifacts. They're *design* artifacts, aimed at
systems that build instead of screens that sit still. The scarce skill in the age of
generative AI isn't making things. Machines make endlessly. It's *knowing what's worth
keeping* — and being able to encode that judgment into a system so it holds at scale.
That's design. That's the whole job, and it just got a much longer reach.

And underneath all of it, the loop closes where it began: at the music. The tool that
analyzed my playing is becoming one I *compose* with. The vocabulary the machine explores
feeds the installation. The installation is my album made large enough for other people to
sit inside. Maker, designer, builder, composer, artist — I stopped thinking of those as
separate things this year. They're one practice now, and AI is what let one person hold all
of them at once.

To anyone who started the year telling themselves they're "not technical": I was you in
January. Eleven hundred commits later, the barrier was never the syntax — that's handled
now. The barrier was believing you had nothing to bring. You do. Taste is the scarce thing.
It always was. It just got a much longer reach.

I still can't quite believe the pace. But I've stopped being surprised by the direction.
Thanks for walking the whole path.

### LinkedIn teaser

I started this year as a designer who couldn't code, quietly worried the ground was
shifting under my profession. So I spent five months answering the question by building.

The arc: *artifact → product → agent → fleet.* A tool made by hand. A shareable product.
An agent that builds on its own. A fleet — many agents, one a critic of the others,
governed by a single design system, running while I sleep.

Here's the sentence I'd put in front of any hiring manager: *a designer can author agent
behavior.* The scarce skill now isn't making things — machines make endlessly. It's knowing
what's worth keeping, and encoding that judgment into systems that hold at scale. That's
design.

Final post in the series. 👇

---

## Posting notes (not for publishing)

- **This series is also a portfolio.** It's built to double as the thing you send a hiring
  manager. The identities are balanced on purpose — Posts 1 & 7 name the full range (maker,
  designer, builder, composer, artist, agent-director); Posts 2–5 lean creative/craft; Post
  6 is the designer-plus-builder showpiece (design system + autonomous AI). Don't let any
  single reading (just-a-musician, just-an-engineer) take over.
- **Cadence:** one every 4–5 days; ~5 weeks. The series opens and closes on the same belief
  ("build the tool you need") on purpose.
- **Strongest standalone hooks, ranked:** (1) Post 6 — "an autonomous AI studio + a critic
  + a design system" (the clearest proof of range; best for hiring managers). (2) Post 2 —
  the *mirror* (most original, most human). (3) Post 1 — "a designer and maker who couldn't
  code." (4) Post 4 — the Ghost *constitution.* If the algorithm gives you two, lead with 6
  and 2.
- **LinkedIn mechanics:** lead with the teaser's first two lines. End with 👇, Substack link
  in the *first comment*, pinned. One hashtag at most, or none. Reply fast in the first hour.
- **Hiring-manager cut:** consider posting Post 6 and Post 7 as LinkedIn-native pieces (no
  Substack link — the full argument in the post) for the professional feed. "A designer can
  author agent behavior" and artifact→product→agent→fleet are the interview story in one line.
- **Assets worth making:** Post 2 — a screenshot of your real *Musical DNA* / analysis
  (information design of your own harmony). Post 4 — a few Ghost frames showing the spirit-
  echoes. Post 6 — a before/after of the palette normalization across dream pages, plus the
  commit-curve chart (21 in Feb → 389 in June). Post 5 — a short capture of a *Welcome Home*
  journey. Visuals will carry this series on LinkedIn.
- **Honesty guardrails (your own principle):** per-track keys come from automated analysis
  and aren't gospel — speak to your *harmonic language* (pedal tones, extended voicings,
  color over resolution), not exact keys. Live counts age: 1,141 commits / 744 cycles / ~700
  prototypes are true as of Jul 11, 2026 — refresh before posting.
- **The grief line in Post 1** is yours to keep or cut. True, and the real seed; you
  referenced it yourself. The one restrained sentence as written lands with dignity — your
  call entirely.
- **For YC / investors:** the no-login shareable *Welcome Home* path is the "can I see it"
  link, not the posts. Keep posts about craft and journey; keep the business pitch separate.
- **Stays out entirely:** the finance and fishing prototypes (isolated, per your standing
  direction). This series is Resonance + the Dream Lab only.
- **Superseded:** replaces the earlier `dream-lab-series.md` (four craft-only posts). Delete
  it or keep as archive — your call.
```

