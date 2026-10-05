import * as THREE from 'three';
import { CFG, type GameState } from './state';
import { makeTextSprite } from './fx';
import type { Meta } from './meta';
import type { AchievementDef } from './meta';

const HP_BARS = 12;

function hpString(hp: number): string {
  const filled = Math.max(0, Math.round((hp / CFG.coreHpMax) * HP_BARS));
  return `CORE ${'█'.repeat(filled)}${'░'.repeat(HP_BARS - filled)}`;
}

/** DOM HUD + world-space sprites for score / banners. */
export class Hud {
  private readonly elScore: HTMLElement;
  private readonly elWave: HTMLElement;
  private readonly elCombo: HTMLElement;
  private readonly elCore: HTMLElement;
  private readonly elStatus: HTMLElement;
  private readonly elVignette: HTMLElement;
  private readonly elOverlay: HTMLElement;
  private readonly elFoot: HTMLElement;
  private readonly scoreSprite;
  private readonly banner;
  private lastDrawn = '';

  constructor(scene: THREE.Scene) {
    this.elScore = document.getElementById('hud-score')!;
    this.elWave = document.getElementById('hud-wave')!;
    this.elCombo = document.getElementById('hud-combo')!;
    this.elCore = document.getElementById('hud-core')!;
    this.elStatus = document.getElementById('status')!;
    this.elVignette = document.getElementById('vignette')!;
    this.elOverlay = document.getElementById('overlay')!;
    this.elFoot = document.getElementById('overlay-foot')!;

    this.scoreSprite = makeTextSprite(512, 192);
    this.scoreSprite.sprite.position.set(CFG.corePos.x, CFG.corePos.y + 0.55, CFG.corePos.z);
    this.scoreSprite.sprite.scale.multiplyScalar(0.8);
    scene.add(this.scoreSprite.sprite);

    this.banner = makeTextSprite(512, 256);
    this.banner.sprite.position.set(0, 1.75, -2.3);
    this.banner.sprite.scale.multiplyScalar(1.6);
    scene.add(this.banner.sprite);
  }

  setOverlayVisible(v: boolean): void {
    this.elOverlay.classList.toggle('hidden', !v);
  }

  setFoot(text: string): void {
    this.elFoot.textContent = text;
  }

  setStatus(text: string): void {
    this.elStatus.textContent = text;
  }

  setHudVisible(v: boolean): void {
    const el = this.elScore.parentElement as HTMLElement;
    if (el) el.style.display = v ? 'block' : 'none';
  }

  setVignette(on: boolean): void {
    this.elVignette.style.opacity = on ? '1' : '0';
  }

  setButtons(previewLabel: string, vrEnabled: boolean, vrLabel: string): void {
    const btnPreview = document.getElementById('btn-preview')!;
    const btnVr = document.getElementById('btn-vr') as HTMLButtonElement;
    btnPreview.textContent = previewLabel;
    btnVr.disabled = !vrEnabled;
    btnVr.textContent = vrLabel;
  }

  onPreviewClick(cb: () => void): void {
    document.getElementById('btn-preview')!.addEventListener('click', cb);
  }

  onVrClick(cb: () => void): void {
    document.getElementById('btn-vr')!.addEventListener('click', cb);
  }

  // ── meta DOM ──────────────────────────────────────────────────────────────

  updateMenuChips(meta: Meta): void {
    const d = meta.data;
    const rank = meta.rank;
    document.getElementById('m-rank')!.innerHTML = `Rank — <b>${rank.name}</b>`;
    document.getElementById('m-level')!.innerHTML = `Level <b>${d.level}</b>`;
    document.getElementById('m-embers')!.innerHTML = `✦ <b>${d.embers}</b> Embers`;
    const daily = meta.daily;
    document.getElementById('m-daily')!.innerHTML = d.daily.done
      ? `Daily: <b>✔ done</b> (streak ${d.daily.streak})`
      : `Daily: <b>${daily.desc.length > 34 ? daily.desc.slice(0, 32) + '…' : daily.desc}</b>`;
    const lp = meta.levelProgress();
    (document.getElementById('m-xp-fill') as HTMLElement).style.width = `${Math.min(100, (lp.into / lp.need) * 100)}%`;
    const board = d.board.slice(0, 3).map((b, i) => `${i + 1}. <b>${b.score.toLocaleString()}</b> (wave ${b.wave})`).join(' &nbsp;·&nbsp; ');
    document.getElementById('m-board')!.innerHTML = board ? `HALL OF STORMS — ${board}` : 'No runs yet — your first storm awaits.';
  }

