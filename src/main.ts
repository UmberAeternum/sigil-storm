import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CFG, COL, createState, resetRun, saveBest, type GameState, type RuneName } from './game/state';
import { buildArena, type Arena } from './game/arena';
import { Particles, Shockwaves, Lightning, RuneRings } from './game/fx';
import { GameAudio } from './game/audio';
import { Enemies } from './game/enemies';
import { Orbs } from './game/projectiles';
import { Spells, classifyStroke } from './game/spells';
import { Hands, FlatInput, type PinchContext } from './game/hands';
import { Hud } from './game/hud';
import { AmbientDirector } from './game/ambient';
import { buildMoodEnvironment } from './game/glow';
import { Meta, THEMES, TRAILS, ACHIEVEMENTS } from './game/meta';
import { MenuOrbs, MetaPanel, ScorePops, type PageId } from './game/panels';

// ── renderer / scene ───────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060d);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
const rig = new THREE.Group();
rig.position.set(0, 1.1, 0.9);
rig.add(camera);
scene.add(rig);
camera.position.set(0, 0, 0);
camera.lookAt(CFG.corePos);

const envMap = buildMoodEnvironment(renderer);
scene.environment = envMap;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.55, 0.7, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── core systems ───────────────────────────────────────────────────────────
const state: GameState = createState();
const audio = new GameAudio();
const hud = new Hud(scene);
const arena: Arena = buildArena(scene, envMap);
const particles = new Particles(scene);
const shockwaves = new Shockwaves(scene);
const lightning = new Lightning(scene);
const runeRings = new RuneRings(scene);
const ambient = new AmbientDirector(scene, arena.lights, arena.skyUniforms, arena.portalSurge);
const meta = new Meta();
const menuOrbs = new MenuOrbs(scene);
const panel = new MetaPanel(scene);
const scorePops = new ScorePops(scene);

meta.onToast((t, s) => hud.toast(t, s));
meta.onJingle((k) => audio.jingle(k));
audio.setVolume(meta.data.settings.volume);

// ── theme application (biome shop) ─────────────────────────────────────────
function applyTheme(): void {
  const theme = meta.theme();
  const ember = new THREE.Color(theme.ember);
  const rune = new THREE.Color(theme.rune);
  ambient.setThemeTint(theme.tint, theme.ember);
  for (const o of orbs.pool) {
    const m = o.mesh.material as THREE.MeshStandardMaterial;
    m.emissive.copy(ember);
  }
  (arena.runes.material as THREE.MeshBasicMaterial).color.copy(rune);
  (arena.rim.material as THREE.MeshBasicMaterial).color.copy(rune).multiplyScalar(0.7);
  (arena.portalMat.uniforms.uColorA.value as THREE.Color).lerp(new THREE.Color(theme.tint), 0.25);
}

// ── enemies / orbs / spells ────────────────────────────────────────────────
const enemies = new Enemies(scene, envMap, particles, shockwaves, {
  onDeath: (e, reactionMs) => {
    audio.enemyDie(e.kind === 'colossus' ? 0.6 : e.kind === 'brute' ? 0.8 : 1);
    state.shake = Math.min(1, state.shake + (e.kind === 'colossus' ? 0.6 : 0.12));
    state.hitStop = 0.045;
    if (reactionMs > 0) {
      state.run.reactionSum += reactionMs;
      state.run.reactionN += 1;
    }
    if (e.kind === 'colossus') {
      state.run.colossusKills += 1;
      shockwaves.pulse(e.mesh.position, COL.colossus, 1.2, 0.4);
      ambient.fire('colossus');
    }
    const points = e.score * state.combo;
    scorePops.pop(e.mesh.position, `+${points}`, state.combo >= 5 ? '#7ef0c2' : '#ffd98a');
    if (state.combo === 5) hud.showBanner('COMBO ×5', 'blazing!', '#7ef0c2');
    if (state.combo === 10) hud.showBanner('COMBO ×10', 'tempest hands!', '#7ef0c2');
    meta.liveCheck({ combo: state.combo, wave: state.wave });
  },
  onReachCore: (e) => {
    state.coreHp -= e.damage;
    state.waveCoreDmg += e.damage;
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.min(1, state.shake + 0.5);
    audio.coreHit();
    ambient.fire('coreHit');
    if (state.coreHp <= 0) triggerGameOver();
  },
});

