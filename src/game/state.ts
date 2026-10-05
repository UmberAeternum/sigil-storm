import * as THREE from 'three';

export type Phase = 'menu' | 'playing' | 'gameover';
export type RuneName = 'line' | 'circle' | 'zigzag';

/** Everything is tuned for a seated player: reach envelope stays inside ~0.7 m. */
export const CFG = {
  corePos: new THREE.Vector3(0, 1.02, -1.05),
  coreHpMax: 12,
  coreHpCalm: 20,
  portalPos: new THREE.Vector3(0, 1.15, -6),
  rackRadius: 0.42,
  rackHeight: 0.92,
  rackCount: 5,
  rackSpreadDeg: 96,
  orbRegenSec: 1.6,
  orbSpeedMax: 11,
  orbThrowBoost: 1.5,
  orbAoe: 0.6,
  orbDirectHit: 0.17,
  orbDespawnSec: 7,
  barrierRadius: 0.55,
  barrierCooldown: 6,
  novaRadius: 2.6,
  novaCooldown: 5,
  chainCooldown: 4,
  chainMaxTargets: 3,
  chainLinkRange: 3.2,
  fistHoldSec: 0.55,
  slowFactor: 0.35,
  slowDuration: 4,
  slowCooldown: 12,
  pinchOn: 0.02,
  pinchOff: 0.032,
  grabRadius: 0.13,
  strokeMinPoints: 6,
  strokeMaxPoints: 96,
  intermissionSec: 4.5,
  waveSize: (wave: number) => 8 + wave * 3,
  spawnInterval: (wave: number) => Math.max(0.7, 2.2 - wave * 0.14),
  enemySpeed: (wave: number) => Math.min(1.6, 0.55 + wave * 0.075),
  threatRing: 2.2,
};

export interface RunStats {
  runes: number;          // strokes drawn (recognized or not)
  runeHits: number;       // strokes that cast successfully
  throws: number;
  throwHits: number;
  reactionSum: number;    // ms, from threat ring to kill
  reactionN: number;
  novas: number;
  slows: number;
  colossusKills: number;
  perfectWaves: number;
  bestCombo: number;
  seconds: number;
}

export interface Cooldowns {
  barrier: number;
  nova: number;
  chain: number;
  slow: number;
}

export interface GameState {
  phase: Phase;
  paused: boolean;
  score: number;
  best: number;
  combo: number;
  comboTimer: number;
  kills: number;
  wave: number;
  waveState: 'intermission' | 'active';
  waveTimer: number;
  spawnLeft: number;
  spawnTimer: number;
  waveCoreDmg: number;
  coreHp: number;
  cooldowns: Cooldowns;
  slowTimer: number;
  time: number;
  shake: number;
  hitStop: number;
  stormMult: number;        // adaptive difficulty (0.75..1.35)
  tutorialStep: number;     // -1 = off
  dailyActive: boolean;
  run: RunStats;
  lastResult: string;
}

export function freshRun(): RunStats {
  return {
    runes: 0, runeHits: 0, throws: 0, throwHits: 0, reactionSum: 0, reactionN: 0,
    novas: 0, slows: 0, colossusKills: 0, perfectWaves: 0, bestCombo: 0, seconds: 0,
  };
}

export function createState(): GameState {
  let best = 0;
  try {
    best = Number(localStorage.getItem('sigilstorm.best') ?? '0') || 0;
  } catch { /* storage unavailable */ }
  return {
    phase: 'menu',
    paused: false,
    score: 0,
    best,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    wave: 1,
    waveState: 'intermission',
    waveTimer: 3,
    spawnLeft: 0,
    spawnTimer: 0,
    waveCoreDmg: 0,
    coreHp: CFG.coreHpMax,
    cooldowns: { barrier: 0, nova: 0, chain: 0, slow: 0 },
    slowTimer: 0,
    time: 0,
    shake: 0,
    hitStop: 0,
    stormMult: 1,
    tutorialStep: -1,
    dailyActive: false,
    run: freshRun(),
    lastResult: '',
  };
}

export function saveBest(s: GameState): void {
  if (s.score > s.best) {
    s.best = s.score;
    try { localStorage.setItem('sigilstorm.best', String(s.best)); } catch { /* ignore */ }
  }
}

export function resetRun(s: GameState, calm: boolean): void {
  s.phase = 'playing';
  s.score = 0;
  s.combo = 0;
  s.comboTimer = 0;
  s.kills = 0;
  s.wave = 1;
  s.waveState = 'intermission';
  s.waveTimer = 2.5;
  s.spawnLeft = 0;
  s.waveCoreDmg = 0;
  s.coreHp = calm ? CFG.coreHpCalm : CFG.coreHpMax;
  s.cooldowns = { barrier: 0, nova: 0, chain: 0, slow: 0 };
  s.slowTimer = 0;
  s.hitStop = 0;
  s.stormMult = calm ? 0.8 : 1;
  s.run = freshRun();
  s.lastResult = '';
}

export const COL = {
  ember: new THREE.Color('#ffb347'),
  emberHot: new THREE.Color('#ffd98a'),
  wisp: new THREE.Color('#ff5470'),
  brute: new THREE.Color('#b36bff'),
  colossus: new THREE.Color('#ff3860'),
  rune: new THREE.Color('#8f7bff'),
  runeOk: new THREE.Color('#7ef0c2'),
  core: new THREE.Color('#6fd8ff'),
  barrier: new THREE.Color('#6fd8ff'),
  nova: new THREE.Color('#ffd98a'),
  chain: new THREE.Color('#bfe8ff'),
};
