import type { VocabularyEntry } from "../types";

export const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
export const REVIEW_DATASET_MESSAGE = "typing-game:learning:v1:review-dataset";
export const REVIEW_READY_MESSAGE = "typing-game:learning:v1:review-ready";
export const REVIEW_ERROR_MESSAGE = "typing-game:learning:v1:review-error";
export const ENGLISH_ACTIVITY_DATASET_MESSAGE =
  "typing-game:english-content:v1:activity-dataset";
export const PARENT_ORIGIN = "https://typing-game.local";

export type ShooterReviewGoal = "remember-words" | "spelling" | "mixed";

export type ShooterReviewDataset = {
  version: 1;
  type: typeof REVIEW_DATASET_MESSAGE;
  requestId: string;
  goal: ShooterReviewGoal;
  entityIds: string[];
};

export type ShooterEnglishActivity =
  | "vocabulary"
  | "collocation"
  | "phrasal-verb"
  | "chunk"
  | "contextual-usage";

export type ShooterEnglishActivityDataset = {
  version: 1;
  type: typeof ENGLISH_ACTIVITY_DATASET_MESSAGE;
  requestId: string;
  gameId: "vocab-shooter";
  activity: ShooterEnglishActivity;
  items: Array<{
    contentId: string;
    entityType: "vocabulary" | "sentence";
    entityId: string;
    promptText: string;
    answerText: string;
    meaningVi?: string;
    ipa?: string;
  }>;
};

export type ShooterWordOutcome = "completed" | "missed";

export type ShooterLearningEvent = {
  version: 1;
  entityType: "vocabulary" | "sentence";
  entityId: string;
  gameId: "vocab-shooter";
  activityType: string;
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs: number;
  hintUsed: false;
  replayUsed: false;
  expectedAnswer: string;
  errorType?: "spelling" | "missed-word";
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const GOALS = new Set<ShooterReviewGoal>([
  "remember-words",
  "spelling",
  "mixed",
]);
const ENGLISH_ACTIVITIES = new Set<ShooterEnglishActivity>([
  "vocabulary",
  "collocation",
  "phrasal-verb",
  "chunk",
  "contextual-usage",
]);

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntityId(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseShooterReviewDataset(
  value: unknown,
): ShooterReviewDataset | null {
  if (!plainObject(value) || value["type"] !== REVIEW_DATASET_MESSAGE) {
    return null;
  }
  if (value["version"] !== 1) {
    throw new TypeError("review dataset version is invalid");
  }

  const requestId = value["requestId"];
  if (
    typeof requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId)
  ) {
    throw new TypeError("review requestId is invalid");
  }

  const goal = value["goal"];
  if (typeof goal !== "string" || !GOALS.has(goal as ShooterReviewGoal)) {
    throw new TypeError("Vocabulary Shooter review goal is invalid");
  }

  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new TypeError("review items must contain 1 to 100 items");
  }

  const entityIds: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!plainObject(item) || item["entityType"] !== "vocabulary") {
      throw new TypeError("Vocabulary Shooter review accepts vocabulary only");
    }
    const entityId = item["entityId"];
    if (typeof entityId !== "string") {
      throw new TypeError("review entityId is invalid");
    }
    const normalized = normalizeEntityId(entityId);
    if (normalized === "" || normalized.length > 200) {
      throw new TypeError("review entityId is invalid");
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entityIds.push(normalized);
  }

  if (entityIds.length === 0) {
    throw new TypeError("review dataset is empty");
  }

  return {
    version: 1,
    type: REVIEW_DATASET_MESSAGE,
    requestId,
    goal: goal as ShooterReviewGoal,
    entityIds,
  };
}

