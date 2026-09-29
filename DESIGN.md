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
- **Chuds:** a wave every 30s of 3 melee and 2 ranged, plus a siege Chud every third wave.
- **Structures per lane, per team:** 2 Shooties and 1 Oakner. Da Base is guarded by one more Shootie.
  - Killing an Oakner makes that lane spawn Chud Brutes.
  - Oakners regrow after 4 minutes.
- **Call for help:** if an enemy champion hurts your champion nearby, your Chuds and Shooties switch to that enemy. This rule is what makes trading and tower dives work.
- **Vision:**
  - Every unit sees in a radius. Walls block sight, and brush hides whoever is inside it.
  - The host only sends each team what that team can see.
- **Progression:**
  - Level cap around 13, with ultimates unlocking at level 5.
  - Experience is shared among nearby allies.
  - Gold comes from last hits and a trickle over time.
  - Kill-streak bounties help losing teams catch up.
- **Shop:** about 15 items, 4 inventory slots, and you can only buy at Da Base.
  - No Flash-style summoner spells in v1. Everyone gets Recall and one shared blink on a long cooldown.

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

### Barbarian (M1)
- **Passive, Blood Rage:** at 100 Rage, his next ability gets a stronger "Brutal" version.
- **Q, Cleave:** a cone in front of him that heals him for each champion hit.
- **W, War Cry:** slows nearby enemies and makes them deal 20% less damage.
- **E, Leap:** jumps to a spot and slows enemies where he lands.
- **R, Berserk:** for 6s he grows bigger, gains tenacity, and his basic attacks hit everyone in front of him. Kills and assists extend it.

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
    sim/         World (fixed 30 Hz tick), Unit, projectiles, dummies
    champions/   Champion base class + one hand-coded file per champion
    protocol.ts  every message between client and host
  host/        HostCore: players, command validation, snapshots. Runs in a Web Worker.
  client/      PixiJS rendering, input, HUD, snapshot interpolation. Never runs the game itself.
```

**How the host model works:**
- The hosting player's tab runs `HostCore` in a Web Worker.
  - Rendering hitches can't stall the game.
  - It should keep ticking when the tab is in the background (to verify in M2).
- Friends connect over WebRTC data channels using PeerJS, and the lobby code is the host's peer ID.
  - Data channels can't live inside a worker in most browsers, so the host tab's main thread passes those messages to and from the worker.
  - PeerJS's free public signaling server is fine for a friend group.
  - A few networks (mobile hotspots, some ISPs) need a TURN relay server. Add one only if a friend can't connect.
- The host enforces fog of war: non-host players only receive what their team can see.
  - The host has zero ping and could in principle read the full game state. That's accepted among friends.
- If the host leaves, the game ends.
- **Bandwidth is the M2 problem.** The host uploads snapshots to five players, so snapshots need to shrink: rounded numbers, only what changed, and a lower rate for distant units. Today the full state is sent every tick, which is fine for a host in the same tab.

**The client:**
- It sends commands (`move`, `attack`, `stop`, `cast`) and draws snapshots about 67ms in the past, smoothed between updates.
- Game events such as damage numbers fire when playback reaches them, so they line up with the visuals.

**Hand-coded abilities:**
- Each champion is one file. Tuning numbers sit at the top, and the logic is plain methods: `onCastStart`, `onCast`, `launchAttack`, `computeStats`.
- Lore interactions like "Logan resists KNEEL!" are just `if` statements, which is one of the main advantages of hand-coding.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0 | Project, host-in-worker, map blockout, nav grid + A*, click-to-move, basic attacks, full Marksman kit, training dummies, HUD | ✅ done |
| M1 | Chuds, Shooties, Oakners, Da Base, win condition, unit collision, Barbarian, basic bots | |
| M2 | Hosting over PeerJS, lobby codes, bots fill empty slots, fog of war and brush, snapshot compression | |
| M3 | Jungle camps, the Warden, experience/levels/ability ranks, gold, shop | |
| M4 | Logan Lionheart, King Rix, Willmore, HunnaG (with the lore mechanics), art and sound pass | |
| M5 | Balance tools, playtests | |

### Known gaps after M0
- Units overlap freely, since there's no unit collision yet.
- Every ability is at rank 1 with no leveling, so Longshot is available from the start.
- Traps are visible to everyone until fog of war exists.
- Only practice dummies; there's no enemy AI yet.
