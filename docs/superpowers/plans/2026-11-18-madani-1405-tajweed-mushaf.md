# Madani 1405 (Tajweed) Mushaf Option — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second selectable Mushaf, "Madani 1405 (Tajweed)", that reproduces the 1405H page and line layout (the one Tarteel shows) with tajweed colours. The current 1421 V4 Tajweed mushaf stays the default.

**Architecture:** Request words from the QF content API with `mushaf=2` (1405 line numbers, verified live) and the word field `text_uthmani_tajweed` (Unicode text with `<rule class=…>` tags). Draw them in the KFGQPC Uthmanic Hafs Unicode font, colour each rule span with CSS, and justify each of the 15 lines. Page boundaries become layout-aware: a 25-entry 1405 override table on top of the existing `PAGE_STARTS`, mirrored in Android Auto.

**Tech Stack:** React 18 + Ionic 8, TypeScript 5, Jest (react-scripts), Capacitor 8, Kotlin (Android Auto).

**Spec:** None separate; the background below is the spec.

## Background (findings, 2026-11-18)

- The QF content API supports several layouts. `/pages/lookup` page 532 gives 55:17–55:40 for mushaf **2** (QCF V1, 1405) and **11**. It gives 55:19–55:41 for **1, 5 and 19** (1421). Rafeeq renders 19.
- `/verses/by_page/{p}?mushaf=2` returns 1405 `line_number`s that match Tarteel line for line:
  - page 5, line 5 starts "۞ إِنَّ ٱللَّهَ";
  - page 532, line 1 is "رَبُّ ٱلْمَشْرِقَيْنِ … ١٨".
- With `word_fields=text_uthmani_tajweed`, each word arrives as e.g. `<rule class=ham_wasl>ٱ</rule>لۡمَغۡرِبَ<rule class=madda_permissible>يۡ</rule>نِ`. End words arrive as Arabic digits (`١٧`).
- Rule classes seen in juz 1 + 30, with counts:
  - ham_wasl 625, madda_normal 479, ikhafa 379, idgham_ghunnah 342
  - madda_permissible 244, ghunnah 240, slnt 209, qalaqah 188
  - laam_shamsiyah 153, madda_obligatory_mottasel 138, idgham_wo_ghunnah 116, madda_obligatory_monfasel 111
  - idgham_shafawi 70, custom 67, iqlab 59, ikhafa_shafawi 40, madda_necessary 9
- Font: `https://verses.quran.foundation/fonts/quran/hafs/uthmanic_hafs/UthmanicHafs1Ver18.woff2` (200, 87 KB). It is the same CDN the V4 fonts use.
- Page starts that differ in 1405, for 25 pages. These are exactly the pages corrected to 1421 on 2026-10-19:
  `121: 5:77, 122: 5:83, 123: 5:90, 145: 6:132, 532: 55:17, 533: 55:41, 534: 55:68, 565: 68:16, 568: 69:35, 570: 70:40, 576: 74:18, 584: 79:16, 586: 81:1, 588: 83:7, 589: 83:35, 590: 85:1, 592: 87:16, 593: 89:1, 594: 89:24, 595: 91:1, 596: 92:15, 597: 95:1, 598: 97:1, 599: 98:8, 600: 100:10`
- **Existing bug, fixed in Task 1:** the API's chapter `pages` spans follow 1405. Under the current 1421 layout, `getSurahEndPage` is wrong for surahs 80, 84, 88, 90, 94 and 96: each really ends one page later, at 586, 590, 593, 595, 597 and 598.
- Tarteel does not publish its method. Its circled-digit verse markers and line-to-line spacing variation are consistent with this approach.

## Global Constraints