export function parseShooterEnglishActivityDataset(
  value: unknown,
): ShooterEnglishActivityDataset | null {
  if (!plainObject(value) || value["type"] !== ENGLISH_ACTIVITY_DATASET_MESSAGE) {
    return null;
  }
  if (value["version"] !== 1 || value["gameId"] !== "vocab-shooter") {
    throw new TypeError("Shooter English activity dataset identity is invalid");
  }
  const requestId = value["requestId"];
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new TypeError("Shooter English activity requestId is invalid");
  }
  const activity = value["activity"];
  if (
    typeof activity !== "string" ||
    !ENGLISH_ACTIVITIES.has(activity as ShooterEnglishActivity)
  ) {
    throw new TypeError("Shooter English activity is invalid");
  }
  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new TypeError("Shooter English activity items must contain 1 to 100 items");
  }
  const parsed: ShooterEnglishActivityDataset["items"] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!plainObject(item)) throw new TypeError("Shooter English activity item is invalid");
    const contentId = item["contentId"];
    const entityType = item["entityType"];
    const entityId = item["entityId"];
    const promptText = item["promptText"];
    const answerText = item["answerText"];
    if (
      typeof contentId !== "string" ||
      (entityType !== "vocabulary" && entityType !== "sentence") ||
      typeof entityId !== "string" ||
      typeof promptText !== "string" ||
      typeof answerText !== "string"
    ) {
      throw new TypeError("Shooter English activity item fields are invalid");
    }
    const cleanContentId = contentId.normalize("NFC").trim();
    const cleanEntityId = entityId.normalize("NFC").trim();
    const cleanPrompt = promptText.normalize("NFC").trim().replace(/\s+/g, " ");
    const cleanAnswer = answerText.normalize("NFC").trim().replace(/\s+/g, " ");
    if (
      cleanContentId === "" ||
      cleanEntityId === "" ||
      cleanPrompt === "" ||
      cleanAnswer === "" ||
      cleanAnswer.length > 200
    ) {
      throw new TypeError("Shooter English activity item text is invalid");
    }
    if (seen.has(cleanContentId)) {
      throw new TypeError("Shooter English activity contentId is duplicated");
    }
    seen.add(cleanContentId);
    parsed.push({
      contentId: cleanContentId,
      entityType,
      entityId: cleanEntityId,
      promptText: cleanPrompt,
      answerText: cleanAnswer,
      ...(typeof item["meaningVi"] === "string" && item["meaningVi"].trim() !== ""
        ? { meaningVi: item["meaningVi"].normalize("NFC").trim() }
        : {}),
      ...(typeof item["ipa"] === "string" && item["ipa"].trim() !== ""
        ? { ipa: item["ipa"].normalize("NFC").trim() }
        : {}),
    });
  }
  return {
    version: 1,
    type: ENGLISH_ACTIVITY_DATASET_MESSAGE,
    requestId,
    gameId: "vocab-shooter",
    activity: activity as ShooterEnglishActivity,
    items: parsed,
  };
}

export function shooterEnglishActivityEntries(
  dataset: ShooterEnglishActivityDataset,
): VocabularyEntry[] {
  return dataset.items.map((item) => ({
    id: "english-content:" + item.contentId,
    en: item.answerText,
    vi: item.meaningVi ?? item.promptText,
    ipa: item.ipa ?? "",
    learning: {
      entityType: item.entityType,
      entityId: item.entityId,
      activityType: dataset.activity,
    },
  }));
}

export function buildShooterLearningEvent(options: {
  entry: VocabularyEntry;
  outcome: ShooterWordOutcome;
  wrongKeys: number;
  responseMs: number;
  occurredAt?: string;
}): ShooterLearningEvent {
  const wrong =
    options.outcome === "missed" || Math.max(0, options.wrongKeys) > 0;

  const learning = options.entry.learning;
  return {
    version: 1,
    entityType: learning?.entityType ?? "vocabulary",
    entityId: learning?.entityId ?? normalizeEntityId(options.entry.en),
    gameId: "vocab-shooter",
    activityType: learning?.activityType ?? "typing",
    result: wrong ? "wrong" : "correct",
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    responseMs: Math.max(0, Math.round(options.responseMs)),
    hintUsed: false,
    replayUsed: false,
    expectedAnswer: options.entry.en,
    ...(wrong
      ? {
          errorType:
            options.outcome === "missed"
              ? ("missed-word" as const)
              : ("spelling" as const),
        }
      : {}),
  };
}
