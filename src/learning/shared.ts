import type { VocabularyEntry } from "../types";

export const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
export const REVIEW_DATASET_MESSAGE = "typing-game:learning:v1:review-dataset";
export const REVIEW_READY_MESSAGE = "typing-game:learning:v1:review-ready";
export const REVIEW_ERROR_MESSAGE = "typing-game:learning:v1:review-error";
export const PARENT_ORIGIN = "https://typing-game.local";

export type ShooterReviewGoal = "remember-words" | "spelling" | "mixed";

export type ShooterReviewDataset = {
  version: 1;
  type: typeof REVIEW_DATASET_MESSAGE;
  requestId: string;
  goal: ShooterReviewGoal;
  entityIds: string[];
};

export type ShooterWordOutcome = "completed" | "missed";

export type ShooterLearningEvent = {
  version: 1;
  entityType: "vocabulary";
  entityId: string;
  gameId: "vocab-shooter";
  activityType: "typing";
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

export function buildShooterLearningEvent(options: {
  entry: VocabularyEntry;
  outcome: ShooterWordOutcome;
  wrongKeys: number;
  responseMs: number;
  occurredAt?: string;
}): ShooterLearningEvent {
  const wrong =
    options.outcome === "missed" || Math.max(0, options.wrongKeys) > 0;

  return {
    version: 1,
    entityType: "vocabulary",
    entityId: normalizeEntityId(options.entry.en),
    gameId: "vocab-shooter",
    activityType: "typing",
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
