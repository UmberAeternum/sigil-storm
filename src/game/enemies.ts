import * as THREE from 'three';
import { CFG, COL, type GameState } from './state';
import type { Particles } from './fx';
import { fresnelShell, makeHalo, tickFresnel } from './glow';

export type EnemyKind = 'wisp' | 'brute' | 'colossus';

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  hp: number;
  radius: number;
  speed: number;
  damage: number;
  score: number;
  mesh: THREE.Mesh;
  phase: number;
  slowTint: number;
  threatSince: number;   // s.time when it entered the threat ring (reaction metric)
}

interface Callbacks {
  onDeath(e: Enemy, reactionMs: number): void;
  onReachCore(e: Enemy): void;
}

const KIND_SPEC: Record<EnemyKind, { hp: number; radius: number; speedMul: number; damage: number; score: number; color: THREE.Color }> = {
  wisp: { hp: 1, radius: 0.13, speedMul: 1, damage: 1, score: 25, color: COL.wisp },
  brute: { hp: 3, radius: 0.22, speedMul: 0.8, damage: 2, score: 60, color: COL.brute },
  colossus: { hp: 10, radius: 0.42, speedMul: 0.42, damage: 4, score: 300, color: COL.colossus },
};

export function pickKind(wave: number): EnemyKind {
  if (wave % 3 === 0) return 'colossus';
  const bruteChance = Math.min(0.35, 0.05 + wave * 0.04);
  return Math.random() < bruteChance ? 'brute' : 'wisp';
}

