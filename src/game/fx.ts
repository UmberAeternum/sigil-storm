import * as THREE from 'three';
import { softGlowTexture } from './glow';

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

/** Cracked polyline flashes for chain lightning. */
export class Lightning {
  private readonly lines: { line: THREE.Line; mat: THREE.MeshBasicMaterial; t: number; dur: number }[] = [];

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
      this.lines.push({ line, mat, t: 0, dur: 0.22 });
    }
  }

  flash(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color): void {
    const slot = this.lines.find((x) => !x.line.visible) ?? this.lines[0];
    const attr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i <= LIGHTNING_SEGS; i++) {
      const t = i / LIGHTNING_SEGS;
      const j = i * 3;
      const jitter = i === 0 || i === LIGHTNING_SEGS ? 0 : 0.09;
      arr[j] = a.x + (b.x - a.x) * t + (Math.random() * 2 - 1) * jitter;
      arr[j + 1] = a.y + (b.y - a.y) * t + (Math.random() * 2 - 1) * jitter;
      arr[j + 2] = a.z + (b.z - a.z) * t + (Math.random() * 2 - 1) * jitter;
    }
    attr.needsUpdate = true;
    slot.mat.color.copy(color);
    slot.mat.opacity = 1;
    slot.line.visible = true;
    slot.t = 0;
  }

  update(dt: number): void {
    for (const s of this.lines) {
      if (!s.line.visible) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.line.visible = false; continue; }
      s.mat.opacity = 1 - k;
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
