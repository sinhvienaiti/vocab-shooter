import type { ShooterSettings } from "../../types";
import type { Target } from "../mode-types";

export function bounceDangerLevel(targets: Target[], settings: ShooterSettings): number {
  return Math.min(1, targets.filter((target) => !target.pending).length / settings.bounce.maxActiveWords);
}

export function reflectTarget(target: Target, width: number, height: number): void {
  const halfWidth = target.width / 2;
  const halfHeight = 22;
  if (target.x - halfWidth <= 8 && target.vx < 0) {
    target.x = halfWidth + 8;
    target.vx = -target.vx;
  }
  if (target.x + halfWidth >= width - 8 && target.vx > 0) {
    target.x = width - halfWidth - 8;
    target.vx = -target.vx;
  }
  if (target.y - halfHeight <= 8 && target.vy < 0) {
    target.y = halfHeight + 8;
    target.vy = -target.vy;
  }
  if (target.y + halfHeight >= height - 82 && target.vy > 0) {
    target.y = height - 82 - halfHeight;
    target.vy = -target.vy;
  }
}
