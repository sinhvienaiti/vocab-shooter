export class ShuffleBag<T extends { id: string }> {
  private entries: T[] = [];
  private remaining: T[] = [];
  private lastId: string | null = null;

  constructor(entries: T[] = []) {
    this.setEntries(entries);
  }

  setEntries(entries: T[]): void {
    this.entries = [...entries];
    this.remaining = [];
    this.lastId = null;
  }

  takeOne(): T | undefined {
    if (this.entries.length === 0) return undefined;
    if (this.remaining.length === 0) this.refill();

    const entry = this.remaining.shift();
    if (entry !== undefined) this.lastId = entry.id;
    return entry;
  }

  take(count: number): T[] {
    const result: T[] = [];
    const selectedIds = new Set<string>();
    const target = Math.min(
      this.entries.length,
      Math.max(0, Math.floor(count)),
    );

    while (result.length < target && this.entries.length > 0) {
      if (this.remaining.length === 0) this.refill(selectedIds);

      const entry = this.remaining.shift();
      if (entry === undefined) break;
      if (selectedIds.has(entry.id)) continue;

      selectedIds.add(entry.id);
      this.lastId = entry.id;
      result.push(entry);
    }

    return result;
  }

  private refill(excludedIds: Set<string> = new Set()): void {
    const pool = [...this.entries];

    for (let index = pool.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swap]] = [pool[swap] as T, pool[index] as T];
    }

    const fresh = pool.filter((entry) => !excludedIds.has(entry.id));
    const alreadySelected = pool.filter((entry) => excludedIds.has(entry.id));
    const ordered = [...fresh, ...alreadySelected];

    if (ordered.length > 1 && ordered[0]?.id === this.lastId) {
      const replacementIndex = ordered.findIndex(
        (entry) => entry.id !== this.lastId && !excludedIds.has(entry.id),
      );
      const fallbackIndex = ordered.findIndex(
        (entry) => entry.id !== this.lastId,
      );
      const swapIndex =
        replacementIndex > 0 ? replacementIndex : fallbackIndex;

      if (swapIndex > 0) {
        const first = ordered[0];
        const replacement = ordered[swapIndex];
        if (first !== undefined && replacement !== undefined) {
          ordered[0] = replacement;
          ordered[swapIndex] = first;
        }
      }
    }

    this.remaining = ordered;
  }
}
