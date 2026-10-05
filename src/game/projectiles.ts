import * as THREE from 'three';
import { CFG, COL, type GameState } from './state';
import type { Particles, Shockwaves } from './fx';
import type { Enemies } from './enemies';
import type { GameAudio } from './audio';
import { makeHalo, fresnelShell } from './glow';

export interface Orb {
  active: boolean;
  held: boolean;          // attached to a pinch
  thrown: boolean;        // in ballistic flight (never snap back to its home)
  anchor: number;         // rack anchor index it came from
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  bornAt: number;
}

interface Callbacks {
  onExplode(pos: THREE.Vector3, hitCount: number): void;
}

/** Ember orbs: rack regeneration, spring-follow while held, ballistic flight, AoE boom. */
export class Orbs {
  readonly pool: Orb[] = [];
  private readonly regen: number[]; // seconds left per anchor
  private readonly tmp2 = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private anchors: THREE.Vector3[],
    private enemies: Enemies,
    private particles: Particles,
    private shockwaves: Shockwaves,
    private audio: GameAudio,
    private cbs: Callbacks,
    private trailColor: () => THREE.Color,
  ) {
    this.regen = anchors.map(() => 0);
    const geo = new THREE.SphereGeometry(0.055, 20, 14);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4a2a08, roughness: 0.2, metalness: 0.2,
        emissive: COL.ember, emissiveIntensity: 2.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.add(makeHalo(COL.ember, 0.22, 0.45));
      // soap-film membrane: bright fresnel rim around each floating ember
      mesh.add(fresnelShell(geo, new THREE.Color('#bfe9ff'), { power: 2.6, intensity: 0.55, scale: 1.55 }));
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ active: false, held: false, thrown: false, anchor: -1, mesh, vel: new THREE.Vector3(), bornAt: 0 });
    }
  }

  private trailTimer = 0;

  private emitTrail(o: Orb, dt: number): void {
    // ember ribbon in the player's equipped trail color
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.016;
      this.particles.burst(o.mesh.position, 1, this.trailColor(), 0.25, 0.4);
    }
  }

  private placeAtAnchor(o: Orb, anchor: number): void {
    o.active = true;
    o.held = false;
    o.thrown = false;
    o.anchor = anchor;
    o.mesh.visible = true;
    o.mesh.position.copy(this.anchors[anchor]);
    o.vel.set(0, 0, 0);
    o.mesh.scale.setScalar(0.01);
    this.particles.burst(this.anchors[anchor], 8, this.trailColor(), 0.35, 0.35);
  }

  /** Grab the nearest idle orb to `pos`, if within reach. */
  grabNearest(pos: THREE.Vector3): Orb | null {
    let best: Orb | null = null;
    let bestD = CFG.grabRadius;
    for (const o of this.pool) {
      if (!o.active || o.held) continue;
      const d = o.mesh.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) {
      best.held = true;
      best.vel.set(0, 0, 0);
      this.audio.grab();
    }
    return best;
  }

  release(o: Orb, velocity: THREE.Vector3, s?: GameState): void {
    o.held = false;
    o.thrown = true;
    o.vel.copy(velocity).multiplyScalar(CFG.orbThrowBoost);
    if (o.vel.length() > CFG.orbSpeedMax) o.vel.setLength(CFG.orbSpeedMax);
    o.bornAt = performance.now() / 1000;
    this.audio.throwWhoosh();
    if (s) s.run.throws += 1;
  }

  /** If a held pinch ends without a throw, return the orb to its home slot. */
  cancel(o: Orb): void {
    o.held = false;
    o.thrown = false;
    if (o.anchor >= 0) {
      o.mesh.position.copy(this.anchors[o.anchor]);
      o.vel.set(0, 0, 0);
    } else {
      o.active = false;
      o.mesh.visible = false;
    }
  }

  heldOrbs(): Orb[] {
    return this.pool.filter((o) => o.active && o.held);
  }

  private explode(o: Orb, s: GameState): void {
    const pos = o.mesh.position.clone();
    this.particles.burst(pos, 26, COL.emberHot, 3, 0.55);
    this.shockwaves.pulse(pos, COL.ember, CFG.orbAoe, 0.32);
    this.audio.orbExplode();
    let hitCount = 0;
    for (const e of this.enemies.pool) {
      if (!e.active) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d < CFG.orbAoe + e.radius) {
        // Colossus weak point: a direct hit to the core shatters 2 HP
        const bonus = e.kind === 'colossus' && d < 0.3 ? 1 : 0;
        this.enemies.damage(e, 1 + bonus, s, pos);
        hitCount += 1;
        if (bonus > 0) this.particles.burst(e.mesh.position, 16, COL.nova, 2.4, 0.5);
      }
    }
    this.cbs.onExplode(pos, hitCount);
    if (hitCount > 0) s.run.throwHits += 1;
    o.active = false;
    o.held = false;
    o.mesh.visible = false;
    if (o.anchor >= 0) this.regen[o.anchor] = CFG.orbRegenSec;
    s.shake = Math.min(1, s.shake + 0.25);
  }

  resetAll(): void {
    for (const o of this.pool) {
      o.active = false;
      o.held = false;
      o.mesh.visible = false;
    }
    this.regen.fill(0);
    this.anchors.forEach((_, i) => {
      const o = this.pool.find((x) => !x.active);
      if (o) this.placeAtAnchor(o, i);
    });
  }

  update(dt: number, s: GameState): void {
    // rack regeneration
    for (let a = 0; a < this.regen.length; a++) {
      if (this.regen[a] > 0) {
        this.regen[a] -= dt;
        if (this.regen[a] <= 0) {
          const o = this.pool.find((x) => !x.active);
          if (o) this.placeAtAnchor(o, a);
        }
      }
    }

    const now = performance.now() / 1000;
    for (const o of this.pool) {
      if (!o.active || o.held) continue;

      // idle: drift around its home like a soap bubble
      if (o.anchor >= 0 && !o.thrown && o.vel.lengthSq() < 1e-6) {
        const home = this.anchors[o.anchor];
        const t = now + o.anchor * 2.399; // golden-angle phase spread
        o.mesh.position.set(
          home.x + Math.sin(t * 0.52) * 0.055 + Math.sin(t * 0.21 + 1.7) * 0.035,
          home.y + Math.sin(t * 0.63 + 0.9) * 0.045 + Math.sin(t * 0.17) * 0.03,
          home.z + Math.cos(t * 0.47 + 2.1) * 0.05,
        );
        // bubbles never overlap: push apart from nearby idle embers
        for (const b of this.pool) {
          if (b === o || !b.active || b.held || b.anchor < 0 || b.vel.lengthSq() >= 1e-6) continue;
          const dx = o.mesh.position.x - b.mesh.position.x;
          const dy = o.mesh.position.y - b.mesh.position.y;
          const dz = o.mesh.position.z - b.mesh.position.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 1e-6 && d2 < 0.0144) { // < 0.12 m
            const inv = 1 / Math.sqrt(d2);
            const push = (0.12 - Math.sqrt(d2)) * 0.5;
            o.mesh.position.x += dx * inv * push;
            o.mesh.position.y += dy * inv * push;
            o.mesh.position.z += dz * inv * push;
          }
        }
        const s = Math.min(1, o.mesh.scale.x + dt * 4);
        o.mesh.scale.setScalar(s >= 1 ? 1 + Math.sin(now * 2.8 + o.anchor * 1.7) * 0.035 : s);
        continue;
      }

      // ballistic flight
      o.mesh.position.addScaledVector(o.vel, dt);
      o.vel.y -= 0.12 * dt; // slight gravity arc
      o.mesh.scale.setScalar(1);
      this.emitTrail(o, dt);

      // despawn
      if (now - o.bornAt > CFG.orbDespawnSec) {
        o.active = false;
        o.mesh.visible = false;
        if (o.anchor >= 0) this.regen[o.anchor] = CFG.orbRegenSec;
        continue;
      }

      // proximity fuse → AoE detonation
      this.tmp2.copy(o.mesh.position);
      const hit = this.enemies.nearest(this.tmp2, undefined, CFG.orbDirectHit + 0.22);
      if (hit) this.explode(o, s);
    }
  }
}
