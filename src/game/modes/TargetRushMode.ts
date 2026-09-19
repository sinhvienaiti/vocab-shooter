import type { VocabularyEntry } from "../../types";
import type { Target } from "../mode-types";

export function shuffledEntries(entries: VocabularyEntry[], count: number): VocabularyEntry[] {
  const pool = [...entries];
  for (let index = pool.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap] as VocabularyEntry, pool[index] as VocabularyEntry];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

export function layoutRushTargets(targets: Target[], width: number, height: number): void {
  if (targets.length === 0) return;
  const usableTop = 36;
  const usableBottom = Math.max(usableTop + 120, height - 100);
  const usableHeight = usableBottom - usableTop;
  const columns = Math.max(3, Math.ceil(Math.sqrt(targets.length * Math.max(1.2, width / Math.max(1, usableHeight)))));
  const rows = Math.ceil(targets.length / columns);
  const cellWidth = width / columns;
  const cellHeight = usableHeight / Math.max(1, rows);

  targets.forEach((target, index) => {
    if (target.state === "danger" || target.pending) return;
    const column = index % columns;
    const row = Math.floor(index / columns);
    target.x = cellWidth * column + cellWidth / 2;
    target.y = usableTop + cellHeight * row + cellHeight / 2;
    target.width = Math.max(76, Math.min(cellWidth - 10, 46 + target.entry.en.length * 8));
  });
}

export function rushDangerLevel(targets: Target[], impactWindowSec: number): number {
  const danger = targets.filter((target) => target.state === "danger" && !target.pending);
  if (danger.length === 0) return 0;
  const minimumRemaining = Math.min(...danger.map((target) => target.dangerRemaining));
  return Math.min(1, 1 - minimumRemaining / Math.max(0.1, impactWindowSec));
}
