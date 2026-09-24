import type { VocabularyEntry } from "../types";

const BASE_URL = "https://typing-game.local/vocabulary";
const STORAGE_KEY = "vocabShooterVocabularySource";
const DEFAULT_TOPIC_ID = "everyday.routine";

export type VocabularySourceMode = "class" | "topic" | "custom";

export type VocabularySourceSettings = {
  mode: VocabularySourceMode;
  level: number;
  topicId: string;
};

export type VocabularyLevelMeta = {
  level: number;
  label: string;
  file: string;
  count: number;
};

export type VocabularyIndex = {
  version: 1;
  plannedLevels: number;
  availableLevels: number;
  totalEntries: number;
  levels: VocabularyLevelMeta[];
};

export type VocabularyTopicEntry = {
  key: string;
  level: number;
};

export type VocabularyTopicMeta = {
  id: string;
  label: string;
  group: string;
  groupLabel?: string;
  levels: string[];
  count: number;
  keys: string[];
  entries?: VocabularyTopicEntry[];
};

export type VocabularyTopicIndex = {
  version: 1;
  totalGroups: number;
  totalTopics: number;
  uniqueVocabularyKeys: number;
  topics: VocabularyTopicMeta[];
};

type VocabularyLookup = {
  version: 1;
  totalEntries: number;
  entries: Record<string, number>;
};

const defaults: VocabularySourceSettings = {
  mode: "custom",
  level: 1,
  topicId: DEFAULT_TOPIC_ID,
};

function normalizeEnglish(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function isEntry(value: unknown): value is VocabularyEntry {
  if (value === null || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["id"] === "string" &&
    entry["id"].trim() !== "" &&
    typeof entry["en"] === "string" &&
    entry["en"].trim() !== "" &&
    typeof entry["vi"] === "string" &&
    entry["vi"].trim() !== "" &&
    typeof entry["ipa"] === "string" &&
    entry["ipa"].trim() !== ""
  );
}

function isTopicMeta(value: unknown): value is VocabularyTopicMeta {
  if (value === null || typeof value !== "object") return false;
  const topic = value as Record<string, unknown>;
  return (
    typeof topic["id"] === "string" &&
    topic["id"].trim() !== "" &&
    typeof topic["label"] === "string" &&
    topic["label"].trim() !== "" &&
    typeof topic["group"] === "string" &&
    (topic["groupLabel"] === undefined ||
      (typeof topic["groupLabel"] === "string" &&
        topic["groupLabel"].trim() !== "")) &&
    Array.isArray(topic["levels"]) &&
    Array.isArray(topic["keys"]) &&
    topic["keys"].every((key) => typeof key === "string" && key.trim() !== "") &&
    (topic["entries"] === undefined ||
      (Array.isArray(topic["entries"]) &&
        topic["entries"].every((entry) => {
          if (entry === null || typeof entry !== "object") return false;
          const item = entry as Record<string, unknown>;
          return (
            typeof item["key"] === "string" &&
            item["key"].trim() !== "" &&
            typeof item["level"] === "number" &&
            Number.isInteger(item["level"]) &&
            item["level"] >= 1 &&
            item["level"] <= 100
          );
        }))) &&
    typeof topic["count"] === "number" &&
    Number.isInteger(topic["count"]) &&
    topic["count"] > 0 &&
    topic["keys"].length === topic["count"] &&
    (topic["entries"] === undefined ||
      topic["entries"].length === topic["count"])
  );
}

export function loadVocabularySourceSettings(): VocabularySourceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...defaults };
    const data = JSON.parse(raw) as Record<string, unknown>;
    const mode: VocabularySourceMode =
      data["mode"] === "class" || data["mode"] === "topic"
        ? data["mode"]
        : "custom";
    return {
      mode,
      level:
        typeof data["level"] === "number" &&
        Number.isInteger(data["level"]) &&
        data["level"] >= 1 &&
        data["level"] <= 100
          ? data["level"]
          : defaults.level,
      topicId:
        typeof data["topicId"] === "string" && data["topicId"].trim() !== ""
          ? data["topicId"]
          : defaults.topicId,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveVocabularySourceSettings(
  settings: VocabularySourceSettings,
): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function loadVocabularyIndex(): Promise<VocabularyIndex> {
  const response = await fetch(`${BASE_URL}/index.json`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Vocabulary index request failed: ${response.status}`);
  }

  const data = (await response.json()) as VocabularyIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.levels) ||
    data.levels.length === 0
  ) {
    throw new Error("Vocabulary index is invalid");
  }
  return data;
}

export async function loadVocabularyTopicIndex(): Promise<VocabularyTopicIndex> {
  const response = await fetch(`${BASE_URL}/topics/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary topic index request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyTopicIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.topics) ||
    data.topics.length === 0 ||
    !data.topics.every(isTopicMeta)
  ) {
    throw new Error("Vocabulary topic index is invalid");
  }
  return data;
}

