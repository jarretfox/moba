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
  - **Old Grudge** applies to Willmore and HunnaG by champion id.
- **Shop** (items in `src/shared/items.ts`): 17 items, 4 inventory slots. Press P or click your gold.
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
  - **Lineup per team:** a solo top lane and a duo bot lane. Each slot has champions that suit it: top Barbarian, Willmore or Logan; carry Marksman, King Rix or HunnaG; partner HunnaG, Logan, King Rix or Willmore. Bots pick at random among those their team doesn't have yet, after the humans' picks. Champions are one per team for humans too: a teammate's pick is greyed out in the lobby.
  - **Laning:** stand behind their own wave (melee close in, ranged further back), last-hit first, and step out of position for a last hit. They help the wave, and hit structures when their Chuds are soaking the Shootie and no enemy champion is near.
  - **Safety:** they won't walk under an enemy Shootie unless at least 2 of their Chuds are tanking it, and they leave immediately if it targets them.
  - **Fighting:** they engage enemy champions within 700 when they're at least as healthy, or the enemy is below 35%. They avoid trading into a crowd of enemy Chuds, never dive towers, and give ground when hit by someone they won't fight. Each champion uses its kit in fights: for example the Marksman rolls away from melee champions and fires Longshot at low targets, and the Barbarian leaps in and uses Berserk when things get close.
  - **Going home:** below 25% health (35% with an enemy near), they recall if it's safe, or run home using escape abilities. They come back at 90%.
  - **Shopping:** each champion has a fixed build (in `profiles.ts`). They buy the next item whenever they're in the shop and can afford it, selling basics to make room. With 900+ gold that buys the next item and no enemy around, they go home to spend it.
  - **Grouping up:** from 18:00 a team's bots leave their own lanes and push one lane together: the one where the enemy has the least left standing. They switch lanes only once the other one is better by a whole structure.
  - **Fair ticks:** every bot decides from the same world state before any of their orders go in, and which team's orders go first alternates each tick. Before this, the team whose bots acted first lost every bots-only match, because casts land the moment they're applied and the other team's bots reacted within the same tick.
  - **What they don't do:** dodge skillshots, plan ganks, defend as a group, or take camps and the Warden.
  - **Match length:** with random six-champion lineups, a bots-only match ends in 11–31 minutes (median about 16). Wins split 17–13 between the sides over 30 games. Bots farm only modestly (about 4–5k gold by 20 minutes), so they finish two or three core items.
  - **Bot win rates by champion** over those 30 games: HunnaG 68%, Barbarian 62%, Marksman 61%, Willmore 45%, Logan 41%, King Rix 33%. That's noisy (about ±10%) and mixes kit strength with how well each bot plays its kit, so it's a starting point for M5 balance, not a verdict.

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
- **Passive, By the Book:** each basic attack on the same target grants +8% attack speed (max 5 stacks, 3s). Switching targets starts the rhythm over.
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
- **W, Mushroom Totem:** a little mushroom (one at a time, 16–22s) that sees like a ward. Every 1.5s it heals allied champions nearby and adds 1 Rot to nearby enemies. It has health; enemies can knock it down for 25 gold. Chuds and Shooties ignore it.
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
- **Passive, Royal Tax:** allied Chuds within 700 of him deal 20% more damage (drawn with a thin gold ring). When an ally near him last-hits a Chud, he takes 4 gold.
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
- **Passive, Aged to Perfection:** each attack ripens her (+6% attack speed for 5s, up to 5; fully ripe she's 8% faster). Fresh until level 5 (melee), Aged at 5 (attacks reach 525), Vintage at 9 (attacks send a wave of molten cheese through the enemies behind the target), Legendary at 13 (always fully ripe). Each tier is marked by a burst of light and feathers.
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

## Art and sound

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
  - **Atmosphere** (`ambience.ts`): fireflies over the jungle, glints on the river, rot spores rising from the seal, and a soft vignette.
  - **Everyone stands up.** Units are upright figures seen side-on from a little above, facing left or right (they mirror when they turn), standing on their spot on the ground. They're depth-sorted, so nearer the bottom of the screen draws in front.
    - Champions, Chuds, King Rix's guards and The Warden are jointed rigs (`render/rig.ts`): a torso, head, two-part arms and legs, feet and a held weapon, drawn once and posed every frame. Legs swing with bending knees in a walk cycle, arms swing against them, the chest breathes. The animation tracks drive the joints: turn raises the arm (negative is up), reach pushes it out in front, lunge leans and steps in, twist spins the figure, grow rears up.
    - Each one's look and proportions are a build (`render/builds.ts`). Champions: Jordini's hood and bow, The Oak's horns and axe, Willmore's sack and bin lid, HunnaG's cap, Logan the lion on his hind legs, King Rix's cape and crown, Dongmaster's jaw and fists, the Dabber's hoodie and tail, Paris's beret and épée, Havarti the winged wheel of cheese, Daltonomo's belled hat and two knives. Chuds wear hoods in their team's color.
    - Creatures that aren't on two legs (`render/beasts.ts`): scurrying rats (the Rat King in a stolen crown), the Mossback with a garden on its shell, the Ember Toad and its tongue, the swaying Glowcap, the siege cart on turning wheels, and a straw practice dummy.
    - Hits, numbers, words and auras happen on the body (`render/stature.ts` knows how tall everything stands), arrows fly at chest height with a shadow below, and units can be clicked anywhere from feet to head.
  - **Structures** stand up too (`render/structures.ts`): Shooties are round stone watchtowers with ivy and a crystal floating over the battlements (beams and shots start there), Oakners are great oaks with a team ribbon round the trunk, and Da Base is a walled fort over the Chud burrow with towers, banners and a big floating crystal.
  - Champions stand on a ring in their team's color (white edge for you). The HUD portrait and the champion-select pictures are busts of the same figures, rendered to images once at startup.
  - Abilities, passives and items use emoji icons. Only emoji up to version 12 are used, so they show on Windows 10 too.
  - **Character:** champions fidget when they stand still (`FIDGETS` in `render/animation.ts`) and talk in synthesized gibberish voices on emotes, ultimates, big hits and deaths (`src/client/voices.ts`).
  - **Story landmarks** (`render/landmarks.ts`): Logan's broken Royal Cage, the Fallen King statue, the Warden's chains in the pit, Willmore's sewer (the Deep) and HunnaG's Rot; and round the pit, Master Paris's Le Petit Café, Dongmaster's Iron Paradise, Havarti's Royal Cellar and the Dark Dabber's Hotbox. They're decoration only (no collision), kept clear of brush.
  - **Play of the Game** (`src/client/highlights.ts`): the client keeps the last few seconds of snapshots, scores each play, and replays the best one before the scores.
- **Sound is synthesized** with Web Audio (`src/client/audio.ts`): every effect is a few oscillators, filtered noise and envelopes, so there are no audio files either.
  - Which event makes which sound is in `src/client/sfx.ts`: attacks (swings, shots, Shootie zaps), hits on you or by you, deaths, casts, the big moments (slams, roars, digging, telegraph warnings), level-ups, gold, the kill feed, and a victory or defeat jingle.
  - Sounds play where they happen: quieter the further from the middle of your screen, and panned left or right. Chuds are much quieter than champions, and repeats are rate-limited so a big fight stays readable.
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
- **Bots don't jungle or fight the Warden.** All three per side lane; the camps and the Warden are there for humans.
- Bots don't dodge skillshots or defend as a group. Late in the game both teams often push different lanes and race each other's bases.
- No minimap, scoreboard, or camp respawn timers yet.
- **No music,** and figures animate with simple procedural motion rather than drawn frames.
