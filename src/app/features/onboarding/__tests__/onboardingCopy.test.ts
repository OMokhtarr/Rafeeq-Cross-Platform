import { ONBOARDING_COPY } from "../onboardingCopy";
import { TOURS, TourId, WELCOME_SLIDES, ALL_RELEASES } from "../tourCatalog";

describe.each(["ar", "en"] as const)("%s copy", (lang) => {
  const copy = ONBOARDING_COPY[lang];

  it("has a title and body for every tour step", () => {
    for (const id of Object.keys(TOURS) as TourId[]) {
      for (const step of TOURS[id]) {
        const c = copy.tours[id]?.[step.key];
        // Shaped so a failure names the missing step.
        expect({ step: `${id}.${step.key}`, ok: Boolean(c?.title && c?.body) }).toEqual({ step: `${id}.${step.key}`, ok: true });
      }
    }
  });

  it("has no copy for steps that do not exist", () => {
    for (const id of Object.keys(copy.tours) as TourId[]) {
      const keys = TOURS[id].map((s) => s.key);
      for (const key of Object.keys(copy.tours[id])) expect(keys).toContain(key);
    }
  });

  it("covers every welcome slide", () => {
    for (const s of WELCOME_SLIDES) {
      expect(copy.slides[s.id].title).toBeTruthy();
      expect(copy.slides[s.id].body).toBeTruthy();
    }
  });

  it("covers every release feature", () => {
    for (const r of ALL_RELEASES) for (const f of r.features) expect(copy.releases[`${r.id}.${f.key}`]?.title).toBeTruthy();
  });
});

it("every release has a unique id and at least one feature", () => {
  const ids = ALL_RELEASES.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const r of ALL_RELEASES) expect(r.features.length).toBeGreaterThan(0);
});
