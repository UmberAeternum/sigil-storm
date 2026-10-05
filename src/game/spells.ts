import * as THREE from 'three';
import { CFG, COL, type GameState, type RuneName } from './state';
import type { Enemies, Enemy } from './enemies';
import type { Particles, Shockwaves, Lightning, RuneRings } from './fx';
import type { GameAudio } from './audio';
import { fresnelShell, tickFresnel, beamMaterial } from './glow';

/**
 * Air-stroke recognizer (a $1-recognizer distilled to the features that separate
 * exactly three rune classes): total turning → circle, corners → zigzag,
 * otherwise a line. Rotation/size invariant by construction.
 */
export function classifyStroke(raw: { x: number; y: number }[]): RuneName | null {
  const n = raw.length;
  if (n < CFG.strokeMinPoints) return null;

  // path length + bbox
  let len = 0;
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i > 0) len += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    minX = Math.min(minX, raw[i].x); maxX = Math.max(maxX, raw[i].x);
    minY = Math.min(minY, raw[i].y); maxY = Math.max(maxY, raw[i].y);
  }
  if (len < 0.05) return null; // too short to be intentional
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1e-6;
  const closure = Math.hypot(raw[n - 1].x - raw[0].x, raw[n - 1].y - raw[0].y) / len;

  // smoothed headings → total turning + corner count
  const headings: number[] = [];
  for (let i = 1; i < n; i++) {
    headings.push(Math.atan2(raw[i].y - raw[i - 1].y, raw[i].x - raw[i - 1].x));
  }
  // unwrap heading deltas so turning accumulates past ±180°
  for (let i = 1; i < headings.length; i++) {
    let d = headings[i] - headings[i - 1];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    headings[i] = headings[i - 1] + d;
  }
  let totalTurning = 0;
  let corners = 0;
  const win = Math.max(2, Math.floor(headings.length / 12));
  let runDir = 0;
  let runLen = 0;
  for (let i = 1; i < headings.length; i++) {
    const d = headings[i] - headings[i - 1];
    totalTurning += Math.abs(d);
    const dir = Math.sign(d);
    if (dir !== 0 && dir !== runDir) {
      if (runLen >= win && runDir !== 0) corners += 1;
      runDir = dir;
      runLen = 1;
    } else {
      runLen += 1;
    }
  }
  if (totalTurning > 4.4 && closure < 0.45) return 'circle';
  if (corners >= 2) return 'zigzag';
  if (len / diag < 2.4 && closure > 0.45) return 'line';
  if (totalTurning > 3.4 && closure < 0.6) return 'circle';
  return null;
}

interface Barrier {
  active(): boolean;
  consume(): boolean;
}

/** The three rune spells + cooldowns + barrier state. */
export class Spells {
  barrierCharges = 0;
  barrierTimer = 0;
  lastNovaKills = 0;
  private readonly barrierMesh: THREE.Mesh;
  private readonly barrierShell: THREE.Mesh;
  private readonly pillar: THREE.Mesh;
  private pillarT = 1; // 1 = idle/done
  private readonly visited = new Set<Enemy>();

  constructor(
    scene: THREE.Scene,
    private enemies: Enemies,
    private particles: Particles,
    private shockwaves: Shockwaves,
    private lightning: Lightning,
    private audio: GameAudio,
    private shake: (amount: number) => void,
    private rings: RuneRings,
  ) {
    this.barrierMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(CFG.barrierRadius, 1),
      new THREE.MeshBasicMaterial({
        color: COL.barrier, wireframe: true, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.barrierMesh.position.copy(CFG.corePos);
    scene.add(this.barrierMesh);
    this.barrierShell = fresnelShell(
      new THREE.IcosahedronGeometry(CFG.barrierRadius, 2), COL.barrier,
      { power: 2.2, intensity: 1.6, scale: 1.06 },
    );
    this.barrierShell.position.copy(CFG.corePos);
    this.barrierShell.visible = false;
    scene.add(this.barrierShell);

    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.75, 2.6, 24, 1, true),
      beamMaterial(COL.nova.clone()),
    );
    this.pillar.position.set(CFG.corePos.x, 0.9, CFG.corePos.z);
    this.pillar.visible = false;
    scene.add(this.pillar);
  }

  barrierInterface(): Barrier {
    return {
      active: () => this.barrierCharges > 0,
      consume: () => {
        if (this.barrierCharges <= 0) return false;
        this.barrierCharges -= 1;
        this.audio.shieldAbsorb();
        this.particles.burst(CFG.corePos, 14, COL.barrier, 1.8, 0.4);
        this.rings.ring(new THREE.Vector3(CFG.corePos.x, -0.04, CFG.corePos.z), COL.barrier, 0.9, 0.55, 2.2);
        return true;
      },
    };
  }

