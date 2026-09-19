import type { ShooterSettings } from "../types";

const KEY = "vocabShooterSettings";

export const defaultSettings: ShooterSettings = {
  speechEnabled: true,
  accent: "en-US",
  speechRate: 0.95,
  volume: 1,
  difficulty: 1,
  revealMs: 2200,
  graphics: "balanced",
};

export function loadSettings(): ShooterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return { ...defaultSettings };
    const data = JSON.parse(raw) as Partial<ShooterSettings>;
    return {
      ...defaultSettings,
      ...data,
      speechRate: Math.min(1.4, Math.max(0.65, Number(data.speechRate ?? defaultSettings.speechRate))),
      volume: Math.min(1, Math.max(0, Number(data.volume ?? defaultSettings.volume))),
      revealMs: Math.min(5000, Math.max(700, Number(data.revealMs ?? defaultSettings.revealMs))),
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: ShooterSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
