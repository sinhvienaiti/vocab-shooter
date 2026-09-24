import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadVocabularySourceSettings,
  loadVocabularyTopic,
  type VocabularyIndex,
  type VocabularyTopicIndex,
} from "./library";

describe("topic vocabulary source", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads only the levels referenced by the selected topic and preserves topic order", async () => {
    const topicIndex: VocabularyTopicIndex = {
      version: 1,
      totalGroups: 1,
      totalTopics: 1,
      uniqueVocabularyKeys: 2,
      topics: [
        {
          id: "food.fruit",
          label: "Fruit",
          group: "food",
          groupLabel: "Food & Drink",
          levels: ["A1"],
          count: 2,
          keys: ["banana", "apple"],
          entries: [
            { key: "banana", level: 2 },
            { key: "apple", level: 1 },
          ],
        },
      ],
    };
    const vocabularyIndex: VocabularyIndex = {
      version: 1,
      plannedLevels: 100,
      availableLevels: 3,
      totalEntries: 3,
      levels: [
        { level: 1, label: "One", file: "levels/001.json", count: 1 },
        { level: 2, label: "Two", file: "levels/002.json", count: 1 },
        { level: 3, label: "Unused", file: "levels/003.json", count: 1 },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json =
        url.endsWith("/levels/001.json")
          ? {
                version: 1,
                level: 1,
                entries: [{ id: "L001-001", en: "apple", vi: "táo", ipa: "/ˈæpəl/" }],
              }
            : url.endsWith("/levels/002.json")
              ? {
                  version: 1,
                  level: 2,
                  entries: [{ id: "L002-001", en: "banana", vi: "chuối", ipa: "/bəˈnænə/" }],
                }
              : { version: 1, level: 3, entries: [] };

      return {
        ok: true,
        status: 200,
        json: async () => json,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries = await loadVocabularyTopic(
      "food.fruit",
      topicIndex,
      vocabularyIndex,
    );

    expect(entries.map((entry) => entry.en)).toEqual(["banana", "apple"]);
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.endsWith("/lookup.json"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/levels/001.json"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/levels/002.json"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/levels/003.json"))).toBe(false);
  });

  it("restores topic source settings without losing the level fallback", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() =>
        JSON.stringify({
          mode: "topic",
          level: 7,
          topicId: "travel.airport",
        }),
      ),
      setItem: vi.fn(),
    });

    expect(loadVocabularySourceSettings()).toEqual({
      mode: "topic",
      level: 7,
      topicId: "travel.airport",
    });
  });
});
