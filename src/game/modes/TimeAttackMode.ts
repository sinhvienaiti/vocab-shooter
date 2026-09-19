import type { ShooterSettings } from "../../types";

export function timeAttackDangerLevel(remainingSec: number, settings: ShooterSettings): number {
  const tensionWindow = Math.min(15, settings.timeAttack.durationSec * 0.25);
  if (remainingSec >= tensionWindow) return 0;
  return Math.min(1, 1 - remainingSec / Math.max(1, tensionWindow));
}
