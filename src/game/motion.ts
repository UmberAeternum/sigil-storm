/**
 * Motion craft: easing curves + frame-rate-independent smoothing.
 * Everything that used to move linearly or on a raw sine goes through here.
 */

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Overshoot settle — pops past 1 and eases back. 0→1 maps 0→1. */
export function easeOutBack(t: number): number {
  const c = 2.0;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
}

export function easeOutCubic(t: number): number {
  const x = 1 - clamp01(t);
  return 1 - x * x * x;
}

export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/** Exponential smoothing toward a target — frame-rate independent. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