  cast(kind: RuneName, s: GameState): boolean {
    if (s.phase !== 'playing') return false;
    const ground = new THREE.Vector3(CFG.corePos.x, -0.045, CFG.corePos.z);
    const cd = s.cooldowns;
    if (kind === 'line') {
      if (cd.barrier > 0) return false;
      cd.barrier = CFG.barrierCooldown;
      this.barrierCharges = 3;
      this.barrierTimer = 12;
      this.audio.castOk();
      this.particles.burst(CFG.corePos, 30, COL.barrier, 1.6, 0.6);
      this.rings.ring(ground, COL.barrier, 1.6, 0.9, 1.8);
      return true;
    }
    if (kind === 'circle') {
      if (cd.nova > 0) return false;
      cd.nova = CFG.novaCooldown;
      this.shockwaves.pulse(CFG.corePos, COL.nova, CFG.novaRadius * 0.72, 0.55);
      this.particles.burst(CFG.corePos, 36, COL.nova, 4.5, 0.7);
      this.particles.burstUp(ground, 30, COL.nova, 4.2, 0.85);
      this.rings.ring(ground, COL.nova, CFG.novaRadius * 0.85, 0.8, 2.6);
      this.pillarT = 0;
      this.pillar.visible = true;
      this.audio.castOk();
      this.shake(0.5);
      s.run.novas += 1;
      let aliveBefore = 0;
      let aliveAfter = 0;
      for (const e of this.enemies.pool) {
        if (!e.active) continue;
        aliveBefore += 1;
        if (e.mesh.position.distanceTo(CFG.corePos) < CFG.novaRadius) {
          this.enemies.damage(e, 2, s, CFG.corePos);
        }
      }
      for (const e of this.enemies.pool) if (e.active) aliveAfter += 1;
      this.lastNovaKills = Math.max(0, aliveBefore - aliveAfter);
      return true;
    }
    // zigzag → chain lightning
    if (cd.chain > 0) return false;
    cd.chain = CFG.chainCooldown;
    this.rings.ring(ground, COL.chain, 1.3, 0.7, 3.2);
    this.visited.clear();
    let from = CFG.corePos.clone();
    let hits = 0;
    for (let i = 0; i < CFG.chainMaxTargets; i++) {
      const target = this.enemies.nearest(from, this.visited, CFG.chainLinkRange);
      if (!target) break;
      this.visited.add(target);
      this.lightning.flash(from, target.mesh.position, COL.chain);
      this.particles.burst(target.mesh.position, 10, COL.chain, 1.6, 0.4);
      this.enemies.damage(target, 1, s);
      from = target.mesh.position.clone();
      hits += 1;
    }
    if (hits > 0) this.audio.castOk();
    else this.audio.fizzle();
    return true;
  }

  update(dt: number, s: GameState): void {
    const mat = this.barrierMesh.material as THREE.MeshBasicMaterial;
    if (this.barrierCharges > 0) {
      this.barrierTimer -= dt;
      if (this.barrierTimer <= 0) this.barrierCharges = 0;
      this.barrierMesh.rotation.y += dt * 1.2;
      this.barrierMesh.rotation.x += dt * 0.5;
      mat.opacity = 0.14 + 0.1 * this.barrierCharges + Math.sin(s.time * 6) * 0.04;
      this.barrierMesh.scale.setScalar(1 + Math.sin(s.time * 4) * 0.02);
      this.barrierShell.visible = true;
      this.barrierShell.rotation.y -= dt * 0.4;
      tickFresnel(this.barrierShell, s.time);
    } else if (mat.opacity > 0) {
      mat.opacity = Math.max(0, mat.opacity - dt * 1.5);
      if (mat.opacity === 0) this.barrierShell.visible = false;
    }
    // nova pillar: slam wide and fade
    if (this.pillar.visible) {
      this.pillarT = Math.min(1, this.pillarT + dt / 0.55);
      const k = this.pillarT;
      const pmat = this.pillar.material as THREE.ShaderMaterial;
      pmat.uniforms.uTime.value = s.time;
      pmat.uniforms.uOpacity.value = 0.85 * (1 - k) * (1 - k);
      this.pillar.scale.set(1 + k * 1.6, 1, 1 + k * 1.6);
      if (k >= 1) this.pillar.visible = false;
    }
  }

  reset(): void {
    this.barrierCharges = 0;
    this.barrierTimer = 0;
    this.pillarT = 1;
    this.pillar.visible = false;
  }
}
