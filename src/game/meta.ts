import type { GameState } from './state';

/**
 * Meta progression — the reason to come back. XP, levels, Embers currency,
 * unlockable altar biomes and ember trails, daily challenges, achievements,
 * ranks and the skill telemetry behind the Growth Report.
 */

export interface Skills {
  runeAttempted: number;
  runeHit: number;
  throws: number;
  throwHits: number;
  reactionSum: number;   // ms
  reactionN: number;
  bestCombo: number;
  perfectWaves: number;
  novas: number;
  playSeconds: number;
}

export interface Settings {
  volume: number;        // 0..1
  musicOn: boolean;
  effects: number;       // 0.5..1.5 multiplier on shake/particles
  calm: boolean;         // no-fail mode for younger players
  colorAssist: boolean;  // distinct rune palette hues
  tutorialDone: boolean;
}

export interface BoardEntry { score: number; wave: number; date: number }

export interface SaveData {
  version: number;
  xp: number;
  level: number;
  embers: number;
  bestScore: number;
  runs: number;
  kills: number;
  seconds: number;
  themes: string[];
  activeTheme: string;
  trails: string[];
  activeTrail: string;
  achievements: Record<string, number>;
  daily: { date: string; done: boolean; streak: number };
  board: BoardEntry[];
  skills: Skills;
  settings: Settings;
}

export interface ThemeDef { id: string; name: string; cost: number; tint: string; ember: string; rune: string }
export interface TrailDef { id: string; name: string; cost: number; color: string }

export const THEMES: ThemeDef[] = [
  { id: 'ember', name: 'Ember Vault', cost: 0, tint: '#8f7bff', ember: '#ffb347', rune: '#8f7bff' },
  { id: 'frost', name: 'Frost Sanctum', cost: 150, tint: '#38bdf8', ember: '#7dd3fc', rune: '#67e8f9' },
  { id: 'verdant', name: 'Verdant Grove', cost: 300, tint: '#34d399', ember: '#a7f3d0', rune: '#6ee7b7' },
];

export const TRAILS: TrailDef[] = [
  { id: 'gold', name: 'Gold Dust', cost: 0, color: '#ffd98a' },
  { id: 'azure', name: 'Azure Wake', cost: 100, color: '#7dd3fc' },
  { id: 'jade', name: 'Jade Ribbon', cost: 200, color: '#6ee7b7' },
  { id: 'storm', name: 'Storm Spark', cost: 350, color: '#c4b5fd' },
];

export const RANKS: { name: string; min: number }[] = [
  { name: 'Novice', min: 0 },
  { name: 'Adept', min: 600 },
  { name: 'Magus', min: 1800 },
  { name: 'Archmagus', min: 4500 },
  { name: 'Stormlord', min: 10000 },
];

export interface AchievementDef { id: string; name: string; desc: string }
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstStorm', name: 'First Storm', desc: 'Finish your first run' },
  { id: 'combo5', name: 'Blazing', desc: 'Reach a ×5 combo' },
  { id: 'combo10', name: 'Tempest Hands', desc: 'Reach a ×10 combo' },
  { id: 'wave5', name: 'Storm Rider', desc: 'Reach wave 5' },
  { id: 'wave8', name: 'Eye of the Storm', desc: 'Reach wave 8' },
  { id: 'nova3', name: 'Trinity Break', desc: 'Shatter 3 wisps with one nova' },
  { id: 'sharpshot', name: 'Sharpshot', desc: 'Finish with 60%+ throw accuracy (10+ throws)' },
  { id: 'runemaster', name: 'Rune Master', desc: 'Finish with 80%+ rune accuracy (10+ strokes)' },
  { id: 'collector', name: 'Collector', desc: 'Unlock your first biome' },
  { id: 'daily1', name: 'Oathkeeper', desc: 'Complete a Daily Sigil' },
];

const DEFAULT_SAVE: SaveData = {
  version: 2,
  xp: 0, level: 1, embers: 0, bestScore: 0, runs: 0, kills: 0, seconds: 0,
  themes: ['ember'], activeTheme: 'ember',
  trails: ['gold'], activeTrail: 'gold',
  achievements: {},
  daily: { date: '', done: false, streak: 0 },
  board: [],
  skills: { runeAttempted: 0, runeHit: 0, throws: 0, throwHits: 0, reactionSum: 0, reactionN: 0, bestCombo: 0, perfectWaves: 0, novas: 0, playSeconds: 0 },
  settings: { volume: 0.6, musicOn: true, effects: 1, calm: false, colorAssist: false, tutorialDone: false },
};

const KEY = 'sigilstorm.save.v2';

export function xpForLevel(level: number): number {
  return Math.round(120 * level * (1 + level * 0.12));
}

