import { MUQATTAAT_OPENERS, spelledLetters } from "../recite-muqattaat";

describe("spelledLetters", () => {
  const cases: Array<[string[], string | null]> = [
    [["الف", "لام", "ميم"], "الم"],
    [["ألف", "لاميم"], "الم"],
    [["ياسين"], "يس"],
    [["يا", "سين"], "يس"],
    [["طاها"], "طه"],
    [["حاميم"], "حم"],
    [["طاسين", "ميم"], "طسم"],
    [["كاف", "ها", "يا", "عين", "صاد"], "كهيعص"],
    [["كافهايا", "عيييين", "صاد"], "كهيعص"],
    [["عين", "سين", "قاف"], "عسق"],
    [["مييييم"], "م"],
    [["قال", "لهم"], null],
    [[], null],
  ];
  it.each(cases)("decodes %j as %j", (input, expected) => {
    expect(spelledLetters(input)).toBe(expected);
  });

  it("lists عسق among the openers", () => {
    expect(MUQATTAAT_OPENERS).toContain("عسق");
    expect(MUQATTAAT_OPENERS).toHaveLength(14);
  });
});
