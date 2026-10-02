import {
  ONBOARDING_KEY,
  LEGACY_KEYS,
  initOnboarding,
  markTourSeen,
  markReleasesSeen,
  completeWelcome,
  resetTours,
} from "../onboardingStore";

beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

const stored = () => JSON.parse(localStorage.getItem(ONBOARDING_KEY) as string);

describe("initOnboarding", () => {
  it("treats an empty device as a new user and persists that", () => {
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: false, seenTours: [], seenReleases: [] });
    expect(stored().welcomeDone).toBe(false);
  });

  it.each(LEGACY_KEYS)("treats a device with %s as an existing user", (key) => {
    localStorage.setItem(key, "x");
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("lets stored state win over legacy keys written on every launch", () => {
    initOnboarding([]); // first launch: new user
    localStorage.setItem("rafiq_lang_v1", "ar"); // LanguageProvider writes this each launch
    localStorage.setItem("rafeeq.tracker.since", "2026-10-01");
    expect(initOnboarding([]).welcomeDone).toBe(false);
  });

  it("is stable when called twice (StrictMode double-invokes initialisers)", () => {
    initOnboarding([]);
    expect(initOnboarding([]).welcomeDone).toBe(false);
  });

  it("never re-runs the welcome after corrupt JSON", () => {
    localStorage.setItem(ONBOARDING_KEY, "{nope");
    expect(initOnboarding(["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("never re-runs the welcome after non-object JSON", () => {
    localStorage.setItem(ONBOARDING_KEY, "[1,2]");
    expect(initOnboarding([]).welcomeDone).toBe(true);
  });

  it("drops non-string entries from stored lists", () => {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ welcomeDone: true, seenTours: ["home", 3], seenReleases: null }));
    expect(initOnboarding([])).toEqual({ welcomeDone: true, seenTours: ["home"], seenReleases: [] });
  });

  it("returns null when storage throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(initOnboarding([])).toBeNull();
  });
});

describe("mutators", () => {
  const base = { welcomeDone: false, seenTours: [], seenReleases: [] };

  it("marks a tour seen once and persists it", () => {
    const s = markTourSeen(markTourSeen(base, "home"), "home");
    expect(s.seenTours).toEqual(["home"]);
    expect(stored().seenTours).toEqual(["home"]);
  });

  it("marks releases seen without duplicates", () => {
    expect(markReleasesSeen({ ...base, seenReleases: ["1.2.0"] }, ["1.2.0", "1.3.0"]).seenReleases).toEqual(["1.2.0", "1.3.0"]);
  });

  it("completing the welcome also marks every current release seen", () => {
    expect(completeWelcome(base, ["1.2.0"])).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
  });

  it("resetTours clears only the tours", () => {
    const s = resetTours({ welcomeDone: true, seenTours: ["home"], seenReleases: ["1.2.0"] });
    expect(s).toEqual({ welcomeDone: true, seenTours: [], seenReleases: ["1.2.0"] });
    expect(stored().seenTours).toEqual([]);
  });
});
