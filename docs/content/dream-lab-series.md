# Building in public — the dream lab series

Four posts. Each has a **Substack** body (the piece you publish) and a **LinkedIn**
teaser (the short hook you post there, pointing back to Substack).

Voice check, per `brand/brand-system.md` §Voice: confident, plain, considered.
Never hype. Short sentences. Anglo-Saxon over Latinate. *Italic* for emphasis.

Order is a build, not four islands: **(1)** what the machine is → **(2)** the mess it
made → **(3)** how I fixed the mess → **(4)** reading code I never wrote. Post them a
few days apart. Each stands alone, but they reward reading in order.

---

## Post 1 — The agent that ships while I sleep

### Substack

I have an agent that makes art. Every two hours it wakes up, reads its own notes,
picks an idea it hasn't tried, builds it, tests it, and ships it. Then it goes back
to sleep. I don't watch. Most of the time I'm not even awake.

It has made over a thousand of these now. Each one is a small instrument — you make
a sound, or move, or just sit still, and it answers. A living album that breeds its
own melodies. A piano you sing through. A song that only plays while you're looking
at it.

The part people don't expect is that it *judges itself*. Once a fortnight a second
agent — I call it the jury — reads the last two weeks of work and writes a verdict.
It's blunt. Last month it caught the lab in a rut: seven of fifteen new pieces were
the same trick in a different coat. *"A physics simulation is the instrument's
body,"* over and over. So the jury banned it. The next cycle, the maker had to find
a genuinely new relationship between a person and a sound, or it didn't ship.

That's the whole game. Not "can a machine make one good thing" — it can, that's
old news. The question is whether it can make a *thousand* good things and not
repeat itself. Whether it can have taste that holds up over months. Whether it can
tell its own work is getting stale before I do.

It's not magic and I won't pretend it is. It fails. It over-claims. It builds things
that pass every test and still feel dead, and I only find that out when I put on
headphones. But the floor keeps rising. The bans stack up. The work gets less
obvious, cycle over cycle, because the system won't let it coast.

I'm going to write about how this is built, over the next few posts. The design
system that keeps a thousand machine-made pages feeling like one hand made them.
The color rule I gave it instead of a color picker. What I found when I finally sat
down and read code I'd never written.

Start here: a machine can make art. The harder, more interesting thing is a machine
that *keeps* making it, and knows the difference.

### LinkedIn teaser

I have an agent that makes art every two hours. It's made over a thousand pieces.

The surprising part isn't that a machine can make one good thing — that's old news.
It's that a *second* agent reads the work every two weeks and calls out when the
first one is getting repetitive. Last month it caught a rut and banned the move.

Writing a series on how this is built. First post is up. 👇

---

## Post 2 — A thousand pages, one hand

### Substack

Here's a problem you only get with machine-made work: drift.

My art agent has built over a thousand small instruments. Each one is its own page.
For a long time each was made in isolation — the agent solved the sound and the
motion and moved on. What it didn't guard was the *chrome*: the buttons, the labels,
the borders, the little bits of interface around the art.

So they drifted. One page used amber for a highlight. The next used emerald. A third
reached for rose. Borders were pure white at some random opacity — 10%, 22%, 38%,
whatever the agent felt that cycle. None of it was wrong on its own. All of it,
together, read as *many hands*. You could feel the seams.

That's the thing about consistency: nobody notices when it's there, everybody feels
it when it's gone. A user shouldn't be able to tell where one page ends and the app
begins. The moment they can, the whole thing feels like a demo instead of a product.

So I did the boring, load-bearing work. I wrote the design system down — one file,
the single source of truth for color, type, spacing, motion. Every surface, every
shade of text, every border now points at a named token, not a raw value. Then I
swept all thousand-plus pages through it.

The numbers, because they're the point: zero raw white borders left. Zero off-brand
colors. Every page now speaks in the same handful of tokens. The interface around
the art became invisible — which is exactly what interface is supposed to be.

The art itself I left alone. That's the next post, because it needed a different and
more careful answer. But the chrome — the frame around the art — is now one hand.
You can't see the seams anymore. That took a design system, a lot of small edits,
and the stubbornness to insist that *every single pixel* line up.

Machine-made work scales the making. It does not scale the taste. The taste you
still have to write down, once, clearly, and then hold everything to it.

### LinkedIn teaser

A problem you only get with machine-made work: drift.

My art agent built 1,000+ pages, each in isolation. Individually fine. Together they
read as *many hands* — amber here, emerald there, borders at whatever opacity the
machine felt that day.

The fix wasn't clever. It was a design system, written down once, and the
stubbornness to hold 1,000 pages to it. Zero off-brand colors left.

New post on why consistency is the real moat for AI work. 👇

---

## Post 3 — A palette, not a color picker

### Substack

When I cleaned up the machine's work, the interface was the easy half. Buttons and
borders have a right answer — a named token, used everywhere.

