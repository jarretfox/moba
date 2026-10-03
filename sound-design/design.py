"""The game's sound design: each recorded sound (by key), the files its takes come from (by pack and name),
and how it sits with the synthesized sound. Writes sound-design/recipe.json, which the sound bench builds
the game's sounds from (src/client/dev/soundBench.ts; `bench.build()` in a dev build's console).

The packs are free downloads (CC0) unpacked under incoming/ (not in the repo; public/CREDITS.md lists them
and where to get them), and incoming/inventory.txt lists their files (from the project root):
    find incoming -type f -iname '*.wav' -o -iname '*.ogg' -o -iname '*.mp3' -o -iname '*.flac' | sed 's|^incoming/||'
Run from the project root: python sound-design/design.py

Keys: a sound's own name (atkBow), one ability's cast (cast:<champion>:<slot>), one effect (fx:<effect>),
a champion's hits (hit:<champion>), or a layer played with another (fx:steamBurst+hiss).
Levels are dB against the synthesized sound a key stands in for (or plays over), measured in the game's mix.
"""
import json, os, re, sys
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
inv = [l.strip() for l in open('incoming/inventory.txt', encoding='utf-8') if l.strip() and '/._' not in l]

def find(pack, name):
    """The file in `pack` (a directory fragment) whose base name (no extension) is `name`."""
    hits = [p for p in inv if pack in p and re.sub(r'\.(wav|ogg|mp3|flac|aif)$', '', p.split('/')[-1]) == name]
    if not hits:
        sys.exit(f'not found: {pack} {name}')
    # Prefer ogg/wav over the duplicate formats.
    hits.sort(key=lambda p: (p.endswith('.aif'), p.endswith('.flac'), len(p)))
    return hits[0]

K_IMP = 'kenney_impact-sounds'
K_RPG = 'kenney_rpg-audio'
K_CAS = 'kenney_casino-audio'
K_SCI = 'kenney_sci-fi-sounds'
K_JIN = 'kenney_music-jingles'
RPG80 = 'x_80-CC0-RPG-SFX_0'
CRE1 = 'x_80-CC0-creature-SFX_0'
CRE2 = 'x_80-CC0-creature-sfx-2'
C100 = 'x_100-CC0-SFX_0'
C100B = 'x_sfx_100_v2'
WM = 'x_100-CC0-wood-metal-SFX'
BFH = 'x_sfx_breaking_and_falling'
BANG = 'x_25-CC0-bang-sfx'
WATER = 'x_water-splash-slime-sfx'
TINY = 'x_tinysized'
RPGP = 'x_rpg_sound_pack'
SWO = 'x_swoshes'
SWI = 'x_swishes'
HITS = 'x_independent_nu_ljudbank-hits_and_punches'
SPLAT = 'x_independent_nu_ljudbank-wet_squish_slurp_impacts'
CRUNCH = 'x_independent_nu_ljudbank-break_crunch_impact'
WOOD = 'x_independent_nu_ljudbank-wood_crack_hit_destruction'
SWORD = 'x_sword_-_starninjas_1'
CLASH = 'x_sword_clash_-_starninjas_0'
SUPER = 'x_superpowers-asset-packs-soundeffects_2'
STEAM = 'x_steam_hisses'
BATTLE = 'x_battle_sound_effects_0'
FOOT = 'x_footsteps'
MONS = 'x_monster_sfx_pack_2'

def rng(pack, fmt, nums):
    return [(pack, fmt.format(n)) for n in nums]

# key: (sources, options). Options: over (play with the synth), level (dB vs. the synth it stands for),
# max (seconds), with (other keys played at the same moment).
D = {}
def S(key, sources, **o):
    D[key] = (sources, o)

# ── Jordini (marksman): a by-the-book archer. A crisp bow, a gavel for Objection!, tape and cuffs.
S('atkBow', [(BATTLE, 'Bow')] + rng(TINY, 'arrow-feathers-0{}', [1]), level=1)
S('hit:marksman', rng(WOOD, 'impactwood{:02d}.mp3', [1, 2, 3, 4]), level=0)
S('cast:marksman:0', [(WM, 'wood_slam_01'), (WM, 'wood_slam_02')], over=True, level=-1)
S('cast:marksman:1', rng(TINY, 'cover-paper-tear-0{}', [1, 2]))
S('fx:trapSnap', rng(TINY, 'handcuffs-metal-lock-0{}', [1, 2]), level=1)
S('fx:roll', rng(SWO, 'swosh-{:02d}', [3, 7, 11]), over=True, level=-2)
S('fx:aimLine', rng(TINY, 'arrow-grab-from-quiver-0{}', [1, 2]), over=True, level=-2)
S('cast:marksman:3', [(WM, 'wood_slam_03'), (WM, 'wood_slam_04')], over=True, level=0)

