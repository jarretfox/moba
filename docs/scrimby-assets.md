# Scrimby: the first fully finished champion

Everything Scrimby needs to look and sound top tier, in the order it's worth doing. Specs, folders and file formats are in `docs/art-bible.md`. Every piece is optional on its own: install any of them and the rest stay as they are.

**Who he is:** a scrappy New Yorker who took the wrong train and ended up in the realm. Fast-talking, impatient, a wisecracker, never without his diner coffee. A mage, built around the subway: a hot dog skillshot, a manhole that blows, a jaywalk dash, and his ultimate, the Express Train, a subway car he charges across the map in.

**His colors:** a navy quilted puffer (`#1d2a44`, shadow `#121a2e`) over a grey hoodie (`#8a8f9a`), mid-blue jeans (`#3a5a8a`), wheat work boots (`#c9963f`, sole `#5a3a1a`), a navy cap (`#1c2541`) with a white monogram, skin `#d6a274`, dark brown stubble (`#2a1a10`), and a blue Greek-diner paper cup (`#2a5aa8` with a cream key pattern `#f2efe6`).

**Keep it ours:** an "NY-ish" monogram of our own on the cap, not the Yankees' logo, and unbranded boots.

## 1. His figure (the biggest jump)

Templates are in `art-templates/scrimby/0/` (`full.png` to paint from, `guide.png` with the joints, one picture per part). Each look gets its own set: `bakeArt('scrimby', 1)` and so on in a dev build's console.

| Part | What it is |
|---|---|
| `head` | Squinting one eye, the other brow up, a smirk, stubble, an ear. Eyes and mouth stay where the template has them (the game blinks and winces over them). |
| `dangle` | The cap: navy crown, the bill out front, the white monogram. It swings, and flies off when he dies. |
| `torso` | The puffer: fat quilted bands, a zip, the hoodie collar. |
| `frontUpper`, `frontFore` | Puffer sleeve, upper and lower; round, overlapping ends. |
| `backUpper`, `backFore` | The same, the far arm, about 20% darker. |
| `frontHand`, `backHand` | His hands (the far one darker). |
| `frontThigh`, `frontShin` / `backThigh`, `backShin` | Jeans, round ends; the far leg darker. |
| `frontFoot`, `backFoot` | The wheat work boots: chunky, padded collar, dark sole, laces. |
| `weapon` | The diner coffee cup, held at its grip point, steam wisps on top. |

**His looks** (each recolors the same pieces):

| # | Look | Colors |
|---|---|---|
| 0 | Uptown | as above (start with this one) |
| 1 | Queens Boulevard | orange puffer, royal-blue cap and hood |
| 2 | Brooklyn Nights | black on black, red monogram and hood |
| 3 | Zombie Commuter | Halloween (`render/costumes.ts`) |

**AI prompt for the concept**, given `full.png` as the reference image:

> Full-body character for a 2D cartoon game, side view facing right, standing, plain white background. Bold ink cartoon style: thick dark outline, flat colors with one shadow tone, light from above. Chunky proportions: big head, big boots, short legs. A scrappy New York commuter in his thirties: navy quilted puffer jacket over a grey hoodie, mid-blue jeans, wheat-colored work boots, a navy baseball cap with an original white "NY"-style monogram, stubble, squinting one eye with the other eyebrow raised, a smirk. Holding a blue Greek-diner paper coffee cup in his front hand. Impatient, wisecracking attitude. Match the reference image's pose and proportions exactly.

Then an artist paints each part over its template using the concept. AI can't yet cut a figure into clean pivoting parts.

## 2. His things in flight

| Sprite key | What | Paint at | `width` |
|---|---|---|---|
| `projectile:token` | His basic attack: a brass subway token, spinning. | 256×256 | 18 |
| `projectile:hotdog` | Q: a street hot dog in its bun, a yellow mustard squiggle, pointing right. | 512×256 | 40 |
| `scrimby:train` | R: a New York subway car, side-on, **front to the right**: brushed steel, an orange stripe, dark windows and sliding doors, a round yellow route bullet with a black R on the front, headlights. | 2048×768 | 175 |

**AI prompts:**
- Token: *"a brass subway token, front view, bold ink cartoon style, thick dark outline, flat colors, transparent background"*.
- Hot dog: *"a New York street hot dog in a bun with a yellow mustard squiggle, side view pointing right, bold ink cartoon style, thick dark outline, flat colors, transparent background"*.
- Train: *"a New York City subway car, side view, the front of the train on the right, brushed stainless steel with an orange stripe, dark windows and sliding doors, a round yellow route sign with a black letter R on the front, headlights on, bold ink cartoon style, thick dark outline, flat colors, transparent background"*.

## 3. His effects

Each one plays over the current code effect unless set to replace it. All at 24 fps.

