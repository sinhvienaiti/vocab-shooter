import { describe, expect, it } from "vitest";
import { normalizeImportedVocabulary } from "./vocabulary-editor";

describe("normalizeImportedVocabulary", () => {
  it("trims valid rows and guarantees unique ids", () => {
    const rows = normalizeImportedVocabulary([
      { id: "same", en: " cache ", vi: " bộ nhớ đệm ", ipa: " /kæʃ/ " },
      { id: "same", en: "render", vi: "kết xuất" },
      { id: "", en: "queue", vi: "hàng đợi" },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      id: "same",
      en: "cache",
      vi: "bộ nhớ đệm",
      ipa: "/kæʃ/",
    });
    expect(new Set(rows.map((entry) => entry.id)).size).toBe(3);
  });

  it("drops malformed or blank rows", () => {
    const rows = normalizeImportedVocabulary([
      null,
      { en: "", vi: "x" },
      { en: "word", vi: "   " },
      { en: 1, vi: "x" },
      { en: "valid", vi: "hợp lệ", ipa: 123 },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.en).toBe("valid");
    expect(rows[0]?.ipa).toBe("");
  });

  it("returns no entries for a non-array payload", () => {
    expect(normalizeImportedVocabulary({ en: "x", vi: "y" })).toEqual([]);
  });
});
