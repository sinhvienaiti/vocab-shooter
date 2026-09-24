import type { VocabularyEntry } from "../types";

const BASE_URL = "https://typing-game.local/vocabulary";
const STORAGE_KEY = "vocabShooterVocabularySource";
const DEFAULT_TOPIC_ID = "everyday.routine";
const DEFAULT_POS_ID = "noun";
const DEFAULT_GRAMMAR_ID = "time.present";

export type VocabularySourceMode =
  | "class"
  | "topic"
  | "word-type"
  | "grammar"
  | "custom";

export type VocabularySourceSettings = {
  mode: VocabularySourceMode;
  level: number;
  topicId: string;
  posId: string;
  grammarId: string;
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

export type VocabularyReference = {
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
  entries?: VocabularyReference[];
};

export type VocabularyTopicIndex = {
  version: 1;
  totalGroups: number;
  totalTopics: number;
  uniqueVocabularyKeys: number;
  topics: VocabularyTopicMeta[];
};

export type VocabularyPosCategory = {
  id: string;
  tokens: string[];
  entries: VocabularyReference[];
  missing: string[];
};

export type VocabularyPosIndex = {
  version: 1;
  categories: VocabularyPosCategory[];
};

export type VocabularyGrammarModule = {
  id: string;
  label: string;
  group: string;
  focus: string[];
  topicIds: string[];
  signalTokens: string[];
  signalEntries: VocabularyReference[];
  missingSignalKeys: string[];
};

export type VocabularyGrammarIndex = {
  version: 1;
  primaryTimeGroups: string[];
  modules: VocabularyGrammarModule[];
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
  posId: DEFAULT_POS_ID,
  grammarId: DEFAULT_GRAMMAR_ID,
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

function isReference(value: unknown): value is VocabularyReference {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["key"] === "string" &&
    item["key"].trim() !== "" &&
    typeof item["level"] === "number" &&
    Number.isInteger(item["level"]) &&
    item["level"] >= 1 &&
    item["level"] <= 100
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
    topic["group"].trim() !== "" &&
    (topic["groupLabel"] === undefined ||
      (typeof topic["groupLabel"] === "string" &&
        topic["groupLabel"].trim() !== "")) &&
    Array.isArray(topic["levels"]) &&
    topic["levels"].every((level) => typeof level === "string") &&
    Array.isArray(topic["keys"]) &&
    topic["keys"].every((key) => typeof key === "string" && key.trim() !== "") &&
    (topic["entries"] === undefined ||
      (Array.isArray(topic["entries"]) && topic["entries"].every(isReference))) &&
    typeof topic["count"] === "number" &&
    Number.isInteger(topic["count"]) &&
    topic["count"] > 0 &&
    topic["keys"].length === topic["count"] &&
    (topic["entries"] === undefined || topic["entries"].length === topic["count"])
  );
}

function isPosCategory(value: unknown): value is VocabularyPosCategory {
  if (value === null || typeof value !== "object") return false;
  const category = value as Record<string, unknown>;
  return (
    typeof category["id"] === "string" &&
    category["id"].trim() !== "" &&
    Array.isArray(category["tokens"]) &&
    category["tokens"].every((token) => typeof token === "string") &&
    Array.isArray(category["entries"]) &&
    category["entries"].every(isReference) &&
    Array.isArray(category["missing"]) &&
    category["missing"].every((token) => typeof token === "string")
  );
}

function isGrammarModule(value: unknown): value is VocabularyGrammarModule {
  if (value === null || typeof value !== "object") return false;
  const module = value as Record<string, unknown>;
  return (
    typeof module["id"] === "string" &&
    module["id"].trim() !== "" &&
    typeof module["label"] === "string" &&
    module["label"].trim() !== "" &&
    typeof module["group"] === "string" &&
    module["group"].trim() !== "" &&
    Array.isArray(module["focus"]) &&
    module["focus"].every((item) => typeof item === "string") &&
    Array.isArray(module["topicIds"]) &&
    module["topicIds"].every((item) => typeof item === "string") &&
    Array.isArray(module["signalTokens"]) &&
    module["signalTokens"].every((item) => typeof item === "string") &&
    Array.isArray(module["signalEntries"]) &&
    module["signalEntries"].every(isReference) &&
    Array.isArray(module["missingSignalKeys"]) &&
    module["missingSignalKeys"].every((item) => typeof item === "string")
  );
}

export function loadVocabularySourceSettings(): VocabularySourceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...defaults };
    const data = JSON.parse(raw) as Record<string, unknown>;
    const mode: VocabularySourceMode =
      data["mode"] === "class" ||
      data["mode"] === "topic" ||
      data["mode"] === "word-type" ||
      data["mode"] === "grammar"
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
      posId:
        typeof data["posId"] === "string" && data["posId"].trim() !== ""
          ? data["posId"]
          : defaults.posId,
      grammarId:
        typeof data["grammarId"] === "string" && data["grammarId"].trim() !== ""
          ? data["grammarId"]
          : defaults.grammarId,
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

