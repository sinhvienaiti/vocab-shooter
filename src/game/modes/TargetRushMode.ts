import type { Target } from "../mode-types";

export function layoutRushTargets(targets: Target[], width: number, height: number): void {
  if (targets.length === 0) return;

  const usableTop = 28;
  const usableBottom = Math.max(usableTop + 140, height - 92);
  const usableHeight = usableBottom - usableTop;
  const rows = Math.min(4, Math.max(1, targets.length));
  const columns = Math.max(1, Math.ceil(targets.length / rows));
  const cellWidth = width / columns;
  const cellHeight = usableHeight / rows;

  targets.forEach((target, index) => {
    if (target.state === "danger" || target.pending) return;

    const row = index % rows;
    const column = Math.floor(index / rows);
    target.x = cellWidth * column + cellWidth / 2;
    target.y = usableTop + cellHeight * row + cellHeight / 2;
    target.width = Math.max(12, cellWidth - 6);
  });
}

export function rushDangerLevel(targets: Target[], impactWindowSec: number): number {
  const danger = targets.filter((target) => target.state === "danger" && !target.pending);
  if (danger.length === 0) return 0;
  const minimumRemaining = Math.min(...danger.map((target) => target.dangerRemaining));
  return Math.min(1, 1 - minimumRemaining / Math.max(0.1, impactWindowSec));
}
