import type { ShooterSettings } from "../../types";
import type { Target } from "../mode-types";

export function classicMaxTargets(score: number): number {
  return Math.min(8, 4 + Math.floor(score / 180));
}

export function classicSpawnInterval(settings: ShooterSettings, score: number): number {
  return Math.max(700, settings.classic.spawnIntervalMs - Math.min(650, score * 1.4));
}

export function classicSpeed(settings: ShooterSettings, score: number): number {
  return settings.classic.speed + Math.min(26, score * 0.045);
}

export function classicDangerLevel(targets: Target[], height: number, lives: number, maxLives: number): number {
  const moving = targets.filter((target) => !target.pending);
  const nearest = moving.length === 0 ? 0 : Math.max(...moving.map((target) => target.y / Math.max(1, height - 80)));
  const lifePressure = maxLives <= 1 ? 0 : 1 - lives / maxLives;
  return Math.min(1, Math.max(nearest * 0.8, lifePressure * 0.9));
}