- The default stays `qpc_v4_tajweed`. Existing users see no change until they pick the new option.
- New kind id: `madani_1405_tajweed`. Labels: Arabic `مصحف المدينة ١٤٠٥ (تجويد)`, English `Madani 1405 (Tajweed)`.
- Tajweed colours reuse the legend hexes already in `Settings.tsx` `TAJWEED_RULES`, so the info sheet stays truthful.
- No visible scrollbars. No `eslint-disable` comments. Page containers keep `var(--max-width-mobile, 600px)` (CLAUDE.md).
- Don't build or `cap sync`; the user builds. Run tests with `CI=true npx react-scripts test --watchAll=false <path>`. The working tree is CRLF.
- No `dangerouslySetInnerHTML` for API text. Tajweed markup is parsed into segments.
- Update `RELEASE-NOTES.md` only when the user bumps versionCode.

## Review Focus

1. **Switching mushaf with pages cached.** The IDB `pages` store is keyed by page only, so a 1421 page must never render under 1405 or the reverse. Test: Task 3 `getPage` treats a record whose `mushaf` differs from the selected one as a miss.
2. **Colour spans splitting Arabic shaping.** A coloured `ٱ` inside a word must still join to its neighbours. Check on an Android device / WebView and iOS Safari (Task 5, step 6 manual check, pages 5 and 532).
3. **Lines wider than the page.** At the height-derived font size, the longest Unicode line may overflow. Test: Task 5 `fitFontToWidth` shrinks to the widest line.
4. **Navigation on the 25 differing pages.** Juz picker, hide mode, playback page turns and Feelings links must land on the right page in both layouts. Test: Task 1 asserts `estimatePageForVerse(55, 17)` is 532 under 1405 and 531 under 1421.
5. **Android Auto page markers with 1405 selected while the app is cold.** Native must read the persisted layout. Test: Task 4 Kotlin mirror assertion, plus manual check of the AA notification page buttons on surah 55.

---

### Task 1: Layout-aware page table

**Files:**
- Modify: `src/app/core/services/data/metadata.service.ts` (PAGE_STARTS block, `getSuraForPage`, `getSurahStartPage`, `getSurahEndPage`, `getPageStart`, `estimatePageForVerse`)
- Test: `src/app/core/services/data/__tests__/page-starts-1405.test.ts` (new); existing `page-starts.test.ts` stays green

**Interfaces:**
- Produces:
  - `export type PageLayout = "1421" | "1405";`
  - `export function setActivePageLayout(layout: PageLayout): void`
  - `export function getActivePageLayout(): PageLayout` (default `"1421"`)
  - `getPageStart`, `estimatePageForVerse` and `getSuraForPage` read the active layout.
  - `getSurahStartPage(s)` / `getSurahEndPage(s)` derive from `estimatePageForVerse(s, 1)` / `estimatePageForVerse(s, SURAH_VERSE_COUNTS[s-1])`. They no longer use `chaptersCache.pages`.

- [ ] **Step 1: Write the failing tests** in `page-starts-1405.test.ts`. Use the same `jest.mock`s as `page-starts.test.ts`, and run `afterEach(() => setActivePageLayout("1421"))`.
  - `it.each` over the 25 overrides from Background: with `"1405"` active, `getPageStart(p)` equals the listed verse.
  - Under `"1405"`:
    - `estimatePageForVerse(55, 17)` is `532`
    - `estimatePageForVerse(55, 41)` is `533`
    - `estimatePageForVerse(92, 14)` is `595`
  - Under `"1421"`, `estimatePageForVerse(55, 17)` is `531`.
  - `getSurahEndPage` per layout:
    - `getSurahEndPage(80)` is `586` under `"1421"` and `585` under `"1405"`
    - `getSurahEndPage(96)` is `598` under `"1421"` and `597` under `"1405"`
- [ ] **Step 2: Run them; expect failures** (`setActivePageLayout` is not exported).
  Run: `CI=true npx react-scripts test --watchAll=false src/app/core/services/data/__tests__/page-starts-1405.test.ts`
- [ ] **Step 3: Implement.**
  - Add `PAGE_STARTS_1405_OVERRIDES: Readonly<Record<number, PageStart>>` with the 25 entries, and a module-level `activeLayout`.
  - Add `startOf(page)`, which returns the override when `activeLayout === "1405"` and the override exists, else `PAGE_STARTS[page]`. Route the three lookups through it.
  - Update the PAGE_STARTS header comment: mushaf 19/1/5 share PAGE_STARTS, and mushaf 2/11 differ on these 25 pages.
