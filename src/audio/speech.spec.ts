import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../storage/settings";
import { speakEnglish, stopSpeech } from "./speech";

class FakeUtterance {
  lang = "";
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(readonly text: string) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("speech queue", () => {
  it("queues rapid words without cancelling the word already being spoken", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const speech = {
      getVoices: () => [],
      speak,
      cancel,
    };

    vi.stubGlobal("speechSynthesis", speech);
    vi.stubGlobal("window", { speechSynthesis: speech });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);

    speakEnglish("first", defaultSettings);
    speakEnglish("second", defaultSettings);

    expect(speak).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();
    expect((speak.mock.calls[0]?.[0] as FakeUtterance).text).toBe("first");
    expect((speak.mock.calls[1]?.[0] as FakeUtterance).text).toBe("second");

    stopSpeech();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
