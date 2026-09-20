import type { VocabularyEntry } from "../types";

const BASE_URL = "https://typing-game.local/vocabulary";
const STORAGE_KEY = "vocabShooterVocabularySource";

export type VocabularySourceMode = "class" | "custom";

export type VocabularySourceSettings = {
  mode: VocabularySourceMode;
  level: number;
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

const defaults: VocabularySourceSettings = {
  mode: "custom",
  level: 1,
};

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

export function loadVocabularySourceSettings(): VocabularySourceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...defaults };
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: data["mode"] === "class" ? "class" : "custom",
      level:
        typeof data["level"] === "number" &&
        Number.isInteger(data["level"]) &&
        data["level"] >= 1 &&
        data["level"] <= 100
          ? data["level"]
          : defaults.level,
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