async function loadVocabularyLookup(): Promise<VocabularyLookup> {
  const response = await fetch(`${BASE_URL}/lookup.json`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Vocabulary lookup request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyLookup;
  if (
    data.version !== 1 ||
    typeof data.entries !== "object" ||
    data.entries === null
  ) {
    throw new Error("Vocabulary lookup is invalid");
  }
  return data;
}

export async function loadVocabularyLevel(
  level: number,
  index?: VocabularyIndex,
): Promise<VocabularyEntry[]> {
  const metadata =
    index?.levels.find((item) => item.level === level) ??
    (await loadVocabularyIndex()).levels.find((item) => item.level === level);

  if (metadata === undefined) {
    throw new Error(`Vocabulary level ${level} is unavailable`);
  }

  const response = await fetch(`${BASE_URL}/${metadata.file}`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary level request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    version?: unknown;
    level?: unknown;
    entries?: unknown;
  };

  if (
    data.version !== 1 ||
    data.level !== level ||
    !Array.isArray(data.entries) ||
    !data.entries.every(isEntry)
  ) {
    throw new Error(`Vocabulary level ${level} is invalid`);
  }

  return data.entries;
}

export async function loadVocabularyTopic(
  topicId: string,
  topicIndex?: VocabularyTopicIndex,
  vocabularyIndex?: VocabularyIndex,
): Promise<VocabularyEntry[]> {
  const topics = topicIndex ?? (await loadVocabularyTopicIndex());
  const topic = topics.topics.find((item) => item.id === topicId);
  if (topic === undefined) {
    throw new Error(`Vocabulary topic ${topicId} is unavailable`);
  }

  const index =
    vocabularyIndex === undefined
      ? await loadVocabularyIndex()
      : vocabularyIndex;

  let levelHints = topic.entries;
  if (levelHints === undefined) {
    const lookup = await loadVocabularyLookup();
    levelHints = topic.keys.flatMap((key) => {
      const level = lookup.entries[normalizeEnglish(key)];
      return Number.isInteger(level) ? [{ key, level }] : [];
    });
  }

  const levels = [
    ...new Set(levelHints.map((entry) => entry.level)),
  ].sort((a, b) => a - b);

  const levelEntries = await Promise.all(
    levels.map((level) => loadVocabularyLevel(level, index)),
  );
  const entriesByKey = new Map<string, VocabularyEntry>();
  for (const entry of levelEntries.flat()) {
    entriesByKey.set(normalizeEnglish(entry.en), entry);
  }

  const resolved = topic.keys
    .map((key) => entriesByKey.get(normalizeEnglish(key)))
    .filter((entry): entry is VocabularyEntry => entry !== undefined);

  if (resolved.length === 0) {
    throw new Error(`Vocabulary topic ${topicId} has no available entries`);
  }
  return resolved;
}
