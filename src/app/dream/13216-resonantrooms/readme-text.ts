export const README = `Resonant Rooms

Eight of Karel's songs re-heard as architectural acoustics — each room in the
building IS one song and wears its title. The top row walks the Welcome Home
album's opening (Interplay, Bath, Welcome Home) into Isolation; the bottom row
holds the full Snowflake EP (Ghost, Realized, Snowflake) and closes at All
Together — all drawn as an architect's blueprint lit from within. Walk the
listener between rooms by dragging (or WASD). Each room loops its one real
recording through a convolution reverb cast to fit the song: Isolation in a
1.0s close bedroom, Bath in an echoing tiled bath, Snowflake in a 4.4s glass
conservatory, All Together in a 5.2s stone hall. The rooms sound like
different spaces, so you can find your way with your eyes closed.

The distinguishing move is acoustic bleed at thresholds. Stand in a doorway and
you hear BOTH adjacent rooms at once, equal-power-crossfaded (cos/sin law) by how
far across the threshold you stand — each still wearing its own reverb. Step fully
into a room and only that room sounds. Sources also HRTF-pan around the moving
listener, giving the plan left/right and front/back depth.

References: Janet Cardiff's The Forty Part Motet (voices you physically walk
among) and Alvin Lucier's I Am Sitting in a Room (a room's resonance as the
instrument).

Caveats: headphones strongly recommended (HRTF + reverb tails), and browsers
require one click before any audio can start. Once a room has loaded it loops
its song with no further network fetches; if a track can't be fetched at all
(headless / offline) that room is marked unreachable, retried every few
seconds, and the walk continues.`;
