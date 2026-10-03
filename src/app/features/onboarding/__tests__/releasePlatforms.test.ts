import { ALL_RELEASES, Release, releasesForPlatform } from "../tourCatalog";

const release: Release = {
  features: [
    { key: "androidOnly", art: "qibla", route: "/prayer-times", tourId: "prayerTimes", platforms: ["android"] },
    { key: "everywhere", art: "qibla", route: "/prayer-times", tourId: "prayerTimes" },
  ],
};

it("keeps a platform-limited feature on its platform", () => {
  const [r] = releasesForPlatform([release], "android");
  expect(r.features.map((f) => f.key)).toEqual(["androidOnly", "everywhere"]);
});

it("drops a platform-limited feature elsewhere", () => {
  const [r] = releasesForPlatform([release], "ios");
  expect(r.features.map((f) => f.key)).toEqual(["everywhere"]);
});

it("drops a release with nothing left to announce", () => {
  const onlyAndroid: Release = { features: [release.features[0]] };
  expect(releasesForPlatform([onlyAndroid], "web")).toEqual([]);
});

it("announces prayer alarms on Android only", () => {
  const feature = ALL_RELEASES.flatMap((r) => r.features).find((f) => f.tourId === "prayerTimes.alarms");
  expect(feature?.platforms).toEqual(["android"]);
});
