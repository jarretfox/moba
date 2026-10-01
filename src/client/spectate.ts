// Watching while you wait to respawn: the camera follows whoever killed you for a few seconds, then a
// teammate who's still standing. Space flips to the next teammate.

/** Seconds the camera stays on your killer before moving to a teammate. */
export const KILLER_TIME = 3;

export class Spectator {
  /** Who the camera is following, if anyone. */
  target: number | null = null;
  private killer: number | null = null;
  private killerUntil = 0;
  /** A teammate chosen with Space, kept until they fall. */
  private chosen: number | null = null;

  /** You just went down; `killer` is the champion who did it, if one did. */
  start(killer: number | null, now: number): void {
    this.killer = killer;
    this.killerUntil = now + KILLER_TIME;
    this.chosen = null;
    this.target = null;
  }

  stop(): void {
    this.killer = null;
    this.chosen = null;
    this.target = null;
  }

  /** Whether the camera is on the one who killed you. */
  get onKiller(): boolean {
    return this.target !== null && this.target === this.killer;
  }

  /** Moves on to the next living teammate (`allies` in a steady order). */
  next(allies: readonly number[]): void {
    if (!allies.length) return;
    const current = this.chosen ?? this.target;
    const at = current === null ? -1 : allies.indexOf(current);
    this.chosen = allies[(at + 1) % allies.length];
    this.killerUntil = 0;
  }

  /**
   * Who to follow this frame. `visible` says whether someone can be seen and is alive; `allies` are your
   * living teammates.
   */
  pick(now: number, visible: (id: number) => boolean, allies: readonly number[]): number | null {
    if (this.killer !== null && now < this.killerUntil && visible(this.killer)) this.target = this.killer;
    else if (this.chosen !== null && allies.includes(this.chosen)) this.target = this.chosen;
    else if (this.target !== null && this.target !== this.killer && allies.includes(this.target)) this.chosen = this.target;
    else this.target = this.chosen = allies[0] ?? null;
    return this.target;
  }
}
