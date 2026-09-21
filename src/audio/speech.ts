import type { ShooterSettings } from "../types";

function preferredVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const exact = voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase());
  if (exact !== undefined) return exact;
  const base = lang.split("-")[0]?.toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().startsWith(base ?? "en")) ?? null;
}

export function speakEnglish(text: string, settings: ShooterSettings): void {
  if (!settings.speechEnabled || !("speechSynthesis" in window)) return;
  // Do not cancel the current utterance here. The browser speech engine queues
  // later words, so fast typing still pronounces every completed word in order.
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = settings.accent;
  utterance.rate = settings.speechRate;
  utterance.volume = settings.volume;
  const voice = preferredVoice(settings.accent);
  if (voice !== null) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
