import * as THREE from 'three';
import { softGlowTexture, runeCircleTexture, makeHalo } from './glow';

/** GPU-friendly additive particle pool: one Points object, ring-buffer respawn. */
export class Particles {
  readonly points: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private cursor = 0;

  constructor(scene: THREE.Scene, n = 1800) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      vertexColors: true,
      map: softGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(center: THREE.Vector3, count: number, color: THREE.Color, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const j = idx * 3;
      this.pos[j] = center.x;
      this.pos[j + 1] = center.y;
      this.pos[j + 2] = center.z;
      // random direction on sphere (Marsaglia) — gameplay VFX, not security-sensitive
      let x = 0; let y = 0; let z = 0; let d2 = Infinity;
      while (d2 > 1 || d2 < 1e-6) {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        d2 = x * x + y * y + z * z;
      }
      const s = speed * (0.4 + Math.random() * 0.6);
      const inv = s / Math.sqrt(d2);
      this.vel[j] = x * inv;
      this.vel[j + 1] = y * inv;
      this.vel[j + 2] = z * inv;
      this.base[j] = color.r;
      this.base[j + 1] = color.g;
      this.base[j + 2] = color.b;
      this.life[idx] = life;
      this.maxLife[idx] = life;
    }
  }

  /** Particles born on a shell collapsing INWARD — death implosions. */
  implosion(center: THREE.Vector3, count: number, color: THREE.Color, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const j = idx * 3;
      let x = 0; let y = 0; let z = 0; let d2 = Infinity;
      while (d2 > 1 || d2 < 1e-6) {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        d2 = x * x + y * y + z * z;
      }
      const inv = 1 / Math.sqrt(d2);
      const r0 = 0.45 + Math.random() * 0.3;
      this.pos[j] = center.x + x * inv * r0;
      this.pos[j + 1] = center.y + y * inv * r0;
      this.pos[j + 2] = center.z + z * inv * r0;
      const s = speed * (0.7 + Math.random() * 0.6);
      this.vel[j] = -x * inv * s;
      this.vel[j + 1] = -y * inv * s;
      this.vel[j + 2] = -z * inv * s;
      this.base[j] = color.r;
      this.base[j + 1] = color.g;
      this.base[j + 2] = color.b;
      this.life[idx] = life;
      this.maxLife[idx] = life;
    }
  }

  /** Burst with a strong upward bias — nova pillars, geyser hits. */
  burstUp(center: THREE.Vector3, count: number, color: THREE.Color, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      const j = idx * 3;
      this.pos[j] = center.x + (Math.random() - 0.5) * 0.2;
      this.pos[j + 1] = center.y - 0.3;
      this.pos[j + 2] = center.z + (Math.random() - 0.5) * 0.2;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 0.45;
      const s = speed * (0.5 + Math.random() * 0.5);
      this.vel[j] = Math.cos(a) * rr * s;
      this.vel[j + 1] = s;
      this.vel[j + 2] = Math.sin(a) * rr * s;
      this.base[j] = color.r;
      this.base[j + 1] = color.g;
      this.base[j + 2] = color.b;
      this.life[idx] = life;
      this.maxLife[idx] = life;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.col[i * 3] !== 0) {
          this.col[i * 3] = 0; this.col[i * 3 + 1] = 0; this.col[i * 3 + 2] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      const j = i * 3;
      const drag = 1 - 1.8 * dt;
      this.vel[j] *= drag;
      this.vel[j + 1] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[j] = this.base[j] * k;
      this.col[j + 1] = this.base[j + 1] * k;
      this.col[j + 2] = this.base[j + 2] * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

interface Wave { mesh: THREE.Mesh; t: number; dur: number; maxR: number; mat: THREE.MeshBasicMaterial }

/** Expanding shockwave rings (nova, impacts). */
export class Shockwaves {
  private readonly pool: Wave[] = [];

  constructor(scene: THREE.Scene, count = 6) {
    const geo = new THREE.SphereGeometry(1, 20, 12);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, t: 0, dur: 0.5, maxR: 2, mat });
    }
  }

  pulse(pos: THREE.Vector3, color: THREE.Color, maxR: number, dur: number): void {
    const w = this.pool.find((x) => !x.mesh.visible) ?? this.pool[0];
    w.mesh.position.copy(pos);
    w.mesh.visible = true;
    w.t = 0;
    w.dur = dur;
    w.maxR = maxR;
    w.mat.color.copy(color);
  }

  update(dt: number): void {
    for (const w of this.pool) {
      if (!w.mesh.visible) continue;
      w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) { w.mesh.visible = false; continue; }
      const r = 0.08 + w.maxR * (1 - (1 - k) ** 2);
      w.mesh.scale.setScalar(r);
      w.mat.opacity = 0.75 * (1 - k);
    }
  }
}

const LIGHTNING_SEGS = 10;
const BOLT_GLOW_SPRITES = 7;

