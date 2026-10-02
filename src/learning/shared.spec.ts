import { describe, expect, it } from "vitest";

import {
  buildShooterLearningEvent,
  parseShooterEnglishActivityDataset,
  parseShooterReviewDataset,
  shooterEnglishActivityEntries,
} from "./shared";

describe("Vocabulary Shooter shared learning contract", () => {
  it("parses and deduplicates compatible vocabulary review datasets", () => {
    expect(
      parseShooterReviewDataset({
        version: 1,
        type: "typing-game:learning:v1:review-dataset",
        requestId: "shooter-review-1",
        goal: "spelling",
        items: [
          { entityType: "vocabulary", entityId: " Airport " },
          { entityType: "vocabulary", entityId: "AIRPORT" },
          { entityType: "vocabulary", entityId: "passport" },
        ],
      }),
    ).toEqual({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "shooter-review-1",
      goal: "spelling",
      entityIds: ["airport", "passport"],
    });
  });

  it("rejects listening and non-vocabulary review input", () => {
    expect(() =>
      parseShooterReviewDataset({
        version: 1,
        type: "typing-game:learning:v1:review-dataset",
        requestId: "shooter-review-2",
        goal: "listening",
        items: [{ entityType: "vocabulary", entityId: "airport" }],
      }),
    ).toThrow("goal is invalid");

    expect(() =>
      parseShooterReviewDataset({
        version: 1,
        type: "typing-game:learning:v1:review-dataset",
        requestId: "shooter-review-3",
        goal: "mixed",
        items: [{ entityType: "grammar", entityId: "time.present" }],
      }),
    ).toThrow("vocabulary only");
  });

  it("records a clean destroyed target as one correct typing event", () => {
    expect(
      buildShooterLearningEvent({
        entry: {
          id: "airport",
          en: "Airport",
          vi: "sân bay",
          ipa: "/ˈerˌpɔrt/",
        },
        outcome: "completed",
        wrongKeys: 0,
        responseMs: 801.7,
        occurredAt: "2026-09-24T15:00:00.000Z",
      }),
    ).toEqual({
      version: 1,
      entityType: "vocabulary",
      entityId: "airport",
      gameId: "vocab-shooter",
      activityType: "typing",
      result: "correct",
      occurredAt: "2026-09-24T15:00:00.000Z",
      responseMs: 802,
      hintUsed: false,
      replayUsed: false,
      expectedAnswer: "Airport",
    });
  });

  it("records corrected spelling and missed targets as wrong word events", () => {
    expect(
      buildShooterLearningEvent({
        entry: { id: "word", en: "word", vi: "từ", ipa: "/wɝːd/" },
        outcome: "completed",
        wrongKeys: 2,
        responseMs: 100,
      }),
    ).toMatchObject({
      result: "wrong",
      errorType: "spelling",
    });

    expect(
      buildShooterLearningEvent({
        entry: { id: "word", en: "word", vi: "từ", ipa: "/wɝːd/" },
        outcome: "missed",
        wrongKeys: 0,
        responseMs: 5000,
      }),
    ).toMatchObject({
      result: "wrong",
      errorType: "missed-word",
    });
  });
  it("preserves rich phrase identity in Shooter learning events", () => {
    const dataset = parseShooterEnglishActivityDataset({
      version: 1,
      type: "typing-game:english-content:v1:activity-dataset",
      requestId: "shooter-rich-1",
      gameId: "vocab-shooter",
      activity: "phrasal-verb",
      items: [{
        contentId: "pv.look-up",
        entityType: "sentence",
        entityId: "pv.look-up",
        promptText: "tra cứu",
        answerText: "look up",
        meaningVi: "tra cứu",
      }],
    });
    expect(dataset).not.toBeNull();
    const entry = shooterEnglishActivityEntries(dataset!)[0]!;
    expect(
      buildShooterLearningEvent({
        entry,
        outcome: "completed",
        wrongKeys: 0,
        responseMs: 700,
        occurredAt: "2026-10-03T00:00:00.000Z",
      }),
    ).toMatchObject({
      entityType: "sentence",
      entityId: "pv.look-up",
      activityType: "phrasal-verb",
      result: "correct",
    });
  });

});
