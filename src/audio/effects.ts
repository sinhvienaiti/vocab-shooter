let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  endFrequency?: number,
): void {
  const audio = getContext();
  if (audio === null) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function unlockAudio(): void {
  getContext();
}

export function playShoot(): void {
  tone(690, 0.075, 0.055, "square", 1250);
}

export function playExplosion(): void {
  tone(150, 0.16, 0.07, "sawtooth", 52);
  setTimeout(() => tone(92, 0.12, 0.045, "triangle", 38), 20);
}

export function playMiss(): void {
  tone(190, 0.055, 0.025, "triangle", 145);
}
