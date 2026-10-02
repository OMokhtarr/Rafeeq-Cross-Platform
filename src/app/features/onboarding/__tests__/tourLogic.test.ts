import {
  launchDeck,
  pendingTours,
  pickNext,
  cardPlacement,
  unionBox,
  resolveTarget,
  swipeStep,
  shouldMarkSeen,
  previousShown,
  nextShowable,
} from "../tourLogic";
import type { Release } from "../tourCatalog";

const rel = (id: string): Release => ({ id, features: [{ key: "x", art: "brand", route: "/", tourId: "home" }] });
const state = (over = {}) => ({ welcomeDone: true, seenTours: [] as string[], seenReleases: [] as string[], ...over });

describe("launchDeck", () => {
  it("shows nothing when storage is unusable", () => expect(launchDeck(null, [rel("1")])).toBeNull());
  it("shows the welcome until it is done", () =>
    expect(launchDeck(state({ welcomeDone: false }), [rel("1")])).toEqual({ kind: "welcome" }));
  it("shows unseen releases oldest first", () =>
    expect(launchDeck(state({ seenReleases: ["1"] }), [rel("1"), rel("2"), rel("3")])).toEqual({
      kind: "whatsNew",
      releases: [rel("2"), rel("3")],
    }));
  it("shows nothing when everything is seen", () => expect(launchDeck(state({ seenReleases: ["1"] }), [rel("1")])).toBeNull());
});

describe("pendingTours", () => {
  it("keeps unseen tours in the order given", () =>
    expect(pendingTours(state({ seenTours: ["viewer"] }), ["viewer.reveal", "viewer", "home"])).toEqual(["viewer.reveal", "home"]));
  it("returns nothing when storage is unusable", () => expect(pendingTours(null, ["home"])).toEqual([]));
});

describe("pickNext", () => {
  const q = [
    { tourId: "home" as const, overOverlay: false },
    { tourId: "viewer.verseSheet" as const, overOverlay: true },
  ];
  it("takes the first request when nothing is open", () => expect(pickNext(q, false)).toBe(0));
  it("only takes over-overlay requests while a sheet is open", () => expect(pickNext(q, true)).toBe(1));
  it("returns -1 when nothing may run", () => expect(pickNext([q[0]], true)).toBe(-1));
});

describe("cardPlacement", () => {
  it("puts the card at the bottom for targets in the upper part", () =>
    expect(cardPlacement({ top: 10, left: 0, width: 40, height: 40 }, 800)).toBe("bottom"));
  it("moves the card to the top for targets in the lower 40%", () =>
    expect(cardPlacement({ top: 740, left: 0, width: 40, height: 40 }, 800)).toBe("top"));
});

describe("unionBox", () => {
  it("returns null for no boxes", () => expect(unionBox([])).toBeNull());
  it("covers every box", () =>
    expect(
      unionBox([
        { top: 10, left: 10, width: 20, height: 20 },
        { top: 5, left: 50, width: 10, height: 40 },
      ]),
    ).toEqual({ top: 5, left: 10, width: 50, height: 40 }));
});

describe("resolveTarget", () => {
  const rect = (top: number, h = 20) => () => ({ top, left: 0, width: 50, height: h, right: 50, bottom: top + h, x: 0, y: top, toJSON() {} }) as DOMRect;

  function mount(html: string, rects: Record<string, () => DOMRect>) {
    document.body.innerHTML = html;
    for (const [id, fn] of Object.entries(rects)) (document.getElementById(id) as HTMLElement).getBoundingClientRect = fn;
  }

  it("ignores copies inside hidden Ionic pages", () => {
    mount(
      `<div class="ion-page ion-page-hidden"><nav id="a" data-tour="home.tabs"></nav></div>
       <div class="ion-page"><nav id="b" data-tour="home.tabs"></nav></div>`,
      { a: rect(1), b: rect(700) },
    );
    expect(resolveTarget(document, "home.tabs", false)?.element.id).toBe("b");
  });

  it("matches one ref among several on an element", () => {
    mount(`<div id="m" data-tour="viewer.swipe viewer.verse"></div>`, { m: rect(100) });
    expect(resolveTarget(document, "viewer.verse", false)?.box.top).toBe(100);
  });

  it("skips zero-size elements", () => {
    mount(`<div id="z" data-tour="search.recents"></div>`, { z: rect(10, 0) });
    expect(resolveTarget(document, "search.recents", false)).toBeNull();
  });

  it("unions every visible match when asked", () => {
    mount(`<i id="x" data-tour="viewer.nav"></i><i id="y" data-tour="viewer.nav"></i>`, { x: rect(10), y: rect(40) });
    expect(resolveTarget(document, "viewer.nav", true)?.box).toEqual({ top: 10, left: 0, width: 50, height: 50 });
  });
});

describe("swipeStep", () => {
  it("ignores short drags", () => expect(swipeStep(20, false)).toBe(0));
  it("LTR: swiping left goes forward", () => expect(swipeStep(-80, false)).toBe(1));
  it("LTR: swiping right goes back", () => expect(swipeStep(80, false)).toBe(-1));
  it("RTL: swiping right goes forward", () => expect(swipeStep(80, true)).toBe(1));
  it("RTL: swiping left goes back", () => expect(swipeStep(-80, true)).toBe(-1));
});

describe("shouldMarkSeen", () => {
  it("marks a finished tour that showed something", () => expect(shouldMarkSeen("done", 2)).toBe(true));
  it("marks a skipped tour", () => expect(shouldMarkSeen("skip", 1)).toBe(true));
  it("leaves a tour whose targets never appeared unseen", () => expect(shouldMarkSeen("done", 0)).toBe(false));
  it("leaves a tour cut short by navigation unseen", () => expect(shouldMarkSeen("cancel", 3)).toBe(false));
});

describe("nextShowable", () => {
  const steps = [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }];
  const only = (...keys: string[]) => (s: { key: string }) => keys.includes(s.key);
  it("returns the very next step when its target exists", () => expect(nextShowable(steps, 0, only("b", "c"))).toBe(1));
  it("skips steps whose targets are missing", () => expect(nextShowable(steps, 0, only("d"))).toBe(3));
  it("returns null when no later step can show, so the current one is the last", () =>
    expect(nextShowable(steps, 1, only("a", "b"))).toBeNull());
  it("returns null from the final step", () => expect(nextShowable(steps, 3, only("a", "b", "c", "d"))).toBeNull());
});

describe("previousShown", () => {
  it("returns the latest shown step before the current one", () => expect(previousShown([0, 2, 3], 3)).toBe(2));
  it("returns null on the first shown step", () => expect(previousShown([1], 1)).toBeNull());
});
