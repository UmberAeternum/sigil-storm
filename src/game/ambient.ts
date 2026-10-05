import * as THREE from 'three';
import type { GameState } from './state';
import type { SkyUniforms } from './glow';

/**
 * AmbientDirector — the "Lumen" system. The whole environment is an instrument:
 * lights, fog, sky and glow respond to gameplay with attack/decay envelopes.
 * Base palette drifts from cold indigo toward storm-crimson as waves climb.
 */

export type AmbientEvent =
  | 'nova' | 'barrier' | 'chain' | 'coreHit' | 'waveStart'
  | 'colossus' | 'slow' | 'gameover' | 'explode' | 'start';

interface Channel {
  value: number;   // 0..1 envelope
  decay: number;   // per second
  boost: number;   // effect strength
  color: THREE.Color;
  fogColor: THREE.Color;
}

const EVENTS: Record<AmbientEvent, { boost: number; decay: number; color: string; fog: string }> = {
  nova:      { boost: 0.8, decay: 2.2,  color: '#ffb347', fog: '#2b1c08' },
  explode:   { boost: 0.45, decay: 3.5, color: '#ffb347', fog: '#241708' },
  barrier:   { boost: 0.7, decay: 1.6,  color: '#6fd8ff', fog: '#08202e' },
  chain:     { boost: 0.8, decay: 3.0,  color: '#cfeaff', fog: '#0d2333' },
  coreHit:   { boost: 1.0, decay: 1.4,  color: '#ff3860', fog: '#2e0812' },
  waveStart: { boost: 0.75, decay: 0.9, color: '#ff5470', fog: '#250a16' },
  colossus:  { boost: 1.0, decay: 0.6,  color: '#ff2244', fog: '#33060f' },
  slow:      { boost: 0.9, decay: 0.55, color: '#8f7bff', fog: '#150b33' },
  gameover:  { boost: 1.0, decay: 0.35, color: '#ff3860', fog: '#20040b' },
  start:     { boost: 0.8, decay: 1.2,  color: '#7ef0c2', fog: '#0a2418' },
};

export class AmbientDirector {
  private channels: { event: AmbientEvent; ch: Channel }[] = [];
  private danger = 0; // 0..1 — grows with waves
  private dangerShown = -1;

  // driven objects
  private hemi: THREE.HemisphereLight;
  private coreLight: THREE.PointLight;
  private portalLight: THREE.PointLight;
  private accentLight: THREE.PointLight;
  private fog: THREE.FogExp2;
  private sky: SkyUniforms;
  private portalSurge: { value: number } | null;
  private baseFog = new THREE.Color('#05060d');
  private baseHemiSky = new THREE.Color('#8a7fd0');
  private baseHemiGround = new THREE.Color('#1a1430');

  /** cold indigo → storm crimson base palettes */
  private static PALETTES = [
    { fog: '#05060d', hemiSky: '#8a7fd0', ground: '#1a1430', top: '#0a0d22', horizon: '#2a1e52', accent: '#8f7bff' },
    { fog: '#0c0714', hemiSky: '#a08cc8', ground: '#221436', top: '#140b2b', horizon: '#4a2262', accent: '#b36bff' },
    { fog: '#150812', hemiSky: '#c088b8', ground: '#301428', top: '#1e0a24', horizon: '#6a2456', accent: '#ff5470' },
    { fog: '#1a0a10', hemiSky: '#d08898', ground: '#381420', top: '#260a1a', horizon: '#7a2040', accent: '#ff3860' },
  ];

  bloomStrength = 0.55;
  private themeTint = new THREE.Color('#8f7bff');

  /** Biome shop: tint accent lights toward the equipped theme. */
  setThemeTint(tint: string, _ember: string): void {
    this.themeTint.set(tint);
  }

  constructor(
    scene: THREE.Scene,
    lights: { hemi: THREE.HemisphereLight; coreLight: THREE.PointLight; portalLight: THREE.PointLight; accentLight: THREE.PointLight },
    sky: SkyUniforms,
    portalSurge?: { value: number },
  ) {
    this.fog = scene.fog as THREE.FogExp2;
    this.hemi = lights.hemi;
    this.coreLight = lights.coreLight;
    this.portalLight = lights.portalLight;
    this.accentLight = lights.accentLight;
    this.sky = sky;
    this.portalSurge = portalSurge ?? null;
    for (const event of Object.keys(EVENTS) as AmbientEvent[]) {
      const spec = EVENTS[event];
      this.channels.push({
        event,
        ch: { value: 0, decay: spec.decay, boost: spec.boost, color: new THREE.Color(spec.color), fogColor: new THREE.Color(spec.fog) },
      });
    }
  }