const orbs = new Orbs(scene, arena.rackAnchors, enemies, particles, shockwaves, audio, {
  onExplode: (_pos, hitCount) => {
    ambient.fire('explode');
    if (hitCount > 0) tutorialEvent('throwHit');
  },
}, () => new THREE.Color(meta.trail().color));

const spells = new Spells(scene, enemies, particles, shockwaves, lightning, audio, (a) => {
  state.shake = Math.min(1, state.shake + a);
}, runeRings);

// ── tutorial ───────────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  'Pinch an ember from the rack',
  'Throw it at a wisp!',
  'Pinch empty air and draw a LINE',
  'Now draw a CIRCLE — nova!',
  'Hold a FIST to bend time',
];
let tutorialTimer: number | null = null;

function tutorialEvent(kind: 'grab' | 'throwHit' | 'line' | 'circle' | 'fist'): void {
  if (state.tutorialStep < 0) return;
  const order = ['grab', 'throwHit', 'line', 'circle', 'fist'];
  const expected = order[state.tutorialStep];
  if (kind !== expected) return;
  state.tutorialStep += 1;
  if (tutorialTimer) { window.clearTimeout(tutorialTimer); tutorialTimer = null; }
  if (state.tutorialStep >= TUTORIAL_STEPS.length) {
    state.tutorialStep = -1;
    meta.data.settings.tutorialDone = true;
    meta.save();
    hud.setSkipTutorialVisible(false);
    hud.hideBanner();
    hud.toast('🎓 Training complete', 'The storm is yours. Grow your streak!');
    return;
  }
  hud.showBanner('TRAINING', TUTORIAL_STEPS[state.tutorialStep], '#7ef0c2');
  armTutorialTimeout();
}

function armTutorialTimeout(): void {
  if (tutorialTimer) window.clearTimeout(tutorialTimer);
  tutorialTimer = window.setTimeout(() => {
    if (state.tutorialStep >= 0) tutorialEvent((['grab', 'throwHit', 'line', 'circle', 'fist'] as const)[state.tutorialStep]);
  }, 45_000);
}

// ── interaction context (VR hands + flat mouse) ────────────────────────────
let openPage: PageId = null;

function togglePage(page: Exclude<PageId, null>): void {
  if (openPage === page) {
    openPage = null;
    panel.hide();
    return;
  }
  openPage = page;
  panel.show();
  if (page === 'growth') panel.growth(meta, lastReport);
  if (page === 'shop') panel.shop(meta);
  if (page === 'daily') panel.daily(meta);
  if (page === 'medals') panel.medals(meta);
  audio.uiClick();
}

const ctx: PinchContext = {
  orbs,
  audio,
  state: () => state,
  onPinchStart: (pos) => {
    if (state.phase === 'menu') {
      const page = menuOrbs.hit(pos, 0.12);
      if (page) {
        if (page === 'shop') {
          // shop orb cycles owned biomes
          const owned = THEMES.filter((t) => meta.data.themes.includes(t.id));
          const idx = owned.findIndex((t) => t.id === meta.data.activeTheme);
          meta.setTheme(owned[(idx + 1) % owned.length].id);
          applyTheme();
        }
        togglePage(page);
        return true;
      }
    }
    if (state.phase === 'menu' && pos.distanceTo(arena.startOrb.position) < 0.13) {
      startGame();
      return true;
    }
    if (gameOverOrbMode && pos.distanceTo(arena.restartOrb.position) < 0.13) {
      startGame();
      return true;
    }
    return false;
  },
  onStroke: (points) => {
    if (state.phase !== 'playing') return;
    state.run.runes += 1;
    const rune = classifyStroke(points);
    if (!rune) {
      audio.fizzle();
      return;
    }
    castRune(rune, true);
  },
  onFist: () => {
    if (state.phase !== 'playing' || state.cooldowns.slow > 0) return;
    state.cooldowns.slow = CFG.slowCooldown;
    state.slowTimer = CFG.slowDuration;
    state.run.slows += 1;
    audio.slowIn();
    ambient.fire('slow');
    tutorialEvent('fist');
    hud.showBanner('TIME BEND', '', '#8f7bff');
    window.setTimeout(() => { if (state.phase === 'playing') hud.hideBanner(); }, 800);
  },
  haptic: (handIndex, intensity, ms) => hands.haptic(handIndex, intensity, ms),
  onGrab: () => {
    tutorialEvent('grab');
  },
};

