# BLOKES art and audio bible

How painted art and recorded sound get into the game, and what they should look and sound like. Everything in the game is drawn and synthesized in code today. Each piece below can be swapped for a real one **one at a time**; anything without art or a recording keeps its code version. Nothing breaks while assets trickle in.

The first champion done this way is Scrimby (`docs/scrimby-assets.md`). Use him to set the bar before the other twelve.

## The look

- **Bold-ink cartoon.** A thick, dark ink outline round every shape (near-black brown, about 3% of the part's height), flat colors with **one** shadow tone and one small highlight. No soft airbrushing, no photo textures, no outer glows baked into the figure.
- **Light from above**, a little in front: the underside of each limb and the side facing away are the shadow tone.
- **Readable at 60 pixels tall.** In a match a champion's head is about 18 pixels on screen. Big shapes and silhouettes do the work; small details are a bonus for the portraits and champion select. Squint at it: if you can't tell who it is, simplify.
- **Chunky, slightly comic proportions** like the current figures: big head, big hands and boots, short legs.
- **Saturated but not neon.** Team colors (blue and red) are reserved for the rings and health bars, so a champion shouldn't be mostly pure blue or red.
- **Each champion owns a few colors** (Scrimby: navy puffer, mid-blue jeans, wheat boots, a navy cap, the blue diner coffee cup). Their other looks recolor those same pieces.
- **No real logos or trademarks.** Scrimby's cap gets an "NY-ish" monogram of our own, not the Yankees' interlocking NY, and the boots are "wheat work boots", not branded.

## Champions: painted body parts

A champion is a jointed rig (`src/client/render/rig.ts`): torso, head, a hat that swings, upper and lower arms and legs, hands, feet, a held item. The game poses these every frame (walking, swinging, flinching, stunned, knocked up, dying). A painting replaces each part's drawing but keeps its joint, so the animation all still works.

### The templates

In a dev build (`npm run dev`), open the browser console and run:

```js
await bakeArt('scrimby', 0)   // champion id, look (0–3)
```

That writes `art-templates/<id>/<look>/`:

| File | What it is |
|---|---|
| `full.png` | The whole figure standing, facing right: the reference to paint from. |
| `guide.png` | The same with every joint marked by a red cross. |
| `<part>.png` | Each body part as drawn now, cut out exactly where the rig pins it, at 320 pixels per r (a head is about 300 px). |
| `parts.json` | Where each picture sits (its top-left corner, in units of the unit radius r) and the scale (`pxPerR`). |

### Rules for painting the parts

1. **Same canvas, same place.** Paint over each `<part>.png` at the same size, with the drawing where it is now. The joint must not move. Its spot is visible in the template: shoulders, elbows and so on are the round ends.
2. **Transparent background**, PNG, facing right.
3. **Round, overlapping joint ends.** Limbs rotate about their ends, so paint each end as a rounded cap that tucks under the part it joins, like a paper cut-out puppet. Nothing should show a gap when an arm swings 90°.
4. **Far side darker.** `back*` parts (the far arm and leg) are the same as the `front*` ones but about 20% darker, so the two read apart.
5. **Face:** the game draws blinks and winces over the eyes and mouth from the template's positions. Keep the eyes and mouth where they are, or paint the face yourself and put `"face": false` in `parts.json` (then there are no blinks or expressions).
6. You may paint a little past the drawn outline (there's padding round each part), but not off the canvas.
7. Higher resolution is fine: scale every picture by the same factor and multiply `pxPerR` by it.

### Installing a look

1. Copy the folder (parts and `parts.json`; `full.png` and `guide.png` aren't needed) to `public/art/champions/<id>/<look>/`.
2. List it in `public/art/index.json`: `"champions": { "scrimby": [0] }`.
3. `npm run dev` and pick the champion. Every place the champion appears (in a match, champion select, portraits, the podium) uses the painting.

## Effects: flipbooks

Any ability effect (the names in `FxKind`, `src/shared/protocol.ts`) can get a painted animation: a sheet of frames played once where the effect happens, **over** the code effect or **instead of** it.

- **Frames:** all the same size, laid left to right then down. Square frames: 256 px for small effects, 512 for big ones. 8–24 frames at 24 fps (0.3–1 s).
- **Anchor:** ground effects (eruptions, splats) stand on the spot, so the bottom middle of the frame is the default anchor. Bursts in the air can use `[0.5, 0.5]`.
- **Glow effects** (fire, sparks, flashes, magic): paint or generate them **on pure black** and set `"glow": true`. They're added as light, so black adds nothing and you never need to cut them out. AI image tools are good at "explosion on black background".
- **Painted effects** (steam, dust, splats, debris) need a transparent background.

In `public/art/index.json`:

```json
"fx": {
  "steamBurst": { "file": "fx/scrimby/steam-burst.png", "frames": 16, "cols": 4, "fps": 24, "size": 2.4, "anchor": [0.5, 0.95] }
}
```

`size` is the frame's width as a multiple of the effect's radius (add `"absolute": true` to give world units instead). `"replace": true` drops the code effect; without it the painting plays over it. `"layer"` is `"under"` (on the ground, under units), `"mid"` (the default) or `"top"`.

## Sprites: single images

A single picture standing in for a drawn object:

- `projectile:<look>`: a projectile in flight (`hotdog`, `token`, `briefcase`, `arrow`...). Painted side-on, **pointing right**; it's turned to its heading.
- `scrimby:train`: Scrimby's subway car, painted side-on with the **front to the right**. It's mirrored when he heads left.

```json
"sprites": {
  "projectile:hotdog": { "file": "sprites/scrimby/hotdog.png", "width": 40, "anchor": [0.5, 0.5] },
  "scrimby:train": { "file": "sprites/scrimby/train.png", "width": 175, "anchor": [0.5, 0.95] }
}
```

`width` is in world units (a champion is about 64 across).

## Sound

The game's sounds are named in `src/client/audio.ts` (`SoundName`). Which event plays which is in `src/client/sfx.ts`. Any of them can get recordings in `public/audio/index.json`.

```json
{
  "sounds": {
    "atkToken": { "files": ["sfx/scrimby/token-1.mp3", "sfx/scrimby/token-2.mp3", "sfx/scrimby/token-3.mp3"], "gain": 0.9 },
    "cast:scrimby:3": { "files": ["sfx/scrimby/express-cast.mp3"] },
    "fx:steamBurst": { "files": ["sfx/scrimby/steam-1.mp3", "sfx/scrimby/steam-2.mp3"] }
  },
  "voices": {
    "scrimby": { "taunt": ["voice/scrimby/taunt-1.mp3", "voice/scrimby/taunt-2.mp3"] }
  },
  "announcer": { "First blood!": "voice/announcer/first-blood.mp3" }
}
```

- **Keys:** a sound's own name (it then replaces it everywhere), or a narrower key the game looks for first:
  - `cast:<champion>:<slot>`: one ability's cast (slot 0–3 is Q, W, E, R).
  - `fx:<effect>`: one effect's sound.
- **Takes:** list 3–5 for anything heard often (attacks, hits). The game never plays the same take twice running, and wobbles the pitch a little.
- **Format:** MP3 at 128–192 kbps (plays in every browser). Mono for effects (the game pans them by where they happen), 44.1 or 48 kHz.
- **Levels:** peaks at −1 dBFS, the loud part around −16 LUFS short-term, similar sounds matched to each other. `gain` trims a set (1 = as recorded).
- **Tight starts:** trim the silence before a sound to under 5 ms, so it lands on the frame.
- **Lengths:** attacks under 0.4 s, casts under 1.2 s, ultimates under 3 s, voice lines under 3 s.
- **Mix:** the game adds the room (reverb), distance and panning itself, so record or pick sounds **dry and close**.

### Voices

Each champion has moments: `taunt`, `laugh`, `cheer`, `line` (the four emote keys), `kill`, `ult`, `hurt`, `death`, `grumble` (a cast that didn't go). For the first five, **takes are matched to the lines in their speech bubbles**: take 1 is the first line in `src/client/emotes.ts`, take 2 the second, and so on, so the voice says what the bubble shows. `ult`, `hurt`, `death` and `grumble` have no bubble: any number of takes.

The announcer's lines are keyed by their text, exactly as `src/client/announcer.ts` says them.

## Where assets come from (the hybrid route)

| Piece | Best source |
|---|---|
| A champion's look (concept) | An AI image tool, given `full.png` and the brief, or a concept artist. |
| The body parts | A 2D artist painting over the templates. AI tools can't yet cut a figure into parts that pivot cleanly, but an artist with the AI concept can do a champion in a few hours. |
| Effects | AI ("on a black background") for glows and explosions; free CC0 packs (Kenney, OpenGameArt) for dust, smoke and sparks; an artist for the signature moments. |
| Projectiles, the train | AI or an artist. Single images are the easiest pieces. |
| Sound effects | Royalty-free libraries: Kenney (CC0), the Sonniss GDC bundles (royalty-free), Freesound (check each license: CC0, or CC-BY with credit). Layer two or three for a signature sound. |
| Voices | An AI voice tool (check its terms allow use in a game), or a voice actor (Casting Call Club, Fiverr). |

**Credits:** anything that asks for credit (CC-BY and the like) goes in `public/CREDITS.md` with its source and license. Check the terms of any AI tool before shipping its output.
