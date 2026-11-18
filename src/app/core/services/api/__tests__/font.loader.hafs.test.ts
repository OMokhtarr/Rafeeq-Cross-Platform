// react-scripts sets resetMocks, so implementations are (re)set in beforeEach.
const mockIdbGet = jest.fn();
const mockIdbPut = jest.fn();
jest.mock("../../storage/idb.service", () => ({
  idb: {
    get: (...args: unknown[]) => mockIdbGet(...args),
    put: (...args: unknown[]) => mockIdbPut(...(args as [])),
  },
}));

const HAFS_URL =
  "https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2";

const fontFamilies: string[] = [];
const fetchMock = jest.fn();

beforeEach(() => {
  jest.resetModules();
  fontFamilies.length = 0;
  mockIdbGet.mockReset();
  mockIdbPut.mockReset();
  mockIdbPut.mockResolvedValue(undefined);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
  });
  (global as any).fetch = fetchMock;
  (global as any).FontFace = class {
    constructor(public family: string) {}
    load() {
      return Promise.resolve(this);
    }
  };
  (document as any).fonts = {
    add: (face: { family: string }) => fontFamilies.push(face.family),
  };
});

const load = () => require("../font.loader") as typeof import("../font.loader");

describe("ensureHafsUnicodeFont", () => {
  it("fetches the Uthmanic Hafs font, registers it and caches it", async () => {
    mockIdbGet.mockResolvedValue(undefined);
    const { ensureHafsUnicodeFont, HAFS_UNICODE_FONT_FAMILY } = load();
    await ensureHafsUnicodeFont();
    expect(HAFS_UNICODE_FONT_FAMILY).toBe("UthmanicHafsV18");
    expect(fetchMock).toHaveBeenCalledWith(HAFS_URL);
    expect(fontFamilies).toEqual(["UthmanicHafsV18"]);
    expect(mockIdbPut).toHaveBeenCalledWith(
      "fonts",
      expect.objectContaining({ fetchedAt: expect.any(Number) }),
    );
  });

  it("registers once across calls", async () => {
    mockIdbGet.mockResolvedValue(undefined);
    const { ensureHafsUnicodeFont } = load();
    await Promise.all([ensureHafsUnicodeFont(), ensureHafsUnicodeFont()]);
    await ensureHafsUnicodeFont();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fontFamilies).toHaveLength(1);
  });

  it("renders from the record it cached without fetching again", async () => {
    mockIdbGet.mockResolvedValue(undefined);
    await load().ensureHafsUnicodeFont();
    const [, record] = mockIdbPut.mock.calls[0] as unknown as [string, unknown];

    // A fresh app start: new module state, the cached record in IDB.
    jest.resetModules();
    fetchMock.mockClear();
    fontFamilies.length = 0;
    mockIdbGet.mockResolvedValue(record);
    await load().ensureHafsUnicodeFont();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(fontFamilies).toEqual(["UthmanicHafsV18"]);
  });
});
