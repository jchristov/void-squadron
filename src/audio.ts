export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineOscA?: OscillatorNode;
  private engineOscB?: OscillatorNode;
  private muted = false;
  private bossDroneGain?: GainNode;
  private bossDroneOscs: OscillatorNode[] = [];

  constructor() {
    const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      return;
    }

    try {
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.14;
      this.master.connect(this.context.destination);

      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      this.engineGain.connect(this.master);

      this.engineOscA = this.context.createOscillator();
      this.engineOscA.type = 'sawtooth';
      this.engineOscA.frequency.value = 80;
      this.engineOscA.connect(this.engineGain);
      this.engineOscA.start();

      this.engineOscB = this.context.createOscillator();
      this.engineOscB.type = 'triangle';
      this.engineOscB.frequency.value = 121;
      this.engineOscB.connect(this.engineGain);
      this.engineOscB.start();
    } catch {
      this.dispose();
    }
  }

  async resume(): Promise<void> {
    if (!this.context || this.context.state !== 'suspended') {
      return;
    }
    try {
      await this.context.resume();
    } catch {
      // Ignore browsers that block resume until a direct user gesture.
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.14, now + 0.05);
    }
  }

  setEngine(active: boolean, speedRatio: number, boosting: boolean): void {
    if (!this.context || !this.engineGain || !this.engineOscA || !this.engineOscB) {
      return;
    }
    const now = this.context.currentTime;
    const speed = Math.max(0, Math.min(1.6, speedRatio));
    const targetGain = this.muted || !active ? 0 : 0.02 + speed * (boosting ? 0.06 : 0.038);
    this.engineGain.gain.cancelScheduledValues(now);
    this.engineGain.gain.linearRampToValueAtTime(targetGain, now + 0.08);

    this.engineOscA.frequency.cancelScheduledValues(now);
    this.engineOscA.frequency.linearRampToValueAtTime(72 + speed * (boosting ? 88 : 52), now + 0.08);
    this.engineOscB.frequency.cancelScheduledValues(now);
    this.engineOscB.frequency.linearRampToValueAtTime(114 + speed * (boosting ? 118 : 72), now + 0.08);
  }

  playLaser(enemy: boolean, power: number): void {
    if (!this.context || !this.master || this.muted) {
      return;
    }
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = enemy ? 'square' : 'triangle';
    oscillator.frequency.setValueAtTime(enemy ? 280 : 760 + power * 8, now);
    oscillator.frequency.exponentialRampToValueAtTime(enemy ? 140 : 260, now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05 + Math.min(power, 40) * 0.0012, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  }

  playImpact(shielded: boolean, strength: number): void {
    if (!this.context || !this.master || this.muted) {
      return;
    }
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = shielded ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(shielded ? 960 : 220, now);
    oscillator.frequency.exponentialRampToValueAtTime(shielded ? 280 : 70, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045 + Math.min(strength, 100) * 0.0008, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  playExplosion(size: number): void {
    if (!this.context || !this.master || this.muted) {
      return;
    }
    const now = this.context.currentTime;
    const low = this.context.createOscillator();
    const mid = this.context.createOscillator();
    const gain = this.context.createGain();
    low.type = 'sawtooth';
    mid.type = 'triangle';
    low.frequency.setValueAtTime(120 + size * 18, now);
    low.frequency.exponentialRampToValueAtTime(38, now + 0.4);
    mid.frequency.setValueAtTime(260 + size * 22, now);
    mid.frequency.exponentialRampToValueAtTime(60, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06 + Math.min(size, 6) * 0.03, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    low.connect(gain);
    mid.connect(gain);
    gain.connect(this.master);
    low.start(now);
    mid.start(now);
    low.stop(now + 0.5);
    mid.stop(now + 0.38);
  }

  playBossAlarm(): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const start = now + pulse * 0.55;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(330, start);
      osc.frequency.linearRampToValueAtTime(520, start + 0.4);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  }

  playBossStinger(escalate: boolean): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    const notes = escalate ? [196, 233, 294] : [392, 330, 262];
    notes.forEach((freq, index) => {
      const start = now + index * 0.12;
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  /** Low looping dread drone for the capital fight; intensity 0..1 raises volume and pitch. */
  setBossDrone(active: boolean, intensity: number): void {
    if (!this.context || !this.master) return;
    if (active && this.bossDroneOscs.length === 0) {
      this.bossDroneGain = this.context.createGain();
      this.bossDroneGain.gain.value = 0;
      this.bossDroneGain.connect(this.master);
      for (const freq of [48, 50.5]) {
        const osc = this.context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(this.bossDroneGain);
        osc.start();
        this.bossDroneOscs.push(osc);
      }
    }
    if (!this.bossDroneGain) return;
    const now = this.context.currentTime;
    const level = this.muted || !active ? 0 : 0.012 + Math.min(1, Math.max(0, intensity)) * 0.03;
    this.bossDroneGain.gain.cancelScheduledValues(now);
    this.bossDroneGain.gain.linearRampToValueAtTime(level, now + 0.4);
    this.bossDroneOscs.forEach((osc, index) => {
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.linearRampToValueAtTime((index === 0 ? 48 : 50.5) * (1 + intensity * 0.35), now + 0.4);
    });
    if (!active && level === 0) {
      const oscs = this.bossDroneOscs;
      this.bossDroneOscs = [];
      window.setTimeout(() => oscs.forEach((osc) => { try { osc.stop(); osc.disconnect(); } catch { /* already stopped */ } }), 500);
    }
  }

  dispose(): void {
    this.bossDroneOscs.forEach((osc) => { try { osc.stop(); } catch { /* already stopped */ } });
    this.bossDroneOscs = [];
    this.bossDroneGain = undefined;
    this.engineOscA?.stop?.();
    this.engineOscB?.stop?.();
    this.engineOscA?.disconnect?.();
    this.engineOscB?.disconnect?.();
    this.engineGain?.disconnect?.();
    this.master?.disconnect?.();
    void this.context?.close?.();
    this.engineOscA = undefined;
    this.engineOscB = undefined;
    this.engineGain = undefined;
    this.master = undefined;
    this.context = undefined;
  }
}
