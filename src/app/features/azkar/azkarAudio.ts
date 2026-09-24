/**
 * Bundled zikr recordings, discovered at build time from
 * src/assets/azkar-audio/<zikrId>.mp3 — adding a file is all it takes.
 */

const ctx = (require as any).context("../../../assets/azkar-audio", false, /\.mp3$/);

const audioByZikrId: Record<string, string> = {};
for (const key of ctx.keys() as string[]) {
  const id = key.replace(/^\.\//, "").replace(/\.mp3$/, "");
  const mod = ctx(key);
  audioByZikrId[id] = typeof mod === "string" ? mod : mod.default;
}

export function zikrAudioUrl(zikrId: string): string | undefined {
  return audioByZikrId[zikrId];
}
