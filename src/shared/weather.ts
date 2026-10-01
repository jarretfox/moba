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

export function pickWeather(random: () => number): Weather {
  let roll = random();
  for (const [w, chance] of WEATHER_CHANCES) {
    if (roll < chance) return w;
    roll -= chance;
  }
  return 'clear';
}
