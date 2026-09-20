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
    const target = Math.max(0, Math.floor(count));

    while (result.length < target && this.entries.length > 0) {
      const entry = this.takeOne();
      if (entry === undefined) break;
      result.push(entry);
    }

    return result;
  }

  private refill(): void {
    const pool = [...this.entries];

    for (let index = pool.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swap]] = [pool[swap] as T, pool[index] as T];
    }

    if (pool.length > 1 && pool[0]?.id === this.lastId) {
      const replacementIndex = pool.findIndex((entry) => entry.id !== this.lastId);
      if (replacementIndex > 0) {
        [pool[0], pool[replacementIndex]] = [
          pool[replacementIndex] as T,
          pool[0] as T,
        ];
      }
    }

    this.remaining = pool;
  }
}
