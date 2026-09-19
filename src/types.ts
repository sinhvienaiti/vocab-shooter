export type VocabularyEntry = {
  id: string;
  en: string;
  vi: string;
  ipa: string;
};

export type Accent = "en-US" | "en-GB";
export type GraphicsMode = "performance" | "balanced" | "quality";
export type GameMode = "classic" | "bounce" | "timeAttack" | "targetRush";
export type QuickRestartKey = "Tab" | "Escape";

export type ClassicSettings = {
  lives: number;
  spawnIntervalMs: number;
  speed: number;
};

export type BounceSettings = {
  maxActiveWords: number;
  spawnIntervalMs: number;
  speed: number;
};

export type TimeAttackSettings = {
  durationSec: number;
  spawnIntervalMs: number;
  speed: number;
};

export type TargetRushSettings = {
  targetCount: number;
  focusWindowSec: number;
  impactWindowSec: number;
};

export type ShooterSettings = {
  version: 2;
  mode: GameMode;
  speechEnabled: boolean;
  accent: Accent;
  speechRate: number;
  volume: number;
  revealMs: number;
  graphics: GraphicsMode;
  quickRestartKey: QuickRestartKey;
  musicEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  dangerAudioEnabled: boolean;
  classic: ClassicSettings;
  bounce: BounceSettings;
  timeAttack: TimeAttackSettings;
  targetRush: TargetRushSettings;
};
