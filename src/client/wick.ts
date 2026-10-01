// Old Wick, the peddler who keeps shop at each team's fountain: a hunched, hooded figure with glowing
// eyes, a pack full of who-knows-what and a lantern burning purple. Everything he says, and when he
// says it. He only talks to you (it's your shop), so none of this goes over the network.

export const WICK_NAME = 'Old Wick';

export type WickMoment = 'greet' | 'farewell' | 'welcomeBack' | 'buy' | 'bigBuy' | 'sell' | 'broke' | 'idle';

const LINES: Record<WickMoment, readonly string[]> = {
  greet: [
    'Ahhh... welcome, bloke.',
    'Got somethin’ that might interest ya...',
    'Come closer. I don’t bite. Much.',
    'Whatcha need, bloke? I’ve got it. Probably.',
    'Heh... I had a feelin’ you’d come.',
  ],
  farewell: ['Come back anytime...', 'Don’t die out there. Bad for business.', 'Heh heh... see ya soon, bloke.', 'Mind the Chuds.'],
  welcomeBack: ['Back so soon? Heh heh...', 'Dyin’s expensive, bloke.', 'Ohh, that looked like it hurt.', 'Rough out there, eh?'],
  buy: ['Heh heh heh... a fine choice.', 'Ohh, you’ll be back for more.', 'Pleasure doin’ business.', 'That one’s got a story. Don’t ask.', 'Heh heh... thank you!'],
  bigBuy: ['Ohhh... THAT one. Heh heh heh.', 'Now you’re talkin’, bloke!', 'Careful... that one bites back.'],
  sell: ['I’ll take that off your hands... cheap.', 'Hmm. Used. Heh.', 'Back in the pack it goes.'],
  broke: ['Not enough coin, bloke.', 'Come back with more gold, eh?', 'No coin, no wares.'],
  idle: ['Heh heh heh...', 'Lovely night for business.', 'Mmm... customers.'],
};

/** One of Wick's lines for the moment; `n` picks which, so a run of purchases doesn't repeat itself. */
export function wickLine(moment: WickMoment, n: number): string {
  const lines = LINES[moment];
  return lines[((Math.floor(n) % lines.length) + lines.length) % lines.length];
}

/** Within this distance of Wick he greets you; past FAR he says goodbye. The gap keeps him from chattering at the edge. */
export const NEAR = 650;
export const FAR = 950;

/**
 * Keeps track of where you are relative to Wick and decides when he speaks up on his own: a hello when
 * you walk up, a goodbye when you leave, a jab when you respawn next to him, and the odd mutter while
 * you browse. Purchases are reported to him separately.
 */
export class WickMood {
  private near = false;
  private wasDead = false;
  private quietUntil = 0;
  private lastIdle = 0;

  /** `distance` from your champion to Wick, `dead` whether you're waiting to respawn, `t` in seconds. */
  update(distance: number, dead: boolean, t: number): WickMoment | null {
    if (dead) {
      this.wasDead = true;
      this.near = false;
      return null;
    }
    if (this.wasDead) {
      this.wasDead = false;
      if (distance < NEAR) {
        this.near = true;
        this.lastIdle = t;
        return this.say('welcomeBack', t);
      }
    }
    if (!this.near && distance < NEAR) {
      this.near = true;
      this.lastIdle = t;
      return this.say('greet', t);
    }
    if (this.near && distance > FAR) {
      this.near = false;
      return this.say('farewell', t);
    }
    if (this.near && t - this.lastIdle > 14 && t >= this.quietUntil) {
      this.lastIdle = t;
      return this.say('idle', t);
    }
    return null;
  }

  /** A sale or a purchase just happened: he reacts, and keeps quiet a little while after. */
  heard(t: number): void {
    this.quietUntil = t + 4;
    this.lastIdle = t;
  }

  private say(moment: WickMoment, t: number): WickMoment | null {
    // At the start of a match you spawn right beside him; a greeting is still welcome then.
    if (t < this.quietUntil && moment !== 'welcomeBack') return null;
    this.quietUntil = t + 2.5;
    return moment;
  }
}