# ── The Oak (barbarian): axe swings that split wood, a timber crack, a war cry, rock breaking.
S('atkAxe', rng(RPGP, 'swing{}', ['', '2', '3']), level=1)
S('hit:barbarian', [(K_RPG, 'chop')] + rng(WOOD, 'impactwood{:02d}.mp3', [6, 7, 8]), level=1)
S('fx:cleave', rng(WOOD, 'crack{:02d}.mp3', [1, 2, 3]), over=True, level=-1)
S('fx:warCry', rng(RPGP, 'ogre{}', [1, 2, 3]), over=True, level=0)
S('fx:slam', rng(BFH, 'bfh1_rock_breaking_0{}', [1, 2, 3]), over=True, level=0)
S('fx:berserk', rng(RPGP, 'giant{}', [1, 2]), over=True, level=0)

# ── Willmore: chains and bin lids, junk, the sewer.
S('atkHook', rng(RPG80, 'chain_0{}', [1, 2, 3]), level=0)
S('hit:willmore', rng(K_IMP, 'impactMetal_medium_00{}', [0, 1, 2, 3]), level=0)
S('cast:willmore:0', rng(BFH, 'bfh1_metal_falling_0{}', [1, 2, 3]), over=True, level=-2)
S('fx:burrow', rng(WATER, 'splash_{:02d}', [5, 6]), over=True, level=-1)
S('fx:surface', rng(WATER, 'splash_{:02d}', [9, 10]), over=True, level=0)
S('fx:tunnel', rng(WATER, 'bubble_0{}', [1, 2]), over=True, level=-2)
S('fx:hookPull', rng(RPG80, 'chain_0{}', [2, 3]), over=True, level=0)

# ── HunnaG: spit, splats, slime, the Deep.
S('atkSpore', rng(CRE1, 'spit_0{}', [1, 2, 3]), level=0)
S('hit:hunnag', rng(SPLAT, 'impactsplat0{}.mp3', [1, 2, 3, 4]), level=0)
S('fx:lob', rng(CRE1, 'burble_0{}', [1, 2]), over=True, level=-2)
S('fx:rotBurst', rng(SPLAT, 'impactsplat0{}.mp3', [5, 6, 7, 8]), over=True, level=0)
S('fx:pulse', rng(WATER, 'bubble_0{}', [1, 2, 3]), over=True, level=-3)
S('fx:hop', rng(TINY, 'mud-steps-0{}', [1, 2, 3]), over=True, level=-1)
S('fx:deepMark', rng(RPGP, 'shade{}', [3, 5, 9]), over=True, level=-1)
S('fx:deepHands', rng(MONS, 'monster-{}', [3, 7]), over=True, level=0, **{'with': ['fx:deepHands+rock']})
S('fx:deepHands+rock', rng(BFH, 'bfh1_rock_falling_0{}', [1, 2]), level=-4)

# ── Logan: a lion. Swipes, snarls, the roar.
S('atkClaw', rng(SWO, 'swosh-{:02d}', [14, 18, 22, 26]), level=0)
S('hit:logan', rng(K_IMP, 'impactPunch_medium_00{}', [0, 1, 2]), level=0)
S('fx:pounce', rng(CRE2, 'attack_0{}', [1, 2, 3]), over=True, level=0)
S('fx:maul', rng(CRE2, 'attack_0{}', [4, 5]), over=True, level=0, **{'with': ['fx:maul+crunch']})
S('fx:maul+crunch', rng(CRUNCH, 'impactcrunch0{}.mp3', [1, 2, 3]), level=-3)
S('fx:mane', rng(CRE2, 'grunt_0{}', [6, 7, 8]), over=True, level=-2)
S('fx:roar', [(CRE1, 'roar_01'), (CRE1, 'roar_02'), (CRE2, 'roar_05')], over=True, level=1)
S('fx:lionheart', [(CRE1, 'breath'), (CRE2, 'breath_02')], over=True, level=-3)