  toast(title: string, sub: string): void {
    const box = document.getElementById('toasts')!;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="t"></div><div class="s"></div>`;
    (el.querySelector('.t') as HTMLElement).textContent = title;
    (el.querySelector('.s') as HTMLElement).textContent = sub;
    box.appendChild(el);
    window.setTimeout(() => {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 420);
    }, 3800);
    while (box.children.length > 4) box.firstChild?.remove();
  }

  openModal(title: string, html: string): void {
    document.getElementById('modal-title')!.textContent = title;
    document.getElementById('modal-body')!.innerHTML = html;
    document.getElementById('modal')!.classList.add('open');
  }

  closeModal(): void {
    document.getElementById('modal')!.classList.remove('open');
  }

  onModalClose(cb: () => void): void {
    document.getElementById('modal-close')!.addEventListener('click', cb);
  }

  // ── game-over rewards screen ──────────────────────────────────────────────

  showGameover(opts: {
    score: number; best: number; isNewBest: boolean; wave: number; kills: number;
    rank: { name: string; next: string | null; progress: number };
    level: number; xpInto: number; xpNeed: number; xpGained: number; levelsGained: number;
    embersGained: number; accuracyRune: number; accuracyThrow: number; reactionAvg: number;
    bestCombo: number; perfectWaves: number; dailyDone: boolean; dailyDesc: string;
    newAchievements: AchievementDef[];
  }): void {
    document.getElementById('gameover')!.classList.add('open');
    (document.getElementById('go-score') as HTMLElement).textContent = opts.score.toLocaleString();
    document.getElementById('go-sub')!.textContent =
      `${opts.isNewBest ? '★ NEW PERSONAL BEST · ' : ''}wave ${opts.wave} · ${opts.kills} kills · best ${opts.best.toLocaleString()}`;
    (document.getElementById('go-rank-fill') as HTMLElement).style.width = `${opts.rank.progress * 100}%`;
    document.getElementById('go-xp-lbl')!.textContent =
      `LEVEL ${opts.level}${opts.levelsGained ? ` → ${opts.level}` : ''} · +${opts.xpGained} XP · +${opts.embersGained} ✦`;
    window.setTimeout(() => {
      (document.getElementById('go-xp-fill') as HTMLElement).style.width =
        `${Math.min(100, (opts.xpInto / opts.xpNeed) * 100)}%`;
    }, 120);
    const grid = document.getElementById('go-grid')!;
    const row = (k: string, v: string) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
    grid.innerHTML =
      row('Rune accuracy', `${Math.round(opts.accuracyRune * 100)}%`) +
      row('Throw accuracy', `${Math.round(opts.accuracyThrow * 100)}%`) +
      row('Avg reaction', `${Math.round(opts.reactionAvg)} ms`) +
      row('Best combo', `×${opts.bestCombo}`) +
      row('Perfect waves', `${opts.perfectWaves}`) +
      row('Skills trained', 'reaction · precision · memory · focus');
    document.getElementById('go-daily')!.textContent = opts.dailyDone
      ? `✦ Daily Sigil complete: ${opts.dailyDesc}`
      : '';
    document.getElementById('go-medals')!.textContent = opts.newAchievements.length
      ? `🏅 ${opts.newAchievements.map((a) => a.name).join(' · ')}`
      : '';
  }

  hideGameover(): void {
    document.getElementById('gameover')!.classList.remove('open');
  }

  onGoAgain(cb: () => void): void {
    document.getElementById('go-again')!.addEventListener('click', cb);
  }

  onGoMenu(cb: () => void): void {
    document.getElementById('go-menu')!.addEventListener('click', cb);
  }

  setSkipTutorialVisible(v: boolean): void {
    document.getElementById('skip-tutorial')!.style.display = v ? 'block' : 'none';
  }

  onSkipTutorial(cb: () => void): void {
    document.getElementById('skip-tutorial')!.addEventListener('click', cb);
  }

  flatUpdate(s: GameState): void {
    this.elScore.textContent = s.score.toLocaleString();
    this.elWave.textContent = `WAVE ${s.wave}${s.waveState === 'intermission' && s.phase === 'playing' ? ' — incoming…' : ''}`;
    this.elCombo.textContent = s.combo > 1 ? `COMBO ×${s.combo}` : '';
    this.elCore.textContent = hpString(s.coreHp);
  }

  worldUpdate(s: GameState): void {
    const key = `${s.score}|${s.combo}|${s.wave}|${s.coreHp}`;
    if (key === this.lastDrawn) return;
    this.lastDrawn = key;
    this.scoreSprite.draw(
      s.score.toLocaleString(),
      `WAVE ${s.wave}${s.combo > 1 ? ` · COMBO ×${s.combo}` : ''} · ${hpString(s.coreHp)}`,
      '#ffb347',
    );
  }

  showBanner(title: string, sub: string, accent = '#ffb347'): void {
    this.banner.draw(title, sub, accent);
    this.banner.sprite.visible = true;
  }

  hideBanner(): void {
    this.banner.sprite.visible = false;
  }

  bannerPulse(t: number): void {
    const k = 1 + Math.sin(t * 2.4) * 0.03;
    this.banner.sprite.scale.set(1.6 * k, 0.8 * k, 1);
  }
}