  fire(event: AmbientEvent): void {
    const c = this.channels.find((x) => x.event === event);
    if (c) c.ch.value = Math.min(1, c.ch.value + c.ch.boost);
    // the portal whirls up when the storm acts
    if (this.portalSurge) {
      const surge = event === 'waveStart' || event === 'colossus' ? 0.55
        : event === 'explode' ? 0.18
        : event === 'nova' ? 0.3
        : event === 'start' ? 0.4 : 0;
      this.portalSurge.value = Math.min(1, this.portalSurge.value + surge);
    }
  }

  private palette(t: number) {
    const P = AmbientDirector.PALETTES;
    const i = Math.min(P.length - 2, Math.floor(t * (P.length - 1)));
    const f = t * (P.length - 1) - i;
    const lerp = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), f);
    return {
      fog: lerp(P[i].fog, P[i + 1].fog),
      hemiSky: lerp(P[i].hemiSky, P[i + 1].hemiSky),
      ground: lerp(P[i].ground, P[i + 1].ground),
      top: lerp(P[i].top, P[i + 1].top),
      horizon: lerp(P[i].horizon, P[i + 1].horizon),
      accent: lerp(P[i].accent, P[i + 1].accent),
    };
  }

  update(dt: number, s: GameState, slowActive: boolean): void {
    // danger level from wave progression
    const target = Math.min(1, (s.wave - 1) / 9);
    if (s.wave !== this.dangerShown) {
      this.dangerShown = s.wave;
    }
    this.danger += (target - this.danger) * Math.min(1, dt * 0.25);
    const pal = this.palette(this.danger);

    // decay channels
    let sum = 0;
    const weights: Partial<Record<AmbientEvent, number>> = {};
    for (const { ch } of this.channels) {
      ch.value = Math.max(0, ch.value - ch.decay * ch.value * dt - 0.01 * dt);
      sum += ch.value;
      if (ch.value > 0.01) weights[this.channels.find((x) => x.ch === ch)!.event] = ch.value;
    }

    // blended event tint (weighted)
    const tint = new THREE.Color(0, 0, 0);
    const fogTint = new THREE.Color(0, 0, 0);
    for (const { ch } of this.channels) {
      if (ch.value <= 0.01) continue;
      tint.r += ch.color.r * ch.value;
      tint.g += ch.color.g * ch.value;
      tint.b += ch.color.b * ch.value;
      fogTint.r += ch.fogColor.r * ch.value;
      fogTint.g += ch.fogColor.g * ch.value;
      fogTint.b += ch.fogColor.b * ch.value;
    }

    // slow-mo holds a violet bed
    if (slowActive) {
      const c = this.channels.find((x) => x.event === 'slow')!.ch;
      c.value = Math.max(c.value, 0.85);
    }

    // base + danger + events → final colors (tint, not flood)
    this.fog.color.copy(this.baseFog).lerp(pal.fog, 0.85).lerp(fogTint, Math.min(0.55, sum * 0.35));
    this.hemi.color.copy(this.baseHemiSky).lerp(pal.hemiSky, 0.85).lerp(tint, Math.min(0.3, sum * 0.25));
    this.hemi.groundColor.copy(this.baseHemiGround).lerp(pal.ground, 0.85);
    this.hemi.intensity = 1.05 + sum * 0.4;
    this.sky.top.value.copy(pal.top).lerp(tint, Math.min(0.22, sum * 0.18));
    this.sky.bottom.value.copy(pal.fog).multiplyScalar(0.35);
    this.sky.horizon.value.copy(pal.horizon).lerp(tint, Math.min(0.45, sum * 0.35));
    this.sky.uTime.value = s.time;
    this.sky.uGlow.value = Math.min(2, sum);
    this.sky.uStorm.value = this.danger;
    if (this.portalSurge) this.portalSurge.value = Math.max(0, this.portalSurge.value - dt * 1.3);

    // lights
    this.coreLight.intensity = 2.2 + sum * 1.6 + (s.phase === 'gameover' ? 0 : 0);
    this.portalLight.intensity = 1.4 + (weights.waveStart ?? 0) * 3 + (weights.colossus ?? 0) * 4 + this.danger * 1.2;
    this.portalLight.color.copy(pal.accent).lerp(new THREE.Color('#ff5470'), 0.35 + (weights.colossus ?? 0));

    // accent light slowly orbits the altar, flaring with events
    const t = s.time;
    this.accentLight.position.set(Math.sin(t * 0.23) * 2.4, 1.6 + Math.sin(t * 0.4) * 0.5, Math.cos(t * 0.23) * 2.4 - 0.6);
    this.accentLight.color.copy(this.themeTint).lerp(pal.accent, 0.35).lerp(tint, Math.min(0.7, sum));
    this.accentLight.intensity = 1.6 + sum * 7 + this.danger * 1.5;

    // bloom breathes with events (flat mode)
    this.bloomStrength = 0.5 + sum * 0.85 + this.danger * 0.15;
  }
}
