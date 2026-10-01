# Design

A 3v3 browser MOBA for a friend group, heavily inspired by League of Legends without copying it.

## Locked decisions

| Area | Decision |
|---|---|
| Audience | Friend group. Lobby codes; bots fill empty slots. |
| Networking | **One player hosts.** Their browser runs the authoritative game; everyone else connects to them. |
| Rendering | 2D top-down, PixiJS |
| Controls | Click-to-move + QWER, like League |
| Economy | Small item shop |
| Abilities | Hand-coded per champion (one file each, tuning numbers at the top) |
| Picks | Blind pick; a champion can appear on both teams but only once per team |

## Terms

| League | Ours |
|---|---|
| Nexus | **Da Base** |
| Inhibitor | **Oakners** |
| Towers | **Shooties** |
| Minions | **Chuds** |
| Baron | **The Warden** |

## Match and map

- **Layout:** bases left and right, a top lane and a bot lane, jungle between them, and a river down the middle with the Warden's pit at the center. The map is authored as one quadrant and mirrored, so both sides and both lanes are identical (`src/shared/map/mapData.ts`).
- **Length:** aim for 15–20 minute games.
- **Chuds:** a wave every 30s, from 0:20. Each wave is 3 melee and 2 ranged (Slinger Chuds), plus a siege Chud every third wave. Numbers are in `src/shared/sim/chud.ts` and `waves.ts`.
  - They crawl out beside Da Base one at a time and march their lane's route (`lanes` in `mapData.ts`), pathing around structures.
  - **Targeting:** an enemy champion who hurts one of their champions nearby comes first. Otherwise they go after enemy Chuds, then structures, then champions, nearest first. Within a category they finish the fight they're in, but a Chud hitting a Shootie turns on enemy Chuds that show up.
  - **Shooties vs Chuds:** each shot takes a fixed share of a Chud's max health (melee 45%, ranged 70%, siege 14%). That's 3 shots for a melee Chud and 2 for a ranged one, so last-hitting under a Shootie is about timing your hit between its shots.
  - Damage numbers only appear for damage you deal or take, as in League. A lane full of Chuds would be unreadable otherwise.
  - **They grow:** each Chud spawns with +4% health and damage per minute of match time. Shootie shots still take a fixed share of their health, so late waves hit structures much harder. This is what breaks evenly matched lanes open.
- **Structures per lane, per team:** 2 Shooties and 1 Oakner. Da Base is guarded by one more Shootie. Numbers live in `src/shared/sim/structure.ts`.
  - **They fall in order:** outer Shootie → inner Shootie → Oakner in the same lane. The base Shootie can be hit while either Oakner is down, and Da Base only once the base Shootie is gone. Until then a structure is shielded: grey health bar, and it can't be attacked.
  - While an enemy Oakner is down, every one of your waves in that lane is led by a **Chud Brute**: 1500 HP, tough, and it takes 15 Shootie shots to kill.
  - Oakners regrow after 4 minutes. If both are standing again, the base Shootie is shielded again.
  - Structures block movement while standing. Units path around them, and the rubble of a fallen one can be walked over.
  - Skillshots fly over structures; only basic attacks damage them.
- **Shooties:**
  - They shoot Chuds before champions, nearest first.
  - Once locked on, they stay on that target until it dies or leaves range.
  - Each consecutive shot at the same champion hits 40% harder, up to +120%. Standing under an enemy Shootie gets deadly fast.
- **Winning:** destroy the enemy Da Base. The match freezes on the spot and everyone gets a Victory or Defeat screen with Play again.
- **Death and going home:**
  - Death timers grow with level (see Progression): 5s at level 1 up to 35s at 13, so late deaths let the enemy push.
  - **Recall (B):** channel for 4s to teleport home. Taking damage, a stun, or any other order breaks it.
  - **Fountain:** standing within 500 of your spawn restores 12% of max health and mana per second. Rage isn't refilled; it's earned.
