import { formatDuration, offsetPhrase, countLabel } from "../alarmFormat";
import { STRINGS } from "../../../core/i18n/strings";

const ar = STRINGS.ar.prayerAlarms;
const en = STRINGS.en.prayerAlarms;

describe("formatDuration", () => {
  it("counts minutes in English", () => {
    expect(formatDuration(10, "en")).toBe("10 min");
    expect(formatDuration(60, "en")).toBe("1 h");
    expect(formatDuration(90, "en")).toBe("1 h 30 min");
  });

  it("follows Arabic number agreement for minutes", () => {
    expect(formatDuration(1, "ar")).toBe("دقيقة");
    expect(formatDuration(2, "ar")).toBe("دقيقتين");
    expect(formatDuration(5, "ar")).toBe("٥ دقائق");
    expect(formatDuration(37, "ar")).toBe("٣٧ دقيقة");
  });

  it("follows Arabic number agreement for hours", () => {
    expect(formatDuration(60, "ar")).toBe("ساعة");
    expect(formatDuration(120, "ar")).toBe("ساعتين");
    expect(formatDuration(180, "ar")).toBe("٣ ساعات");
    expect(formatDuration(75, "ar")).toBe("ساعة و١٥ دقيقة");
  });
});

describe("offsetPhrase", () => {
  it("says how far before or after the adhan an alarm rings", () => {
    expect(offsetPhrase(-10, en, "en")).toBe("10 min before the adhan");
    expect(offsetPhrase(5, en, "en")).toBe("5 min after the adhan");
    expect(offsetPhrase(0, en, "en")).toBe("At the adhan");
  });

  it("joins the Arabic preposition to a number with a tatweel and to a word directly", () => {
    expect(offsetPhrase(-10, ar, "ar")).toBe("قبل الأذان بـ١٠ دقائق");
    expect(offsetPhrase(60, ar, "ar")).toBe("بعد الأذان بساعة");
  });
});

describe("countLabel", () => {
  it("names how many alarms a prayer has", () => {
    expect(countLabel(0, en, "en")).toBe("None");
    expect(countLabel(1, en, "en")).toBe("1 alarm");
    expect(countLabel(3, en, "en")).toBe("3 alarms");
  });

  it("uses Arabic dual and plural forms", () => {
    expect(countLabel(1, ar, "ar")).toBe("منبّه واحد");
    expect(countLabel(2, ar, "ar")).toBe("منبّهان");
    expect(countLabel(4, ar, "ar")).toBe("٤ منبّهات");
    expect(countLabel(12, ar, "ar")).toBe("١٢ منبّهًا");
  });
});