const hands = new Hands(renderer, scene, ctx);
const flat = new FlatInput(renderer.domElement, scene, () => camera, orbs, ctx);

// ── run lifecycle ──────────────────────────────────────────────────────────
let gameOverOrbMode = false;
let prevWave = 1;
let lastReport: { accuracyRune: number; accuracyThrow: number; reactionAvg: number } | null = null;

function startGame(): void {
  resetRun(state, meta.data.settings.calm);
  enemies.clearAll();
  orbs.resetAll();
  spells.reset();
  arena.restartOrb.visible = false;
  arena.startOrb.visible = false;
  menuOrbs.setVisible(false);
  panel.hide();
  openPage = null;
  gameOverOrbMode = false;
  prevWave = 1;
  hud.hideGameover();
  hud.hideBanner();
  audio.ensure();
  audio.setVolume(meta.data.settings.volume);
  audio.duckDrone(0.05);
  audio.waveStart();
  ambient.fire('start');
  if (!meta.data.settings.tutorialDone) {
    state.tutorialStep = 0;
    hud.showBanner('TRAINING', TUTORIAL_STEPS[0], '#7ef0c2');
    armTutorialTimeout();
    hud.setSkipTutorialVisible(true);
  }
  hud.showBanner('WAVE 1', state.wave % 3 === 0 ? 'a Colossus stirs…' : 'defend the core');
}

function triggerGameOver(): void {
  state.phase = 'gameover';
  saveBest(state);
  enemies.clearAll();
  for (const o of orbs.pool) { o.active = false; o.held = false; o.mesh.visible = false; }
  arena.restartOrb.visible = true;
  gameOverOrbMode = true;
  menuOrbs.setVisible(false);
  panel.hide();
  audio.gameOver();
  audio.duckDrone(0.015);
  audio.setMusicIntensity(0);
  ambient.fire('gameover');

  const summary = meta.finishRun({
    score: state.score,
    wave: state.wave,
    kills: state.kills,
    bestCombo: state.run.bestCombo,
    runeAttempted: state.run.runes,
    runeHit: state.run.runeHits,
    throws: state.run.throws,
    throwHits: state.run.throwHits,
    reactionSum: state.run.reactionSum,
    reactionN: state.run.reactionN,
    novas: state.run.novas,
    slows: state.run.slows,
    colossusKills: state.run.colossusKills,
    seconds: Math.round(state.run.seconds),
    perfectWaves: state.run.perfectWaves,
  });
  lastReport = { accuracyRune: summary.accuracyRune, accuracyThrow: summary.accuracyThrow, reactionAvg: summary.reactionAvg };

  hud.showBanner('GAME OVER', `best ${state.best.toLocaleString()} — pinch the gold orb`, '#ff7d6e');
  const isNewBest = state.score >= state.best && state.score > 0;
  hud.showGameover({
    score: state.score, best: state.best, isNewBest, wave: state.wave, kills: state.kills,
    rank: meta.rank,
    level: meta.data.level, xpInto: meta.levelProgress().into, xpNeed: meta.levelProgress().need,
    xpGained: summary.xpGained, levelsGained: summary.levelsGained, embersGained: summary.embersGained,
    accuracyRune: summary.accuracyRune, accuracyThrow: summary.accuracyThrow, reactionAvg: summary.reactionAvg,
    bestCombo: state.run.bestCombo, perfectWaves: state.run.perfectWaves,
    dailyDone: summary.dailyDone, dailyDesc: meta.daily.desc,
    newAchievements: summary.newAchievements,
  });
  if (summary.levelsGained > 0) audio.jingle('level');
}

