import type { ChampionId } from '../../shared/champions/types';

/** A couple of lines of story for each champion, shown in champion select. (The full lore is in DESIGN.md.) */
export const LORE: Record<ChampionId, string> = {
  marksman: 'A hunter out of the Greenwood who has never needed a second arrow. Breathe, aim, loose: the fight is over before it starts.',
  barbarian: 'He broke out of the king’s fighting pit with his bare hands. The angrier he gets, the harder he hits, and he is always getting angrier.',
  willmore: 'A Chud who crawled up from the Deep and kept everything he found on the way. He has been picking fights with the Warden since he could walk.',
  hunnag: 'For years she has eaten away at the seal over the Deep with rot magic. Everything rots in the end, and she is in no hurry.',
  logan: 'Raised in the royal menagerie, he held the palace gate alone when the Chuds came up, and was locked in his cage for it. A week later the cage was empty.',
  dabber: 'Down in the Deep, the Rat King’s runaway son found HunnaG’s rot garden and ate everything in it. He came back up giggling, red-eyed and wrapped in a smoke that never quite clears. He has been trying to get a bite of Havarti for years.',
  dongmaster: 'One morning he was simply there, doing pull-ups on the Warden’s chains. He has never skipped a day, never lost a staring contest, and never been seen without his jawline. The Barbarian calls him a show-off.',
  kingrix: 'He hid in the treasury while the city burned, then decreed there is only one Lionheart, and he wears the crown. He wants his lion back in its cage.',
};