- [ ] **Step 4: Run both page-start test files; expect PASS.**
- [ ] **Step 5: Commit** `feat(mushaf): layout-aware page starts (1405 overrides) + derive surah page spans from table`

---

### Task 2: Mushaf kind + tajweed word text through the data layer

**Files:**
- Modify: `src/app/core/services/api/mushaf.config.ts` (`MushafKind`, `MushafSpec`, `MUSHAFS`)
- Modify: `src/app/shared/models/verse.model.ts` (`VerseWord`)
- Modify: `src/app/core/services/api/quran-api.client.ts` (`fetchVersesByPage`, `fetchVersesByJuz` word mapping, the `line_number?` response type near line 316)
- Modify: `src/app/core/services/data/quran.service.ts` (`mapApiWord`)
- Test: `src/app/core/services/api/__tests__/mushaf.config.test.ts` (new)

**Interfaces:**
- Produces:
  - `MushafKind` gains `"madani_1405_tajweed"`.
  - `MushafSpec` gains `layout: PageLayout` (`"1421"` for the existing kinds) and `renderer: "v4-glyph" | "unicode-tajweed"` (`"v4-glyph"` for the existing four).
  - `export function layoutFor(kind: MushafKind): PageLayout`
  - `export function rendererFor(kind: MushafKind): MushafSpec["renderer"]`
  - `VerseWord.textTajweed?: string`, filled from `text_uthmani_tajweed`.
- `MUSHAFS.madani_1405_tajweed`:
  - `wordFields: "text_uthmani,text_uthmani_tajweed,line_number,page_number"`
  - `mushafId: 2`
  - `layout: "1405"`
  - `renderer: "unicode-tajweed"`
  - labels as in Global Constraints

- [ ] **Step 1: Write failing tests:**
  - `layoutFor("madani_1405_tajweed")` is `"1405"`; `layoutFor("qpc_v4_tajweed")` is `"1421"`.
  - `rendererFor("madani_1405_tajweed")` is `"unicode-tajweed"`.
  - `mushafIdFor("madani_1405_tajweed")` is `2`.
  - With a mocked `apiFetch` payload holding one word with `text_uthmani_tajweed: "<rule class=ham_wasl>ٱ</rule>لۡ"`, `fetchVersesByPage(5, MUSHAFS.madani_1405_tajweed.wordFields, 2)` returns that string as `words[0].textTajweed`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** `mushaf.config.ts` imports `PageLayout` as a type from `metadata.service`; a type-only import, so no runtime cycle. `mapApiWord` passes `textTajweed` through.
- [ ] **Step 4: Run; expect PASS.** Also run `merge-layout.test.ts` and `page-layout.test.ts`; they stay green because the merge stays gated on `qpc_v4_tajweed`.
- [ ] **Step 5: Commit** `feat(mushaf): madani_1405_tajweed kind (mushaf=2, tajweed word text)`

---

### Task 3: Selecting the mushaf — settings, cache safety, boot

**Files:**
- Modify: `src/app/features/settings/Settings.tsx` (`MUSHAF_OPTIONS`, the `set("mushaf", …)` handler)
- Modify: `src/app/core/services/data/quran.service.ts` (`fetchAndStorePage` stores `mushaf`; `getPage` IDB-hit check; new `applyMushafSelection`)
- Modify: `src/App.tsx` (boot, next to `initMetadata()` at line 237)
- Test: `src/app/core/services/data/__tests__/mushaf-switch.test.ts` (new)

**Interfaces:**
- Consumes: `layoutFor` (Task 2), `setActivePageLayout` (Task 1), `clearDerivedPageCache` (`page-cache.ts`).
- Produces: `export async function applyMushafSelection(kind: MushafKind): Promise<void>` in `quran.service.ts`. It calls `setActivePageLayout(layoutFor(kind))`, then `clearDerivedPageCache()`. Task 4 adds the native sync call.