function castRune(rune: RuneName, fromStroke: boolean): void {
  const names: Record<RuneName, string> = { line: 'BARRIER', circle: 'NOVA', zigzag: 'CHAIN LIGHTNING' };
  const ok = spells.cast(rune, state);
  if (!fromStroke) state.run.runes += 1;
  if (ok) {
    state.run.runeHits += 1;
    audio.castOk();
    ambient.fire(rune === 'line' ? 'barrier' : rune === 'circle' ? 'nova' : 'chain');
    state.shake = Math.min(1, state.shake + 0.15);
    if (rune === 'circle' && spells.lastNovaKills >= 3) hud.showBanner('TRINITY BREAK!', `${spells.lastNovaKills} shattered by one nova`, '#ffd98a');
    else hud.showBanner(names[rune], '', '#7ef0c2');
    if (rune === 'line' || rune === 'circle') tutorialEvent(rune);
    window.setTimeout(() => { if (state.phase === 'playing') hud.hideBanner(); }, 900);
  } else {
    audio.fizzle();
    hud.showBanner(names[rune], 'recharging…', '#6a639b');
    window.setTimeout(() => { if (state.phase === 'playing') hud.hideBanner(); }, 700);
  }
}

// ── VR session management ──────────────────────────────────────────────────
async function enterVr(): Promise<void> {
  if (!navigator.xr) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'hand-tracking', 'bounded-floor'],
    });
    await renderer.xr.setSession(session);
  } catch (err) {
    hud.setStatus(`VR session failed: ${String(err)}`);
  }
}

let xrSupported = false;
void (async () => {
  try {
    xrSupported = await navigator.xr?.isSessionSupported('immersive-vr') ?? false;
  } catch { xrSupported = false; }
  hud.setButtons('PLAY PREVIEW', xrSupported, xrSupported ? 'ENTER VR' : 'VR NOT DETECTED');
  hud.setStatus(xrSupported
    ? 'WebXR ready — enable hand tracking in Quest settings, then pinch the green orb'
    : 'No immersive-vr device — preview mode with mouse + keys');
  refreshOverlay();
})();

let paused = true;

function refreshOverlay(): void {
  hud.updateMenuChips(meta);
}

hud.onVrClick(() => {
  audio.ensure();
  if (xrSupported) void enterVr();
});

hud.onPreviewClick(() => {
  audio.ensure();
  setPaused(false);
});

function setPaused(p: boolean): void {
  paused = p;
  hud.setOverlayVisible(p);
  hud.setHudVisible(!p);
  flat.enabled = !p && !renderer.xr.isPresenting;
  refreshOverlay();
  if (!p && state.phase === 'menu') {
    menuOrbs.setVisible(true);
    hud.showBanner('SIGIL STORM', 'pinch the green orb to begin', '#7ef0c2');
  }
  if (p) { hud.hideBanner(); panel.hide(); openPage = null; }
}

renderer.xr.addEventListener('sessionend', () => {
  setPaused(true);
  hud.setButtons('RESUME PREVIEW', xrSupported, xrSupported ? 'RE-ENTER VR' : 'VR NOT DETECTED');
});
renderer.xr.addEventListener('sessionstart', () => {
  setPaused(false);
  audio.ensure();
});

// ── DOM wiring ─────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (paused) {
    if (e.code === 'Enter' || e.code === 'Space') { audio.ensure(); setPaused(false); }
    return;
  }
  const casts: Record<string, RuneName> = { Digit1: 'line', Digit2: 'circle', Digit3: 'zigzag' };
  if (casts[e.code] && !e.repeat) castRune(casts[e.code], false);
  if (!e.repeat && e.code === 'KeyR' && state.phase === 'gameover') startGame();
  if (!e.repeat && (e.code === 'Enter' || e.code === 'Space')) {
    if (state.phase === 'menu' || state.phase === 'gameover') startGame();
  }
  if (!e.repeat && (e.code === 'ShiftLeft' || e.code === 'KeyF')) ctx.onFist();
});

