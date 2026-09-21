import type { ShooterSettings } from "../types";

export class AudioManager {
  private context: AudioContext | null = null;
  private baseGain: GainNode | null = null;
  private dangerGain: GainNode | null = null;
  private musicNodes: OscillatorNode[] = [];
  private settings: ShooterSettings;
  private lastDanger = -1;
  private sharedMusicPlaying = false;

  constructor(settings: ShooterSettings) {
    this.settings = settings;
  }

  updateSettings(settings: ShooterSettings): void {
    this.settings = settings;
    this.applyMusicLevels(Math.max(0, this.lastDanger));
  }

  setSharedMusicPlaying(playing: boolean): void {
    if (this.sharedMusicPlaying === playing) return;
    this.sharedMusicPlaying = playing;
    if (!playing && this.settings.musicEnabled) this.ensureMusic();
    this.applyMusicLevels(Math.max(0, this.lastDanger));
  }

  unlock(): void {
    const context = this.getContext();
    if (context?.state === "suspended") void context.resume();
    if (this.settings.musicEnabled && !this.sharedMusicPlaying) this.ensureMusic();
  }

  suspend(): void {
    if (this.context?.state === "running") void this.context.suspend();
  }

  stop(): void {
    for (const oscillator of this.musicNodes) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    this.musicNodes = [];
    this.lastDanger = -1;
    this.baseGain = null;
    this.dangerGain = null;
  }

  setDanger(level: number): void {
    if (!this.settings.musicEnabled) return;
    const normalized = Math.min(1, Math.max(0, level));
    if (Math.abs(normalized - this.lastDanger) < 0.025) return;
    this.lastDanger = normalized;
    this.ensureMusic();
    this.applyMusicLevels(normalized);
  }

  playShoot(): void {
    this.tone(690, 0.075, 0.075, "square", 1250);
  }

  playExplosion(strong = false): void {
    this.tone(strong ? 180 : 150, strong ? 0.22 : 0.16, strong ? 0.11 : 0.08, "sawtooth", 52);
    window.setTimeout(() => this.tone(92, 0.12, strong ? 0.08 : 0.05, "triangle", 38), 20);
  }

  playMiss(): void {
    this.tone(190, 0.055, 0.035, "triangle", 145);
  }

  playImpact(): void {
    this.tone(120, 0.28, 0.13, "sawtooth", 32);
    window.setTimeout(() => this.tone(62, 0.24, 0.09, "square", 28), 18);
  }

  playLateSave(): void {
    this.tone(520, 0.09, 0.08, "triangle", 920);
    window.setTimeout(() => this.tone(760, 0.13, 0.07, "sine", 1280), 45);
  }

  playCountdown(): void {
    this.tone(420, 0.06, 0.045, "sine", 520);
  }

  private getContext(): AudioContext | null {
    if (this.context !== null) return this.context;
    try {
      this.context = new AudioContext();
      return this.context;
    } catch {
      return null;
    }
  }

  private ensureMusic(): void {
    if (
      !this.settings.musicEnabled ||
      this.sharedMusicPlaying ||
      this.musicNodes.length > 0
    ) return;
    const context = this.getContext();
    if (context === null) return;

    const master = context.createGain();
    const base = context.createGain();
    const danger = context.createGain();
    master.gain.value = 1;
    base.gain.value = 0;
    danger.gain.value = 0;
    base.connect(master);
    danger.connect(master);
    master.connect(context.destination);

    const low = context.createOscillator();
    const mid = context.createOscillator();
    const alert = context.createOscillator();
    low.type = "sine";
    mid.type = "triangle";
    alert.type = "sine";
    low.frequency.value = 110;
    mid.frequency.value = 164.81;
    alert.frequency.value = 329.63;
    low.connect(base);
    mid.connect(base);
    alert.connect(danger);
    low.start();
    mid.start();
    alert.start();

    this.baseGain = base;
    this.dangerGain = danger;
    this.musicNodes = [low, mid, alert];
    this.applyMusicLevels(0);
  }

  private applyMusicLevels(dangerLevel: number): void {
    const context = this.context;
    if (context === null || this.baseGain === null || this.dangerGain === null) return;
    const now = context.currentTime;
    const music =
      this.settings.musicEnabled && !this.sharedMusicPlaying
        ? this.settings.musicVolume
        : 0;
    const baseLevel = 0.018 * music;
    const dangerLevelGain = this.settings.dangerAudioEnabled ? 0.035 * music * dangerLevel : 0;
    this.baseGain.gain.cancelScheduledValues(now);
    this.dangerGain.gain.cancelScheduledValues(now);
    this.baseGain.gain.linearRampToValueAtTime(baseLevel, now + 0.16);
    this.dangerGain.gain.linearRampToValueAtTime(dangerLevelGain, now + 0.16);
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    endFrequency?: number,
  ): void {
    const context = this.getContext();
    if (context === null) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    }
    const peak = Math.max(0.0001, volume * this.settings.sfxVolume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
