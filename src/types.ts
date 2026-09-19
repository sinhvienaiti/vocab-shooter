export type VocabularyEntry = {
  id: string;
  en: string;
  vi: string;
  ipa: string;
};

export type Accent = "en-US" | "en-GB";
export type GraphicsMode = "performance" | "balanced" | "quality";

export type ShooterSettings = {
  speechEnabled: boolean;
  accent: Accent;
  speechRate: number;
  volume: number;
  difficulty: 1 | 2 | 3;
  revealMs: number;
  graphics: GraphicsMode;
};
