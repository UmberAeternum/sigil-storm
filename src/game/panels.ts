import * as THREE from 'three';
import { makeHalo } from './glow';
import { makeTextSprite } from './fx';
import { Meta, THEMES, TRAILS, ACHIEVEMENTS, RANKS } from './meta';
import type { GameState } from './state';

/**
 * VR meta-menu: four orb buttons orbiting the altar (Growth / Shop / Daily /
 * Medals). Pinching one opens a world-space panel rendered to canvas.
 * The shop orb cycles owned biomes (purchases happen on the desktop screen).
 */

export type PageId = 'growth' | 'shop' | 'daily' | 'medals' | null;

interface OrbDef { id: Exclude<PageId, null>; label: string; color: number; angle: number }

const ORB_DEFS: OrbDef[] = [
  { id: 'growth', label: 'GROWTH', color: 0xb36bff, angle: -138 },
  { id: 'shop', label: 'SHOP', color: 0xffb347, angle: -166 },
  { id: 'daily', label: 'DAILY', color: 0x7ef0c2, angle: -14 },
  { id: 'medals', label: 'MEDALS', color: 0xff7d6e, angle: -42 },
];

export class MenuOrbs {
  private readonly items: { def: OrbDef; mesh: THREE.Mesh; label: THREE.Sprite }[] = [];
  private readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.055, 20, 14);
    for (const def of ORB_DEFS) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x141026, roughness: 0.2, metalness: 0.2,
        emissive: new THREE.Color(def.color), emissiveIntensity: 1.5,
      }));
      mesh.add(makeHalo(new THREE.Color(def.color), 0.34, 0.5));
      mesh.visible = false;
      this.group.add(mesh);
      const label = makeTextSprite(256, 80).sprite;
      label.scale.set(0.42, 0.13, 1);
      label.visible = false;
      this.group.add(label);
      this.items.push({ def, mesh, label });
    }
    scene.add(this.group);
  }

  setVisible(v: boolean): void {
    for (const it of this.items) {
      it.mesh.visible = v;
      it.label.visible = v;
    }
  }

  update(t: number, openPage: PageId): void {
    for (const it of this.items) {
      const a = (it.def.angle * Math.PI) / 180;
      const bob = Math.sin(t * 1.8 + a * 3) * 0.015;
      const pos = new THREE.Vector3(Math.sin(a) * 0.62, 0.98 + bob, -0.55 - Math.cos(a) * 0.18);
      it.mesh.position.copy(pos);
      it.label.position.copy(pos).add(new THREE.Vector3(0, -0.12, 0));
      const active = openPage === it.def.id;
      const pulse = active ? 1.35 + Math.sin(t * 6) * 0.12 : 1;
      it.mesh.scale.setScalar(pulse);
      (it.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 2.4 : 1.5;
    }
  }

  /** Pinch/hover targeting: returns the nearest orb id to pos within radius. */
  hit(pos: THREE.Vector3, radius = 0.12): PageId {
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      if (it.mesh.position.distanceTo(pos) < radius) return it.def.id;
    }
    return null;
  }

  rayHit(origin: THREE.Vector3, dir: THREE.Vector3, maxAngle = 0.995): PageId {
    const d = dir.clone().normalize();
    for (const it of this.items) {
      if (!it.mesh.visible) continue;
      const to = it.mesh.position.clone().sub(origin).normalize();
      if (to.dot(d) > maxAngle) return it.def.id;
    }
    return null;
  }
}

