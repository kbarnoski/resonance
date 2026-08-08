// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment + citations).

export const README = `Second Ear — a co-composer that infers your taste from one bit at a time.

THE ONE QUESTION
What if the machine were the second taste in the room? It never asks you to tune
anything. It PROPOSES a short 2-bar phrase; you give exactly ONE bit — Keep or
Pass — and from that stream of bits it silently builds a live model of YOUR ear
and composes toward it. Over a couple of minutes its proposals audibly converge
on what you keep.

AESTHETIC SELECTION, INVERTED
Classic interactive evolution (Dawkins' Biomorphs, Karl Sims) has the human
hand-pick parents while the machine executes crossover. Here it flips: the
machine proposes and builds a model of the HUMAN's taste, then biases its next
proposals toward that inferred ear.

HOW THE TASTE MODEL WORKS (no ML library, pure TypeScript)
Every phrase becomes an 8-D feature vector — register, range, density,
syncopation, contour, interval size, dissonance, leaps. A plain ONLINE LOGISTIC
REGRESSION keeps a preference-weight vector, updated one keep(+)/pass(−) bit at
a time by  w += lr·(y − p)·x. Each round it generates a seeded batch of diverse
candidates, scores every one by the model's logit, and PROPOSES THE TOP-SCORING
one — so proposals drift toward your ear.

KNOWS-YOUR-EAR METER
Before you decide, the model PREDICTS whether you'll keep it. It tracks the
running accuracy of that prediction and shows it climbing — the visible proof
it is learning you.

BOLD MOVE
Every few keeps it composes a longer 4-bar passage sampled purely from the top
of your inferred taste and asks "Is this you?" — a small Turing moment.

THE SELF-DEMO
On load a seeded synthetic listener with a HIDDEN taste (it likes dense,
syncopated, high phrases) runs the loop with no clicks and no audio, so the map
is alive and the meter climbs within seconds. The instant you make a real
Keep/Pass, it hands over to you.

THE MAP
The visual is a diagram, not a dot-cloud: a density × register plane with a soft
inferred taste field, labeled glyphs (kept phrases anchor and glow, passed ones
fade), and a drift trail of proposals migrating toward the taste region.

REFERENCES
· TuneJury — "Improving Text-to-Music Generation with Human Preference Rewards"
  (arXiv:2606.21670, June 2026): a learned pairwise preference ranker used at
  inference to select which generated samples to keep. Second Ear runs the same
  mechanism LIVE, per-player, in seconds.
· Interactive evolutionary computation / aesthetic selection (inverted).
· "The Shape of Surprise: Structured Uncertainty and Co-Creativity in AI Music
  Tools" (arXiv:2509.25028).

CONTROLS
K = Keep · J or P = Pass · Space = next. Equal-size tap buttons are the fallback.`;