export function rankFor(bestScore: number): { name: string; next: string | null; progress: number } {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (bestScore >= RANKS[i].min) idx = i;
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const progress = next ? (bestScore - cur.min) / (next.min - cur.min) : 1;
  return { name: cur.name, next: next?.name ?? null, progress: Math.min(1, Math.max(0, progress)) };
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface DailyDef { desc: string; reward: number; kind: string; target: number }
const DAILIES: DailyDef[] = [
  { desc: 'Reach a ×5 combo in one run', reward: 60, kind: 'combo', target: 5 },
  { desc: 'Score 400+ in a single run', reward: 60, kind: 'score', target: 400 },
  { desc: 'Cast 5 runes in one run', reward: 60, kind: 'runes', target: 5 },
  { desc: 'Reach wave 4', reward: 70, kind: 'wave', target: 4 },
  { desc: 'Shatter 20 wisps in one run', reward: 70, kind: 'kills', target: 20 },
  { desc: 'Finish with 80%+ rune accuracy (8+ strokes)', reward: 80, kind: 'runeAcc', target: 80 },
  { desc: 'Defeat a Colossus', reward: 80, kind: 'colossus', target: 1 },
  { desc: 'Bend time 3 times in one run', reward: 60, kind: 'slows', target: 3 },
];

export function dailyFor(dateKey: string): DailyDef {
  let h = 0;
  for (const c of dateKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DAILIES[h % DAILIES.length];
}

export interface RunStats {
  score: number; wave: number; kills: number; bestCombo: number;
  runeAttempted: number; runeHit: number; throws: number; throwHits: number;
  reactionSum: number; reactionN: number; novas: number; slows: number;
  colossusKills: number; seconds: number; perfectWaves: number;
}

export class Meta {
  data: SaveData;
  private toasts: (title: string, sub: string) => void = () => {};
  private jingle: (kind: 'level' | 'medal' | 'buy' | 'daily') => void = () => {};

  constructor() {
    this.data = this.load();
    this.rollDaily();
  }

  onToast(cb: (title: string, sub: string) => void): void { this.toasts = cb; }
  onJingle(cb: (kind: 'level' | 'medal' | 'buy' | 'daily') => void): void { this.jingle = cb; }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.version === 2) return { ...DEFAULT_SAVE, ...parsed, settings: { ...DEFAULT_SAVE.settings, ...parsed.settings }, skills: { ...DEFAULT_SAVE.skills, ...parsed.skills } };
      }
    } catch { /* corrupt save → fresh */ }
    return JSON.parse(JSON.stringify(DEFAULT_SAVE)) as SaveData;
  }

  save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  private rollDaily(): void {
    const today = todayKey();
    if (this.data.daily.date !== today) {
      this.data.daily = { date: today, done: false, streak: this.data.daily.streak };
      this.save();
    }
  }

  get daily(): DailyDef {
    this.rollDaily();
    return dailyFor(this.data.daily.date);
  }

  get rank() { return rankFor(this.data.bestScore); }

  levelProgress(): { into: number; need: number } {
    const need = xpForLevel(this.data.level);
    return { into: this.data.xp, need };
  }

  /** Record a finished run. Returns a summary of everything earned. */
  finishRun(stats: RunStats): {
    xpGained: number; embersGained: number; levelsGained: number;
    newAchievements: AchievementDef[]; dailyDone: boolean; dailyReward: number;
    accuracyRune: number; accuracyThrow: number; reactionAvg: number;
  } {
    const d = this.data;
    d.runs += 1;
    d.kills += stats.kills;
    d.seconds += stats.seconds;
    d.skills.runeAttempted += stats.runeAttempted;
    d.skills.runeHit += stats.runeHit;
    d.skills.throws += stats.throws;
    d.skills.throwHits += stats.throwHits;
    d.skills.reactionSum += stats.reactionSum;
    d.skills.reactionN += stats.reactionN;
    d.skills.bestCombo = Math.max(d.skills.bestCombo, stats.bestCombo);
    d.skills.perfectWaves += stats.perfectWaves;
    d.skills.novas += stats.novas;
    d.skills.playSeconds += stats.seconds;

    const xpGained = Math.round(stats.score / 10 + stats.kills * 2 + stats.wave * 20);
    const embersGained = Math.round(stats.score / 30 + stats.kills / 4 + stats.wave * 4);
    d.xp += xpGained;
    let levelsGained = 0;
    while (d.xp >= xpForLevel(d.level)) {
      d.xp -= xpForLevel(d.level);
      d.level += 1;
      levelsGained += 1;
      d.embers += 50; // level-up bonus
    }
    d.embers += embersGained;

    const isBest = stats.score > d.bestScore;
    if (isBest) d.bestScore = stats.score;

    // leaderboard (top 5)
    d.board.push({ score: stats.score, wave: stats.wave, date: Date.now() });
    d.board.sort((a, b) => b.score - a.score);
    d.board = d.board.slice(0, 5);

    // achievements
    const newAchievements: AchievementDef[] = [];
    const grant = (id: string): void => {
      if (d.achievements[id]) return;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return;
      d.achievements[id] = Date.now();
      newAchievements.push(def);
    };
    grant('firstStorm');
    if (stats.bestCombo >= 5) grant('combo5');
    if (stats.bestCombo >= 10) grant('combo10');
    if (stats.wave >= 5) grant('wave5');
    if (stats.wave >= 8) grant('wave8');
    if (stats.throws >= 10 && stats.throwHits / stats.throws >= 0.6) grant('sharpshot');
    if (stats.runeAttempted >= 10 && stats.runeHit / stats.runeAttempted >= 0.8) grant('runemaster');
    for (const a of newAchievements) {
      d.embers += 40;
      this.toasts(`🏅 ${a.name}`, a.desc);
      this.jingle('medal');
    }

    // daily
    let dailyDone = false;
    let dailyReward = 0;
    if (!d.daily.done) {
      const def = this.daily;
      const accRune = stats.runeAttempted >= 8 ? (stats.runeHit / stats.runeAttempted) * 100 : 0;
      const hit: Record<string, boolean> = {
        combo: stats.bestCombo >= def.target,
        score: stats.score >= def.target,
        runes: stats.runeAttempted >= def.target && stats.runeHit >= def.target,
        wave: stats.wave > def.target,
        kills: stats.kills >= def.target,
        runeAcc: accRune >= def.target,
        colossus: stats.colossusKills >= def.target,
        slows: stats.slows >= def.target,
      };
      if (hit[def.kind]) {
        d.daily.done = true;
        d.daily.streak += 1;
        dailyDone = true;
        dailyReward = def.reward;
        d.embers += dailyReward;
        if (d.achievements['daily1']) d.embers += 10;
        grant('daily1');
        this.toasts('✦ Daily Sigil complete', `${def.desc} — +${dailyReward} Embers`);
        this.jingle('daily');
      }
    }

    this.save();
    return {
      xpGained, embersGained, levelsGained, newAchievements, dailyDone, dailyReward,
      accuracyRune: stats.runeAttempted ? stats.runeHit / stats.runeAttempted : 0,
      accuracyThrow: stats.throws ? stats.throwHits / stats.throws : 0,
      reactionAvg: stats.reactionN ? stats.reactionSum / stats.reactionN : 0,
    };
  }

  liveCheck(s: { combo: number; wave: number }): void {
    const grant = (id: string): void => {
      if (this.data.achievements[id]) return;
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (!def) return;
      this.data.achievements[id] = Date.now();
      this.data.embers += 40;
      this.toasts(`🏅 ${def.name}`, def.desc);
      this.jingle('medal');
      this.save();
    };
    if (s.combo >= 5) grant('combo5');
    if (s.combo >= 10) grant('combo10');
    if (s.wave >= 5) grant('wave5');
    if (s.wave >= 8) grant('wave8');
  }

  /** Skill trend vs lifetime averages (+ = improving). */
  trends(): { rune: number; throwAcc: number; reaction: number } {
    const s = this.data.skills;
    const rune = s.runeAttempted >= 10 ? s.runeHit / s.runeAttempted : -1;
    const throwAcc = s.throws >= 10 ? s.throwHits / s.throws : -1;
    const reaction = s.reactionN >= 10 ? s.reactionSum / s.reactionN : -1;
    return { rune, throwAcc, reaction };
  }

  buyTheme(id: string): boolean {
    const def = THEMES.find((t) => t.id === id);
    if (!def || this.data.themes.includes(id) || this.data.embers < def.cost) return false;
    this.data.embers -= def.cost;
    this.data.themes.push(id);
    if (this.data.themes.length === 2) this.data.achievements['collector'] ||= Date.now();
    this.save();
    this.jingle('buy');
    return true;
  }

  buyTrail(id: string): boolean {
    const def = TRAILS.find((t) => t.id === id);
    if (!def || this.data.trails.includes(id) || this.data.embers < def.cost) return false;
    this.data.embers -= def.cost;
    this.data.trails.push(id);
    this.save();
    this.jingle('buy');
    return true;
  }

  setTheme(id: string): void {
    if (this.data.themes.includes(id)) { this.data.activeTheme = id; this.save(); }
  }

  setTrail(id: string): void {
    if (this.data.trails.includes(id)) { this.data.activeTrail = id; this.save(); }
  }

  theme(): ThemeDef { return THEMES.find((t) => t.id === this.data.activeTheme) ?? THEMES[0]; }
  trail(): TrailDef { return TRAILS.find((t) => t.id === this.data.activeTrail) ?? TRAILS[0]; }

  setSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  resetAll(): void {
    this.data = JSON.parse(JSON.stringify(DEFAULT_SAVE)) as SaveData;
    this.rollDaily();
    this.save();
  }
}
