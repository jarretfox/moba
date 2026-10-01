import type { ChampionId } from '../shared/champions/types';
import type { EmoteKind } from '../shared/protocol';

// What champions say: taunts, laughs, cheers, lines from their stories, and what they have to say after a
// kill. Logan and King Rix save something special for each other.

type Said = EmoteKind | 'kill';

const LINES: Record<ChampionId, Record<Said, readonly string[]>> = {
  marksman: {
    taunt: ['You can run. It won’t help.', 'I never miss twice.'],
    laugh: ['Heh. Predictable.', 'Ha! Too slow.'],
    cheer: ['Steady, everyone!', 'Eyes up — we’ve got this.'],
    line: ['Breathe. Aim. Loose.', 'One shot is all I need.', 'The steady hand wins.'],
    kill: ['Right where I aimed.', 'One arrow. One less problem.', 'Steady... and done.'],
  },
  barbarian: {
    taunt: ['Come on! Hit me!', 'Is that all you’ve got?!'],
    laugh: ['HAHAHA!', 'Ha! Pathetic!'],
    cheer: ['RAAAAH!', 'Smash them all!'],
    line: ['Chains couldn’t hold me. Neither will you.', 'More! MORE!', 'I broke the shackles. I’ll break you.'],
    kill: ['WHO’S NEXT?!', 'Too easy!', 'RAAAH! Next!'],
  },
  willmore: {
    taunt: ['I’ve fished better than you out of the drain.', 'Come down to the Deep, friend.'],
    laugh: ['Heh heh heh...', 'Hah! Gutter gold!'],
    cheer: ['For the sewers!', 'Up from the Deep!'],
    line: ['One man’s junk...', 'The Deep remembers.', 'Smells like home.'],
    kill: ['Down you go!', 'Another one for the pile.', 'The Deep takes you.'],
  },
  hunnag: {
    taunt: ['You smell... ripe.', 'Breathe deep, little one.'],
    laugh: ['Hee hee hee...', 'Ahh, sweet decay.'],
    cheer: ['Let it all rot!', 'Grow, my spores!'],
    line: ['Everything rots.', 'The Deep calls.', 'Spores in your lungs, friend.'],
    kill: ['Back to the soil.', 'Such lovely rot.', 'The mushrooms thank you.'],
  },
  logan: {
    taunt: ['Hear me ROAR!', 'You call that a fight?'],
    laugh: ['Ha! A kitten could do better.', 'Hah! Too slow for a lion.'],
    cheer: ['For the pride!', 'Together! Charge!'],
    line: ['The cage is open.', 'No more chains.', 'A lion doesn’t ask permission.'],
    kill: ['The pride stands!', 'That’s for the cage.', 'ROOOAR!'],
  },
  dongmaster: {
    taunt: ['You’re mogged.', 'Imagine skipping leg day.'],
    laugh: ['Hah. Cute.', 'Ha ha ha. Weak jaw.'],
    cheer: ['WE’RE ALL GONNA MAKE IT!', 'Stay hard, brothers!'],
    line: ['The jawline is a lifestyle.', 'Mewing in progress.', 'Never skipped a day. Not once.'],
    kill: ['Mogged.', 'Should’ve stayed in the gym.', 'Another rep.'],
  },
  dabber: {
    taunt: ['Smells like fear, man.', 'Come get a whiff.'],
    laugh: ['Hehehe... hehehe...', 'Heh. Heh. Whoa.'],
    cheer: ['Light ’em up!', 'Squeak squeak, baby!'],
    line: ['It’s all just smoke, man.', 'The Deep provides.', 'Did anyone else see that?'],
    kill: ['You got smoked.', 'Pass it on.', 'Hehehe... gone.'],
  },
  paris: {
    taunt: ['En garde, if you dare.', 'Is that your best? Charming.'],
    laugh: ['Ho ho ho!', 'Ah, magnifique.'],
    cheer: ['Encore! Encore!', 'Allons-y, mes amis!'],
    line: ['A gentleman never rushes his coffee.', 'Elegance is a weapon.', 'Footwork, footwork, footwork.'],
    kill: ['Touché.', 'Au revoir.', 'Merci for the lesson.'],
  },
  kingrix: {
    taunt: ['Kneel.', 'Know your place, peasant.'],
    laugh: ['Hohoho! Delightful.', 'Ha! The crown wins again.'],
    cheer: ['Onward, my loyal subjects!', 'For the crown!'],
    line: ['Taxes are due.', 'Long live the king.', 'Every crown needs a cage.'],
    kill: ['Your debt is paid.', 'The crown collects.', 'Kneel... forever.'],
  },
};

/** What they say after beating their rival. */
/** What they say after beating their rival, keyed "killer:victim". */
const RIVAL: Partial<Record<`${ChampionId}:${ChampionId}`, readonly string[]>> = {
  'logan:kingrix': ['Your cage is empty, Rix.', 'Long live the lion.', 'Kneel to THAT.'],
  'kingrix:logan': ['Back in your cage, kitten.', 'Every lion has a master.', 'Bad kitty.'],
  'dongmaster:barbarian': ['Rage is for people who skip leg day.', 'Mogged. Again.', 'Should’ve trained instead of yelling.'],
  'paris:kingrix': ['Your footwork was always sloppy, Majesty.', 'Lesson over.', 'Touché, Your Majesty.'],
  'kingrix:paris': ['You’re fired. Again.', 'Off with his beret!', 'Teach THAT.'],
  'barbarian:dongmaster': ['HOW’S THAT FOR A JAWLINE?!', 'Pretty face. Broke easy.', 'FLEX THAT!'],
};

/** The line a champion says for an emote; \`n\` picks which, the same on every screen. */
export function emoteLine(champ: ChampionId, kind: Said, n: number, vs?: ChampionId): string {
  const rival = kind === 'kill' && vs !== undefined ? RIVAL[`${champ}:${vs}`] : undefined;
  const lines = rival ?? LINES[champ][kind];
  return lines[Math.abs(Math.floor(n)) % lines.length];
}