# ── King Rix: royal. Gems, coins, armor, a gong, a brass hit.
S('atkScepter', rng(RPG80, 'item_gem_0{}', [1, 2, 3, 4]), level=0)
S('hit:kingrix', rng(RPGP, 'metal-small{}', [1, 2, 3]), level=-1)
S('cast:kingrix:0', [(TINY, 'coinflip-01'), (TINY, 'coin-spin-fall-01')], over=True, level=-1)
S('fx:summon', [(RPGP, 'chainmail1'), (RPGP, 'chainmail2'), (RPGP, 'armor-light')], over=True, level=0)
S('fx:kneel', rng(C100, 'gong_0{}', [1, 2]), over=True, level=1)
S('fx:decree', rng(K_JIN, 'jingles_HIT{:02d}', [0, 3]), over=True, level=0, **{'with': ['fx:decree+gong']})
S('fx:decree+gong', [(C100, 'gong_02')], level=-4)

# ── Dongmaster: real punches, a stare, the ascension.
S('atkPunch', rng(HITS, 'hit{:02d}.mp3', [1, 3, 5, 7, 9]), level=1)
S('hit:dongmaster', rng(K_IMP, 'impactPunch_heavy_00{}', [0, 1, 2, 3]), level=0)
S('fx:chinCheck', rng(HITS, 'hit{:02d}.mp3', [20, 24, 28]), over=True, level=1)
S('fx:mewing', [(CRE1, 'breath')], over=True, level=-3)
S('fx:sigmaStare', rng(K_SCI, 'forceField_00{}', [0, 1]), over=True, level=-2)
S('fx:ascension', rng(RPGP, 'giant{}', [3, 4]), over=True, level=0, **{'with': ['fx:ascension+brass']})
S('fx:ascension+brass', rng(K_JIN, 'jingles_HIT{:02d}', [8, 12]), level=-3)

# ── Dark Dabber: smoke and fire. Kept well under the others (players found him loud: he attacks fast and
# his fire and smoke sat on top of everything), and his long takes are cut short.
S('atkRig', rng(K_SCI, 'slime_00{}', [0, 1]), level=-8, max=0.3)
S('hit:dabber', rng(SPLAT, 'impactsplat0{}.mp3', [2, 4, 6]), level=-7, max=0.45)
S('cast:dabber:0', rng(TINY, 'compressed-air-spray-0{}', [1, 2]), over=True, level=-6, max=0.5)
S('cast:dabber:1', rng(WATER, 'slime_{:02d}', [3, 7, 11]), over=True, level=-7)
S('fx:lightItUp', [(TINY, 'lighter-light-01')], over=True, level=-5, **{'with': ['fx:lightItUp+fire']})
S('fx:lightItUp+fire', rng(RPG80, 'spell_fire_0{}', [1, 2, 3]), level=-9, max=0.9)
S('fx:cloudNine', rng(RPG80, 'spell_fire_0{}', [5, 6, 7]), over=True, level=-6, max=0.9, **{'with': ['fx:cloudNine+thrust']})
S('fx:cloudNine+thrust', rng(K_SCI, 'thrusterFire_00{}', [0, 2]), level=-11, max=0.8)

# ── Master Paris: a fencer. Thin steel, clashes, café cups.
S('atkEpee', rng(SWORD, 'sword.{}', [1, 3, 5, 7]), level=0)
S('hit:paris', rng(CLASH, 'sword_clash.{}', [1, 2, 3, 4]), level=-1)
S('fx:fleche', rng(RPGP, 'sword-unsheathe{}', ['', '2', '3']), over=True, level=0)
S('fx:cafeBreak', rng(C100, 'dishes_0{}', [1, 2, 3]), over=True, level=0)
S('fx:touche', rng(TINY, 'sword-clash-0{}', [1, 2, 3]), over=True, level=1)
S('fx:encore', rng(RPGP, 'sword-unsheathe{}', ['4', '5']), over=True, level=0)

# ── Havarti: holy cheese. Chimes, bubbling fondue, a knife through the rind.
S('atkCheese', [(None, 'magical_1_0'), (None, 'magical_2'), (None, 'magical_4')], level=-2)
S('hit:havarti', rng(SPLAT, 'impactsplat0{}.mp3', [1, 3, 5]), level=-2)
S('fx:curdle', rng(TINY, 'wood-bowl-spoon-0{}', [1, 2, 3]), over=True, level=0)
S('fx:fondue', [(None, 'cooking_with_cover_01')], over=True, level=-2, max=1.6)
S('fx:rindBlade', rng(TINY, 'apple-cut-0{}', [1, 2, 3]), over=True, level=1)
S('fx:divineFondue', [(None, 'magical_7_0'), (None, 'magical_6_0')], over=True, level=0, **{'with': ['fx:divineFondue+bell']})
S('fx:divineFondue+bell', rng(C100, 'bell_0{}', [1, 3]), level=-4)
S('fx:fondueEruption', rng(WATER, 'splash_{:02d}', [12, 13]), over=True, level=0)
S('fx:ascend', [(None, 'magical_5')], over=True, level=0)