export class MetaPanel {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  visible = false;

  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.7, 1.0625, 1);
    this.sprite.position.set(0, 1.62, -1.85);
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  show(): void { this.visible = true; this.sprite.visible = true; }
  hide(): void { this.visible = false; this.sprite.visible = false; }

  private frame(title: string, accent: string): void {
    const g = this.ctx;
    g.clearRect(0, 0, 1024, 640);
    g.fillStyle = 'rgba(10, 12, 28, 0.88)';
    g.strokeStyle = accent;
    g.lineWidth = 3;
    const r = 26;
    g.beginPath();
    g.roundRect(6, 6, 1012, 628, r);
    g.fill();
    g.stroke();
    g.fillStyle = accent;
    g.font = '700 46px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(title.toUpperCase(), 44, 58);
    g.fillStyle = 'rgba(255,255,255,0.85)';
  }

  private rows(lines: { text: string; color?: string; size?: number }[], startY = 128, gap = 52): void {
    const g = this.ctx;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    let y = startY;
    for (const l of lines) {
      g.fillStyle = l.color ?? 'rgba(226,222,244,0.94)';
      g.font = `${l.size ?? 30}px "Segoe UI", system-ui, sans-serif`;
      g.fillText(l.text, 44, y);
      y += l.size && l.size > 34 ? gap + 10 : gap;
    }
  }

  growth(meta: Meta, last: { accuracyRune: number; accuracyThrow: number; reactionAvg: number } | null): void {
    const d = meta.data;
    const s = d.skills;
    this.frame('Growth Report', '#b36bff');
    const life = {
      rune: s.runeAttempted ? Math.round((s.runeHit / s.runeAttempted) * 100) : 0,
      throwAcc: s.throws ? Math.round((s.throwHits / s.throws) * 100) : 0,
      react: s.reactionN ? Math.round(s.reactionSum / s.reactionN) : 0,
    };
    const lastLine = last
      ? `Last run — runes ${Math.round(last.accuracyRune * 100)}% · throws ${Math.round(last.accuracyThrow * 100)}% · react ${Math.round(last.reactionAvg)}ms`
      : 'Finish a run to record your stats';
    const trend = meta.trends();
    const trendLine = trend.rune >= 0 ? `Lifetime — runes ${life.rune}% · throws ${life.throwAcc}% · reaction ${life.react}ms` : 'Skills build as you play more runs';
    const focus = d.skills.playSeconds > 60 ? `Focus training: ${Math.round(d.skills.playSeconds / 60)} min of sustained attention logged` : '';
    this.rows([
      { text: 'This game trains reaction speed, precision,', color: '#9a93c9', size: 26 },
      { text: 'working memory (runes) and sustained focus.', color: '#9a93c9', size: 26 },
      { text: ' ', size: 12 },
      { text: lastLine, color: '#7ef0c2', size: 30 },
      { text: trendLine, size: 28 },
      { text: `Perfect waves: ${s.perfectWaves} · best combo ×${s.bestCombo}`, size: 28 },
      { text: focus, color: '#ffb347', size: 28 },
      { text: ' ', size: 12 },
      { text: 'Rank ladder — ' + RANKS.map((r) => r.name).join(' → '), color: '#9a93c9', size: 24 },
      { text: `You are: ${meta.rank.name}${meta.rank.next ? ` · ${Math.round(meta.rank.progress * 100)}% to ${meta.rank.next}` : ' — top of the ladder!'}`, color: '#ffb347', size: 30 },
    ]);
  }

  shop(meta: Meta): void {
    this.frame('Altar Shop', '#ffb347');
    const lines: { text: string; color?: string; size?: number }[] = [
      { text: `Embers: ${meta.data.embers} ✦ · pinch the SHOP orb to cycle your biome`, color: '#7ef0c2', size: 28 },
      { text: ' ', size: 10 },
    ];
    for (const t of THEMES) {
      const owned = meta.data.themes.includes(t.id);
      const active = meta.data.activeTheme === t.id;
      lines.push({
        text: `${active ? '◆ ' : owned ? '· ' : '🔒 '}${t.name} — ${owned ? (active ? 'ACTIVE' : 'owned (cycle to equip)') : `${t.cost} ✦ — unlock on the desktop shop`}`,
        color: active ? '#ffb347' : owned ? '#e2def4' : '#9a93c9',
        size: 30,
      });
    }
    lines.push({ text: ' ', size: 10 });
    lines.push({ text: `Ember trail: ${meta.trail().name} · more trails on the desktop shop`, color: '#9a93c9', size: 26 });
    this.rows(lines);
  }

  daily(meta: Meta): void {
    this.frame('Daily Sigil', '#7ef0c2');
    const d = meta.daily;
    const done = meta.data.daily.done;
    this.rows([
      { text: d.desc, color: '#ffb347', size: 36 },
      { text: ' ', size: 14 },
      { text: `Reward: ${d.reward} ✦ · streak: ${meta.data.daily.streak} day${meta.data.daily.streak === 1 ? '' : 's'}`, size: 30 },
      { text: done ? '✔ Completed today — new challenge tomorrow!' : 'Start a run and complete it to claim', color: done ? '#7ef0c2' : 'rgba(226,222,244,0.9)', size: 28 },
      { text: ' ', size: 14 },
      { text: 'Dailies keep your skills sharp — come back', color: '#9a93c9', size: 26 },
      { text: 'every day to grow your streak.', color: '#9a93c9', size: 26 },
    ]);
  }

  medals(meta: Meta): void {
    this.frame('Medals', '#ff7d6e');
    const lines: { text: string; color?: string; size?: number }[] = [];
    for (const a of ACHIEVEMENTS) {
      const got = meta.data.achievements[a.id];
      lines.push({ text: `${got ? '🏅' : '·'} ${a.name} — ${a.desc}`, color: got ? '#ffd98a' : 'rgba(154,147,201,0.75)', size: 28 });
    }
    this.rows(lines, 120, 48);
  }

  scorePops: THREE.Sprite[] = [];
}

/** Floating "+N" score pop pool. */
export class ScorePops {
  private pool: { sprite: THREE.Sprite; t: number; vel: number }[] = [];

  constructor(scene: THREE.Scene, count = 10) {
    for (let i = 0; i < count; i++) {
      const { sprite } = makeTextSprite(256, 96);
      sprite.scale.set(0.6, 0.225, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, t: 0, vel: 0 });
    }
  }

  pop(pos: THREE.Vector3, text: string, color: string): void {
    const slot = this.pool.find((p) => !p.sprite.visible) ?? this.pool[0];
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const g = c.getContext('2d')!;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 58px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 16;
    g.fillText(text, 128, 48);
    const mat = slot.sprite.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = new THREE.CanvasTexture(c);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    slot.sprite.position.copy(pos);
    slot.sprite.visible = true;
    slot.t = 0;
    slot.vel = 0.8;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      p.sprite.position.y += p.vel * dt;
      p.vel *= 1 - dt * 1.5;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - p.t / 0.9);
      if (p.t > 0.9) p.sprite.visible = false;
    }
  }
}

export function gameStateSummary(s: GameState): { combo: number; wave: number } {
  return { combo: s.combo, wave: s.wave };
}