- **Call for help:** if an enemy champion hurts your champion nearby, your Chuds and Shooties switch to that enemy. This rule is what makes trading and tower dives work.
- **Vision (fog of war)** — `src/shared/sim/vision.ts`, sight ranges in `sight.ts`:
  - **What each team can see:** champions see 1100 units, Chuds 800, Shooties 1100, Da Base 900 and Oakners 700. This is worked out on a 100-unit grid, 10 times a second, and walls block line of sight.
  - **Brush:** 5 patches per quadrant: along lane edges, in the jungle, and by the river mouth. You can't see into a patch unless someone on your side is standing in it; from inside, you see out normally. Units in brush are drawn semi-transparent.
  - **Revealing:** attacking or casting reveals you for 1 second, even from brush.
  - **Always and never visible:** structures are always visible to both sides. Enemy traps never are.
  - **The host enforces it:** each team is only sent the enemies it can see, and only the damage, effects and casts it could see. Chuds, Shooties and bots can't target or react to what their team can't see, and an attack on a unit that disappears into fog or brush is dropped.
  - **Drawing it:** each client computes its own team's fog from its own units, with the same code, so fog costs no bandwidth.
- **Progression** (all numbers in `src/shared/sim/progression.ts`, payouts in `rewards.ts`):
  - **Levels:** cap of 13. Level 2 takes 180 experience, and each level after needs 70 more. Every level adds stats (per-champion growth) and heals you by the extra maximum health and mana.
  - **Ability ranks:** you start with one skill point and gain one per level. Basics go to rank 4, learnable at levels 1/3/5/7; the ultimate goes to rank 3 at levels 5/9/13, as in League. Nothing is learned at the start, and an unlearned ability can't be cast. Click the "+" over an ability or press Shift+Q/W/E/R.
  - **Chud experience:** every enemy champion within 1400 of a dying Chud shares it, whoever landed the kill. Two champions each get 65%, so laning together costs less than half.
  - **Gold:** start with 500, plus 2 per second from 1:00.
    - Last hits: melee Chud 21, ranged 14, siege and brute 60.
    - Champion kills: 300, plus 75 per kill of the victim's streak beyond 2 (cap 750). Assisters split 150.
    - Kill credit goes to the last enemy champion who hurt the victim in the last few seconds, even if a Shootie finished them.
    - Structures pay the whole team: outer Shootie 125, inner 150, Oakner 100, base Shootie 150.
  - **Kill experience:** 100 + 30 × the victim's level, split among killer and assisters.
  - **Death timer:** 5s at level 1, plus 2.5s for each level after that (35s at 13).
  - **HUD:** level badge, experience bar, gold, rank pips and a kill feed. Champion health bars show their level.
  - Bots spend points as soon as they have them: ultimate first, then a per-champion order.
- **Jungle camps** (numbers in `src/shared/sim/jungle.ts`; spots in `mapData.ts`): 4 per side, on neutral team 0.
  - **Camps:** each side has one of each:
    - **Gutter Rats:** a Rat King and two rats.
    - **Mossback:** one big, slow, tanky tortoise.
    - **Ember Toad** (buff).
    - **Glowcap** (buff).
  - **Where:** on each side, the top half has the Rats and the Toad, and the bottom half has the Mossback and the Glowcap.
  - **Timing:** they first appear at 1:15. A cleared camp comes back 100s (Rats), 120s (Mossback) or 150s (buffs) later, and monsters toughen 3% per minute of match time.
  - **Fighting:** monsters stand still until a champion hits the camp. Then the whole camp fights back, on whoever hit it most recently.
  - **Leash:** a monster won't follow anyone more than 750 from the camp. Past that the camp walks home, can't be hit on the way, and heals to full.
  - **Rewards:** gold and experience go to whoever gets the kill (or the last champion who hit it).
  - **Ignored by the lanes:** Chuds and Shooties ignore monsters, and monsters ignore them.
  - **Buffs** last 90s and pass to whoever kills the holder:
    - **Ember Toad's Heat:** basic attacks burn for 8 + 2 per level bonus true damage and slow 20% for 1s.
    - **Glowcap's Glow:** +20 ability haste, and 1% of max mana back per second.
  - Bots don't take camps yet.