export async function loadVocabularyPosIndex(): Promise<VocabularyPosIndex> {
  const response = await fetch(`${BASE_URL}/parts-of-speech/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary word-type index request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyPosIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.categories) ||
    data.categories.length === 0 ||
    !data.categories.every(isPosCategory)
  ) {
    throw new Error("Vocabulary word-type index is invalid");
  }
  return data;
}

export async function loadVocabularyGrammarIndex(): Promise<VocabularyGrammarIndex> {
  const response = await fetch(`${BASE_URL}/grammar/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary grammar index request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyGrammarIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.primaryTimeGroups) ||
    !Array.isArray(data.modules) ||
    data.modules.length === 0 ||
    !data.modules.every(isGrammarModule)
  ) {
    throw new Error("Vocabulary grammar index is invalid");
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

async function resolveTopicReferences(
  topic: VocabularyTopicMeta,
): Promise<VocabularyReference[]> {
  if (topic.entries !== undefined) return topic.entries;
  const lookup = await loadVocabularyLookup();
  return topic.keys.flatMap((key) => {
    const level = lookup.entries[normalizeEnglish(key)];
    return Number.isInteger(level) ? [{ key, level }] : [];
  });
}

async function loadEntriesByReferences(
  references: readonly VocabularyReference[],
  orderedKeys: readonly string[],
  vocabularyIndex?: VocabularyIndex,
): Promise<VocabularyEntry[]> {
  const index = vocabularyIndex ?? (await loadVocabularyIndex());
  const levels = [
    ...new Set(
      references
        .map((entry) => entry.level)
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 100),
    ),
  ].sort((a, b) => a - b);

  if (levels.length === 0) {
    throw new Error("Selected curriculum item has no mapped vocabulary levels");
  }

  const levelEntries = await Promise.all(
    levels.map((level) => loadVocabularyLevel(level, index)),
  );
  const entriesByKey = new Map<string, VocabularyEntry>();
  for (const entry of levelEntries.flat()) {
    entriesByKey.set(normalizeEnglish(entry.en), entry);
  }

  const resolved: VocabularyEntry[] = [];
  const seen = new Set<string>();
  for (const key of orderedKeys) {
    const normalized = normalizeEnglish(key);
    if (seen.has(normalized)) continue;
    const entry = entriesByKey.get(normalized);
    if (entry === undefined) continue;
    seen.add(normalized);
    resolved.push(entry);
  }

  if (resolved.length === 0) {
    throw new Error("Selected curriculum item has no available vocabulary entries");
  }
  return resolved;
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
  const references = await resolveTopicReferences(topic);
  return loadEntriesByReferences(references, topic.keys, vocabularyIndex);
}

export async function loadVocabularyPosCategory(
  posId: string,
  posIndex?: VocabularyPosIndex,
  vocabularyIndex?: VocabularyIndex,
): Promise<VocabularyEntry[]> {
  const index = posIndex ?? (await loadVocabularyPosIndex());
  const category = index.categories.find((item) => item.id === posId);
  if (category === undefined) {
    throw new Error(`Vocabulary word type ${posId} is unavailable`);
  }
  return loadEntriesByReferences(
    category.entries,
    category.entries.map((entry) => entry.key),
    vocabularyIndex,
  );
}

export async function loadVocabularyGrammarModule(
  grammarId: string,
  grammarIndex?: VocabularyGrammarIndex,
  topicIndex?: VocabularyTopicIndex,
  vocabularyIndex?: VocabularyIndex,
): Promise<VocabularyEntry[]> {
  const grammar = grammarIndex ?? (await loadVocabularyGrammarIndex());
  const module = grammar.modules.find((item) => item.id === grammarId);
  if (module === undefined) {
    throw new Error(`Vocabulary grammar module ${grammarId} is unavailable`);
  }

  const topics = topicIndex ?? (await loadVocabularyTopicIndex());
  const references: VocabularyReference[] = [...module.signalEntries];
  const keys: string[] = module.signalEntries.map((entry) => entry.key);

  for (const topicId of module.topicIds) {
    const topic = topics.topics.find((item) => item.id === topicId);
    if (topic === undefined) continue;
    const topicReferences = await resolveTopicReferences(topic);
    references.push(...topicReferences);
    keys.push(...topic.keys);
  }

  return loadEntriesByReferences(references, keys, vocabularyIndex);
}
