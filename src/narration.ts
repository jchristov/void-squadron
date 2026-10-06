import { VOICE_LINES, VOICE_LINE_BY_ID, type VoiceLine, type VoiceRole } from './voiceLines';

export interface NarrationEvents {
  onSubtitle?: (line: { role: VoiceRole; text: string } | null) => void;
  /** True while a clip is speaking; used to duck the music. */
  onSpeaking?: (speaking: boolean) => void;
}

/**
 * Plays the pre-rendered neural-voice clips with a small priority queue, per-line cooldowns and a radio filter
 * for the onboard computer and wingman. Command stays clean and warm.
 */
export class Narrator {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly lastSpoken = new Map<string, number>();
  private readonly queue: VoiceLine[] = [];
  private current: { line: VoiceLine; source: AudioBufferSourceNode } | null = null;
  private volume = 1;
  private muted = false;
  private subtitles = true;
  private enabled = true;
  private generation = 0;
  private readonly events: NarrationEvents;
  private readonly baseUrl: string;

  constructor(ctx: AudioContext, destination: AudioNode, events: NarrationEvents = {}, baseUrl = '/') {
    this.ctx = ctx;
    this.events = events;
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(destination);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
    if (muted) this.clear();
  }

  setSubtitles(enabled: boolean): void {
    this.subtitles = enabled;
    if (!enabled) this.events.onSubtitle?.(null);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  /** Warm the cache in the background so in-combat lines play without a network hiccup. */
  preloadAll(): void {
    const ids = VOICE_LINES.map((line) => line.id);
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) await this.load(ids[cursor++]);
    };
    void Promise.all([worker(), worker(), worker()]);
  }

  /**
   * Speak a line. A louder priority interrupts whatever is playing; lower ones queue (priority 1 is dropped when busy).
   * `cooldown` suppresses the same id for that many seconds so event chatter never loops.
   */
  say(id: string, cooldown = 0): void {
    const line = VOICE_LINE_BY_ID.get(id);
    if (!line || !this.enabled || this.muted || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const last = this.lastSpoken.get(id);
    if (cooldown > 0 && last !== undefined && now - last < cooldown) return;
    if (this.queue.some((queued) => queued.id === id) || this.current?.line.id === id) return;
    this.lastSpoken.set(id, now);

    if (!this.current) {
      void this.play(line);
      return;
    }
    if (line.priority > this.current.line.priority) {
      this.queue.unshift(line);
      this.stopCurrent();
      return;
    }
    if (line.priority === 1) return;
    this.queue.push(line);
    if (this.queue.length > 3) this.queue.sort((a, b) => b.priority - a.priority).length = 3;
  }

  /** Drop everything: used when the mission ends or the pilot returns to the hangar. */
  clear(): void {
    this.queue.length = 0;
    this.generation += 1;
    this.stopCurrent(false);
    this.events.onSubtitle?.(null);
    this.events.onSpeaking?.(false);
  }

  private applyGain(): void {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, now + 0.05);
  }

  private stopCurrent(advance = true): void {
    const current = this.current;
    if (!current) return;
    this.current = null;
    if (current.source) {
      current.source.onended = null;
      try { current.source.stop(); } catch { /* Already stopped. */ }
    }
    if (advance) this.next();
  }

  private next(): void {
    const line = this.queue.shift();
    if (line) void this.play(line);
    else {
      this.events.onSubtitle?.(null);
      this.events.onSpeaking?.(false);
    }
  }

  private load(id: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const task = fetch(`${this.baseUrl}audio/voice/${id}.mp3`)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => { this.buffers.set(id, buffer); return buffer; })
      .catch(() => null)
      .finally(() => this.loading.delete(id));
    this.loading.set(id, task);
    return task;
  }

  private async play(line: VoiceLine): Promise<void> {
    const generation = this.generation;
    this.current = { line, source: null as unknown as AudioBufferSourceNode };
    const buffer = await this.load(line.id);
    if (generation !== this.generation || !this.current || this.current.line !== line) return;
    if (!buffer) { this.current = null; this.next(); return; }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    this.connectChain(source, line.role);
    source.onended = () => {
      if (this.current?.source !== source) return;
      this.current = null;
      window.setTimeout(() => this.next(), 160);
    };
    this.current.source = source;
    source.start();
    this.events.onSpeaking?.(true);
    if (this.subtitles) this.events.onSubtitle?.({ role: line.role, text: line.text });
  }

  private connectChain(source: AudioBufferSourceNode, role: VoiceRole): void {
    if (role === 'command') {
      const warm = this.ctx.createBiquadFilter();
      warm.type = 'highpass';
      warm.frequency.value = 90;
      const gain = this.ctx.createGain();
      gain.gain.value = 1.1;
      source.connect(warm).connect(gain).connect(this.out);
      return;
    }
    // Cockpit radio: band-limited with a touch of grit.
    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = role === 'computer' ? 380 : 300;
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = role === 'computer' ? 5200 : 3600;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let index = 0; index < curve.length; index += 1) {
      const x = index / 128 - 1;
      curve[index] = Math.tanh(x * (role === 'computer' ? 1.4 : 2.2));
    }
    shaper.curve = curve;
    const gain = this.ctx.createGain();
    gain.gain.value = role === 'computer' ? 0.95 : 0.85;
    source.connect(high).connect(low).connect(shaper).connect(gain).connect(this.out);
  }
}
