// Each match gets weather, rolled by the host when it starts and sent to everyone with their welcome, so
// the whole lobby plays in the same rain. Purely for looks and sound: it never touches the game.

export type Weather = 'clear' | 'rain' | 'storm' | 'snow' | 'autumn' | 'mist';

/** How often each comes up. */
export const WEATHER_CHANCES: readonly (readonly [Weather, number])[] = [
  ['clear', 0.3],
  ['rain', 0.18],
  ['storm', 0.12],
  ['snow', 0.13],
  ['autumn', 0.13],
  ['mist', 0.14],
];

/**
 * Whether the rain (or a storm) clears up partway through, and when (match seconds), or undefined if it
 * sets in for the whole match. Rolled with the weather.
 */
export const CLEARING = { chance: 0.45, from: 240, to: 600 };

export function rollClearing(weather: Weather, random: () => number): number | undefined {
  if (weather !== 'rain' && weather !== 'storm') return undefined;
  if (random() >= CLEARING.chance) return undefined;
  return Math.round(CLEARING.from + random() * (CLEARING.to - CLEARING.from));
}

export function pickWeather(random: () => number): Weather {
  let roll = random();
  for (const [w, chance] of WEATHER_CHANCES) {
    if (roll < chance) return w;
    roll -= chance;
  }
  return 'clear';
}