- [ ] **Step 1: Write failing tests** (mock `idb` like `page-refresh.test.ts` does):
  - An IDB `pages` record `{ page: 5, mushaf: "qpc_v4_tajweed", verses: [...] }`, with `madani_1405_tajweed` selected in `rafiq_settings_v1`, makes `getPage(5)` refetch from the API, not return the cached verses.
  - A record with no `mushaf` field (written before this change) counts as `qpc_v4_tajweed`.
  - `applyMushafSelection("madani_1405_tajweed")` sets `getActivePageLayout()` to `"1405"` and calls `idb.clear("pages")`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
  - `fetchAndStorePage` writes `mushaf` into the record; `getPage` compares it.
  - Settings: `MUSHAF_OPTIONS = [MUSHAFS.qpc_v4_tajweed, MUSHAFS.madani_1405_tajweed]`. Keep `cleanMushafLabel` from stripping "(Tajweed)": change the regex to strip only parentheticals that contain Latin capitals and digits, e.g. `(KFGQPC V4)`. Call `applyMushafSelection` when the mushaf changes.
  - App boot: `setActivePageLayout(layoutFor(readSelectedMushaf()))` before `initMetadata()`.
- [ ] **Step 4: Run the new test plus `page-cache.test.ts` and `page-refresh.test.ts`; expect PASS.**
- [ ] **Step 5: Commit** `feat(settings): offer Madani 1405 mushaf; per-mushaf page cache`

---

### Task 4: Android Auto mirror

**Files:**
- Modify: `android/app/src/main/java/com/rafeeq/quranquiz/auto/RafeeqAudioUrls.kt`
  - add `PAGE_STARTS_1405_OVERRIDES: IntArray` as flat triples `page, sura, aya`
  - add `var layout1405: Boolean`
  - `estimatePageForVerse` uses the overrides when it is set
- Modify: the `RafeeqAuto` plugin Kotlin class (the class registered as `"RafeeqAuto"`)
  - add `@PluginMethod setPageLayout(call)`, which reads `layout` ("1405"/"1421")
  - persist it to the plugin's existing SharedPreferences, so cold start works
  - set `RafeeqAudioUrls.layout1405`
  - `RafeeqMediaService` reads the pref on create
- Modify: `src/app/core/services/native/driving-mode.plugin.ts`
  - add `setPageLayout(opts: { layout: PageLayout }): Promise<void>` to the interface
  - add a web stub `async () => {}`
- Modify: `src/app/core/services/data/quran.service.ts` with `syncNativePageLayout(layout: PageLayout): void`, a fire-and-forget call that swallows errors
- Test: extend `src/app/core/services/data/__tests__/page-starts-1405.test.ts`

