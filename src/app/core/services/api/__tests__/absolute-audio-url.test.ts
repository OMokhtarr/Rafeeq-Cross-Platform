import { absoluteAudioUrl } from "../quran-api.client";

describe("absoluteAudioUrl", () => {
  it("resolves a relative path against the verses CDN", () => {
    expect(absoluteAudioUrl("Shuraym/mp3/002142.mp3")).toBe(
      "https://verses.quran.foundation/Shuraym/mp3/002142.mp3",
    );
  });

  it("ignores a leading slash on a relative path", () => {
    expect(absoluteAudioUrl("/Alafasy/mp3/001001.mp3")).toBe(
      "https://verses.quran.foundation/Alafasy/mp3/001001.mp3",
    );
  });

  it("keeps the host of a protocol-relative url", () => {
    expect(absoluteAudioUrl("//mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3")).toBe(
      "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/001001.mp3",
    );
  });

  it("leaves a full url alone", () => {
    expect(absoluteAudioUrl("https://audio.example/a.mp3")).toBe("https://audio.example/a.mp3");
  });
});
