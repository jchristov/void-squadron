export type MusicMode = 'off' | 'menu' | 'combat' | 'stealth' | 'boss' | 'victory' | 'defeat';

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

interface ModeConfig {
  bpm: number;
  /** Chord roots (MIDI) per bar and the chord tones as semitone offsets. */
  bars: { root: number; tones: number[] }[];
  pad: number;
  bass: number;
  arp: number;
  drums: number;
  stab: number;
}

const MIN7 = [0, 3, 7, 10], MIN = [0, 3, 7], MAJ = [0, 4, 7], MAJ7 = [0, 4, 7, 11], DIM = [0, 3, 6], SUS = [0, 5, 7], PHRYG = [0, 1, 7, 8];

/** Layer targets per mode; the scheduler cross-fades layer buses toward these. */
const MODES: Record<Exclude<MusicMode, 'off'>, ModeConfig> = {
  menu: { bpm: 74, pad: 0.55, bass: 0.18, arp: 0.34, drums: 0, stab: 0, bars: [{ root: 50, tones: MIN7 }, { root: 46, tones: MAJ7 }, { root: 43, tones: MIN7 }, { root: 45, tones: SUS }] },
  combat: { bpm: 112, pad: 0.34, bass: 0.55, arp: 0.2, drums: 0.7, stab: 0.2, bars: [{ root: 38, tones: MIN }, { root: 34, tones: MAJ }, { root: 31, tones: MIN }, { root: 33, tones: MAJ }] },
  stealth: { bpm: 60, pad: 0.4, bass: 0.1, arp: 0.28, drums: 0, stab: 0, bars: [{ root: 38, tones: SUS }, { root: 37, tones: DIM }, { root: 38, tones: SUS }, { root: 35, tones: DIM }] },
  boss: { bpm: 132, pad: 0.4, bass: 0.7, arp: 0.14, drums: 1, stab: 0.55, bars: [{ root: 38, tones: PHRYG }, { root: 39, tones: MAJ }, { root: 36, tones: MIN }, { root: 37, tones: DIM }] },
  victory: { bpm: 88, pad: 0.55, bass: 0.22, arp: 0.3, drums: 0.15, stab: 0, bars: [{ root: 50, tones: MAJ }, { root: 55, tones: MAJ }, { root: 47, tones: MIN7 }, { root: 52, tones: SUS }] },
  defeat: { bpm: 56, pad: 0.5, bass: 0.24, arp: 0.06, drums: 0, stab: 0, bars: [{ root: 45, tones: MIN }, { root: 41, tones: MAJ }, { root: 38, tones: MIN }, { root: 40, tones: SUS }] },
};

/**
 * Original procedural score: pad / bass / arpeggio / drum / stab layers on a lookahead scheduler.
 * Nothing is sampled, so there are no licensing or download costs.
 */
export class MusicDirector {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly bus: Record<'pad' | 'bass' | 'arp' | 'drums' | 'stab', GainNode>;
  private readonly reverb: ConvolverNode;
  private readonly reverbSend: GainNode;
  private readonly noise: AudioBuffer;
  private mode: MusicMode = 'off';
  private intensity = 0.5;
  private volume = 0.6;
  private muted = false;
  private ducked = false;
  private paused = false;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private oneShotDone = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.bus = { pad: ctx.createGain(), bass: ctx.createGain(), arp: ctx.createGain(), drums: ctx.createGain(), stab: ctx.createGain() };
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.createImpulse(2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(this.reverb);
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    this.reverb.connect(wet);
    wet.connect(this.out);
    for (const bus of Object.values(this.bus)) {
      bus.gain.value = 0;
      bus.connect(this.out);
      bus.connect(this.reverbSend);
    }
    this.noise = this.createNoise();
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    this.oneShotDone = false;
    this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    this.applyLevels(1.2);
    if (mode === 'off') this.stopTimer();
    else this.startTimer();
  }

  setIntensity(value: number): void {
    const next = Math.max(0, Math.min(1, value));
    if (Math.abs(next - this.intensity) < 0.04) return;
    this.intensity = next;
    this.applyLevels(0.6);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyLevels(0.2);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevels(0.1);
  }

