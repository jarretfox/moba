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
  - **Health:**
    - Outer Shootie 2500, inner and base Shootie 3000, all with 40 armor.
    - Oakner 2200 and Da Base 4000, with 20 armor.
    - A late-game champion takes an outer Shootie in about 20s alone; a grouped team takes it in about 7s.
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
    - Its edge is a ringed stone curb in your team's color, so you can see where it ends.
    - A guardian crystal at the back of the platform (`sim/fountain.ts`, drawn in `render/fountain.ts`) stops spawn camping. Every half second it zaps any enemy champion on the platform for 18% of their max health + 80 true damage. It also zaps anyone who hits a champion on the platform from outside it, for 3 seconds, within 1000 of the spawn. Its kills count as Da Base's.
    - Bots keep off the enemy platform.
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
  - **A foe who goes untargetable for a moment** (a dodge, a blink) while still in the leash isn't a reason to reset: the camp waits up to 3s for them. Before, it healed to full on the spot.
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
  - **Old Grudge** applies to Willmore and HunnaG by champion id.
- **Shop** (items in `src/shared/items.ts`): 39 items in a League-style tree, and 6 inventory slots. Press P, click your gold, or click Old Wick (either button; if you're away from the fountain you walk over to him).
  - You can buy and sell only in your own fountain, or while dead. Selling returns 70% of the price.
  - **The tree** (`RECIPES`). Owning the parts knocks their price off, and they're used up when you buy (freeing their slots). Parts can have parts: a Bloodreaver is a Vampiric Fang (a Shiv) and a Chud Mallet (two Shivs).
    - **Basics** (250–435, stack): Rusty Shiv (AD), Quickstring (attack speed), Hearty Loaf (health), Chud Leather (armor), Oakbark Cloak (MR), Sagestone (AP), Deep Crystal (mana), Spore Tonic (mana regen).
    - **Boots** (one pair): Tunnel Treads, upgraded into Swiftstriders (+ attack speed), Ironshod Boots (+ armor; basic attacks hit you 12% softer), Sewer Waders (+ MR; stuns, roots, slows and fears 30% shorter) or Quickthought Clogs (+ haste).
    - **Epics** (750–1100, built from basics, stack): Vampiric Fang, War Drum (active), Chud Mallet, Rat-Bone Kris, Ironbark Vest (thorns: 8 magic damage back to a champion's basic attack), Mossy Mantle, Hexed Tome, Glowworm Charm, Giant's Ham, Whetstone (Spellblade).
    - **Legendaries** (2500–3400, built from epics, one of each), most with a unique passive (`PASSIVES`, numbers beside them):
      - Attack: Pride Longbow (every third attack on a champion adds magic damage), Bloodreaver (lifesteal past full health becomes a shield), Warden's Link (attacks on champions sunder 5% armor, up to 25%), Trident of the Deep (Spellblade at 200% base AD), Rotten Fork (attacks wound: 40% less healing for 3s), Stormstring (every fifth attack chains lightning to four enemies).
      - Magic: Glowworm Lantern (active), Rotroot Staff (ability damage burns 1% max health a second for 3s), Witchfire Taper (Spellblade with AP), Great Glowcap Hat (+30% AP), Royal Hourglass (active: Royal Pause, 2.5s of stasis, untouchable and stuck).
      - Defense: Royal Plate (thorns that also wound), Deepstone Aegis (active), Oath of the Old Guard (allies within 700 take 8% less damage), Mossheart (heals and shields on you 25% stronger), Ogre's Hamhock (+800 health; out of combat 6s, regenerate 3% a second).
    - **Spellblade:** after a cast, the next basic attack within 10s hits harder (every 1.5s); with more than one, the strongest fires.
    - Item extra damage (thorns, Static, Pride, burns) never sets off another item effect.
  - **The shop window:** sections for Basics, Boots, Epic and Legendary; filters for Attack, Magic and Defense; each card shows its stats as chips, its passive and active, what it's built from or into, and your price beside the full one.
  - **Undo** takes back the last purchase (every coin and part) or sale, while you're still at the shop.
  - **Wick suggests:** along the top of the shop, your champion's build (the bots' build for them, through the new tree) is ticked off as you go. It offers the next thing to buy, or the dearest part of it you can afford.
  - **Item actives** (`ACTIVES`), on **D** and **F** (the first two in your inventory) or by clicking the slot. The slot shades over as it cools down.
    - **Glowworm Lantern, Light the Way** (60s): throws light up to 1400 away. Your team sees everything within 550 of it, brush and over walls, for 6s. It works as a "ward" only your team knows about (`sim/ward.ts`).
    - **Deepstone Aegis, Deepstone Ward** (75s): a shield of 120 plus 10% of max health for 3s, on you and allies within 600.
    - **War Drum, War Beat** (45s): you and allies within 700 run 30% faster for 3s.
    - **Royal Hourglass, Royal Pause** (90s): 2.5s of stasis, gold as a statue.
  - Items add stats, including some that only come from items:
    - **Ability haste:** 100 haste halves cooldowns.
    - **Lifesteal:** heals a share of basic-attack damage, but not against structures.
    - **Mana regen** (per second).
  - Health and mana from a new item come already filled. Mana items don't raise the Barbarian's Rage cap.
  - **Economy:** passive gold is 2.5 a second from 1:00 (was 2), so a good match reaches two or three legendaries.
  - **Bots after the item tree** (192 matches): bots finish boots and two legendaries in a 20-minute match; the Warden's Link, Rotroot Staff and Stormstring are the most built. Win rates 37–63% (Jordini 63%, The Oak 62%; King Rix 37%) after Jordini's range went to 525, King Rix's guards and Dongmaster's Sigma Stare got stronger.
  - Names lean into the lore: Pride Longbow (Logan wants his mane back), Royal Plate (King Rix had it let out twice), Warden's Link, Glowworm Lantern (HunnaG's design).
  - No Flash-style summoner spells in v1. Everyone gets Recall and one shared blink on a long cooldown.
- **Bounties:** killing a champion pays 300 gold, plus 75 for each kill past two in their streak (up to 750). From three kills without dying they're **WANTED**: a poster over their head shows the gold. Ending the spree is announced as BOUNTY CLAIMED, with the amount.
- **The Sewer Crab** (`sim/crab.ts`): a river objective.
  - From 2:30 a crab scuttles up and down each half of the river. It never fights back, and scurries off when hit.
  - Whoever takes it gets 70 gold, 90 experience and 30% speed for 5s.
  - Their team also gets vision of that stretch of the river (radius 900) for 90s, from a crab-shell lookout only they can see.
  - Another comes 2:30 later.