- [ ] **Step 1: Write the failing test** "matches the Android Auto 1405 overrides entry for entry". Parse `PAGE_STARTS_1405_OVERRIDES: IntArray = intArrayOf(...)` the way `page-starts.test.ts` parses `PAGE_STARTS`. Assert it has 25 triples equal to the TS overrides.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement the Kotlin and TS changes above.** Call `syncNativePageLayout(layoutFor(kind))` at the end of `applyMushafSelection` (Task 3). Also call `syncNativePageLayout(getActivePageLayout())` once at boot (Task 3's boot line), so an existing selection reaches native.
- [ ] **Step 4: Run; expect PASS.** Kotlin is compiled by the user's build; flag it in the hand-off.
- [ ] **Step 5: Commit** `feat(auto): 1405 page-start overrides + setPageLayout bridge`

---

### Task 5: Unicode-tajweed rendering in MushafPage

**Files:**
- Create: `src/app/shared/components/mushaf-page/tajweed-markup.ts`, which parses the markup and maps rule classes to colours
- Create: `src/app/shared/components/mushaf-page/fit-width.ts`, which does the width-fit maths
- Modify: `src/app/core/services/api/font.loader.ts`: add `ensureHafsUnicodeFont()` and `HAFS_UNICODE_FONT_FAMILY = "UthmanicHafsV18"`, cached in IDB like the V4 page fonts, URL from Background
- Modify: `src/app/shared/components/mushaf-page/MushafPage.tsx`, the font effect (~line 228), the size effect (~line 267), `renderWord` (~line 655) and the root `style` (~line 788)
- Modify: `src/app/shared/components/mushaf-page/MushafPage.css`
- Modify: `src/styles/tokens.css` (`--tajweed-*` tokens)
- Test: `__tests__/tajweed-markup.test.ts`, `__tests__/fit-width.test.ts`, and `__tests__/MushafPage.unicode.test.tsx` (pattern: `MushafPage.glow.test.tsx`)

**Interfaces:**
- Consumes: `rendererFor` (Task 2), `VerseWord.textTajweed` (Task 2).
- Produces:
  - `export interface TajweedSegment { text: string; rule?: TajweedColor }`
  - `export type TajweedColor = "necessary" | "obligatory" | "permissible" | "normal" | "ghunnah" | "qalqalah" | "silent"`
  - `export function parseTajweed(markup: string): TajweedSegment[]`, which maps classes via `RULE_TO_COLOR`; an unknown class or `custom` gives a segment without `rule`
  - `export function fitFontToWidth(heightPx: number, naturalLineWidthsAtHeightPx: number[], containerWidthPx: number): number`, which returns `heightPx` when the widest line fits, else `floor(heightPx * containerWidthPx / widest)`

Class → colour token. Hexes come from `Settings.tsx` `TAJWEED_RULES`:

| Token | Hex | Rule classes |
|---|---|---|
| necessary | `#c0392b` | madda_necessary |
| obligatory | `#e91e8c` | madda_obligatory_mottasel, madda_obligatory_monfasel |
| permissible | `#e67e22` | madda_permissible |
| normal | `#f0c040` | madda_normal |
| ghunnah | `#27ae60` | ghunnah, ikhafa, ikhafa_shafawi, iqlab, idgham_ghunnah, idgham_shafawi |
| qalqalah | `#5dade2` | qalaqah |
| silent | `#95a5a6` | ham_wasl, laam_shamsiyah, slnt, idgham_wo_ghunnah, idgham_mutajanisayn, idgham_mutaqaribayn |

- [ ] **Step 1: Write failing unit tests.**
  - `parseTajweed("<rule class=ham_wasl>ٱ</rule>لۡمَغۡرِبَ<rule class=madda_permissible>يۡ</rule>نِ")` equals `[{text:"ٱ",rule:"silent"},{text:"لۡمَغۡرِبَ"},{text:"يۡ",rule:"permissible"},{text:"نِ"}]`.
  - Plain text `"رَبُّ"` gives `[{text:"رَبُّ"}]`.
  - `<rule class=custom>x</rule>` gives `[{text:"x"}]`.
  - Markup containing `<script>` is returned as literal text, never as an element.
  - `fitFontToWidth(30, [300, 360], 330)` is `27`; `fitFontToWidth(30, [300], 330)` is `30`.
- [ ] **Step 2: Write the failing render test.** With `madani_1405_tajweed` selected and the font loader mocked:
  - a word with `textTajweed` renders `span.mushaf-tj-silent` holding `ٱ`;
  - with `showTajweedColors: false`, no `.mushaf-tj-*` spans render and the word text equals the tag-stripped string;
  - the root has no `fontPalette` style;
  - the `data-verse-key` attributes are unchanged, so hide mode and recite keep working.
- [ ] **Step 3: Run all three; expect FAIL.**
- [ ] **Step 4: Implement.**
  - In `unicode-tajweed` mode:
    - load `ensureHafsUnicodeFont()` instead of `ensurePageFont(page)`; the bismillah and surah-name fonts are unchanged;
    - set the root `fontFamily` to `HAFS_UNICODE_FONT_FAMILY` and omit `fontPalette`;
    - `renderWord` emits segments as `<span className={"mushaf-tj-" + rule}>` when tajweed is on, else the plain text.
  - End markers render as the API digits. If the device check in Step 6 shows bare digits rather than an enclosed marker, prefix `U+06DD` (`۝`). That is the only permitted variation.
  - Glow: in this mode `.mushaf-word-glow` uses `color: var(--tajweed-glow)` (the existing green) instead of a palette. Mistakes CSS is unchanged; it is already colour-based.
  - Width fit:
    - after the height-derived size is applied, measure each `.mushaf-line`'s natural width, i.e. the sum of its children's `getBoundingClientRect().width`;
    - re-apply `fitFontToWidth(...)`;
    - only in `unicode-tajweed` mode, so V4 sizing is untouched.
- [ ] **Step 5: Run the tests, plus `MushafPage.glow.test.tsx` and `page-line-gaps.test.ts`; expect PASS.**
- [ ] **Step 6: Manual check (user's device build).** Select 1405 and open:
  - **page 5:** line 5 starts "۞ إن";
  - **page 532:** line 1 is "رب المشرقين…١٧ … ١٨", and line 15 ends at ٤٠;
  - **page 1:** Al-Fatiha, natural-width path;
  - **page 3:** first full page;
  - **page 596:** a surah start mid-page in 1405 at 92:15.

  On each page confirm: no line overflows; colours join inside words; hide mode bars line up; a recite red word shows; Mushaf quiz pages (Akmel al-Ayah, Mutashabihat) render the same layout.
- [ ] **Step 7: Commit** `feat(mushaf): render Madani 1405 with Unicode Hafs font + CSS tajweed colours`

---

### Task 6: Hand-off

- [ ] Run the full suite: `CI=true npx react-scripts test --watchAll=false`. It is green at 1299+ (2026-11-10 baseline).
- [ ] Update the `project-page-starts-table` memory: two layouts now exist, and the "all mushafs share one layout" rule is gone.
- [ ] Tell the user that Kotlin changed (Task 4) and that the device checks in Task 5 Step 6 are pending.

---

## Other Mushaf options (not in this plan)

All come from the same QF API / CDN unless noted. Effort assumes this plan's layout plumbing has landed.

| Option | What it is | Data source | Effort | Notes |
|---|---|---|---|---|
| **Madani 1405 Classic** | Exact 1405 printed page, per-page glyph fonts, no colours | `mushaf=2`, `code_v1`, fonts `…/hafs/v1/woff2/p{N}.woff2` (verified 200) | S–M | Same pipeline as V4 (per-page font), layout `"1405"`; no palettes. Best "looks exactly like print" 1405 option. |
| **Madani 1421 Plain** | Today's V4 page without colours | already there | done | Same as turning off the Tajweed toggle. No new option needed. |
| **IndoPak 15-line (604 pages)** | South-Asian Naskh script | `mushaf=3`, `text_indopak` + IndoPak Nastaleeq font | M | Kind already exists in `mushaf.config.ts` but is hidden. It needs the Unicode renderer from Task 5, without colours. Page breaks match 1421. |
| **IndoPak 15-line Qudratullah (610 pages) / 16-line Taj (548 pages)** | The IndoPak layouts most South-Asian readers actually own | `mushaf=6` / `7` | L | Breaks the 604-page assumption: TOTAL_PAGES, the page tables, the juz/hizb page maps and Android Auto would need per-layout counts. |
| **KFGQPC Hafs Unicode (1421)** | Clean Unicode text in the 1421 layout, selectable/copyable | `mushaf=5` | S | The Task 5 renderer with layout `"1421"`. Useful as a light, fast fallback (one font, not 604). |
| **Digital Khatt (1405 or 1421)** | Variable font that justifies lines by stretching letters, the way printed Mushafs do | QUL layouts 22 (1405) / 20 (1421), fonts on QUL | M–L | Best-looking Unicode option. Needs QUL data or confirmation that the QF API exposes it, plus a licence check. |
| **Qira'at: Warsh, Qaloun, Douri, Sousi, Shu'ba** | Other recitation readings | QUL fonts; text not on the QF content API | XL | Different text, so search, recite matching and quizzes would all need per-qira'ah data. A separate project. |

Display options that aren't separate Mushafs but could sit next to the picker:
- word-by-word translation on tap (`word_fields=translation` is already mapped);
- a sepia/paper theme;
- a "lines per page = natural wrap" mode, already present as `bigTextMode`.
