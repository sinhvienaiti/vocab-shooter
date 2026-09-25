import type { VocabularyEntry } from "../types";

export function parseBulkVocabulary(text: string): VocabularyEntry[] {
  const result: VocabularyEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    const [en = "", vi = "", ipa = ""] = line.split("|").map((part) => part.trim());
    if (en === "" || vi === "") continue;
    result.push({ id: crypto.randomUUID(), en, vi, ipa });
  }
  return result;
}

export function vocabularyToBulk(entries: VocabularyEntry[]): string {
  return entries.map((entry) => `${entry.en} | ${entry.vi} | ${entry.ipa}`).join("\n");
}


export function normalizeImportedVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];

  const usedIds = new Set<string>();
  const result: VocabularyEntry[] = [];

  for (const raw of value) {
    if (raw === null || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry["en"] !== "string" || typeof entry["vi"] !== "string") {
      continue;
    }

    const en = entry["en"].trim();
    const vi = entry["vi"].trim();
    if (en === "" || vi === "") continue;

    let id =
      typeof entry["id"] === "string" && entry["id"].trim() !== ""
        ? entry["id"].trim()
        : crypto.randomUUID();
    while (usedIds.has(id)) id = crypto.randomUUID();
    usedIds.add(id);

    result.push({
      id,
      en,
      vi,
      ipa: typeof entry["ipa"] === "string" ? entry["ipa"].trim() : "",
    });
  }

  return result;
}