| Effect | When | Frames | Notes |
|---|---|---|---|
| `mustard` | Q hits: a mustard splat and hot-dog-water splash | 10 at 256 | anchor `[0.5, 0.5]` |
| `manhole` | W's warning (0.6 s): the cover rattles, steam leaks round it | 14 at 256 | layer `under`, anchor `[0.5, 0.6]` |
| `steamBurst` | W goes off: the cover blasts up, a roaring column of steam | 18 at 512 | anchor `[0.5, 0.95]` |
| `jaywalk` | E: dust kicked up at the end of the dash | 10 at 256 | layer `under` |
| `expressHorn` | R starts: the headlights flare | 8 at 256 | `glow`, painted on black |
| `expressCrash` | R hits: twisted metal, sparks, dust, a shockwave | 20 at 512 | sparks as a second `glow` sheet if wanted |

AI image tools don't yet keep a whole animation consistent across frames. The quickest good routes:
- **Smoke, dust, steam and sparks:** free CC0 flipbooks (Kenney's particle packs, OpenGameArt), recolored.
- **Signature moments** (steam burst, crash): an artist animating 6–8 keyframes from an AI or artist concept.
- **Glows** (headlight flare, crash flash): AI on a black background.

## 4. His sounds

Record or pick sounds **dry**: the game adds the room, distance and panning.

| Key | What it should sound like | Takes |
|---|---|---|
| `atkToken` | A token flicked and pinging off someone: a bright metal tink. | 4 |
| `cast:scrimby:0` | Q: a quick wind-up whoosh and the dog flung. | 2 |
| `fx:mustard` | Q lands: a wet splat. | 3 |
| `cast:scrimby:1` | W: a crowbar clank under the cover. | 2 |
| `fx:manhole` | W warning: the cover rattling, steam hissing. | 1 |
| `fx:steamBurst` | W goes off: a heavy metal thunk and a roaring steam blast. | 2 |
| `cast:scrimby:2` | E: a sneaker squeak and a car horn (*HONK*). | 3 |
| `fx:jaywalk` | E lands: quick scuffing footsteps. | 2 |
| `cast:scrimby:3` | R: the subway doors' chime (two notes), then rumbling wheels. | 1 |
| `fx:expressHorn` | R: a subway train horn, long. | 1 |
| `fx:expressCrash` | R hits: brakes screeching, a crash of metal, rubble. | 2 |
| `castHonk` | His other casts' signature (now a synth honk); can stay. | n/a |

Where to find them: Kenney's audio packs (CC0) for impacts, metal and footsteps; the Sonniss GDC bundles (royalty-free) and Freesound (check each license) for the train horn, door chime, brakes and steam. Layer two or three for the big ones (horn + rumble, thunk + steam).

## 5. His voice

A fast-talking New Yorker, Queens or Brooklyn accent, a little nasal, mid-pitched, impatient but likeable: a cab driver who's seen it all. Dry, close-miked, no room. Each line is under 3 s.

Lines 1–n of each moment must be in this order: each take matches the words in his speech bubble.

| File | Line |
|---|---|
| `taunt-1` | Ay, I'm walkin' here! |
| `taunt-2` | You call that a jungle? I've seen the L train at rush hour. |
| `laugh-1` | Heh. Fuhgeddaboudit. |
| `laugh-2` | Ha! Classic. |
| `cheer-1` | Let's GO! |
| `cheer-2` | Stand clear of the closing doors! |
| `line-1` | I took the wrong train, okay? |
| `line-2` | This place needs a bodega. |
| `line-3` | Nobody here knows how to walk. |
| `kill-1` | Next stop: you. |
| `kill-2` | Mind the gap. |
| `kill-3` | Fuhgeddaboudit. |
| `grumble-1` | I'm runnin' on empty here. (out of mana) |
| `grumble-2` | Need a coffee. (out of mana) |
| `grumble-3` | Hold on, hold on! (on cooldown) |
| `grumble-4` | The train's delayed, okay? (on cooldown) |
| `grumble-5` | Who am I throwin' at, the pigeons? (no target) |
| `grumble-6` | Nobody there, pal. (no target) |
| `ult-1…3` | "STAND CLEAR!", "Express comin' through!", "Next stop: YOU!" |
| `hurt-1…4` | Short grunts: "Agh!", "Hey! Watch it!", "Oof!", "Ow, c'mon!" |
| `death-1…2` | "Aw, c'mon...", "I'm gettin' off here..." |

In `public/audio/index.json`, under `"voices"` → `"scrimby"`, each moment lists its files in that order (`voice/scrimby/taunt-1.mp3`, ...).

Against Big Whale his kill bubble shows a rival line instead ("Ay, Moneybags! Fuhgeddaboudit." and two more, in `src/client/emotes.ts`). Those can be recorded later. Until then the kill voice won't match the bubble in that one case.

## Order of work

1. The concept painting, then the figure parts. This is the biggest visible change.
2. The train sprite and the hot dog. They're easy and very visible.
3. The voice. It's the most personality for the least work.
4. The ability sounds.
5. The effects.

Drop any finished files in `incoming/scrimby/` (anything goes; names don't matter) and Claude installs them, sets sizes and anchors, checks them in a match, and takes screenshots.