# ── Daltonomo: a jester. Springs, a vanishing act, knives, fireworks.
S('atkDagger', rng(TINY, 'knife-unsheathe-0{}', [2]) + rng(SWI, 'swish-{}', [3, 6, 9]), level=0)
S('hit:daltonomo', rng(RPG80, 'blade_0{}', [1, 2, 3]), level=-1)
S('fx:nowYouSeeMe', [(None, 'teleport')], over=True, level=0)
S('fx:jackbox', rng(C100, 'spring_0{}', [1, 3, 5]), over=True, level=1)
S('fx:boxShot', rng(C100, 'spring_0{}', [7, 8, 9]), over=True, level=-2)
S('fx:backstab', rng(RPG80, 'blade_0{}', [1, 3]), over=True, level=0)
S('fx:doubleAct', [(TINY, 'chimes-wood-rattle')], over=True, level=0)
S('fx:cloneBoom', rng(BANG, 'fw_0{}', [1, 2, 3]), over=True, level=0)
S('cast:daltonomo:2', rng(TINY, 'metal-knife-scrape-0{}', [1, 2, 3]), over=True, level=-1)

# ── Big Whale: money and water.
S('atkCoin', rng(RPGP, 'coin{}', ['', '2', '3']), level=0)
S('hit:bigwhale', rng(RPG80, 'item_coins_0{}', [1, 2, 3, 4]), level=-1)
S('fx:tip', [(TINY, 'coinflip-01')], over=True, level=0)
S('fx:cashRain', rng(K_CAS, 'card-fan-{}', [1, 2]) + [(K_CAS, 'card-shuffle')], over=True, level=0, **{'with': ['fx:cashRain+coins']})
S('fx:cashRain+coins', [(TINY, 'coins-shake-01'), (RPG80, 'item_coins_03')], level=-3)
S('fx:yachtParty', rng(K_JIN, 'jingles_SAX{:02d}', [0, 2, 5]), over=True, level=-1, max=2.2)
S('fx:paperwork', rng(RPG80, 'book_0{}', [1, 2, 3]), over=True, level=0, **{'with': ['fx:paperwork+latch']})
S('fx:paperwork+latch', rng(RPG80, 'lock_0{}', [1, 2]), level=-3)
S('fx:breach', rng(WATER, 'splash_{:02d}', [1, 2]), over=True, level=0)
S('fx:splashZone', rng(WATER, 'splash_{:02d}', [14, 15]), over=True, level=-4)

# ── Scrimby: what he had (now through the bench), plus the steam hiss.
S('atkToken', rng(K_IMP, 'impactMetal_light_00{}', [0, 1, 2, 3, 4]), level=1)
S('cast:scrimby:1', rng(K_IMP, 'impactPlate_heavy_00{}', [1, 3]), level=3)
S('fx:manhole', rng(K_IMP, 'impactPlate_light_00{}', [0, 1, 2, 3, 4]), level=1)
S('fx:steamBurst', rng(K_IMP, 'impactPlate_heavy_00{}', [0, 2, 4]), over=True, level=0, **{'with': ['fx:steamBurst+hiss']})
S('fx:steamBurst+hiss', rng(STEAM, 'steam_hiss_{}', [1, 2, 3]), level=-1, max=1.8)
S('fx:jaywalk', rng(K_IMP, 'footstep_concrete_00{}', [0, 1, 2, 3, 4]), over=True, level=-2)
S('fx:mustard', rng(K_IMP, 'impactSoft_medium_00{}', [0, 1, 2, 3, 4]), over=True, level=0)
S('fx:expressCrash', rng(K_IMP, 'impactMetal_heavy_00{}', [0, 1, 3]), over=True, level=-4, **{'with': ['fx:expressCrash+crunch']})
S('fx:expressCrash+crunch', rng(CRUNCH, 'impactcrunch0{}.mp3', [4, 5]), level=-2)

out = {}
for key, (sources, o) in D.items():
    files = [find(pack or 'oga/', name) for pack, name in sources]
    entry = {'from': files}
    entry.update({k: v for k, v in o.items()})
    out[key] = entry
os.makedirs('sound-design', exist_ok=True)
json.dump(out, open('sound-design/recipe.json', 'w', encoding='utf-8', newline=''), indent=1)
print(len(out), 'keys,', sum(len(v['from']) for v in out.values()), 'files')