const menuRay = new THREE.Raycaster();
const menuNdc = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (paused) return;
  menuNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  menuRay.setFromCamera(menuNdc, camera);
  if (state.phase === 'menu') {
    // menu orbs first (flat clicking), then the start orb
    for (const it of [menuOrbs] as unknown as { rayHit(o: THREE.Vector3, d: THREE.Vector3): PageId }[]) {
      const page = it.rayHit(menuRay.ray.origin, menuRay.ray.direction);
      if (page) {
        if (page === 'shop') {
          const owned = THEMES.filter((t) => meta.data.themes.includes(t.id));
          const idx = owned.findIndex((t) => t.id === meta.data.activeTheme);
          meta.setTheme(owned[(idx + 1) % owned.length].id);
          applyTheme();
        }
        togglePage(page);
        return;
      }
    }
    if (menuRay.ray.distanceToPoint(arena.startOrb.position) < 0.34) { startGame(); return; }
  }
  if (gameOverOrbMode && menuRay.ray.distanceToPoint(arena.restartOrb.position) < 0.34) startGame();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// DOM meta screens
hud.onModalClose(() => hud.closeModal());
hud.onGoAgain(() => { hud.hideGameover(); startGame(); });
hud.onGoMenu(() => {
  hud.hideGameover();
  state.phase = 'menu';
  arena.startOrb.visible = true;
  setPaused(true);
});
hud.onSkipTutorial(() => {
  state.tutorialStep = -1;
  meta.data.settings.tutorialDone = true;
  meta.save();
  hud.setSkipTutorialVisible(false);
  hud.hideBanner();
});

function modalGrowth(): void {
  const s = meta.data.skills;
  const acc = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const react = s.reactionN ? Math.round(s.reactionSum / s.reactionN) + ' ms' : '—';
  hud.openModal('Growth Report', `
    <p>This game trains <b>reaction speed</b>, <b>throw precision</b>, <b>working memory</b> (runes)
    and <b>sustained focus</b> — adaptive difficulty keeps every player in their growth zone.</p>
    <h4>Lifetime skills</h4>
    <div class="grid2">
      <div class="stat"><span>Rune accuracy</span><b>${acc(s.runeHit, s.runeAttempted)}</b></div>
      <div class="stat"><span>Throw accuracy</span><b>${acc(s.throwHits, s.throws)}</b></div>
      <div class="stat"><span>Avg reaction</span><b>${react}</b></div>
      <div class="stat"><span>Best combo</span><b>×${s.bestCombo}</b></div>
      <div class="stat"><span>Perfect waves</span><b>${s.perfectWaves}</b></div>
      <div class="stat"><span>Focus time</span><b>${Math.round(s.playSeconds / 60)} min</b></div>
    </div>
    <h4>Rank ladder</h4>
    <div class="stat"><span>Current</span><b>${meta.rank.name}${meta.rank.next ? ` (${Math.round(meta.rank.progress * 100)}% to ${meta.rank.next})` : ' — maximum!'}</b></div>`);
}

function modalShop(): void {
  const d = meta.data;
  const themeRow = (t: typeof THEMES[number]) => {
    const owned = d.themes.includes(t.id);
    const active = d.activeTheme === t.id;
    return `<div class="item"><span class="dot" style="background:${t.tint}"></span>
      <span class="nm">${t.name}${active ? ' — <b style="color:#ffb347">active</b>' : ''}</span>
      <span class="pr">${owned ? 'owned' : `${t.cost} ✦`}</span>
      <button data-theme="${t.id}" ${(!owned || active) ? 'disabled' : ''}>${owned ? 'Equip' : 'Unlock'}</button></div>`;
  };
  const trailRow = (t: { id: string; name: string; cost: number; color: string }) => {
    const owned = d.trails.includes(t.id);
    const active = d.activeTrail === t.id;
    return `<div class="item"><span class="dot" style="background:${t.color}"></span>
      <span class="nm">${t.name}${active ? ' — <b style="color:#ffb347">active</b>' : ''}</span>
      <span class="pr">${owned ? 'owned' : `${t.cost} ✦`}</span>
      <button data-trail="${t.id}" ${(!owned || active) ? 'disabled' : ''}>${owned ? 'Equip' : 'Unlock'}</button></div>`;
  };
  hud.openModal('Altar Shop', `
    <p>Embers: <b style="color:#ffb347">${d.embers} ✦</b></p>
    <h4>Altar biomes</h4>
    ${THEMES.map(themeRow).join('')}
    <h4>Ember trails</h4>
    ${TRAILS.map(trailRow).join('')}`);
  document.getElementById('modal-body')!.querySelectorAll('button[data-theme]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.theme!;
      if (meta.data.themes.includes(id)) meta.setTheme(id);
      else if (!meta.buyTheme(id)) return;
      applyTheme();
      modalShop();
    });
  });
  document.getElementById('modal-body')!.querySelectorAll('button[data-trail]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.trail!;
      if (meta.data.trails.includes(id)) meta.setTrail(id);
      else if (!meta.buyTrail(id)) return;
      modalShop();
    });
  });
}

