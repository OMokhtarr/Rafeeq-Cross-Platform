import {
  FACING_TOLERANCE_DEG,
  markerRotation,
  signedDelta,
  turnInstruction,
} from "../qibla.geometry";

describe("signedDelta", () => {
  it("is positive when the target is clockwise of the heading", () => {
    expect(signedDelta(90, 45)).toBe(45);
  });

  it("is negative when the target is anticlockwise", () => {
    expect(signedDelta(45, 90)).toBe(-45);
  });

  // The wrap is the whole reason this function exists: a naive subtraction
  // gives -350 here and would send the user almost all the way round.
  it("takes the short way across north", () => {
    expect(signedDelta(5, 355)).toBe(10);
    expect(signedDelta(355, 5)).toBe(-10);
  });

  it("never exceeds half a turn in either direction", () => {
    for (let b = 0; b < 360; b += 7) {
      for (let h = 0; h < 360; h += 11) {
        const d = signedDelta(b, h);
        expect(d).toBeGreaterThan(-180.0001);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });

  it("handles headings outside 0-360 rather than producing nonsense", () => {
    expect(signedDelta(10, 370)).toBe(0);
  });
});

describe("turnInstruction", () => {
  it("says facing inside the tolerance band", () => {
    expect(turnInstruction(100, 100)).toBe("facing");
    expect(turnInstruction(100, 100 + FACING_TOLERANCE_DEG - 1)).toBe("facing");
    expect(turnInstruction(100, 100 - FACING_TOLERANCE_DEG + 1)).toBe("facing");
  });

  it("says right when the qibla is clockwise of where the user points", () => {
    expect(turnInstruction(180, 90)).toBe("right");
  });

  it("says left when it is anticlockwise", () => {
    expect(turnInstruction(90, 180)).toBe("left");
  });

  it("still resolves at exactly the tolerance edge", () => {
    // A gap between "facing" and a turn would leave the label blank.
    expect(turnInstruction(100, 100 - FACING_TOLERANCE_DEG)).toBe("right");
    expect(turnInstruction(100, 100 + FACING_TOLERANCE_DEG)).toBe("left");
  });
});

describe("markerRotation", () => {
  it("puts the marker at the top when the user faces the qibla", () => {
    expect(markerRotation(136, 136)).toBe(0);
  });

  it("offsets the marker by the difference as the user turns", () => {
    expect(markerRotation(136, 46)).toBe(90);
  });

  it("normalises into a single turn rather than going negative", () => {
    expect(markerRotation(10, 100)).toBe(270);
  });
});
