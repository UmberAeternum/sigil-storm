/** Procedural WebAudio synth — zero audio assets, instant cold start. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;

  /** Must be called from a user gesture (button click / session start). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startDrone();
  }

  private startDrone(): void {
    if (!this.ctx || !this.master) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.master);
    this.droneGain = g;
    for (const [freq, detune] of [[55, 0], [55.4, 4], [110, -6]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      const og = this.ctx.createGain();
      og.gain.value = 0.35;
      o.connect(f).connect(og).connect(g);
      o.start();
      // slow LFO on filter for breathing motion
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 90;
      lfo.connect(lfoGain).connect(f.frequency);
      lfo.start();
    }
  }

  duckDrone(amount: number): void {
    if (this.droneGain && this.ctx) {
      this.droneGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.3);
    }
  }

  private env(dur: number, peak: number, attack = 0.005): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  private tone(type: OscillatorType, freq: number, dur: number, peak: number, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const g = this.env(dur, peak);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, peak: number, filterFreq: number, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const g = this.env(dur, peak, 0.002);
    if (!g) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // white-noise source for percussive sounds — audio DSP, not a security context
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    const t = this.ctx.currentTime;
    f.frequency.setValueAtTime(filterFreq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = 0.8;
    src.connect(f).connect(g);
    src.start(t);
  }

  throwWhoosh(): void { this.noise(0.28, 0.18, 900, 2600); }
  orbExplode(): void { this.noise(0.32, 0.4, 1400, 220); this.tone('sine', 160, 0.25, 0.3, 60); }
  enemyDie(pitch = 1): void { this.tone('triangle', 620 * pitch, 0.22, 0.22, 130 * pitch); this.noise(0.12, 0.12, 3000, 800); }
  castOk(): void { this.tone('sine', 520, 0.18, 0.25, 780); this.tone('sine', 780, 0.26, 0.16, 1040); }
  fizzle(): void { this.noise(0.16, 0.1, 500, 200); }
  coreHit(): void { this.tone('square', 190, 0.22, 0.3, 80); this.noise(0.18, 0.2, 700, 250); }
  waveStart(): void { this.tone('sawtooth', 72, 0.9, 0.24, 60); this.tone('sine', 288, 0.7, 0.1, 240); }
  gameOver(): void { this.tone('sawtooth', 220, 1.4, 0.3, 48); this.noise(1.1, 0.18, 800, 90); }
  slowIn(): void { this.tone('sine', 420, 0.6, 0.2, 130); }
  grab(): void { this.tone('sine', 340, 0.07, 0.1, 420); }
  uiClick(): void { this.tone('sine', 660, 0.08, 0.14, 880); }
  shieldAbsorb(): void { this.tone('sine', 300, 0.2, 0.24, 420); this.noise(0.14, 0.14, 1800, 900); }

  // ── meta jingles ─────────────────────────────────────────────────────────
  jingle(kind: 'level' | 'medal' | 'buy' | 'daily'): void {
    const t = this.ctx?.currentTime ?? 0;
    const arp = (freqs: number[], step: number, type: OscillatorType, peak: number): void => {
      freqs.forEach((f, i) => {
        if (!this.ctx || !this.master) return;
        const g = this.ctx.createGain();
        const start = t + i * step;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + step * 1.6);
        g.connect(this.master);
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(g);
        o.start(start);
        o.stop(start + step * 1.8);
      });
    };
    if (kind === 'level') arp([392, 494, 587, 784], 0.09, 'triangle', 0.3);
    else if (kind === 'medal') arp([880, 1174], 0.1, 'sine', 0.26);
    else if (kind === 'buy') arp([660, 990], 0.07, 'square', 0.14);
    else arp([523, 659, 784, 1046, 784, 1046], 0.11, 'triangle', 0.28);
  }

  /** Adaptive combat pulse — intensity 0..1 scales tempo-following bass. */
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private pulseIntensity = 0;
  setMusicIntensity(intensity: number): void {
    this.pulseIntensity = intensity;
    if (intensity > 0.02 && !this.pulseTimer && this.ctx) {
      this.pulseTimer = setInterval(() => {
        if (this.pulseIntensity <= 0.02 || !this.ctx) return;
        this.tone('sine', 52, 0.16, 0.05 + this.pulseIntensity * 0.16, 40);
        if (this.pulseIntensity > 0.5) this.noise(0.05, 0.03 + this.pulseIntensity * 0.05, 5200, 3800);
      }, 560);
    }
    if (intensity <= 0.02 && this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v)) * 0.6;
  }
}