function modalDaily(): void {
  const d = meta.daily;
  const done = meta.data.daily.done;
  hud.openModal('Daily Sigil', `
    <p style="font-size:16px;color:#ffb347"><b>${d.desc}</b></p>
    <p>Reward: <b>${d.reward} ✦</b> · streak: <b>${meta.data.daily.streak} day${meta.data.daily.streak === 1 ? '' : 's'}</b></p>
    <p>${done ? '✔ Completed today — a new challenge arrives tomorrow. Streaks keep skills sharp!' : 'Start a run and complete the objective to claim the reward.'}</p>`);
}

function modalMedals(): void {
  hud.openModal('Medals', ACHIEVEMENTS.map((a) => {
    const got = meta.data.achievements[a.id];
    return `<div class="item"><span class="dot" style="background:${got ? '#ffd98a' : '#3a3560'}"></span>
      <span class="nm">${a.name} — <span style="color:#9a93c9">${a.desc}</span></span>${got ? '<span class="pr">🏅</span>' : ''}</div>`;
  }).join(''));
}

function modalSettings(): void {
  const st = meta.data.settings;
  hud.openModal('Settings', `
    <label>Volume <input type="range" id="st-vol" min="0" max="100" value="${Math.round(st.volume * 100)}"></label>
    <label><input type="checkbox" id="st-music" ${st.musicOn ? 'checked' : ''}> Music pulse</label>
    <label><input type="checkbox" id="st-calm" ${st.calm ? 'checked' : ''}> Calm mode (no fail — for younger players)</label>
    <label><input type="checkbox" id="st-fx" ${st.effects > 1 ? 'checked' : ''}> Extra effects (shake & particles)</label>
    <p style="color:#9a93c9;font-size:12px">Resets progress, XP and unlocks.</p>
    <button class="small" id="st-reset">Reset all progress</button>`);
  document.getElementById('st-vol')!.addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value) / 100;
    meta.setSettings({ volume: v });
    audio.setVolume(v);
  });
  document.getElementById('st-music')!.addEventListener('change', (e) => meta.setSettings({ musicOn: (e.target as HTMLInputElement).checked }));
  document.getElementById('st-calm')!.addEventListener('change', (e) => meta.setSettings({ calm: (e.target as HTMLInputElement).checked }));
  document.getElementById('st-fx')!.addEventListener('change', (e) => meta.setSettings({ effects: (e.target as HTMLInputElement).checked ? 1.4 : 1 }));
  document.getElementById('st-reset')!.addEventListener('click', () => {
    meta.resetAll();
    applyTheme();
    refreshOverlay();
    hud.closeModal();
    hud.toast('Progress reset', 'A fresh storm begins.');
  });
}

document.getElementById('btn-growth')!.addEventListener('click', () => { audio.ensure(); modalGrowth(); });
document.getElementById('btn-shop')!.addEventListener('click', () => { audio.ensure(); modalShop(); });
document.getElementById('btn-daily')!.addEventListener('click', () => { audio.ensure(); modalDaily(); });
document.getElementById('btn-medals')!.addEventListener('click', () => { audio.ensure(); modalMedals(); });
document.getElementById('btn-settings')!.addEventListener('click', () => { audio.ensure(); modalSettings(); });