- **The Warden** (numbers in `src/shared/sim/warden.ts`; lore below):
  - **Timing:** wakes at 8:00 in the pit at the center of the map, and comes back 6 minutes after it falls. The HUD counts down its last 2 minutes.
  - **Stats:** 5000 health, 60 armor, 50 magic resist, and +3% per minute of match time. It never moves.
  - **Who it fights:** leaves passers-by alone, and fights champions in its pit who've hit it in the last 6s. It ignores anyone outside the pit, even if they hit it. Left alone, it heals back to full.
  - **Chain slam:** every 7s it marks a champion's spot with a red circle that fills in over 1.2s, then smashes it. The slam deals 150 + 12 per minute physical damage and stuns for 0.75s; step out in time to dodge it.
  - **Reward:** every champion on the killing team gets 300 gold and 300 experience. The team is then **Unchained** for 90s: its Chuds spawn with +50% health and damage, and are drawn with a pale blue ring.
  - **Uprising:** if Willmore or HunnaG lands the kill, Unchained becomes an Uprising, and every wave also brings a Chud Brute.
  - **HUD and kill feed:** the HUD shows who's Unchained and for how long. The kill feed announces the kill, and names the Warden (or a Shootie) when it kills a champion.
  - **Old Grudge** is coded for Willmore and HunnaG by champion id, so it works once they exist (M4).
- **Shop** (items in `src/shared/items.ts`): 16 items, 4 inventory slots. Press P or click your gold.
  - You can buy and sell only in your own fountain, or while dead. Selling returns 70% of the price.
  - No recipes: each item is bought whole.
    - **Basics** (300–435) stack.
    - **Boots**: one pair at a time.
    - **Core items** (1000–3000): one of each.
  - Items add stats, including two that only come from items:
    - **Ability haste:** 100 haste halves cooldowns.
    - **Lifesteal:** heals a share of basic-attack damage, but not against structures.
  - Health and mana from a new item come already filled. Mana items don't raise the Barbarian's Rage cap.
  - Names lean into the lore: Pride Longbow (Logan wants his mane back), Royal Plate (King Rix had it let out twice), Warden's Link, Glowworm Lantern (HunnaG's design).
  - No Flash-style summoner spells in v1. Everyone gets Recall and one shared blink on a long cooldown.
