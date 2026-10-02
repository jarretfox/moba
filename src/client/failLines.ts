import type { ChampionId } from '../shared/champions/types';
import type { CastFail } from '../shared/protocol';

// What your champion grumbles when a cast can't go: out of mana (or not angry enough yet), not ready, or
// nobody there to cast it on. Only you hear it, and not every time (see GameClient.grumble).

const LINES: Record<ChampionId, Record<CastFail, readonly string[]>> = {
  marksman: {
    mana: ['Insufficient funds.', 'That request is out of budget.'],
    cooldown: ['Not yet. There’s a waiting period.', 'Take a number.'],
    target: ['Object to whom, exactly?', 'There’s nobody there to deny.'],
  },
  barbarian: {
    mana: ['Not angry enough. YET.', 'Need more rage!'],
    cooldown: ['They’re jamming my signal!', 'Something’s blocking it. Suspicious.'],
    target: ['Nobody there. That’s what they WANT you to think.', 'Empty. Too empty.'],
  },
  willmore: {
    mana: ['Pockets are empty.', 'Nothin’ left in the sack.'],
    cooldown: ['Hold yer horses.', 'Still fishin’ it out.'],
    target: ['Nothin’ there but rats.', 'Who am I grabbin’, the air?'],
  },
  hunnag: {
    mana: ['The rot needs feeding.', 'Spores... spent.'],
    cooldown: ['Patience. Rot is slow.', 'It’s still growing.'],
    target: ['Nothing there to rot.', 'Nobody to spread to.'],
  },
  logan: {
    mana: ['Catching my breath.', 'Give me a moment.'],
    cooldown: ['Not yet. Steady.', 'Breathe, lion.'],
    target: ['No prey there.', 'Nothing to pounce on.'],
  },
  kingrix: {
    mana: ['The treasury is empty!', 'Royal coffers are dry.'],
    cooldown: ['The crown is not ready.', 'All in good time.'],
    target: ['Kneel? Who? There’s no one!', 'There is nobody to decree at.'],
  },
  dongmaster: {
    mana: ['Gotta carb up.', 'Out of gas, bro.'],
    cooldown: ['Rest day.', 'Muscles need recovery.'],
    target: ['Nobody to spot.', 'Who am I flexing on?'],
  },
  dabber: {
    mana: ['Outta the good stuff.', 'Stash is empty, man.'],
    cooldown: ['Gotta let it cure.', 'Chill. Chill.'],
    target: ['Light up who?', 'Nobody’s even sticky.'],
  },
  paris: {
    mana: ['Mon énergie... non.', 'I need a coffee.'],
    cooldown: ['Patience, mon ami.', 'Not yet. Breathe.'],
    target: ['En garde... against nobody?', 'There is no one to fence.'],
  },
  havarti: {
    mana: ['My curds are spent.', 'I need to rest my rind.'],
    cooldown: ['Still aging.', 'Good cheese takes time.'],
    target: ['None worthy of fondue.', 'There is no one to bless.'],
  },
  daltonomo: {
    mana: ['Out of tricks!', 'The hat is empty!'],
    cooldown: ['Wait for the punchline!', 'Timing is everything.'],
    target: ['Juggle what, the air?', 'No audience!'],
  },
  scrimby: {
    mana: ['I’m runnin’ on empty here.', 'Need a coffee.'],
    cooldown: ['Hold on, hold on!', 'The train’s delayed, okay?'],
    target: ['Who am I throwin’ at, the pigeons?', 'Nobody there, pal.'],
  },
  bigwhale: {
    mana: ['I’ll have my people sort that out.', 'Put it on my tab. What do you mean no?'],
    cooldown: ['Patience. Money takes time.', 'My assistant is on it.'],
    target: ['Who wants a tip? Anyone? Hello?', 'Nobody’s even looking at me.'],
  },
};

export function failLine(champ: ChampionId, why: CastFail, n: number): string {
  const lines = LINES[champ][why];
  return lines[Math.abs(n) % lines.length];
}