// ── main loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const rawDt = Math.min(0.05, clock.getDelta());
  const dt = state.hitStop > 0 ? rawDt * 0.12 : rawDt;
  if (state.hitStop > 0) state.hitStop -= rawDt;
  const t = state.time;

  if (!paused) {
    state.time += dt;
    if (state.phase === 'playing') state.run.seconds += dt;

    for (const k of ['barrier', 'nova', 'chain', 'slow'] as const) {
      if (state.cooldowns[k] > 0) state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dt);
    }
    if (state.slowTimer > 0) state.slowTimer = Math.max(0, state.slowTimer - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    hands.update(dt, renderer.xr.isPresenting ? renderer.xr.getCamera() : camera, state);
    flat.update(dt, camera, state);

    if (state.phase === 'playing' || state.phase === 'gameover') {
      enemies.update(dt, state, spells.barrierInterface());
      orbs.update(dt, state);
      spells.update(dt, state);
      if (state.wave !== prevWave) {
        prevWave = state.wave;
        if (state.phase === 'playing') {
          // adaptive difficulty: perfect wave → storm rises; rough wave → it eases
          if (state.waveCoreDmg === 0) {
            state.run.perfectWaves += 1;
            state.stormMult = Math.min(1.35, state.stormMult * 1.08);
          } else if (state.waveCoreDmg >= 3) {
            state.stormMult = Math.max(0.75, state.stormMult * 0.9);
          }
          state.waveCoreDmg = 0;
          if (meta.data.settings.calm) state.coreHp = Math.min(CFG.coreHpCalm, state.coreHp + 2);
          audio.waveStart();
          const colossusWave = state.wave % 3 === 0;
          ambient.fire(colossusWave ? 'colossus' : 'waveStart');
          hud.showBanner(
            `WAVE ${state.wave}`,
            colossusWave ? 'a Colossus stirs…' : 'defend the core',
            colossusWave ? '#ff7d6e' : '#ffb347',
          );
          window.setTimeout(() => { if (state.phase === 'playing') hud.hideBanner(); }, 1400);
        }
      }
    }

    const fxScale = meta.data.settings.effects;
    if (state.shake > 0.001) {
      arena.world.position.set(
        (Math.random() - 0.5) * 0.02 * state.shake * fxScale,
        (Math.random() - 0.5) * 0.02 * state.shake * fxScale,
        (Math.random() - 0.5) * 0.02 * state.shake * fxScale,
      );
      state.shake *= Math.max(0, 1 - dt * 7);
    } else {
      arena.world.position.set(0, 0, 0);
    }

    const hpFrac = Math.max(0, state.coreHp / CFG.coreHpMax);
    arena.hpRing.scale.setScalar(0.4 + hpFrac * 0.6);
    (arena.hpRing.material as THREE.MeshBasicMaterial).color.setHSL(0.33 * hpFrac, 0.85, 0.55);
    (arena.coreCrystal.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.25 + hpFrac * 1.1;

    hud.worldUpdate(state);
    hud.flatUpdate(state);
    hud.bannerPulse(state.time);
    hud.setVignette(state.slowTimer > 0);
    particles.update(dt);
    shockwaves.update(dt);
    runeRings.update(dt);
    lightning.update(dt);
    scorePops.update(dt);
    ambient.update(dt, state, state.slowTimer > 0);
    bloom.strength = ambient.bloomStrength;
    const musicOn = meta.data.settings.musicOn ? 1 : 0;
    audio.setMusicIntensity(state.phase === 'playing' && state.waveState === 'active'
      ? Math.min(1, 0.15 + (state.wave - 1) / 8) * musicOn
      : 0);
    if (state.phase === 'menu') menuOrbs.update(state.time, openPage);
  }

  arena.update(state.time, state.slowTimer > 0, Math.max(0, state.coreHp / CFG.coreHpMax));
  if (renderer.xr.isPresenting) {
    renderer.render(scene, camera);
  } else {
    composer.render(dt);
  }
});
