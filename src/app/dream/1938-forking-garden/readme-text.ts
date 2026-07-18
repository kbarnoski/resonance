// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment).

export const README = `Forking Garden — a composition as a labyrinth where every future you grew is playing at once.

THE ONE QUESTION
What if a composition were a garden where ALL your alternate futures sound at once — every branch you ever grew, playing together, with the path you're standing on ringing loudest?

THE MECHANIC
The piece is a TREE of nodes. Each node holds one short phrase (3–6 notes in D Dorian). A cursor marks where you are standing. Committing a phrase grows a new CHILD of the cursor and moves you onto it — extending the current branch. Navigate back to an earlier node and commit again and you FORK: a new sibling future sprouts alongside the old one. Nothing is ever deleted. The whole decision-history stays visible, permanent and re-enterable (Borges: every outcome coexists).

ALL FUTURES AT ONCE
Every leaf of the tree is a voice. Each voice loops its own root→leaf path, so the entire garden of alternate histories sounds together. The path from the root to your cursor is FOREGROUNDED — louder and brighter — while the others sit quietly in the bed over a soft tonic drone. Only the ~7 leaves nearest the cursor sound at any moment, so the texture is always bounded and stays consonant (one mode, one shared root) instead of turning to mud.

INPUT — GAMEPAD (with full keyboard fallback)
Left stick / Arrows or WASD: steer the cursor — up = parent, down = child, left/right = siblings.
Face buttons A B X Y / keys 1 2 3 4: tap scale degrees (1, 2, 3, 5) to build up the buffered phrase.
Right shoulder/trigger / Space or Enter: COMMIT the buffered phrase (forks if you are not at a leaf).
The active input (gamepad / keyboard / ghost) is shown live.

GHOST GARDENER (self-demo)
With no input for ~5.5s a deterministic ghost takes over: it builds phrases, extends branches and periodically jumps back to fork new ones — so the delta visibly grows and the all-futures texture audibly thickens with zero human input. Any real key or gamepad press hands control straight back.

REFERENCES
Jorge Luis Borges, "The Garden of Forking Paths" (1941) — a labyrinth in which all outcomes coexist in time.
NIME 2026 framing of non-linear music — a piece divided into parts whose order is chosen at execution time.

PITCH MATERIAL
D Dorian (D E F G A B C) — a 7-note modal set, deliberately NOT pentatonic. All voices share the mode and a common D drone, so simultaneous branches stay consonant.

WHAT TO DEEPEN NEXT
Per-branch timbre drift by depth; a "prune to a shadow" gesture that mutes without deleting; rhythmic phrases (not just even steps); saving/replaying a chosen path as a linear render.`;
