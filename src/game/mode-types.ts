import type { GameMode, VocabularyEntry } from "../types";

export type TargetState = "normal" | "dormant" | "spotlight" | "danger" | "pending";

export type Target = {
  id: string;
  entry: VocabularyEntry;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  typed: number;
  width: number;
  pending: boolean;
  error: number;
  state: TargetState;
  dangerRemaining: number;
  lateSave: boolean;
};

export type HudState = {
  score: number;
  streak: number;
  metricLabel: string;
  metricValue: string;
  active: string;
  running: boolean;
  mode: GameMode;
  dangerLevel: number;
};

export type GameResult = {
  mode: GameMode;
  score: number;
  correctWords: number;
  missedWords: number;
  wrongKeys: number;
  accuracy: number;
  wpm: number;
  characters: number;
  maxStreak: number;
  elapsedSec: number;
  averageWordSec: number;
  lateSaves: number;
  maxActiveWords: number;
  failedWord: string;
  failureReason: string;
};
