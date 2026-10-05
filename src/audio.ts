export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineOscA?: OscillatorNode;
  private engineOscB?: OscillatorNode;
  private muted = false;

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

  dispose(): void {
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