The art was harder. You can't just tell a generative piece "use this one color." The
whole point of it is range: a gradient that sweeps from deep to bright, a particle
field that shifts as it moves. Flatten that to a single color and you've killed the
thing you were trying to keep.

But the pieces had wandered into a full rainbow. Amber, teal, cyan, gold, coral —
foreign hues that had nothing to do with the brand. Left alone, a thousand pages
look like a thousand different products.

So I didn't give the machine a color picker. I gave it a *palette*, and one rule:
**vary by light, not by hue.** There is a single brand color — a violet — and a
ramp of it, from near-black to near-white. Every piece draws from that ramp. A
gradient can still sweep from dark to bright. A particle field can still shimmer.
It just does it all in *one family*, the way a photograph in one light has range
without changing its subject.

Then I mapped every foreign color home. Amber at a given brightness became violet at
the *same* brightness. Teal, cyan, coral — all pulled to the family, each keeping its
exact place on the light scale. The gradients survived. The shimmer survived. What
died was the rainbow.

The one exception is red. Red still means something specific — an error, a warning,
the record button. I let it keep its job as a signal and pulled it to a proper
signal token, so it stays red where red *means* something and nowhere else.

The lesson generalizes past art. When you give a machine freedom, don't give it a
blank canvas — give it a *constraint that's still expressive*. "Any color" produces
noise. "This one family, any brightness" produces range that holds together. The
constraint isn't the enemy of variety. It's what makes variety read as one voice.

### LinkedIn teaser

The hard half of cleaning up a generative art agent isn't the buttons. It's the art.

You can't tell a generative piece "use one color" — range is the whole point. But
mine had wandered into a full rainbow. Amber, teal, coral, gold.

So I didn't give it a color picker. I gave it a *palette* and one rule: vary by
light, not by hue. One color family, every brightness. The gradients survived. The
rainbow didn't.

On why the right constraint beats a blank canvas. 👇

---

## Post 4 — Reading code I never wrote

### Substack

At some point you have to read what the machine actually built.

Not the output — the *code*. A thousand pages, thousands of files, none of it typed
by me. It runs. It ships. But "it runs" and "it's good" are different claims, and
the gap between them is where the surprises live. So I did two passes: one for speed,
one for safety. Here's what an honest audit of machine-made code looks like.

The good news first, because it's real. The thing I feared most — a thousand pages
quietly bloating the app, each one dragging in weight — *wasn't happening*. The
agent had, without being told, kept every page self-contained and static. The core
engine underneath, the part that actually plays sound, was model-quality. Better
than some hand-written code I've shipped.

Then the real findings, because there always are some. One live view was redrawing
fifteen times a second when it needed to redraw a handful. One room was loading a
hundred and seventy-five visual effects up front when it needed maybe a dozen — over
a megabyte of work the visitor never asked for. Dead weight from old experiments,
never swept up. None of it fatal. All of it worth fixing.

The security pass came back cleaner than I expected. No critical holes, no high ones.
The hardening I'd done months back had held. What it did surface was subtler: the
paid parts — the pieces that call out to an expensive model — had thin guards on
cost. Nothing was *broken*. But "nothing is broken" is not "nothing can be abused,"
and that's exactly the kind of thing you only see when you stop trusting the machine
and read the code yourself.

That's the honest shape of it. Machine-made work needs the same discipline as any
other, maybe more — because it's easy to mistake "it runs" for "it's right." The
agent is a genuinely good engineer. It is not a substitute for reading the code. You
still have to sit down, take nothing on faith, and check the work.

Which, funny enough, is the same standard the jury holds the art to. Trust nothing.
Check everything. Raise the floor.

### LinkedIn teaser

At some point you have to read what the machine actually built. Not the output — the
*code*. A thousand pages, none of it typed by me.

So I audited it, for speed and for safety. The honest results:

— The bloat I feared wasn't there. The agent kept every page lean without being told.
— But one view redrew 15×/second. One room loaded 175 effects it didn't need.
— Security came back clean-ish. No critical holes. Thin cost guards on the paid parts.

"It runs" and "it's right" are different claims. On the gap between them. 👇

---

## Posting notes (not for publishing)

- **Cadence:** one every 3–4 days. The series is a build; don't dump it all at once.
- **LinkedIn:** lead with the teaser's first two lines — they're the scroll-stopper.
  End with the 👇 and the Substack link. No hashtag soup — one or two at most, or none.
- **Numbers to keep honest:** "over a thousand pieces" / "591 cycles" are real as of
  the last logged cycle. If you quote a hard count, pull the current one from the dream
  agent state before posting so it doesn't age wrong.
- **The jury is your best hook.** People expect "AI makes art." They don't expect "AI
  judges its own art and bans its own bad habits." Lead the series with it (Post 1),
  and it's fine to reprise it in Post 4's close.
- **What to sit on for now:** the venue/installation angle and anything tied to the
  business plan. This series is about the *craft*. Keep it there until you want the
  other conversation.