export class Enemies {
  readonly pool: Enemy[] = [];
  private readonly fresnels: THREE.Mesh[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, envMap: THREE.Texture, private particles: Particles, private cbs: Callbacks) {
    const geos: Record<EnemyKind, THREE.BufferGeometry> = {
      wisp: new THREE.OctahedronGeometry(0.13),
      brute: new THREE.DodecahedronGeometry(0.22),
      colossus: new THREE.IcosahedronGeometry(0.42),
    };
    for (let i = 0; i < 56; i++) {
      const kind: EnemyKind = i < 36 ? 'wisp' : i < 50 ? 'brute' : 'colossus';
      const spec = KIND_SPEC[kind];
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color, roughness: 0.28, metalness: 0.35,
        envMap, envMapIntensity: 1.3,
        emissive: spec.color, emissiveIntensity: 0.5,
      });
      const mesh = new THREE.Mesh(geos[kind], mat);
      mesh.visible = false;
      const shell = fresnelShell(geos[kind], spec.color, { power: 2.2, intensity: 1.5 });
      mesh.add(shell);
      mesh.add(makeHalo(spec.color, spec.radius * 6, 0.35));
      scene.add(mesh);
      this.fresnels.push(shell);
      this.pool.push({
        active: false, kind, hp: spec.hp, radius: spec.radius, speed: 1,
        damage: spec.damage, score: spec.score, mesh, phase: 0, slowTint: 0, threatSince: 0,
      });
    }
  }

  aliveCount(): number {
    return this.pool.reduce((n, e) => n + (e.active ? 1 : 0), 0);
  }

  /** Activate a pooled enemy at the portal. ("emitEnemy" — game entity pool, not process spawn.) */
  emitEnemy(kind: EnemyKind, wave: number): void {
    const e = this.pool.find((x) => !x.active && x.kind === kind)
      ?? this.pool.find((x) => !x.active && x.kind !== 'colossus');
    if (!e) return; // pool exhausted — skip this one
    const spec = KIND_SPEC[kind];
    e.active = true;
    e.kind = kind;
    e.hp = spec.hp;
    e.radius = spec.radius;
    e.damage = spec.damage;
    e.score = spec.score;
    e.speed = CFG.enemySpeed(wave) * spec.speedMul;
    e.phase = Math.random() * Math.PI * 2; // gameplay jitter, not security randomness
    e.slowTint = 0;
    e.threatSince = 0;
    (e.mesh.material as THREE.MeshLambertMaterial).color.copy(spec.color);
    e.mesh.position.copy(CFG.portalPos);
    e.mesh.position.x += (Math.random() - 0.5) * 1.4;
    e.mesh.position.y += (Math.random() - 0.5) * 0.7;
    e.mesh.visible = true;
    e.mesh.scale.setScalar(0.2);
  }

  /** Wave machine + movement + collisions with the core/barrier. */
  update(dt: number, s: GameState, barrier: { active(): boolean; consume(): boolean }): void {
    if (s.phase === 'playing') {
      if (s.waveState === 'intermission') {
        s.waveTimer -= dt;
        if (s.waveTimer <= 0) {
          s.waveState = 'active';
          s.spawnLeft = CFG.waveSize(s.wave);
          s.spawnTimer = 0.4;
        }
      } else {
        s.spawnTimer -= dt;
        if (s.spawnLeft > 0 && s.spawnTimer <= 0) {
          this.emitEnemy(pickKind(s.wave), s.wave);
          s.spawnLeft -= 1;
          s.spawnTimer = CFG.spawnInterval(s.wave) / s.stormMult;
        }
        if (s.spawnLeft === 0 && this.aliveCount() === 0) {
          s.score += 100 * s.wave;
          s.wave += 1;
          s.waveState = 'intermission';
          s.waveTimer = CFG.intermissionSec;
        }
      }
    }

    const enemyDt = dt * (s.slowTimer > 0 ? CFG.slowFactor : 1);
    const mult = s.stormMult; // adaptive difficulty
    const barrierOn = barrier.active();
    for (const e of this.pool) {
      if (!e.active) continue;
      this.tmp.copy(CFG.corePos).sub(e.mesh.position);
      const dist = this.tmp.length();
      // absorb at the barrier shell
      if (barrierOn && dist < CFG.barrierRadius + e.radius) {
        if (barrier.consume()) {
          this.kill(e, false);
          continue;
        }
      }
      // reach the core
      if (dist < 0.32 + e.radius) {
        e.active = false;
        e.mesh.visible = false;
        this.particles.burst(e.mesh.position, 22, KIND_SPEC[e.kind].color, 1.6, 0.5);
        this.cbs.onReachCore(e);
        continue;
      }
      this.tmp.normalize();
      // lateral weave
      e.phase += enemyDt * 2.4;
      const weave = Math.sin(e.phase) * (e.kind === 'colossus' ? 0.12 : 0.45);
      const px = -this.tmp.z;
      const pz = this.tmp.x;
      const move = enemyDt * e.speed * mult;
      // reaction metric: clock starts when the wisp crosses the threat ring
      if (e.threatSince === 0 && dist < CFG.threatRing) e.threatSince = s.time;
      e.mesh.position.addScaledVector(this.tmp, move);
      e.mesh.position.x += px * weave * enemyDt;
      e.mesh.position.z += pz * weave * enemyDt;
      e.mesh.rotation.x += enemyDt * 1.4;
      e.mesh.rotation.y += enemyDt * 0.9;
      // spawn pop-in
      if (e.mesh.scale.x < 1) e.mesh.scale.setScalar(Math.min(1, e.mesh.scale.x + enemyDt * 2.4));
      // bullet-time tint
      const targetTint = s.slowTimer > 0 ? 1 : 0;
      e.slowTint += (targetTint - e.slowTint) * Math.min(1, dt * 6);
      const mat = e.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.5 + e.slowTint * 0.8;
    }
    // shimmer the fresnel shells
    for (let i = 0; i < this.fresnels.length; i++) {
      if (this.pool[i].active) tickFresnel(this.fresnels[i], s.time + i);
    }
  }

  damage(e: Enemy, amount: number, s: GameState, knockFrom?: THREE.Vector3): void {
    if (!e.active) return;
    e.hp -= amount;
    if (knockFrom) {
      this.tmp.copy(e.mesh.position).sub(knockFrom);
      if (this.tmp.lengthSq() > 1e-6) {
        this.tmp.normalize().multiplyScalar(0.28);
        e.mesh.position.add(this.tmp);
      }
    }
    if (e.hp <= 0) this.kill(e, true, s);
  }

  private kill(e: Enemy, scored: boolean, s?: GameState): void {
    e.active = false;
    e.mesh.visible = false;
    this.particles.burst(e.mesh.position, e.kind === 'colossus' ? 60 : e.kind === 'brute' ? 30 : 18, KIND_SPEC[e.kind].color, e.kind === 'colossus' ? 3.2 : 2.2, 0.7);
    if (scored && s) {
      s.combo = s.comboTimer > 0 ? s.combo + 1 : 1;
      s.comboTimer = 3.5;
      s.run.bestCombo = Math.max(s.run.bestCombo, s.combo);
      s.score += e.score * s.combo;
      s.kills += 1;
      const reactionMs = e.threatSince > 0 ? Math.round((s.time - e.threatSince) * 1000) : 0;
      this.cbs.onDeath(e, reactionMs);
    }
  }

  clearAll(): void {
    for (const e of this.pool) {
      e.active = false;
      e.mesh.visible = false;
    }
  }

  nearest(from: THREE.Vector3, exclude?: Set<Enemy>, maxDist = Infinity): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxDist;
    for (const e of this.pool) {
      if (!e.active || exclude?.has(e)) continue;
      const d = e.mesh.position.distanceTo(from);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}