  /** Lowers the score under narration. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyLevels(0.25);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyLevels(0.4);
  }

  dispose(): void {
    this.stopTimer();
    this.out.disconnect();
  }

  private applyLevels(seconds: number): void {
    const now = this.ctx.currentTime;
    const config = this.mode === 'off' ? null : MODES[this.mode];
    const master = this.muted || this.mode === 'off' ? 0 : this.volume * 0.34 * (this.ducked ? 0.45 : 1) * (this.paused ? 0.5 : 1);
    this.ramp(this.out.gain, master, now, Math.min(seconds, 0.8));
    const drive = this.mode === 'combat' ? 0.45 + this.intensity * 0.75 : 1;
    const levels = { pad: config?.pad ?? 0, bass: (config?.bass ?? 0) * (this.mode === 'combat' ? 0.5 + this.intensity * 0.5 : 1), arp: config?.arp ?? 0, drums: (config?.drums ?? 0) * drive, stab: (config?.stab ?? 0) * (this.mode === 'combat' ? this.intensity : 1) };
    (Object.keys(levels) as (keyof typeof levels)[]).forEach((key) => this.ramp(this.bus[key].gain, levels[key], now, seconds));
  }

  private ramp(param: AudioParam, value: number, now: number, seconds: number): void {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stopTimer(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule(): void {
    if (this.mode === 'off' || this.ctx.state !== 'running') return;
    const config = MODES[this.mode];
    const stepDuration = 60 / config.bpm / 4;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.playStep(config, this.step, this.nextTime, stepDuration);
      this.step += 1;
      this.nextTime += stepDuration;
    }
  }

  private playStep(config: ModeConfig, step: number, time: number, stepDuration: number): void {
    const stepInBar = step % 16;
    const bar = config.bars[Math.floor(step / 16) % config.bars.length];
    const beat = stepDuration * 4;
    if (stepInBar === 0) this.playPad(bar, time, beat * 4.05);
    if (this.mode === 'victory' && step === 0) this.playFanfare(time, beat);
    if (this.mode === 'defeat' && step === 0) this.playDirge(time, beat);

    if (this.mode === 'menu' || this.mode === 'stealth') {
      const tones = bar.tones;
      const spacing = this.mode === 'stealth' ? 8 : 2;
      if (stepInBar % spacing === 0) {
        const index = (stepInBar / spacing + (this.mode === 'stealth' ? 0 : Math.floor(step / 16))) % tones.length;
        const octave = this.mode === 'stealth' ? 36 : 24 + (stepInBar % 8 === 6 ? 12 : 0);
        this.playPluck(midi(bar.root + octave + tones[index]), time, stepDuration * (this.mode === 'stealth' ? 6 : 3), 0.42);
      }
      if (stepInBar === 0) this.playBass(midi(bar.root - 12), time, beat * 3.6, 'sine');
      return;
    }

    if (this.mode === 'victory') {
      if (stepInBar % 2 === 0) this.playPluck(midi(bar.root + 24 + bar.tones[(stepInBar / 2) % bar.tones.length]), time, stepDuration * 3, 0.3);
      if (stepInBar === 0) this.playBass(midi(bar.root - 12), time, beat * 3.6, 'triangle');
      if (stepInBar === 0 || stepInBar === 8) this.playKick(time, 0.5);
      return;
    }
    if (this.mode === 'defeat') {
      if (stepInBar === 0) this.playBass(midi(bar.root - 12), time, beat * 3.8, 'sine');
      if (stepInBar === 8) this.playPluck(midi(bar.root + 12 + bar.tones[2]), time, beat * 2, 0.22);
      return;
    }

    const boss = this.mode === 'boss';
    // Driving bass: eighths in combat, sixteenths with an octave jump in the boss fight.
    if (boss ? true : stepInBar % 2 === 0) {
      const accent = stepInBar % 4 === 0;
      const note = bar.root - 12 + (boss && stepInBar % 8 === 7 ? 12 : 0) + (!boss && stepInBar % 8 === 6 ? 7 : 0);
      this.playBass(midi(note), time, stepDuration * (boss ? 0.9 : 1.7), 'sawtooth', accent ? 1 : 0.7);
    }
    if (stepInBar % 4 === 0 && (boss || stepInBar % 8 === 0 || this.intensity > 0.35)) this.playKick(time, boss ? 1 : 0.85);
    if (stepInBar === 4 || stepInBar === 12) this.playSnare(time, boss ? 1 : 0.8);
    if (stepInBar % 2 === 0) this.playHat(time, stepInBar % 4 === 2 ? 0.55 : 0.3);
    else if (boss) this.playHat(time, 0.18);
    if (boss && stepInBar === 0) this.playStab(bar, time, beat * 1.6);
    if (!boss && (stepInBar === 0 || stepInBar === 10) && this.intensity > 0.45) this.playStab(bar, time, beat * 0.9);
    if (stepInBar % 4 === 2) this.playPluck(midi(bar.root + 24 + bar.tones[(step >> 2) % bar.tones.length]), time, stepDuration * 2, boss ? 0.2 : 0.26);
  }

  private env(gain: GainNode, time: number, attack: number, hold: number, release: number, peak: number): void {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + attack);
    gain.gain.setValueAtTime(peak, time + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + hold + release);
  }

  private playPad(bar: { root: number; tones: number[] }, time: number, length: number): void {
    const notes = [bar.root + 12, ...bar.tones.map((tone) => bar.root + 24 + tone)];
    for (const note of notes) {
      for (const detune of [-9, 8]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, time);
        filter.frequency.linearRampToValueAtTime(1400, time + length * 0.5);
        filter.frequency.linearRampToValueAtTime(600, time + length);
        const gain = this.ctx.createGain();
        this.env(gain, time, length * 0.35, length * 0.3, length * 0.4, 0.035);
        osc.connect(filter).connect(gain).connect(this.bus.pad);
        osc.start(time);
        osc.stop(time + length * 1.1);
      }
    }
  }

  private playBass(freq: number, time: number, length: number, type: OscillatorType, accent = 1): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'sawtooth' ? 520 * accent + 140 : 300, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + length);
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.01, length * 0.4, length * 0.6, 0.22 * accent);
    osc.connect(filter).connect(gain).connect(this.bus.bass);
    osc.start(time);
    osc.stop(time + length * 1.2);
  }

  private playPluck(freq: number, time: number, length: number, peak: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.005, 0.01, length, peak * 0.3);
    osc.connect(gain).connect(this.bus.arp);
    osc.start(time);
    osc.stop(time + length + 0.1);
  }

  private playStab(bar: { root: number; tones: number[] }, time: number, length: number): void {
    for (const tone of [0, ...bar.tones.slice(1)]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midi(bar.root + 12 + tone);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, time);
      filter.frequency.exponentialRampToValueAtTime(500, time + length);
      const gain = this.ctx.createGain();
      this.env(gain, time, 0.012, length * 0.2, length * 0.8, 0.06);
      osc.connect(filter).connect(gain).connect(this.bus.stab);
      osc.start(time);
      osc.stop(time + length + 0.1);
    }
  }

  private playKick(time: number, level: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.002, 0.02, 0.22, 0.7 * level);
    osc.connect(gain).connect(this.bus.drums);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private noiseHit(time: number, length: number, type: BiquadFilterType, freq: number, peak: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.001, 0.005, length, peak);
    source.connect(filter).connect(gain).connect(this.bus.drums);
    source.start(time, Math.random() * 0.5);
    source.stop(time + length + 0.05);
  }

  private playSnare(time: number, level: number): void {
    this.noiseHit(time, 0.16, 'bandpass', 1900, 0.5 * level);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.002, 0.01, 0.1, 0.25 * level);
    osc.connect(gain).connect(this.bus.drums);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private playHat(time: number, level: number): void {
    this.noiseHit(time, 0.05, 'highpass', 7500, 0.22 * level);
  }

  private playFanfare(time: number, beat: number): void {
    // D major call: D4 A4 D5 F#5 A5, resolving on a held chord.
    const notes = [62, 69, 74, 78, 81];
    notes.forEach((note, index) => {
      const at = time + index * beat * 0.5;
      for (const type of ['sawtooth', 'square'] as OscillatorType[]) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = midi(note);
        osc.detune.value = type === 'square' ? 6 : -6;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2400;
        const gain = this.ctx.createGain();
        const hold = index === notes.length - 1 ? beat * 3 : beat * 0.4;
        this.env(gain, at, 0.02, hold, beat * 0.8, 0.045);
        osc.connect(filter).connect(gain).connect(this.bus.stab);
        osc.start(at);
        osc.stop(at + hold + beat + 0.2);
      }
    });
    this.noiseHit(time + notes.length * beat * 0.5, 1.4, 'bandpass', 5000, 0.2);
  }

  private playDirge(time: number, beat: number): void {
    [57, 53, 50, 45].forEach((note, index) => {
      const at = time + index * beat * 1.5;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midi(note);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = this.ctx.createGain();
      this.env(gain, at, 0.2, beat, beat * 1.2, 0.05);
      osc.connect(filter).connect(gain).connect(this.bus.stab);
      osc.start(at);
      osc.stop(at + beat * 3);
    });
  }

  private createNoise(): AudioBuffer {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private createImpulse(seconds: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.4);
    }
    return buffer;
  }
}
