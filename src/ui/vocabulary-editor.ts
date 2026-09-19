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
