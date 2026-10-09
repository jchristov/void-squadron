export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private effectsGain?: GainNode;
  private sfxVolume = 0.8;
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

      this.effectsGain = this.context.createGain();
      this.effectsGain.gain.value = this.sfxVolume;
      this.effectsGain.connect(this.master);

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

  getContext(): AudioContext | undefined {
    return this.context;
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

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.effectsGain && this.context) {
      this.effectsGain.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.015);
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

  playBlaster(power: number): void {
    if (!this.context || !this.effectsGain || this.muted) {
      return;
    }
    const now = this.context.currentTime;
    const pitch = 680 + Math.min(power, 100) * 2.2;
    const fundamental = this.context.createOscillator();
    const edge = this.context.createOscillator();
    const fundamentalGain = this.context.createGain();
    const edgeGain = this.context.createGain();
    fundamental.type = 'sawtooth';
    fundamental.frequency.setValueAtTime(pitch, now);
    fundamental.frequency.exponentialRampToValueAtTime(pitch * 0.43, now + 0.095);
    edge.type = 'square';
    edge.frequency.setValueAtTime(pitch * 1.51, now);
    edge.frequency.exponentialRampToValueAtTime(pitch * 0.68, now + 0.07);
    fundamentalGain.gain.setValueAtTime(0.0001, now);
    fundamentalGain.gain.exponentialRampToValueAtTime(0.065, now + 0.006);
    fundamentalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
    edgeGain.gain.setValueAtTime(0.0001, now);
    edgeGain.gain.exponentialRampToValueAtTime(0.018, now + 0.004);
    edgeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    fundamental.connect(fundamentalGain);
    edge.connect(edgeGain);
    fundamentalGain.connect(this.effectsGain);
    edgeGain.connect(this.effectsGain);
    fundamental.start(now);
    edge.start(now);
    fundamental.stop(now + 0.11);
    edge.stop(now + 0.05);
  }

  playLaser(enemy: boolean, power: number): void {
    if (!this.context || !this.effectsGain || this.muted) {
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
    gain.connect(this.effectsGain);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  }

  playImpact(shielded: boolean, strength: number): void {
    if (!this.context || !this.effectsGain || this.muted) {
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
    gain.connect(this.effectsGain);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  playExplosion(size: number): void {
    if (!this.context || !this.effectsGain || this.muted) {
      return;
    }
    const now = this.context.currentTime;
    const scale = Math.max(0.7, Math.min(6, size));
    const pitchJitter = 0.9 + Math.random() * 0.2;
    const sub = this.context.createOscillator();
    const body = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    const subGain = this.context.createGain();
    const noiseBuffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.55), this.context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1) {
      noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
    }
    const noise = this.context.createBufferSource();
    const lowPass = this.context.createBiquadFilter();
    const highPass = this.context.createBiquadFilter();
    const rumbleGain = this.context.createGain();
    const crackleGain = this.context.createGain();
    noise.buffer = noiseBuffer;
    lowPass.type = 'lowpass';
    lowPass.frequency.setValueAtTime(1500 + scale * 180, now);
    lowPass.frequency.exponentialRampToValueAtTime(260, now + 0.42);
    highPass.type = 'highpass';
    highPass.frequency.value = 700;
    sub.type = 'sine';
    sub.frequency.setValueAtTime((54 + scale * 5) * pitchJitter, now);
    sub.frequency.exponentialRampToValueAtTime(29, now + 0.55);
    body.type = 'triangle';
    body.frequency.setValueAtTime((165 + scale * 26) * pitchJitter, now);
    body.frequency.exponentialRampToValueAtTime(48, now + 0.32);
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.2 + scale * 0.025, now + 0.018);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.11 + scale * 0.025, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    rumbleGain.gain.setValueAtTime(0.0001, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.18 + scale * 0.025, now + 0.009);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    crackleGain.gain.setValueAtTime(0.0001, now);
    crackleGain.gain.exponentialRampToValueAtTime(0.1 + scale * 0.012, now + 0.004);
    crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    sub.connect(subGain);
    body.connect(bodyGain);
    noise.connect(lowPass);
    lowPass.connect(rumbleGain);
    lowPass.connect(highPass);
    highPass.connect(crackleGain);
    subGain.connect(this.effectsGain);
    bodyGain.connect(this.effectsGain);
    rumbleGain.connect(this.effectsGain);
    crackleGain.connect(this.effectsGain);
    sub.start(now);
    body.start(now);
    noise.start(now);
    sub.stop(now + 0.6);
    body.stop(now + 0.42);
    noise.stop(now + 0.55);
  }

  playBossAlarm(): void {
    if (!this.context || !this.effectsGain || this.muted) return;
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
      gain.connect(this.effectsGain);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  }

  playBossStinger(escalate: boolean): void {
    if (!this.context || !this.effectsGain || this.muted) return;
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
      gain.connect(this.effectsGain!);
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
    this.effectsGain?.disconnect?.();
    this.master?.disconnect?.();
    void this.context?.close?.();
    this.engineOscA = undefined;
    this.engineOscB = undefined;
    this.engineGain = undefined;
    this.master = undefined;
    this.context = undefined;
  }
}