/** Cracked polyline flashes for chain lightning, with glow beads + crackle re-jitter. */
export class Lightning {
  private readonly slots: {
    line: THREE.Line;
    mat: THREE.MeshBasicMaterial;
    t: number;
    dur: number;
    a: THREE.Vector3;
    b: THREE.Vector3;
    sprites: THREE.Sprite[];
  }[] = [];

  constructor(scene: THREE.Scene, count = 4) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LIGHTNING_SEGS + 1) * 3), 3));
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat as unknown as THREE.LineBasicMaterial);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      const sprites: THREE.Sprite[] = [];
      for (let k = 0; k < BOLT_GLOW_SPRITES + 1; k++) {
        const s = makeHalo(new THREE.Color(0xffffff), 0.16, 0);
        s.visible = false;
        scene.add(s);
        sprites.push(s);
      }
      this.slots.push({ line, mat, t: 0, dur: 0.24, a: new THREE.Vector3(), b: new THREE.Vector3(), sprites });
    }
  }

  private reJitter(slot: (typeof this.slots)[number]): void {
    const attr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i <= LIGHTNING_SEGS; i++) {
      const t = i / LIGHTNING_SEGS;
      const j = i * 3;
      const jitter = i === 0 || i === LIGHTNING_SEGS ? 0 : 0.11;
      arr[j] = slot.a.x + (slot.b.x - slot.a.x) * t + (Math.random() * 2 - 1) * jitter;
      arr[j + 1] = slot.a.y + (slot.b.y - slot.a.y) * t + (Math.random() * 2 - 1) * jitter;
      arr[j + 2] = slot.a.z + (slot.b.z - slot.a.z) * t + (Math.random() * 2 - 1) * jitter;
    }
    attr.needsUpdate = true;
  }

  flash(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): void {
    const slot = this.slots.find((x) => !x.line.visible) ?? this.slots[0];
    slot.a.copy(a);
    slot.b.copy(b);
    this.reJitter(slot);
    slot.mat.color.copy(color);
    slot.mat.opacity = 1;
    slot.line.visible = true;
    slot.t = 0;
    // glow beads strung along the bolt + a brighter cap at the strike point
    for (let k = 0; k < slot.sprites.length; k++) {
      const s = slot.sprites[k];
      const end = k === slot.sprites.length - 1;
      const t = end ? 1 : k / BOLT_GLOW_SPRITES;
      s.position.lerpVectors(a, b, t);
      s.scale.setScalar(end ? 0.34 : 0.12 + Math.random() * 0.14);
      (s.material as THREE.SpriteMaterial).color.copy(color);
      (s.material as THREE.SpriteMaterial).opacity = end ? 0.95 : 0.6;
      s.visible = true;
    }
  }

  update(dt: number): void {
    for (const s of this.slots) {
      if (!s.line.visible) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) {
        s.line.visible = false;
        for (const sp of s.sprites) sp.visible = false;
        continue;
      }
      // crackle: the bolt keeps re-breaking itself in the first half of its life
      if (s.t < s.dur * 0.45) this.reJitter(s);
      s.mat.opacity = 1 - k;
      for (const sp of s.sprites) (sp.material as THREE.SpriteMaterial).opacity *= Math.max(0, 1 - dt * 7);
    }
  }
}

interface RuneRing { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; maxR: number; spin: number }

/** Expanding rune mandalas on the altar floor — one per spell cast. */
export class RuneRings {
  private readonly pool: RuneRing[] = [];

  constructor(scene: THREE.Scene, count = 5) {
    const tex = runeCircleTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, t: 0, dur: 0.9, maxR: 1.5, spin: 1 });
    }
  }

  ring(pos: THREE.Vector3, color: THREE.Color, maxR: number, dur = 0.9, spin = 1.4): void {
    const r = this.pool.find((x) => !x.mesh.visible) ?? this.pool[0];
    r.mesh.position.set(pos.x, pos.y + 0.02, pos.z);
    r.mesh.visible = true;
    r.t = 0;
    r.dur = dur;
    r.maxR = maxR;
    r.spin = spin;
    r.mat.color.copy(color);
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const scale = 0.15 + r.maxR * (1 - (1 - k) ** 2);
      r.mesh.scale.setScalar(scale);
      r.mesh.rotation.z += dt * r.spin * (1 - k);
      r.mat.opacity = 0.95 * (1 - k) * (0.4 + 0.6 * (1 - k));
    }
  }
}

/** Canvas-texture sprite for score / banners. */
export function makeTextSprite(width = 512, height = 160): { sprite: THREE.Sprite; draw(text: string, sub: string, accent: string): void } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.5, 1.5 * (height / width), 1);
  const draw = (text: string, sub: string, accent: string): void => {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = `700 ${sub ? 68 : 84}px "Segoe UI", system-ui, sans-serif`;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    ctx.fillText(text, width / 2, sub ? height * 0.36 : height / 2);
    if (sub) {
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(232,228,248,0.92)';
      ctx.font = `500 34px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(sub, width / 2, height * 0.74);
    }
    tex.needsUpdate = true;
  };
  return { sprite, draw };
}
