import type {
  Accent,
  GameMode,
  GraphicsMode,
  QuickRestartKey,
  ShooterSettings,
} from "../types";

const KEY = "vocabShooterSettings";

export const defaultSettings: ShooterSettings = {
  version: 3,
  mode: "classic",
  speechEnabled: true,
  accent: "en-US",
  speechRate: 0.95,
  volume: 1,
  revealMs: 2200,
  graphics: "balanced",
  quickRestartKey: "Escape",
  musicEnabled: true,
  musicVolume: 0.35,
  sfxVolume: 0.7,
  dangerAudioEnabled: true,
  classic: {
    lives: 3,
    spawnIntervalMs: 2100,
    speed: 38,
  },
  bounce: {
    maxActiveWords: 12,
    spawnIntervalMs: 2600,
    speed: 62,
  },
  timeAttack: {
    durationSec: 100,
    spawnIntervalMs: 1800,
    speed: 42,
  },
  targetRush: {
    targetCount: 70,
    focusWindowSec: 3,
    impactWindowSec: 2,
  },
};

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(numberInRange(value, fallback, min, max));
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeSettings(raw: unknown): ShooterSettings {
  if (raw === null || typeof raw !== "object") return structuredClone(defaultSettings);

  const data = raw as Record<string, unknown>;
  const version = numberInRange(data["version"], 1, 1, 3);
  const classic = (data["classic"] ?? {}) as Record<string, unknown>;
  const bounce = (data["bounce"] ?? {}) as Record<string, unknown>;
  const timeAttack = (data["timeAttack"] ?? {}) as Record<string, unknown>;
  const targetRush = (data["targetRush"] ?? {}) as Record<string, unknown>;

  const legacyDifficulty = integerInRange(data["difficulty"], 1, 1, 3);
  const legacyClassicSpeed = [0, 28, 38, 50][legacyDifficulty] ?? defaultSettings.classic.speed;
  const legacySpawn = [0, 2450, 1950, 1500][legacyDifficulty] ?? defaultSettings.classic.spawnIntervalMs;

  return {
    version: 3,
    mode: enumValue<GameMode>(
      data["mode"],
      ["classic", "bounce", "timeAttack", "targetRush"],
      defaultSettings.mode,
    ),
    speechEnabled: boolValue(data["speechEnabled"], defaultSettings.speechEnabled),
    accent: enumValue<Accent>(data["accent"], ["en-US", "en-GB"], defaultSettings.accent),
    speechRate: numberInRange(data["speechRate"], defaultSettings.speechRate, 0.65, 1.4),
    volume: numberInRange(data["volume"], defaultSettings.volume, 0, 1),
    revealMs: integerInRange(data["revealMs"], defaultSettings.revealMs, 700, 5000),
    graphics: enumValue<GraphicsMode>(
      data["graphics"],
      ["performance", "balanced", "quality"],
      defaultSettings.graphics,
    ),
    quickRestartKey:
      version < 3
        ? defaultSettings.quickRestartKey
        : enumValue<QuickRestartKey>(
            data["quickRestartKey"],
            ["Tab", "Escape"],
            defaultSettings.quickRestartKey,
          ),
    musicEnabled: boolValue(data["musicEnabled"], defaultSettings.musicEnabled),
    musicVolume: numberInRange(data["musicVolume"], defaultSettings.musicVolume, 0, 1),
    sfxVolume: numberInRange(data["sfxVolume"], defaultSettings.sfxVolume, 0, 1),
    dangerAudioEnabled: boolValue(data["dangerAudioEnabled"], defaultSettings.dangerAudioEnabled),
    classic: {
      lives: integerInRange(classic["lives"], defaultSettings.classic.lives, 1, 9),
      spawnIntervalMs: integerInRange(
        classic["spawnIntervalMs"],
        data["difficulty"] !== undefined ? legacySpawn : defaultSettings.classic.spawnIntervalMs,
        700,
        5000,
      ),
      speed: numberInRange(
        classic["speed"],
        data["difficulty"] !== undefined ? legacyClassicSpeed : defaultSettings.classic.speed,
        15,
        120,
      ),
    },
    bounce: {
      maxActiveWords: integerInRange(
        bounce["maxActiveWords"],
        defaultSettings.bounce.maxActiveWords,
        3,
        30,
      ),
      spawnIntervalMs: integerInRange(
        bounce["spawnIntervalMs"],
        defaultSettings.bounce.spawnIntervalMs,
        700,
        10000,
      ),
      speed: numberInRange(bounce["speed"], defaultSettings.bounce.speed, 20, 160),
    },
    timeAttack: {
      durationSec: integerInRange(
        timeAttack["durationSec"],
        defaultSettings.timeAttack.durationSec,
        15,
        600,
      ),
      spawnIntervalMs: integerInRange(
        timeAttack["spawnIntervalMs"],
        defaultSettings.timeAttack.spawnIntervalMs,
        600,
        5000,
      ),
      speed: numberInRange(timeAttack["speed"], defaultSettings.timeAttack.speed, 15, 140),
    },
    targetRush: {
      targetCount: integerInRange(
        targetRush["targetCount"],
        defaultSettings.targetRush.targetCount,
        5,
        100,
      ),
      focusWindowSec: numberInRange(
        targetRush["focusWindowSec"],
        defaultSettings.targetRush.focusWindowSec,
        1.5,
        6,
      ),
      impactWindowSec: numberInRange(
        targetRush["impactWindowSec"],
        defaultSettings.targetRush.impactWindowSec,
        1,
        4,
      ),
    },
  };
}

export function loadSettings(): ShooterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? structuredClone(defaultSettings) : normalizeSettings(JSON.parse(raw));
  } catch {
    return structuredClone(defaultSettings);
  }
}

export function saveSettings(settings: ShooterSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
