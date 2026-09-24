import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadVocabularyGrammarModule,
  loadVocabularyPosCategory,
  loadVocabularySourceSettings,
  loadVocabularyTopic,
  type VocabularyGrammarIndex,
  type VocabularyIndex,
  type VocabularyPosIndex,
  type VocabularyTopicIndex,
} from "./library";

const vocabularyIndex: VocabularyIndex = {
  version: 1,
  plannedLevels: 100,
  availableLevels: 3,
  totalEntries: 5,
  levels: [
    { level: 1, label: "One", file: "levels/001.json", count: 2 },
    { level: 2, label: "Two", file: "levels/002.json", count: 2 },
    { level: 3, label: "Unused", file: "levels/003.json", count: 1 },
  ],
};

function installVocabularyFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json =
      url.endsWith("/levels/001.json")
        ? {
            version: 1,
            level: 1,
            entries: [
              { id: "L001-001", en: "apple", vi: "táo", ipa: "/ˈæpəl/" },
              { id: "L001-002", en: "today", vi: "hôm nay", ipa: "/təˈdeɪ/" },
            ],
          }
        : url.endsWith("/levels/002.json")
          ? {
              version: 1,
              level: 2,
              entries: [
                { id: "L002-001", en: "banana", vi: "chuối", ipa: "/bəˈnænə/" },
                { id: "L002-002", en: "work", vi: "công việc", ipa: "/wɝk/" },
              ],
            }
          : { version: 1, level: 3, entries: [] };

    return {
      ok: true,
      status: 200,
      json: async () => json,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("shared curriculum vocabulary sources", () => {
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
    const fetchMock = installVocabularyFetch();

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

  it("loads word-type entries from embedded level hints without the 18k lookup", async () => {
    const posIndex: VocabularyPosIndex = {
      version: 1,
      categories: [
        {
          id: "noun",
          tokens: ["banana", "apple"],
          entries: [
            { key: "banana", level: 2 },
            { key: "apple", level: 1 },
          ],
          missing: [],
        },
      ],
    };
    const fetchMock = installVocabularyFetch();

    const entries = await loadVocabularyPosCategory(
      "noun",
      posIndex,
      vocabularyIndex,
    );

    expect(entries.map((entry) => entry.en)).toEqual(["banana", "apple"]);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/lookup.json")),
    ).toBe(false);
  });

  it("builds grammar practice from signal words plus linked topic context", async () => {
    const topicIndex: VocabularyTopicIndex = {
      version: 1,
      totalGroups: 1,
      totalTopics: 1,
      uniqueVocabularyKeys: 2,
      topics: [
        {
          id: "everyday.routine",
          label: "Daily Routine",
          group: "everyday-life",
          groupLabel: "Everyday Life",
          levels: ["A1"],
          count: 2,
          keys: ["work", "today"],
          entries: [
            { key: "work", level: 2 },
            { key: "today", level: 1 },
          ],
        },
      ],
    };
    const grammarIndex: VocabularyGrammarIndex = {
      version: 1,
      primaryTimeGroups: ["time.present"],
      modules: [
        {
          id: "time.present",
          label: "Present",
          group: "present",
          focus: ["habits and routines"],
          topicIds: ["everyday.routine"],
          signalTokens: ["today"],
          signalEntries: [{ key: "today", level: 1 }],
          missingSignalKeys: [],
        },
      ],
    };
    installVocabularyFetch();

    const entries = await loadVocabularyGrammarModule(
      "time.present",
      grammarIndex,
      topicIndex,
      vocabularyIndex,
    );

    expect(entries.map((entry) => entry.en)).toEqual(["today", "work"]);
  });

  it("restores curriculum source settings while keeping safe defaults", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() =>
        JSON.stringify({
          mode: "grammar",
          level: 7,
          topicId: "travel.airport",
          posId: "verb",
          grammarId: "time.future",
        }),
      ),
      setItem: vi.fn(),
    });

    expect(loadVocabularySourceSettings()).toEqual({
      mode: "grammar",
      level: 7,
      topicId: "travel.airport",
      posId: "verb",
      grammarId: "time.future",
    });
  });
});