- **Map events** (`src/shared/sim/events.ts`; buffs in `eventBuffs.ts`; sites in `mapData.ts` as `eventSites`; drawn by `client/render/events.ts` and `eventFigures.ts`): twice a match something turns up for both teams to fight over.
  - **When:** two a match, rolled once at the start (so no two matches play the same): one between 4:00 and 6:00, before the Warden wakes, and one between 10:00 and 14:00. Each is announced 30s ahead with a banner, a horn, a beacon at its site (a pole with a pennant and a light) and a marker on the minimap; while it runs, a readout under the clock shows its name, the time left and how it's going; the result is announced when it ends.
  - **Which:** two different kinds from the pool of three, when the map has sites for them. Each kind has a top and a bottom site, all the same distance from both Da Bases; which is used is rolled per event. A map without `eventSites` has no events.
  - **Three Chuds in a Coat** (the boss; The Oak was right): a very tall "bloke" in a long coat and a top hat ambles up and down the river by the lane mouth. 3400 health (+4% per minute), 35 armor and magic resist. Like the Warden it only fights champions near its site who've hit it lately, and heals back up when left alone; it wanders off after 2:30 if nobody finishes it.
    - **Topple:** every 8s it marks a strip 520 long and 200 wide from itself toward whoever it's after, for 1.1s, then falls flat along it: 120 + 12 per minute physical damage and 0.7s in the air to anyone still in it. It then lies face down for 2.2s, stunned and taking 25% more damage. Step out of the strip, then pile in.
    - **Adds:** under 66% and 33% health a Chud tumbles out ("Two Chuds in a Coat", then "One Chud in a Coat", and the coat gets shorter): a **Loose Chud** (550 health, 28 damage) that picks on the nearest champion by the site for 35s. Killing one pays 25 gold.
    - **Enrage:** after 75s it loses its patience: 50% faster attacks, 30% more damage, a Topple every 5s.
    - **Reward:** the killing team gets 150 gold and 150 experience each and **Deep Pockets** for 90s: 2 gold a second for everyone on the team. The kill goes in the feed.
  - **Old Wick's Cart** (the escort): a handcart under Wick's purple lantern sets off from the middle of a path through the jungle, at the height of the camps. Champions standing within 320 of it push it toward their own end (110 a second); with both teams there it goes nowhere, and the side with more champions by it wins the push. Flags mark each end.
    - **Reward:** the team whose end it reaches gets 110 gold and 120 experience each and **Wick's Favor** for 90s: +10% move speed, +15 armor and +15 magic resist. If it hasn't arrived after 2:30 it breaks down, and the side it's on gets 50 gold each (dead center, nobody).
  - **The Royal Tax Stall** (the capture point): King Rix's collector sets up a booth in the river by the lane mouth, with a circle of radius 320 round it. A team alone in the circle fills its bar over 20s (however many of them stand there) and drains the other team's at half that rate; with both teams in it, nothing moves. Every second a team holds it, each of its champions standing there pockets 3 gold on the spot.
    - **Reward:** the first full bar takes the treasury: 100 gold and 120 experience each and **Royal Favor** for 90s: +15 attack damage, +25 ability power and +10% attack speed. After 2:30 the collector packs up: a team past halfway takes it, otherwise nobody.
  - **Counterplay:** every event is a reason to fight in the middle at a time both teams know. The Coat punishes standing in its strip and rewards hitting it while it's down; its adds mean the team that brought two is better off than one; and a team can contest without ever touching it, by killing the champions who are. The cart stalls under equal numbers, so a 2v1 wins it and a retreat loses it. The stall is lost by leaving it: a single champion stepping in freezes the bar. All three pay the whole team, dead or alive, and the buff comes back after a respawn; killing a champion doesn't steal it.
  - **Bots** go when an event is on within 2600 of them, they're above half health and they're one of the two of their team nearest to it (so a team never empties both lanes): they hit the Coat (swatting a Loose Chud that's on them first), stand by the cart on their own side of it, or stand in the stall's circle. Fights with contesting champions, running home when hurt and Shootie safety come first, as usual.
  - **Dev:** `hostWorker.worker.postMessage({ conn: 'local', devEvent: 'boss' | 'escort' | 'capture' })` starts one 4s from now (dev builds; `hp: 0.1` with `boss` brings it in nearly done for).
- **Bots** ("decent new player"; numbers at the top of `src/shared/bots/bot.ts`, each champion's habits in `profiles.ts`):
  - They play through the same commands a human sends, rethinking about 5 times a second.
  - **Lineup per team:** a solo top lane and a duo bot lane. Each slot has champions that suit it: top Barbarian, Willmore or Logan; carry Marksman, King Rix or HunnaG; partner HunnaG, Logan, King Rix or Willmore. Bots pick at random among those their team doesn't have yet, after the humans' picks. Champions are one per team for humans too: a teammate's pick is greyed out in the lobby.
  - **Laning:** stand behind their own wave (melee close in, ranged further back), last-hit first, and step out of position for a last hit. They help the wave, and hit structures when their Chuds are soaking the Shootie and no enemy champion is near.
  - **Safety:** they won't walk under an enemy Shootie unless at least 2 of their Chuds are tanking it, and they leave immediately if it targets them.
  - **Fighting:** they engage enemy champions within 700 when they're at least as healthy, or the enemy is below 35%. They avoid trading into a crowd of enemy Chuds, never dive towers, and give ground when hit by someone they won't fight. Each champion uses its kit in fights: for example the Marksman rolls away from melee champions and fires Longshot at low targets, and the Barbarian leaps in and uses Berserk when things get close.
  - **Going home:** below 25% health (35% with an enemy near), they recall if it's safe, or run home using escape abilities. They come back at 90%.
  - **Shopping:** each champion has a fixed build (in `profiles.ts`). They buy the next item whenever they're in the shop and can afford it, building up from parts they own and selling leftover basics to make room. With 900+ gold that buys the next item and no enemy around, they go home to spend it.
  - **Items and the crab:** they use the Aegis when a fight turns against them, and the Drum to chase or run. They take a Sewer Crab when one's close and nobody's there to contest it.
  - **Grouping up:** from 18:00 a team's bots leave their own lanes and push one lane together: the one where the enemy has the least left standing. They switch lanes only once the other one is better by a whole structure.
  - **Fair ticks:** every bot decides from the same world state before any of their orders go in, and which team's orders go first alternates each tick. Before this, the team whose bots acted first lost every bots-only match, because casts land the moment they're applied and the other team's bots reacted within the same tick.
  - **Jungling:** the third bot of an all-bot team jungles. It clears its side's camps with basic abilities (the ultimate's saved), takes crabs from further off, and helps the bot lane while the camps are down. With people on the team, nobody's made to jungle.
    - It starts a camp only above 60% health, sticks to the monster it's on, and finishes a camp that's down to half unless it's below 15%.
    - A camp, crab or Warden nobody on its team can see, it walks to first: an attack order needs sight, and it used to stand idle at the fountain.
  - **The Warden:** a team calls it when it has more champions up, they're level 9 or more on average, and healthy.
  - **Dodging:** about half of enemy skillshots, seen coming, get a step to the side.
  - **Defending:** bots within 3200 come back to a structure with enemy champions at it (not on the Hollow).
  - **What they don't do:** plan ganks, ward, or play around cooldowns.
  - **Match length:** with random six-champion lineups, a bots-only match ends in 11–31 minutes (median about 16). Wins split 17–13 between the sides over 30 games. Bots farm only modestly (about 4–5k gold by 20 minutes), so they finish two or three core items.
  - **Bot win rates by champion** over those 30 games: HunnaG 68%, Barbarian 62%, Marksman 61%, Willmore 45%, Logan 41%, King Rix 33%. That's noisy (about ±10%) and mixes kit strength with how well each bot plays its kit, so it's a starting point for M5 balance, not a verdict.

## Playtest round 2 (2026-10-02)

- **Champion select** groups champions by role (`shared/champions/roles.ts`): Tank (Logan, Dongmaster), Fighter (The Oak, Willmore, Havarti), Assassin (Daltonomo, Master Paris), Mage (HunnaG), Marksman (Jordini, Dark Dabber) and Support (King Rix). The showcase names each champion's roles. The showcase only changes once the pointer rests on a card for a moment, so you can reach a bottom-row champion's looks.
- **Readability:**
  - Damage numbers start above a unit's name and title, and numbers and comic words landing together stack instead of covering each other. Hit words sit beside the target.
  - Shop items show their stats as big colored chips ("+25 AD").
  - The clock shows the champion kill score, your team v theirs.
  - Jungle buffs are unmissable: Ember Toad's flames round the feet, Glowcap's halo over the head, and badges beside the health bar.
  - When you're hidden, the screen's edges darken. Unseen (invisible, in the haze, burrowed) is deep with a violet shimmer and a label; tall grass is light.
- **The world:**
  - Buildings look worse as they lose health: cracks, then a broken parapet, soot and smoke, then a breach with fire inside (`drawWear` in `render/structures.ts`).
  - Recalling builds to its last second: a tightening ring of runes, a climbing column of light, motes, light on the ground, and a flare.
  - Tall grass is chest-high.
- **Settings:** camera pan speed (40–250%) for playing unlocked, full screen, and the announcer voice.
- **The Warden hangs off the screen** (`render/wardenDangle.ts`). While he's awake, a little Warden dangles on his chain from an iron clamp on the top edge of the screen. He swings, kicks his boots, taunts you in a speech bubble, and laughs if you click him. Twenty seconds before he wakes he peeks in from above; when he's slain, the chain snaps and he drops out of sight.
- **Hold Tab for the jungle legend** (`ui/jungleLegend.ts`, portraits in `render/bestiary.ts`), beside the scoreboard: every camp, the Sewer Crab and the Warden. Each has what it pays, its buff, how it comes back, and live status (spawning, each side's camp back in m:ss once your team saw it cleared, the crab arriving, the Warden waking).
- **Jungle paths:** a cell is walkable if it has 30 units of open ground around its center (it used to close every cell next to a closed one, which shut gaps that looked open). Rocks are drawn past their blocked shape, so no grass shows where you can't walk.
- **Paths are fair to both sides** (`map/symmetry.test.ts`): walking to a blocked spot (a tower, the Warden) goes to the nearest open spot, and a tie goes to the side you're coming from. It used to take the first of a tie reading left to right, and a tower on a cell border sat in a different cell from its mirror image, so blue's bots and red's ended up on different sides of their own towers when they came back to defend. Blue had been winning about 57% of bot matches since bots started defending and calling the Warden.
- **Balance** (bot simulations with `npm run sim`, which now plays the same match as the host through `freshMatch` in `shared/sim/match.ts`, its dice seeded):
  - Two things skewed the old numbers: only The Oak's and HunnaG's bots used abilities on Chud waves, and HunnaG and King Rix were in nearly every bot lineup. Now every bot clears waves with its kit, and lineups are spread so each champion turns up about as often.
  - Tuning, over five rounds of 160–224 matches:
    - Jordini: By the Book +6% a stack (was 8%); Objection! loses 25% per enemy it passes through (was 15%) and hits a little softer; base AD 59.
    - The Oak: Cleave heals 6 per Chud and 25–48 per champion and hits softer; 680 health; slower armor and AD growth; base AD 64.
    - HunnaG: the totem (above), a softer Sludge Lob on a longer cooldown (8–6.5s), smaller Rot ticks and burst.
    - King Rix: 660 health, 28 armor, 60 AD, 0.66 attack speed, 450 range; Royal Tax +30% Chud damage; stronger Levy (also on a shorter cooldown), KNEEL! and guards.
    - Logan: 66 AD; Pounce +40–115 (+50% AD); Maul 60–165 (+80% AD) on a 7–5.5s cooldown.
    - Dongmaster: 66 AD; Chin Check 70–175.
    - Havarti: +25 health, +2 armor, 61 AD, stronger Holy Wheel and Rind Blade, a shorter Fondue Blessing cooldown, and her tiers come earlier (4, 8, 11).
  - Result (224 matches): every champion wins 41–65% (it was 27–74%), sides 116–108, median match 20 minutes. Jordini (65%), The Oak and HunnaG (61%) are still the strongest bots; King Rix and Havarti (41%) the weakest. Bots aren't people: check these in real games.
  - **With bot junglers and Scrimby and Big Whale** (224 matches, after the side fix): sides 122–102 (it was 129–95), median 20.7 minutes.
    - The bot lane is a solo lane now while the jungler's in the jungle, and Dark Dabber ran away with it (75%): Light It Up loses 3 damage a stack and his base AD is 56.
    - Big Whale (28%) is a support with nobody to support there: 640 health, 30 armor, 55 AD, a stronger and quicker Make It Rain (80–185 every 7–5.5s), more on Yacht Party's shield (80–170) and Hostile Takeover (60–150), and his bot invites whoever's getting hurt. He was at 31% before the last of those.
    - King Rix: 680 health. He's at 40%.
    - Jordini (66%) and Dark Dabber (63%) are the strongest bots now; Big Whale, King Rix and Willmore the weakest.
  - **ARAM** (120 bots-only 5v5 matches): sides 55–65, median 22 minutes. Master Paris 43% with his bigger adjustment (36% without it), Daltonomo 44%; Big Whale 57%, in his element.

## ARAM: the Howling Hollow

A second map and mode: All Random, All Mid, on a haunted graveyard at night (`shared/map/aramMap.ts`).

- **The map:** one long lane, Da Base at each end, with grassy alcoves and brush off its sides and a wide graveyard plaza in the middle. Each side has five structures in a row: an outer and an inner Shootie, an Oakner, a base Shootie and Da Base. It has no jungle, crabs, Warden or map events.
- **Pumpkins** (`shared/sim/relics.ts`) grow at eight spots from 1:00. The first champion to touch one gets 15% health and 15% mana. It grows back 40 seconds later.
- **The rules:**
  - Everyone starts at level 3 with at least 1400 gold.
  - Gold ×1.35, experience ×1.3 and respawn timers ×0.7.
  - No recalling: walk home, or eat pumpkins.
  - Structures have half health.
- **Lobby:**
  - The host picks the map, the team size (3v3, 4v4 or 5v5) and whether champions are All Random or picked. Bots fill the empty slots.
  - In All Random, everyone is rolled a champion nobody on their team has, with two rerolls. The cards are only for looking, but you still pick your champion's look.
  - The main menu has a Howling Hollow button that goes straight to a 5v5 All Random lobby against bots.
  - The Rift stays 3v3.
- **The look** (`render/hollow.ts`): the same inked style as the Rift, graded toward a cold purple night.
  - Crooked gravestones line the lane, and carved jack-o'-lanterns light it orange. Old grave slabs, fallen leaves and candle clusters lie underfoot.
  - The plaza has an iron fence and a cobbled round with a pale moon set into it, ringed by candles and ghost lights.
  - Dead trees stand in the alcoves, and a pumpkin-headed scarecrow in a witch's hat keeps watch on each side.
  - It's always night. Random weather is mist, or sometimes a thunderstorm that doesn't clear.
  - Pumpkins are grinning jack-o'-lanterns that pop out of the ground and burst when eaten.
  - **It howls:**
    - The music turns haunted: E harmonic minor (Em, C, Am, B7; Em, C, D#dim, B in a fight), a music box for the plucks and harp, and a wavering theremin where the flute plays.
    - Wolves howl far off (sometimes answered), crows caw, and the wind moans through the graves.
  - **Night life:**
    - Crows sit on the gravestones and scatter when someone comes by.
    - A stream of bats pours across the sky now and then.
    - Little ghosts drift round the plaza.
  - **Pumpkin Glutton:** an end-screen award for eating the most pumpkins (3 or more).
- **ARAM-only champion adjustments** (`shared/sim/aramTuning.ts`), League-style:
  - Master Paris deals 15% more damage and takes 15% less.
  - Daltonomo deals 6% more and takes 6% less.
  - Assassins have nobody alone to pick off on one lane. The Rift is untouched.
- **Bots:**
  - All bots go mid.
  - On the Hollow they don't run back to defend; everyone's in the one lane already.
  - They fight when their side has more champions close by, or as many and are about as healthy.
  - They retreat at 15% health, to a pumpkin if one is near, or else home.
  - They don't go home to shop.
- **Balance** (120 bots-only 5v5 matches): every match finished, with a median of 17 minutes (10–27). Sides split 63–57. Champions won 34–60%. HunnaG (60%) and the marksmen thrive in the teamfights. Master Paris (34%) and Daltonomo (42%), assassins with nobody alone to pick off, are weakest. The Rift's tuning is unchanged.

## How the game answers your input (2026-10-02)

- **Your own champion moves the moment you click, over the network** (`client/prediction.ts`).
  - A friend's click used to reach the host, come back, and then play 0.15s behind. That's a quarter of a second or more of walking in place.
  - Now a walk sets off on your screen at once, along the same path the host will take, and settles onto the host's position once it has caught up.
  - If the two disagree by more than lag can explain (a stun, a knock-back, a crowd in the way), the host's position wins.
  - Attacks, casts, stops and recalls hand straight back to the host. The host's own screen doesn't predict; it's barely behind.
  - In dev builds, `?lag=250` fakes a 250ms round trip to try it.
  - Casts show on the press too: the wind-up, the champion's cast mark, the sound and an aim flash, and the host's confirmation doesn't play them again.
    - Abilities that need a target wait for the host, since they may walk in first.
    - Right-clicking an enemy marks it as your target at once.
- **A cast pressed a moment early still goes off** (`CAST_QUEUE`, 0.4s).
  - This covers pressing just before the cooldown ends, mid-cast and mid-dash. The host holds the press and fires it the moment it can.
  - The ability's slot glows blue while it waits. A new order drops it.
  - Only players' presses are held: bots play exactly as before, so the balance numbers stand.
- **Abilities cast on someone walk into range.**
  - Pounce, Flèche, Juggling Knives and Down Below, aimed at an enemy out of reach, walk you in and go off once you're close enough (for up to 4s, while you can still see them).
  - With nobody there to cast them on (those, Royal Decree, or Light It Up with no resin out), the slot flashes, a "no" sounds, and your champion grumbles why ("No prey there.", "Kneel? Who? There's no one!").
  - Not enough mana or still cooling down get their own grumbles (`client/failLines.ts`). Only you hear them, at most every 2.5s.
- **Attack-move.** Press A, then click: you walk there and fight the first enemy that comes into reach, then carry on. It leaves jungle monsters alone, so it never pulls a camp. Your reach shows while it waits for the click.
- **Hold C to see your attack range.**
- **Last-hit marker.** An enemy Chud's health bar has a notch where your next basic attack would leave it, and lights up gold when that hit would kill it. It's in the settings.
- **Tooltips work out the numbers.**
  - Your rank's number in every "40/65/90/115" is picked out, and anything that scales says what it comes to right now ("(+50% AD) = 73").
  - Cooldowns show what ability haste makes them. Item passives too (`ui/liveNumbers.ts`).
- **The first minute:**
  - The shop opens by itself while you're at it with nothing bought.
  - The Next Buy chip buys the item in one click when you're at the shop and can afford it.
  - Pressing an ability you haven't learned makes its "+" jump.
  - A new setting, "Level abilities: Automatically", spends skill points in the order the bots use (`nextSkill` in `bots/profiles.ts`).
  - A first-match tip teaches A and C.

## Playing with friends

- **Chat:** Enter talks to your team, Shift+Enter to everyone (Tab switches while typing).
  - Lines show bottom left with name and champion, and fade after a while.
  - It works in the lobby too.
  - The host sends team lines to the team only, trims them to 140 characters, and allows five lines per six seconds each.
- **Lobby settings** (the host's; everyone sees them; solo, they're above the champions):
  - **Weather:** random or any of the six.
  - **Time:** evening, or night. Night only changes the look (sky, lanterns, moon); the clock still starts at zero.
  - **Starting gold:** 500, 1500 or 3000, for the bots too.
  - **Pace:** normal, or fast (50% more gold and experience, half the death timers).
  - **Picks:** free, or a **draft** (not in All Random):
    - The host starts the draft once everyone's in. Picks are cleared and the teams are locked.
    - Everyone bans one champion in turn (blue, red, blue...), then picks snake (blue, red, red, blue...), 25 seconds a turn.
    - A ban that runs out passes; a pick that runs out goes random.
    - Banned and picked champions are off the table for everyone, bots included.
    - Nobody can join mid-draft, and the match starts once it's done.
- **Rejoin after a dropped connection** (`hostCore.rejoin`):
  - Friends get a rejoin token in their welcome. If their connection drops, a bot plays their champion.
  - Reconnecting gives it back mid-match, with no intro. That happens automatically (12 tries), or by joining the same code again; the token survives a reload in sessionStorage.
  - A new connection can also take over from one the host hasn't noticed is gone.
- **A full lobby is cheap** (`host/load.test.ts`): a 5v5 Hollow match with the host and nine friends costs about 0.6ms of host work a tick (out of 33), and each friend gets about 10 KB/s.
- **Match history:** the profile keeps your last 20 matches: champion and look, result, K/D/A, CS, MVP, map, length and when.
- **Practice Range last-hit drill:** the HUD under the clock counts your last hits on enemy Chuds against the ones that died within 800 of you to something else, with a percentage and a grade ("The Chuds are laughing at you" up to "Chud Reaper").
- **Rematch** from the end screen.
  - The host's click starts it, or "swap sides" to change ends. Anyone else's click is counted, and everyone sees who wants one.
  - Everyone goes back to the lobby with their picks, looks and the settings, on a fresh match.
  - The old match's screen is taken down and a new one built; the chat carries on.
- **Profile and titles** (`client/profile.ts`, `shared/titles.ts`): your record is kept in your browser.
  - It tracks matches, wins, kills, deaths, assists, last hits, MVPs, and per-champion games and wins. Practice doesn't count.
  - Milestones unlock titles: Winner, Da Base Breaker, Legend of Da Base, Slayer, Wingman, Chud Botherer, Untouchable, MVP, "<Champion> Main" after ten games, and more.
  - Pick one in the menu's Profile, and it shows in gold over your name in matches and beside it in the lobby. The host only checks that it's a real title.
  - New ones are announced on the end screen.

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

### Newcomers

- **Jordini** (the champion first built as "Marksman") has read every rule in the realm and objected to most of them. When the Chuds crawled up out of the Deep without a single permit, Jordini started shooting, and every arrow since has been a strongly worded rejection. Willmore and HunnaG are in clear violation.
- **The Oak** (first built as "Barbarian") broke out of the king's fighting pit bare-handed, lives for the kill, and has been asking questions ever since. Birds aren't real, Old Wick is three Chuds in a coat, the Warden is a cover-up, and Dongmaster's jaw is a government implant. Named for the Oakners, the only things that never lied.
- **Dongmaster** turned up one morning doing pull-ups on the Warden's chains, and nobody has seen him skip a day since. The Barbarian calls him a show-off; they trade words whenever they meet.
- **The Dark Dabber** is the Rat King's runaway son. He found HunnaG's rot garden in the Deep, ate everything in it, and came back up giggling, red-eyed and wrapped in smoke. He has been trying to get a bite of Havarti for years.
- **Master Paris** taught King Rix's guard to fence and the king himself to lose gracefully (it didn't take). When Rix caged a lion for the court's amusement, Paris flicked his gloves onto the throne and walked out. Rix has never forgiven the fencing teacher.
- **Daltonomo** was King Rix's court jester, right up until he laughed at the wrong moment. Rix had him thrown into the Deep; a week later he climbed back out, still laughing, with a box nobody should open. Since then there have always been at least two of him. Jordini finds him unbearable.
- **Havarti** was a wheel of cheese left in the deepest royal cellar six hundred years ago. Around year four hundred it began to glow; by six hundred it had wings. She guards the jungle against her oldest enemies: mold, rot and rats (HunnaG and the Dark Dabber know who she means).

These rivalries are flavor for now (the match intro and kill quips), not mechanics: Dongmaster vs The Oak, Paris vs King Rix, Havarti vs the Dark Dabber and HunnaG, Jordini vs the Chuds (Willmore and HunnaG), and Daltonomo vs King Rix and Jordini.

## Champions

| Champion | Role | Range | Damage | Resource |
|---|---|---|---|---|
| Jordini | Ranged carry | Ranged | Physical | Mana |
| The Oak | Juggernaut | Melee | Physical | Rage |
| Willmore | Jungle ambusher | Melee | Physical | None |
| HunnaG | Control mage | Ranged | Magic | Mana |
| Logan Lionheart | Starts fights, protects allies | Melee | Physical | None |
| King Rix | Commander | Mid-range | Magic | Mana |
| Dongmaster | Brawler | Melee | Physical | None |
| Dark Dabber | Ranged carry (stealth, stacking poison) | Ranged | Physical and true | Mana |
| Master Paris | Melee carry (resets) | Melee | Physical and true | Mana |
| Havarti | Grows into a ranged carry, protects allies | Melee, then ranged | Mixed | Mana |
| Daltonomo | Assassin and trickster | Melee | Physical, magic boxes | Mana |

Jordini and The Oak keep the kits first built as "Marksman" and "Barbarian" (the code still calls them `marksman` and `barbarian`); only the names, lore, lines and ability names changed.

King Rix deals magic damage on purpose. Without him, HunnaG would be the only source of magic damage and magic-resist items would be pointless.

### Jordini, the Naysayer ✅ implemented

The numbers live at the top of `src/shared/champions/marksman.ts`.
- **Passive, By the Book:** each basic attack on the same target grants +6% attack speed (max 5 stacks, 3s). Switching targets starts the rhythm over.
- **Q, Objection!:** a line skillshot that passes through every enemy it hits. Each enemy after the first takes 15% less damage, down to 55%.
- **W, Red Tape:** places a trap that arms after 0.75s and roots the first enemy champion to step on it for 1.25s. Up to 2 traps at once.
- **E, Step Back:** a short dash. The next basic attack within 3s is ready instantly and deals bonus damage.
- **R, Final Notice:** a 1s telegraphed aim, then a map-wide shot at the first champion hit. It deals up to 50% more damage the more health the target is missing.

### The Oak ✅ implemented

The numbers live at the top of `src/shared/champions/barbarian.ts`. Resource: Rage, which starts empty.
- **Passive, Paranoia:** hitting (+8 per basic attack, +5 per enemy an ability hits) and getting hit (+2) builds Rage. It burns off after 6s out of combat. At 100 Rage his next ability is **Brutal**: stronger, and it spends all his Rage. Brutal is decided the moment you press the key.
- **Q, Timber!:** a 110° swing in front of him. Heals 10 per enemy hit and 30 per champion. Brutal: longer reach, +50% damage, double healing.
- **W, Wake Up!:** nearby enemies are slowed 30% for 2s and deal 20% less damage for 4s. Brutal: a 60% slow and 35% less damage.
- **E, Leap of Faith:** jumps to a spot, even over walls, and slows enemies where he lands. Brutal: a wider landing that stuns instead.
- **R, It's All Connected:** for 6s he grows bigger, gains +30% attack speed and 40% tenacity, and his basic attacks splash half damage around the target. Gives 50 Rage. Takedowns (kills and assists) add 2s, up to 12s. Brutal: 9s.

### Willmore ✅ implemented

The numbers live at the top of `src/shared/champions/willmore.ts`. No resource: cooldowns only.
- **Passive, Scavenger:** Chuds and monsters he kills drop scrap for 10s, which only he can pick up. Each piece heals 10 + 2% max health and gives +2 armor, stacking 10 times (stacks last 30s).
- **Q, Junk Toss:** a skillshot that cycles Can (40% more damage), Sludge (40% slow for 2s), Boot (0.8s stun). An icon over his head shows everyone what's next, and the slot says it too.
- **W, Burrow:** up to 4s underground: hidden from enemies (Chuds, Shooties and bots can't see him either) and 40% faster, but he can't attack. Skillshots and area spells still hit him. Press W again (or cast anything else) to surface, knocking nearby enemies up for 0.75s. Bleeding (Logan's Maul) gives him away.
- **E, Sewer Hook:** the first enemy hit is dragged to him. If the hook catches a wall instead, it pulls him to the wall. Immovable things (the Warden, training dummies) take the damage but don't move.
- **R, Down Below:** grabs the nearest enemy champion beside him (within 275) and drags them underground for 1.5s, through walls if he likes, to where he aimed (up to 600 away). Both are untouchable and hidden on the way. They come up knocked into the air and take damage. No victim, no cast (and no cooldown).
- **Kin of the Deep:** while burrowed he can use any HunnaG's Mole Holes, even the enemy's.

### HunnaG ✅ implemented

The numbers live at the top of `src/shared/champions/hunnag.ts`. Her spells scale with ability power; the Glowworm Lantern and the new Rotroot Staff (2700: +90 AP, +200 health) are the core AP items.
- **Passive, Rot:** her spells stack Rot on enemies (up to 4): magic damage every 0.5s for 4s, per stack. The 4th stack bursts for extra magic damage and a 30% slow for 1.5s, and Rot starts over. Rot keeps ticking if she dies.
- **Q, Sludge Lob:** lobbed at a spot; it lands 0.5s later for magic damage and 1 Rot, and leaves a puddle that slows 30% for 2.5s.
- **W, Mushroom Totem:** a little mushroom (one at a time, 12–15s) that sees like a ward. Every 2s it heals allied champions nearby (16–37, +12% AP) and adds 1 Rot to nearby enemies. It has health; enemies can knock it down for 25 gold. Chuds and Shooties ignore it.
- **E, Mole Hole:** she digs down and pops up at the target spot straight away. Both holes stay open for 5s: allied champions hop between them by walking in. Coming out next to (or on) the other hole, you have to step off before it takes you back.
- **R, The Deep Calls:** marks a big circle; 0.75s later hands burst out, dealing magic damage, rooting everyone inside, and giving them full Rot (which bursts at once).

### Logan Lionheart ✅ implemented

The numbers live at the top of `src/shared/champions/logan.ts`. No resource: cooldowns only. Shields and fear are new engine features: shields soak damage before health (white on the health bar), and fear makes you run straight away from its source, unable to act (tenacity shortens it).
- **Passive, Lionheart:** when an allied champion within 1000 drops below 30% health, he gets a shield (80 + 20 per level) and 40% speed for 2s to get to them. Once every 20s. Uneasy Alliance: for King Rix, only below 15%.
- **Q, Pounce:** leaps onto the visible enemy nearest where he aimed (champions, Chuds, monsters). His next basic attack within 3s stuns for 0.75s and hits harder. No enemy there, no cast.
- **W, Thick Mane:** a 4s shield that grows with his bonus health (health from items). While it holds, his basic attacks slow 30%.
- **E, Maul:** a cone swipe that makes enemies bleed for 3s: extra damage each second, and bleeding enemies can't hide (it reveals a burrowed Willmore).
- **R, Pride's Roar:** enemies in front of him are feared for 1.25s (King Rix's guards for 2.5s: the Royal Menagerie). Allies near him get a shield and 30% speed for 3s.

### King Rix ✅ implemented

The numbers live at the top of `src/shared/champions/kingrix.ts`. Mid-range (400) attacks; his spells deal magic damage and scale with ability power.
- **Passive, Royal Tax:** allied Chuds within 700 of him deal 30% more damage (drawn with a thin gold ring). When an ally near him last-hits a Chud, he takes 4 gold.
- **Q, Levy:** a scepter bolt that hits the first enemy for magic damage. If it kills, he collects extra gold and gets the mana back.
- **W, Call the Guard:** two royal guards for 8s. They follow him, attack whatever he attacks, and go home when their time's up or he dies. Chuds and Shooties fight them like Chuds; killing one pays 15 gold.
- **E, KNEEL!:** enemies in a short cone take magic damage and are stunned for 1–1.3s.
- **R, Royal Decree:** anywhere on the map, marks the visible enemy champion nearest where he aims. For 6s they're revealed to everyone (even burrowed or in brush) and take 15% more damage. If they die while marked, whoever gets the kill, everyone on his team gets 100/150/200 gold. No target, no cast.

**The rivalry, as built:**
- **A Lion Kneels to No One:** KNEEL! stuns Logan for half as long, and he roars right back, scaring Rix off for 0.6s.
- **The Royal Menagerie:** Pride's Roar keeps Rix's guards scared for 2.5s instead of 1.25s.
- **Uneasy Alliance:** Logan's Lionheart triggers for Rix only below 15% health.
- **Two Crowns:** on opposite teams, killing the rival pays double the bounty. Logan then wears the crown (👑 over his head); Rix hangs a lion banner over his own Da Base (🦁 DA BASE 🦁).

### Dongmaster ✅ implemented

The numbers live at the top of `src/shared/champions/dongmaster.ts`. No resource: cooldowns only.
- **Passive, Mog:** enemy champions within 400 of him deal 8% less damage (16% while Ascended). Every champion he Chin Checks gives a stack of Gains: +6 max health for good, up to 30.
- **Q, Chin Check:** charges forward; the first enemy in the way takes damage and is knocked back 250.
- **W, Mewing:** a 3s shield (scales with max health) and 20% tenacity; whatever shield is left when it ends heals him for a quarter of it.
- **E, Sigma Stare:** a cone that damages and fears.
- **R, Ascension:** a knock-up shockwave, then 8–10s bigger, with bonus max health, +25% attack speed and attacks that splash half damage.

### Dark Dabber ✅ implemented

The numbers live at the top of `src/shared/champions/dabber.ts`. Twitch-style.
- **Passive, Sticky Resin:** basic attacks stack resin (up to 6, 6s) that deals true damage every second per stack.
- **Q, Hotbox:** after 0.75s he vanishes into smoke for 5–8s and moves 10% faster. Enemy champions and structures within 300 still spot him (a new rule in vision). Attacking or casting ends it and gives a burst of attack speed.
- **W, Sticky Icky:** a lobbed glob: 2 stacks and a slow, plus a puddle that adds a stack every second for 3s.
- **E, Light It Up:** sets fire to every resin stack within 1100 for damage per stack, and clears them. Needs someone to burn.
- **R, Cloud Nine:** for 6s, +300 range and bonus attack damage; his attacks become smoke bolts that pierce the whole line (falling off 10% per enemy, down to 60%) and stack resin on everyone.

### Master Paris ✅ implemented

The numbers live at the top of `src/shared/champions/paris.ts`. Master Yi-style. Untargetable and damage reduction are new engine features (an `untargetable` status, and `Unit.incomingDamageScale`).
- **Passive, Riposte:** every 4th basic attack in a row strikes a second time for half damage.
- **Q, Flèche:** lunges at an enemy and flashes between up to 3–4 nearby enemies, striking each; he can't be hit while he does it. Each basic attack takes 1s off its cooldown.
- **W, Café Break:** a channel of up to 3s: heals every second and takes 50–65% less damage. Any other order ends it.
- **E, Touché:** for 5s his basic attacks add true damage.
- **R, Encore:** 7s of bonus attack and move speed, immune to slows. Champion takedowns add 4s and cut his other cooldowns by 70%.

### Havarti ✅ implemented

The numbers live at the top of `src/shared/champions/havarti.ts`. Kayle-style. Invulnerability (`blessed`) and armor/magic-resist shred (`curdled`) are new engine features in `World.damage`.
- **Passive, Aged to Perfection:** each attack ripens her (+6% attack speed for 5s, up to 5; fully ripe she's 8% faster). Fresh until level 4 (melee), Aged at 4 (attacks reach 525), Vintage at 8 (attacks send a wave of molten cheese through the enemies behind the target), Legendary at 11 (always fully ripe). Each tier is marked by a burst of light and feathers.
- **Q, Holy Wheel:** a wheel of cheese that hits the first enemy: magic damage, a 25% slow, and armor and magic resist curdled by 15% for 4s.
- **W, Fondue Blessing:** heals her and the most hurt allied champion within 900, and both move faster for 2s.
- **E, Rind Blade:** her attacks add magic damage. Cast: the next attack within 4s reaches 200 further and bites for a share of the target's missing health (capped against non-champions).
- **R, Divine Fondue:** an allied champion (or herself, if nobody's where she aimed) can't be hurt for 2–3s, then molten cheese erupts around them.

### Daltonomo ✅ implemented

The numbers live at the top of `src/shared/champions/daltonomo.ts`. Shaco-style. A `vanished` status (full invisibility, only Bleed gives him away) is new; sprung traps can now be seen by the enemy (`revealed` on a trap).
- **Passive, Punchline:** basic attacks from behind the target deal bonus physical damage.
- **Q, Now You See Me:** blinks up to 400 and turns invisible for 2.5–3.25s. Attacking or casting reveals him; the next attack within 3.5s always counts as from behind and hits harder.
- **W, Surprise Box:** up to 2 hidden boxes (40s). When an enemy comes within 300 one springs: everything nearby is feared, and it shoots the nearest enemy (champions first) every 0.8s for 5s.
- **E, Juggling Knives:** his attacks slow. Cast: a thrown knife at an enemy, 50% more below 30% health, slowing.
- **R, Double Act:** he blinks out of reach for a moment and a double appears beside him for 18s. To the enemy it looks exactly like him (it's a guard-like unit that sends itself as him). It fights what he fights, deals half his damage, takes 50% more, and explodes when it dies or the act ends.

### Scrimby, the Commuter ✅ implemented

The user's mage: a New Yorker (somehow) in Timberland boots and a Yankees cap. The numbers are at the top of `src/shared/champions/scrimby.ts`.
- **Passive, New York Minute:** every spell stacks +5% speed and +6 ability haste for 4s, up to 3 times.
- **Q, Dirty Water Dog:** a hot dog skillshot. Magic damage, and a 25% slow for 1.5s.
- **W, Manhole Steam:** after 0.6s the cover blows: magic damage and a 0.6s knock-up. Then the vent steams for 2.5s, scalding whoever stands in it.
- **E, Jaywalk:** a 380 dash and a burst of speed.
- **R, Express Train:** a Sion-style charge, drawn as a New York subway car with the yellow R bullet.
  - He's the train for up to 3s, speeding up from 520 to 1050. Right-clicks steer it at a train's turning rate.
  - He can't be stopped while it runs. Chuds on the tracks are thrown aside.
  - The first enemy champion or wall ends the ride: everyone around takes magic damage and is knocked up (whoever he hit, for longer).
  - A recast pulls the brake.
- His figure: a navy puffer, jeans, wheat boots, a navy cap with the white NY, and a blue diner coffee cup. Looks: Uptown, Queens Boulevard (Mets colors), Brooklyn Nights, and the Zombie Commuter for Halloween.

### Big Whale, the Unwanted Investor ✅ implemented

The user's support: rich, annoying, unwanted, and he has no idea. The numbers are at the top of `src/shared/champions/bigwhale.ts`.
- **Passive, Tipping Culture:** allied champions within 800 of him get +4 gold for every Chud they finish off (`onAllyLastHit` now says who made the last hit).
- **Q, Make It Rain:** a cash drop at a spot. Magic damage, and a 35% slow while they scrabble for it.
- **W, Yacht Party:** a shield and some speed for him and the ally nearest the cursor (just him if nobody's there).
- **E, Hostile Takeover:** a briefcase skillshot. The first enemy hit is stunned, reading the fine print.
- **R, Splash Zone:** he breaches: a leap that lands in a huge splash, knocking up enemies and healing allies.
- His figure: an upright whale in a navy yacht blazer with gold trim, a gold $ chain, aviator shades, a cigar, a white captain's hat, his tail fluke behind, and a wad of cash. Looks: Old Money, Crypto Whale, Gilded Whale, and Moby Rich (a harpoon he hasn't noticed) for Halloween.

## Halloween costumes

Every champion's fourth look is a Halloween costume (`render/costumes.ts`). It's a palette plus pieces drawn over the figure (head, body or back), sometimes a different hat; masked ones skip the blinking face. Bots wear them sometimes.
- Pumpkin Ranger Jordini, Frankenoak, Sewer Mummy Willmore, Jack-o'-Shroom HunnaG, Werewolf Logan, Vampire King Rix.
- Swole-o'-Lantern Dongmaster, Plague Doctor Dabber, Phantom of the Boulevard Paris, Haunted Havarti, Dead Funny Daltonomo.
- Zombie Commuter Scrimby, Moby Rich Big Whale.

## Art and sound

### Painted art and recorded sound (the hybrid route) 🚧 pipelines in, assets coming

Everything below is drawn and synthesized in code. Any piece can now be swapped for a painted image or a recording, one at a time, with the code version kept for anything that has none. The specs are in `docs/art-bible.md`; Scrimby is the first champion getting the full treatment (`docs/scrimby-assets.md`).
- **Painted figures** (`render/art.ts`): a champion look can have an image per body part, pinned at the part's joint, so the rig poses the painting exactly as it posed the drawing: walking, swinging, flinching, dying (the cap and cup fly off as paintings). `buildFor` hands them to every place the champion appears: in a match, champion select, portraits, the podium.
- **Templates:** `bakeArt('scrimby', 0)` in a dev build's console writes each part as drawn now, at 320 px per r, cut out where the rig pins it, plus the whole figure, a guide with the joints marked and the manifest (`render/artBake.ts`, saved through a dev-only `/__save` endpoint). Scrimby's are in `art-templates/scrimby/0/`.
- **Painted effects:** any ability effect can play a flipbook (a sheet of frames) over the code effect or instead of it (`FxLayer.flipbook`); glows painted on black play as added light.
- **Painted sprites:** any projectile (`projectile:<look>`) and Scrimby's subway car (`scrimby:train`, turned to his heading, mirrored heading left).
- **Recordings** (`samples.ts`): any sound can have takes (never the same twice running), or narrower ones for one ability's cast (`cast:scrimby:3`) or one effect (`fx:steamBurst`). Champions' voice lines are matched to the words in their bubbles (a take per line, in `emotes.ts` order; grumbles in `failLines.ts` order), and the announcer's to its lines' text, falling back to the mumble and the browser's voice.
- `public/art/index.json` and `public/audio/index.json` list what exists; nothing else is fetched, and both are empty until the first assets arrive.


- **Everything is drawn in code** (PixiJS graphics), so there are no image files to load or license.
  - **The style is painterly and hand-inked** (chosen 2026-10-01 to get away from flat, perfectly round shapes): soft painted ground, and everything with an edge outlined in wobbly ink lines that swell and taper, darker shades of the fill rather than black, with hatching and stipple for shade. Light comes from the top-left. The toolkit is `render/organic.ts`: seeded noise, roughened outlines, ink strokes, hatching.
  - **The map** (`src/client/render/mapView.ts`) is painted once at load from MapData, with decoration placed by a seeded random generator so it looks the same for everyone:
    - The ground is painted onto a canvas at a quarter of world size (`render/groundTexture.ts`): wobbly soft-edged ground shapes, brush dabs that pick up the color under them, soft shadows under cliffs and trees, mottling and paper grain. It's stretched over the map as one sprite.
    - Forest canopies fill everything off the paths: lumpy inked crowns, with gaps and shrubs along the treeline so it isn't a wall.
    - The jungle has clumps of grass, flowers, mushrooms, pebbles and twigs; lanes are worn dirt with pebbles and cracks.
    - Bases are plazas of irregular flagstones in the team tint.
    - The river has a deeper channel and ripples.
    - Walls are craggy outcrops: slabs and boulders on top, hatched in the shade, moss and cracks.
    - Brush is clumps of tall grass blades.
    - Camps are trampled nests with bones.
    - The Warden's pit is a ring of cracked stone over the Deep, with runes and rot seeping up.
  - **Atmosphere** (`ambience.ts`): fireflies over the jungle, glints on the river, rot spores rising from the seal, and a faint vignette.
  - **Night comes on** over the match (`render/nightlife.ts`, `render/lighting.ts`):
    - The lanterns are dark through the golden evening. From five minutes in they're lit one by one, each sputtering before it catches.
    - The Shooties' arrow slits glow with candlelight.
    - The fireflies gather round the lanterns and braziers.
    - Once it's night the moon shows in the river, broken up by the ripples and sliding along the water as you move.
  - **Weather** is rolled per match (`shared/weather.ts`, drawn in `render/weather.ts`). It's drawn on the map, never over the whole screen: the falling rain and snow, the lightning flashes and the rainbow were taken off because they got in the way of playing.
    - **Clear.**
    - **Rain:** splashes on the ground, puddles gathering, a slightly darker sky, and thunder now and then.
    - **Storm:** heavier, with more thunder. Some bolts strike the ground in view: a flash on the spot, scorched earth and thunder right on top.
    - **Clearing up:** random rain or storms clear partway through 45% of the time, between 4 and 10 minutes in (`rollClearing`, sent in the welcome). Over half a minute the rain stops and the sky turns to a bright, warm day. The rain's sound and the wind die down. The puddles glint in the sun and dry over five minutes.
    - **Mist** drifting faintly over the map.
    - **Snow:** the ground frosts over (not the river) and snow sits on the treetops. Breath puffs white, feet sink in deep (Chuds' too), and the crickets go quiet.
    - **Autumn wind:** the canopy turns orange and rust, fallen leaves cover the ground and a few more blow across in gusts.
    - The sky's tint for each is gentle, and the wind's strength and sound follow the weather.
  - **Everyone stands up.** Units are upright figures seen side-on from a little above, facing left or right (they mirror when they turn), standing on their spot on the ground. They're depth-sorted, so nearer the bottom of the screen draws in front.
    - Champions, Chuds, King Rix's guards and The Warden are jointed rigs (`render/rig.ts`): a torso, head, two-part arms and legs, feet and a held weapon, drawn once and posed every frame. Legs swing with bending knees in a walk cycle, arms swing against them, the chest breathes. The animation tracks drive the joints: turn raises the arm (negative is up), reach pushes it out in front, lunge leans and steps in, twist spins the figure, grow rears up.
    - Each one's look and proportions are a build (`render/builds.ts`). Champions: Jordini's hood and bow, The Oak's horns and axe, Willmore's sack and bin lid, HunnaG's cap, Logan the lion on his hind legs, King Rix's cape and crown, Dongmaster's jaw and fists, the Dabber's hoodie and tail, Paris's beret and épée, Havarti the winged wheel of cheese, Daltonomo's belled hat and two knives. Chuds wear hoods in their team's color.
    - Creatures that aren't on two legs (`render/beasts.ts`): scurrying rats (the Rat King in a stolen crown), the Mossback with a garden on its shell, the Ember Toad and its tongue, the swaying Glowcap, the siege cart on turning wheels, and a straw practice dummy.
    - **Monsters left alone have lives of their own:**
      - The Mossback dozes off, with z's drifting up.
      - The Ember Toad snaps a fly out of the air.
      - The rats squabble, rounding on each other and nipping, and the Rat King guards a crumb of cheese.
      - The Warden paces its pit, stopping to look about.
    - **Chuds have personality** (`render/chudLife.ts`):
      - Each wears whatever it found: a pot, a bucket, a traffic cone, a paper hat, a mushroom cap or a feather.
      - Each has a face of its own: brows, a unibrow, a moustache, a plaster, an eyepatch or warts.
      - They cheer when a Shootie or an Oakner falls.
      - They flap their arms in a panic when nearly done for. This is only the look: the sim still decides where they go.
      - They bicker on the march (a line, then a reply).
    - **Gear shows on the body** (`render/gear.ts`): what a champion buys, they wear.
      - Royal Plate adds a breastplate and a steel pauldron.
      - The Aegis, the war drum and the longbow go on the back.
      - Treads and striders change the boots.
      - The Glowworm Lantern hangs at the belt, and the Warden's Link wraps the forearm.
      - Bloodreaver stains the weapon (or the fists) red.
    - Hits, numbers, words and auras happen on the body (`render/stature.ts` knows how tall everything stands), arrows fly at chest height with a shadow below, and units can be clicked anywhere from feet to head.
    - **Attacks are made to be seen and heard** (a playtest found it hard to tell when you were attacking or being attacked):
      - A reticle in the enemy color turns under whatever you're attacking for as long as your attack order is on it, and your reach shows faintly round you. The host sends your current target (`MeSnap.tgt`) and attack range.
      - Every basic attack trails a swoosh, and the weapon flashes at the moment the blow lands (`hit` on each attack animation). Melee blows leave a bigger, longer slash arc (yours biggest); ranged shots flash at the hand.
      - Every hit you take flushes the screen edges red in proportion, and a champion's hit shoves the view a touch (heavy hits keep their shake, hit-stop and comic word).
      - Your own attacks are louder with a bright edge on top; hits on you have a deeper thump; an enemy champion starting an attack at you comes with a rising whoosh.
    - **They're alive** (all in the rig):
      - Capes, tails, sacks and wings swing behind the movement, and hats wobble.
      - Champions blink and glance where they're heading. They wince when hit, grin after a kill, an ultimate or a cheery emote, and sleep with their eyes closed.
      - They flinch from hits, reel when stunned, and backflip when knocked up.
      - They topple over dead with X-ed eyes, the weapon clattering down and the hat flying off (Havarti's halo floats away).
      - Fast swings and thrusts leave a swoosh.
    - **Recalls** (`render/recalls.ts`) pose the whole body: sitting, lying down, bowing, holding up their arms. They draw props in the hands, on the head and round the figure.
    - **The world reacts:**
      - Figures wade in the river, shin-deep with ripples.
      - Tall grass closes round their legs in the brush.
      - Champions leave footprints in the dirt.
      - The wind (`render/wind.ts`, stronger in rain and gusting in storms) leans the brush, flaps the banners and stirs the tree crowns.
    - **Light falls on them** (`Lighting.lightAt`):
      - Champions glow on the side of the nearest lantern, brazier or base light, and every figure takes a little of its color.
      - Shadows fall away from the light, longer at night under the moon.
    - In **champion select** the showcase shows the champion live (`ui/stage.ts`): idling, fidgeting, spinning into a new skin, and striking their ultimate's pose when locked in.
    - **The HUD portrait is live** (`ui/livePortrait.ts`), wearing your gear:
      - It winces when you're low.
      - It grins after a kill or an ultimate.
      - It nods off while you recall, and is X-ed out while you're dead.
    - **The end screen lines everyone up** (`ui/podium.ts`, poses in `render/poses.ts`), each in what they bought.
      - The winners celebrate in character: the Oak hoists his axe, Dongmaster flexes, Logan roars, Daltonomo bows, Paris salutes, King Rix holds his scepter high, and Dabber spins.
      - The losers hang their heads, sit with their heads in their hands, or lie flat on their faces.
  - **Structures** stand up too (`render/structures.ts`): Shooties are round stone watchtowers with ivy and a crystal floating over the battlements (beams and shots start there), Oakners are great oaks with a team ribbon round the trunk, and Da Base is a walled fort over the Chud burrow with towers, banners and a big floating crystal.
  - Champions stand on a ring in their team's color (white edge for you). The champion-select pictures (and the kill feed's faces) are busts of the same figures, rendered to images once at startup.
  - **Spells are inked too** (`render/fx.ts`, `render/particles.ts`): rings, bursts and slashes have brushed ink edges, smoke is lumpy and outlined, and big hits throw comic words (`render/comic.ts`: CHOP!, BONK!, TOUCHÉ!, K.O.!).
  - **Everyone casts and hits in their own hand** (a playtest found every cast looked like the same arcane star, and every hit the same). You should be able to tell who's casting, and who hit whom, at a glance.
    - **Cast signatures** (`render/signatures.ts`): the mark that appears on and around a champion whenever they cast anything, bigger for the ultimate. The Oak splits the ground (cracks, splinters, embers); Jordini stamps a big red NO on the ground and the paperwork flies; Willmore's bin lid clangs down (a dented grey ring, still ringing); HunnaG's fairy ring of little mushrooms sprouts round her feet; Logan presses a golden paw print; King Rix drops a crown round his feet and coins spin off it; Dongmaster slams an iron plate down and his jaw glints; the Dark Dabber's smoke rolls out in a ring; Master Paris signs the air with his blade (a Z) and a petal falls; Havarti's halo blazes over her head and feathers drift down; Daltonomo's harlequin diamonds spin round him in confetti. No rune circles.
    - **Abilities in character** (`render/spells.ts`): Jordini's Red Tape snaps shut in red ribbon and leaves a cross of tape, Objection! trails torn paperwork, Final Notice grows the red NO as he draws; The Oak's Wake Up! pops exclamation marks all round, and It's All Connected strings a conspiracy board of red string between pins round him; HunnaG's totem pulse, Mole Holes and The Deep Calls grow mushrooms and clawing fingers instead of runes; King Rix's Call the Guard lays a great crown on the ground and Royal Decree slams a red wax seal onto the target; Logan's Pounce lands on a paw print; Daltonomo's vanishings and his double appear in rings of spinning diamonds. The rest (fondue, smoke, roses, chains, confetti) were already their own.
    - **Basic attacks** (`render/animation.ts` `ATTACKS`, `render/attacks.ts`): each champion has two to four swings played in turn, each with a wind-up and a follow-through: The Oak chops, sweeps flat and rips a backhand up; Willmore whirls, flails and yanks the hook; Logan rakes, backhands and bites; Dongmaster jabs, crosses, uppercuts and hooks; Paris thrusts, lunges deep, cuts a moulinet and flicks; Daltonomo stabs, pirouettes, stabs overhand and backhands "ta-da"; Havarti slashes, sweeps and flicks; Jordini looses, snapshots and draws high; HunnaG jabs, taps and sweeps the orb; King Rix flourishes, flicks and points the scepter; the Dabber kicks, hip-fires and coughs.
    - **Hits land their own way**, timed to the swing: the Oak's axe throws an orange comic star, splinters and dust with speed lines; Willmore's hook CLANKs with grey sparks and vibration arcs; Logan leaves three red claw marks (or two rows of teeth); Dongmaster's fist lands a big white POW with speed lines and sweat flying; Paris's point is a pinprick of light and a thin ring; Daltonomo's knives cross in an X with a bell's chime; Havarti's blade throws cheese crumbs and a sizzle; Jordini's arrows THWIP with ice-blue sparks and paper; HunnaG's spores burst softly in rings; King Rix BONKs gold with a spill of coins; the Dabber's bolts splat amber resin in a puff of smoke. Ranged hits arrive when the shot does.
  - **The HUD is inked** (`ui/ink.ts`): panels and slots have brushed ink frames over warm paper, drawn at startup.
  - **Old Wick** (`render/shopkeeper.ts`), the landmarks and the map's props (lanterns, braziers, toadstools) are drawn in the same hand. Their standing parts are sorted in with the units, so you pass behind them.
  - Abilities, passives and items use emoji icons. Only emoji up to version 12 are used, so they show on Windows 10 too.
  - **Character:** champions fidget when they stand still (`FIDGETS` in `render/animation.ts`) and talk in synthesized gibberish voices on emotes, ultimates, big hits and deaths (`src/client/voices.ts`).
  - **Story landmarks** (`render/landmarks.ts`): Logan's broken Royal Cage, the Fallen King statue, the Warden's chains in the pit, Willmore's sewer (the Deep) and HunnaG's Rot; and round the pit, Master Paris's Le Petit Café, Dongmaster's Iron Paradise, Havarti's Royal Cellar and the Dark Dabber's Hotbox. They're decoration only (no collision), kept clear of brush.
  - **They sit in the jungle, not on it** (`render/loreGround.ts`):
    - The earth round each landmark is worn bare: a gravel terrace under the café, dust round the gym, a mound round the cellar, earth torn up where the king fell. The Deep and the Rot stain the river.
    - Footpaths lead to the landmarks from the back doors, the camps and the mouths of the Warden's pit. Paths and bare earth are painted into the ground under the same brushwork as the lanes, so grass and flowers keep off them.
    - Grass grows up over the edges of the slabs, tiles and mats. Ivy climbs the cage and the plinth.
    - Each landmark's clutter spreads out into the grass: Logan's straw, chips of the king, the café's leaves, a geranium planter and a chalkboard, a tractor tire and a kettlebell by the gym, cheese rind along the cellar path, the Hotbox's litter and an old fire ring.
    - The gym's mat is now scavenged floor tiles, one missing and one kicked askew.
  - **Play of the Game** (`src/client/highlights.ts`): the client keeps the last few seconds of snapshots, scores each play, and replays the best one before the scores.
  - **Smoothness** (measured in a match: Pixi rebuilt its draw lists every frame, and the off-screen half of the map was drawn anyway):
    - The big static layers (the painted ground, cliff tops and canopy, about 86,000 shapes between them) are render groups of their own, so a change elsewhere doesn't make them batch again.
    - The unit layer is a render group too: it re-sorts by depth nearly every frame, and that no longer drags the rest of the map along.
    - **Culling:** units and standing props more than 350 off the screen aren't drawn, and their views aren't updated (they catch up when they're back). The river's streaks and foam and the fireflies are only drawn near the screen. In a test match the frame's render work fell from about 21ms to 11ms, and the worst frames from 61ms to 20ms.
    - **No freezes between updates:** the host sends 30 snapshots a second and the client plays them a little behind. If one's late (a hiccup in the host), everything carries on the way it was moving for up to 0.1s instead of freezing and then jumping (`snapshotBuffer.ts`; blinks aren't carried on).
    - The Warden's lines under the clock are measured once per change, not every frame (reading layout every frame forced the page to lay itself out again).
- **Sound is synthesized** with Web Audio (`src/client/audio.ts`): every effect is a few oscillators, filtered noise and envelopes, so there are no audio files either.
  - Which event makes which sound is in `src/client/sfx.ts`: attacks (swings, shots, Shootie zaps), hits on you or by you, deaths, casts, the big moments (slams, roars, digging, telegraph warnings), level-ups, gold, the kill feed, and a victory or defeat jingle.
  - Sounds play where they happen: quieter the further from the middle of your screen, and panned left or right. Chuds are much quieter than champions, and repeats are rate-limited so a big fight stays readable.
  - **The mix** (`src/client/mix.ts` holds the arithmetic):
    - Five buses: effects, interface, voices, ambience and music.
    - One shared reverb (a generated 2.2s hall), with a send per sound: clicks dry, tolls and collapses wet.
    - A glue compressor and a brickwall limiter on the master.
    - Big moments (ultimates, slams, collapses, heavy hits on you) dip the music and ambience for a moment.
    - Distant sounds are duller and wetter as well as quieter.
    - Every effect gets a little random pitch and timing, so repeats don't sound robotic. Jingles and chimes stay in tune.
    - Interface and announcer sounds are never crowded out by a fight.
  - **Effects:**
    - Hits are layered (edge, body, tail). Heavy hits and magic hits sound different.
    - Each champion's attack and cast signature is in character: the Oak's axe splitting wood, Willmore's chain and bin lid, King Rix's royal ting, Dongmaster's knuckles, and so on.
    - Shootie shots charge and crack. Structures collapse with rubble; Da Base's crystal shatters over a deep rumble.
    - The Warden's slam clangs with rattling chains.
    - There are sounds for the shop, ranking up, landing, the item actives (Lantern, Aegis, Drum) and the Sewer Crab (skittering, then squeaking when taken). A till rings when your side claims a bounty. Titles, rematch and chat have their own.
    - Victory and defeat have their own stingers, with the music stepping back under them.
  - **Ambience** follows the world, quietly: it has its own **Ambient sound** slider in the settings, at 30% to start (it used to follow the effects slider, at 80%), and the wind, river, rain and crickets are softer and sparser than they were.
    - Night brings up the crickets and owls and settles the wind.
    - Each weather has its own sound: rain patters, storms rumble between bolts, snow muffles and hushes, autumn gusts rustle leaves, and mist dampens everything.
    - The river burbles near the water. The Warden's pit drones with clinking chains. Da Base and the Shooties hum faintly close up.
  - **Music:** the generated loop sits well under the effects. It has a shimmer over the pad, and when it's calm a flute phrase or a rolled harp chord now and then, with a far-off horn at night. It darkens at night.
    - It follows the size of the fight near the camera. A skirmish you're in brings the drums and a pulsing bass. Three champions trading blows on screen bring running strings. Four or more is a teamfight: taiko, brass stabs, a choir, cymbal swells and a darker progression (Dm, Bb, F, C).
  - **The announcer speaks** (`src/client/announcer.ts`). It uses the browser's own speech: a British man's voice where the browser has one, pitched low and taken slow.
    - Kills: First blood! Double and triple kill, Rampage, sprees, Shutdown! Bounty claimed!, Ace!, Executed. Also when you've slain someone or been slain.
    - Objectives: "Objective destroyed!" when we take a Shootie, "Our Shootie has fallen!" when we lose one, Oakners, the Sewer Crab and the Warden.
    - The match: "Welcome to Da Base!", the first Chuds (ten seconds out, then when they spawn), the Warden waking, the map events, Victory and Defeat.
    - Lines queue so they never talk over each other; small ones drop in a busy fight, and stale ones are skipped. The biggest (first blood, bounties, aces, the Warden) get a cinematic hit (`epic`) and a banner that slams in larger with gold rays turning behind it. Settings → Announcer voice turns it off.
  - **M** (or the speaker by the clock) mutes; the setting is remembered.

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
| M3 | Jungle camps, the Warden, experience/levels/ability ranks, gold, shop | ✅ done (plus kill feed, structure retune, bots that group up late, fair bot ticks) |
| M4 | Logan Lionheart, King Rix, Willmore, HunnaG (with the lore mechanics), art and sound pass | ✅ done (plus one-champion-per-team picks) |
| M5 | Balance tools, playtests | |

### Known gaps
- Figures are drawn and animated in code rather than from real art.
- Bots play a decent new player's game: they don't plan ganks, ward, or play around cooldowns.
- Netcode predicts your own walking and casts; everyone else is shown slightly behind (fine for a friend group, not for a ladder).