- **Bots** ("decent new player"; numbers at the top of `src/shared/bots/bot.ts`, each champion's habits in `profiles.ts`):
  - They play through the same commands a human sends, rethinking about 5 times a second.
  - Lineup per team: solo top Barbarian, duo bot lane of Marksman and Barbarian. A human takes a slot and bots fill the rest.
  - **Laning:** stand behind their own wave (melee close in, ranged further back), last-hit first, and step out of position for a last hit. They help the wave, and hit structures when their Chuds are soaking the Shootie and no enemy champion is near.
  - **Safety:** they won't walk under an enemy Shootie unless at least 2 of their Chuds are tanking it, and they leave immediately if it targets them.
  - **Fighting:** they engage enemy champions within 700 when they're at least as healthy, or the enemy is below 35%. They avoid trading into a crowd of enemy Chuds, never dive towers, and give ground when hit by someone they won't fight. Each champion uses its kit in fights: for example the Marksman rolls away from melee champions and fires Longshot at low targets, and the Barbarian leaps in and uses Berserk when things get close.
  - **Going home:** below 25% health (35% with an enemy near), they recall if it's safe, or run home using escape abilities. They come back at 90%.
  - **Shopping:** each champion has a fixed build (in `profiles.ts`). They buy the next item whenever they're in the shop and can afford it, selling basics to make room. With 900+ gold that buys the next item and no enemy around, they go home to spend it.
  - **What they don't do:** dodge skillshots, plan ganks, or coordinate as a team.
  - A bots-only match currently ends in roughly 27 minutes. Bots farm only modestly (about 4–5k gold by 20 minutes), so they finish two or three core items. Human pressure ends games sooner.

## Lore

### The Deep and the Warden

Under the map is the Deep, where the Chuds live. Both Da Bases were built over Chud burrows, and every 30 seconds a fresh wave crawls out to fight for whoever feeds them.

At the center of the map, sitting on the old seal over the Deep, stands **the Warden**. It's an ancient iron jailer whose only job is to keep what's down there down there. It hates every Chud that crawls out, and two of them most of all:
- **Willmore**, who has been picking fights with it since he could walk.
- **HunnaG**, who has spent years eating away at the seal with rot magic.

Mechanics that come from this:
- **Old Grudge:** the Warden deals 25% more damage to Willmore and HunnaG, and attacks them first when they're in the pit.
- **Unchained:** killing the Warden makes the team's Chud waves stronger for 90s.
- **Uprising:** if Willmore or HunnaG lands the killing blow, Unchained becomes Uprising, and every wave also brings a Chud Brute.
- **Kin of the Deep:** Willmore can use HunnaG's Mole Holes while Burrowed.

### Two Kings: Logan Lionheart and King Rix

King Rix's banner has always shown a golden lion, and for years there was a real one in the palace. Logan was raised in the royal menagerie and paraded at feasts as "the Lionheart of Rix."

Then the Chuds came up through the palace cellars. The king hid in the treasury while Logan held the gate alone. By morning the city was chanting Logan's name louder than the king's.

Rix answered with a decree: *there is only one Lionheart, and he wears the crown.* Logan's title was taken away and his cage was locked. A week later the cage was empty.

Now Logan fights to prove that a crown doesn't make a king. Rix wants his lion back in the cage and his title back on his banner.

Mechanics that come from this:
- **A Lion Kneels to No One:** King Rix's *KNEEL!* only stuns Logan for half as long, and Logan roars back.
- **The Royal Menagerie:** Rix's summoned guards are terrified of Logan. *Pride's Roar* fears them for twice as long.
- **Uneasy Alliance** (same team): Logan's *Lionheart* passive triggers for allies at 30% health, but for King Rix only at 15%.
- **Two Crowns** (opposite teams): a kill on the rival pays double bounty and leaves a cosmetic trophy. Logan takes the crown; Rix hangs a lion banner over his Da Base.

## Champions

| Champion | Role | Range | Damage | Resource |
|---|---|---|---|---|
| Marksman | Ranged carry | Ranged | Physical | Mana |
| Barbarian | Juggernaut | Melee | Physical | Rage |
| Willmore | Jungle ambusher | Melee | Physical | None |
| HunnaG | Control mage | Ranged | Magic | Mana |
| Logan Lionheart | Starts fights, protects allies | Melee | Physical | None |
| King Rix | Commander | Mid-range | Magic | Mana |

King Rix deals magic damage on purpose. Without him, HunnaG would be the only source of magic damage and magic-resist items would be pointless.

### Marksman ✅ implemented

The numbers live at the top of `src/shared/champions/marksman.ts`.
- **Passive, Steady Rhythm:** each basic attack on the same target grants +8% attack speed (max 5 stacks, 3s). Switching targets starts the rhythm over.
- **Q, Piercing Bolt:** a line skillshot that passes through every enemy it hits. Each enemy after the first takes 15% less damage, down to 55%.
- **W, Snare Trap:** places a trap that arms after 0.75s and roots the first enemy champion to step on it for 1.25s. Up to 2 traps at once.
- **E, Roll:** a short dash. The next basic attack within 3s is ready instantly and deals bonus damage.
- **R, Longshot:** a 1s telegraphed aim, then a map-wide shot at the first champion hit. It deals up to 50% more damage the more health the target is missing.

### Barbarian ✅ implemented

The numbers live at the top of `src/shared/champions/barbarian.ts`. Resource: Rage, which starts empty.
- **Passive, Blood Rage:** hitting (+8 per basic attack, +5 per enemy an ability hits) and getting hit (+2) builds Rage. It burns off after 6s out of combat. At 100 Rage his next ability is **Brutal**: stronger, and it spends all his Rage. Brutal is decided the moment you press the key.
- **Q, Cleave:** a 110° swing in front of him. Heals 10 per enemy hit and 30 per champion. Brutal: longer reach, +50% damage, double healing.
- **W, War Cry:** nearby enemies are slowed 30% for 2s and deal 20% less damage for 4s. Brutal: a 60% slow and 35% less damage.
- **E, Leap:** jumps to a spot, even over walls, and slows enemies where he lands. Brutal: a wider landing that stuns instead.
- **R, Berserk:** for 6s he grows bigger, gains +30% attack speed and 40% tenacity, and his basic attacks splash half damage around the target. Gives 50 Rage. Takedowns (kills and assists) add 2s, up to 12s. Brutal: 9s.

### Willmore (M4)
- **Passive, Scavenger:** minions and monsters he kills drop scrap. Picking it up heals him and grants stacking armor.
- **Q, Junk Toss:** cycles through Can (damage), then Sludge (slow), then Boot (short stun). Everyone can see which item is next.
- **W, Burrow:** he goes underground, invisible and fast, but can't attack. Surfacing knocks nearby enemies into the air.
- **E, Sewer Hook:** pulls an enemy to him, or pulls him to a wall.
- **R, Down Below:** drags an enemy champion underground for 1.5s, then resurfaces up to 600 units away in a direction he chooses.

### HunnaG (M4)
- **Passive, Rot:** her spells stack Rot, which deals damage over time. The 4th stack bursts for extra damage and a slow.
- **Q, Sludge Lob:** a lobbed shot that leaves a slowing puddle.
- **W, Mushroom Totem:** grants vision and pulses, healing allies and adding Rot to enemies. Enemies can destroy it.
- **E, Mole Hole:** two linked holes that allies can hop through for 5s.
- **R, The Deep Calls:** a large area. After 0.75s, hands burst out and root every enemy inside, applying maximum Rot.

### Logan Lionheart (M4)
- **Passive, Lionheart:** when a nearby ally drops to low health, he gets a burst of speed toward them and a shield (see Uneasy Alliance above).
- **Q, Pounce:** leaps to an enemy. His first basic attack after landing briefly stuns.
- **W, Thick Mane:** a shield that grows with his bonus health. While it's up, his basic attacks slow.
- **E, Maul:** a cone swipe that makes enemies bleed. Bleeding enemies are revealed, which counters Willmore's Burrow.
- **R, Pride's Roar:** enemies in front of him are feared for 1.25s. Nearby allies gain a shield and speed.

### King Rix (M4)
- **Passive, Royal Tax:** allied Chuds near him hit harder, and he gets bonus gold when allies nearby last-hit.
- **Q, Levy:** a scepter bolt. If it kills a unit, he gets bonus gold and mana back.
- **W, Call the Guard:** summons 2 royal guards for 8s that attack his target.
- **E, KNEEL!:** enemies in a short cone kneel, which stuns them for 1s.
- **R, Royal Decree:** works anywhere on the map. Marks a visible enemy champion: they're revealed and take 15% more damage for 6s. If they die, his whole team gets bonus gold.

## Architecture

```
src/
  shared/      pure TypeScript: no browser or Node APIs. This IS the game.
    map/         map layout, nav grid, A* pathfinding
    sim/         World (fixed 30 Hz tick), units, Chuds, structures, projectiles, collision
    champions/   Champion base class + one hand-coded file per champion
    bots/        bot brain, lane helpers, per-champion habits, lineups
    protocol.ts  every message between client and host
  host/        HostCore: lobby, players, bots, snapshots. Runs in a Web Worker.
  client/      PixiJS rendering, input, HUD, snapshot interpolation. Never runs the game itself.
    net/         host worker relay, PeerJS host and join links
    ui/          main menu, lobby
```

**How the host model works:**
- The hosting player's tab runs `HostCore` in a Web Worker.
  - Rendering hitches can't stall the game.
  - It should keep ticking when the tab is in the background (still to verify).
- **Lobby:**
  - Hosting claims a 5-letter code on PeerJS's free public signaling server; the peer ID is `chudmoba-<code>`. The code alphabet has no 0/O or 1/I/L, since codes get read out loud.
  - Friends join with the code. They're seated on alternating teams, can switch while there's room, and pick champions. The host (★) picks "bots fill empty slots" or "no bots", then starts once everyone has picked.
  - Solo play uses the same flow with a lobby of one.
- **Connections:**
  - Friends connect over WebRTC data channels, or through PeerJS's relay servers when a network blocks direct connections.
  - Data channels can't live inside a worker in most browsers, so the host tab's main thread relays those messages to and from it (`src/client/net/`).
  - Remote connections get `peer:`-prefixed IDs, so nobody can pose as the host's own `local` connection.
- **Leaving:**
  - Both ends ping every second and treat 6 seconds of silence as a disconnect, because WebRTC doesn't reliably report a closed tab. Closing a tab normally also says goodbye immediately; in testing, a closed tab was noticed within about 3 seconds.
  - If a friend leaves mid-match, a bot takes over their champion ("Name (bot)").
  - If the host leaves, everyone else gets a "Disconnected" screen with a way back to the menu.
- The host enforces fog of war: non-host players only receive what their team can see.
  - The host has zero ping and could in principle read the full game state. That's accepted among friends.
- Everything a client sends is validated: message shapes, names (trimmed, 16 characters max), team numbers, and champion IDs (own keys only, so `__proto__` isn't a champion).
- **Bandwidth** (`src/shared/snapshotCodec.ts`):
  - Each player gets deltas: new entities in full, only the changed fields of known ones (`null` when a field goes away), and the IDs that left.
  - Friends get 15 updates a second, with events batched between them; the host's own client gets 30.
  - Measured over a bots match: a friend downloads about 8 KB/s, versus 143 KB/s for full state 30 times a second. Five friends cost the host roughly 42 KB/s of upload.
  - The channel is reliable and ordered, so no acknowledgements are needed.

**The client:**
- It sends commands (`move`, `attack`, `stop`, `cast`, `recall`) and draws the game slightly in the past (67ms for the host, 150ms for friends), smoothed between updates.
- Game events such as damage numbers fire when playback reaches them, so they line up with the visuals.

**Hand-coded abilities:**
- Each champion is one file. Tuning numbers sit at the top, and the logic is plain methods: `onCastStart`, `onCast`, `launchAttack`, `computeStats`.
- Lore interactions like "Logan resists KNEEL!" are just `if` statements, which is one of the main advantages of hand-coding.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Project, host-in-worker, map blockout, nav grid + A*, click-to-move, basic attacks, full Marksman kit, training dummies, HUD | ✅ done |
| M1 | Chuds, Shooties, Oakners, Da Base, win condition, unit collision, Barbarian, basic bots | ✅ done (plus Recall, fountain, champion select, growing death timers and Chuds) |
| M2 | Hosting over PeerJS, lobby codes, bots fill empty slots, fog of war and brush, snapshot compression, GitHub Pages | ✅ done — live at https://jarretfox.github.io/moba/ |
| M3 | Jungle camps, the Warden, experience/levels/ability ranks, gold, shop | |
| M4 | Logan Lionheart, King Rix, Willmore, HunnaG (with the lore mechanics), art and sound pass | |
| M5 | Balance tools, playtests | |

### Known gaps after M1
- **Structure health is still tuned down** for level-1 champions (outer Shootie 1800). M3 will raise it again now that champions level and buy items.
- **Only two champions,** so teams repeat them (the one-per-team rule waits for a bigger roster).
- **Bots don't jungle or fight the Warden.** All three per side lane; the camps and the Warden are there for humans.
- Bots don't dodge skillshots or coordinate as a team.
