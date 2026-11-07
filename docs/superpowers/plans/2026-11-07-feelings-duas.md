# Feelings — Duas & Verses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Feelings" page under More where the user picks one of 12 feelings and sees Quran verses and authenticated duas for it.

**Architecture:** Static bundled content. `feelingsData.ts` (hand-authored) lists verse refs and duas, mostly reused from `azkarData.ts` by `(categoryId, zikrId)`. A one-off Node script fetches verse text + mushaf page from `api.quran.com` into `feelingsVerses.generated.ts`. A pure resolver turns a feeling into display-ready verses/duas; one Ionic page renders the grid (`/feelings`) and detail (`/feelings/:feelingId`).

**Tech Stack:** React 18 + Ionic React, react-router v5, TypeScript, Jest via react-scripts, Node 22 (script, built-in `fetch`).

**Spec:** `docs/superpowers/specs/2026-11-07-feelings-duas-design.md`

## Global Constraints

- Verse/dua text is Arabic only; UI chrome bilingual via `src/app/core/i18n/strings.ts` (`ar` + `en` objects, `AppStrings` interface).
- Verse text is never hand-typed — only from `scripts/generate-feeling-verses.mjs` output.
- Every dua has a source. No hadith graded weak by al-Albani; never add «اللهم ألهمني رشدي…» or «اللهم ما أصبح بي من نعمة…».
- Reused duas are referenced as `{ categoryId, zikrId }` — zikr ids repeat across categories.
- Page containers: `max-width: var(--max-width-mobile, 600px); margin: 0 auto`; scroll container `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))`.
- No scrollbar styling, no `eslint-disable` comments.
- Colours: green only as fills, gold for text/borders (Unified Controls).
- `/feelings*` routes must NOT be added to `ROOT_TAB_PATHS`; navigate into them with `history.push`.
- Don't run `npm run build`, `cap sync` or Gradle — the owner builds.
- Tests: `CI=true npx react-scripts test --watchAll=false --testPathPattern feelings` (Git Bash). Working tree is CRLF.

## Review Focus

1. **Bad verse ref in data** (`"94:5-"`, `"2:300"`, `"3:10-5"`) — expect a thrown error naming the ref, caught by the data test, never a blank card. → Task 1, `parseVerseRef rejects malformed refs`.
2. **Range card deep link** — tapping `94:5-6` must open the mushaf at 94:5 on 94:5's page, not 94:6's. → Task 2, `range uses first ayah's key and page`.
3. **Same dua twice in one feeling** (copy-paste in data) — expect none. → Task 1, `no feeling lists the same dua twice`.
4. **Unknown feeling id in URL** (`/feelings/nope`, stale link) — expect redirect to the grid. → Task 1 `getFeeling returns undefined for unknown id` + Task 3 `<Redirect>`.
5. **Verse refs edited without re-running the generator** — expect a failing test, not a crash at runtime. → Task 2, `every verse ref has generated text and page`.

---

### Task 1: Feelings data + dua resolver

**Files:**
- Create: `src/data/feelingsData.ts`
- Create: `src/app/features/feelings/feelingsContent.ts`
- Test: `src/app/features/feelings/__tests__/feelingsContent.test.ts`

**Interfaces:**
- Produces (`feelingsData.ts`):
  ```ts
  export type FeelingDua =
    | { categoryId: string; zikrId: string }
    | { text: string; source: string; note?: string };
  export interface Feeling { id: string; emoji: string; titleAr: string; titleEn: string; verses: string[]; duas: FeelingDua[] }
  export const FEELINGS: Feeling[];
  ```
- Produces (`feelingsContent.ts`):
  ```ts
  export interface VerseRef { surah: number; from: number; to: number }
  export interface ResolvedDua { text: string; source: string; note?: string }
  export function parseVerseRef(ref: string): VerseRef;      // throws Error(`Bad verse ref: ${ref}`)
  export function expandVerseRef(ref: string): string[];      // "94:5-6" → ["94:5","94:6"]
  export function getFeeling(id: string): Feeling | undefined;
  export function resolveDuas(feeling: Feeling): ResolvedDua[]; // throws Error(`Missing zikr ${categoryId}/${zikrId}`)
  ```

**Content** — the spec's table, in that order, with these resolutions found while planning:

| id | emoji | titleAr | titleEn | duas (in order) |
|---|---|---|---|---|
| `sad` | 😢 | الحزن والهم | Sad & worried | distress/ds-8, distress/mo-9, distress/ds-2, distress/ds-4 |
| `anxious` | 😟 | القلق | Anxious | distress/ds-5, distress/ds-1, distress/ds-10 |
| `afraid` | 😨 | الخوف | Afraid | fear/fe-1, fear/fe-2, fear/fe-3, morning/me-6 |
| `angry` | 😠 | الغضب | Angry | sneezing/sn-4, salah/sp-19 |
| `confused` | 😕 | الحيرة | Confused | istikhara/is-1, inline A |
| `weak-faith` | 😔 | ضعف الإيمان | Weak faith | inline B, inline C |
| `sick` | 🤒 | المرض والرقية | Sick | illness/il-7, illness/il-1, illness/il-2, illness/il-8 |
| `impatient` | 😤 | نفاد الصبر | Impatient | funeral/fn-1 |
| `happy` | 😊 | السعادة | Happy | social/so-10, after-prayer/ap-9 |
| `content` | 😌 | الرضا والطمأنينة | Content & at peace | morning/mo-1, salah/sp-19 |
| `love` | 🥰 | الحب | Love | inline D, social/so-2 *(the book already has the reply «أحبك الذي أحببتني له» with the «إني أحبك في الله» note — replaces the spec's inline Abu Dawud 5125)* |
| `lazy` | 😩 | الكسل والضعف | Lazy & low | distress/mo-9, distress/ds-10, inline E |

Verse refs per feeling: exactly the spec table's "Verses" column, as strings (`"94:5-6"`, `"89:27-30"`).

Inline duas (exact copy; owner verifies before merge):

- **A** — text `اللَّهُمَّ اهْدِنِي وَسَدِّدْنِي`, source `صحيح مسلم 2725`
- **B** — text `يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ`, note `كان أكثر دعاء النبي ﷺ`, source `صحيح الترمذي 2140`
- **C** — text `اللَّهُمَّ مُصَرِّفَ الْقُلُوبِ صَرِّفْ قُلُوبَنَا عَلَى طَاعَتِكَ`, source `صحيح مسلم 2654`
- **D** — text `اللَّهُمَّ إِنِّي أَسْأَلُكَ حُبَّكَ، وَحُبَّ مَنْ يُحِبُّكَ، وَحُبَّ عَمَلٍ يُقَرِّبُ إِلَى حُبِّكَ`, note `من حديث معاذ في اختصام الملأ الأعلى`, source `صحيح الترمذي 3235`
- **E** — text `اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَالْهَرَمِ وَعَذَابِ الْقَبْرِ، اللَّهُمَّ آتِ نَفْسِي تَقْوَاهَا، وَزَكِّهَا أَنْتَ خَيْرُ مَنْ زَكَّاهَا، أَنْتَ وَلِيُّهَا وَمَوْلَاهَا`, source `صحيح مسلم 2722`

File header comment: what the file is, the content rules (sourced, no weak hadith, verse text only via the generator), and that ids are URL slugs.

- [ ] **Step 1: Write the failing tests**

```ts
import azkarData from "../../../../data/azkarData";
import { FEELINGS } from "../../../../data/feelingsData";
import { parseVerseRef, expandVerseRef, getFeeling, resolveDuas } from "../feelingsContent";

const IDS = ["sad","anxious","afraid","angry","confused","weak-faith","sick","impatient","happy","content","love","lazy"];

test("exactly the 12 feelings, in order, url-safe", () => {
  expect(FEELINGS.map(f => f.id)).toEqual(IDS);
  FEELINGS.forEach(f => expect(f.id).toMatch(/^[a-z]+(-[a-z]+)*$/));
});
test("every feeling has at least one verse and one dua", ...);       // verses.length >= 1, duas.length >= 1
test("parseVerseRef reads single and range refs", () => {
  expect(parseVerseRef("13:28")).toEqual({ surah: 13, from: 28, to: 28 });
  expect(parseVerseRef("94:5-6")).toEqual({ surah: 94, from: 5, to: 6 });
});
test("parseVerseRef rejects malformed refs", () => {
  ["94:5-", "2:300", "3:10-5", "115:1", "0:1", "13", ""].forEach(r =>
    expect(() => parseVerseRef(r)).toThrow(`Bad verse ref: ${r}`));
});
test("expandVerseRef lists each ayah key", () =>
  expect(expandVerseRef("89:27-30")).toEqual(["89:27","89:28","89:29","89:30"]));
test("every verse ref in the data parses", ...);                      // FEELINGS.flatMap(verses).forEach(parseVerseRef) doesn't throw
test("every reused dua exists in azkarData", ...);                    // resolveDuas(f) doesn't throw for each f
test("every dua resolves with non-empty text and source", ...);
test("no feeling lists the same dua twice", ...);                     // resolved texts unique within each feeling
test("resolveDuas carries the book's source and note", () => {
  const love = resolveDuas(getFeeling("love")!);
  const so2 = azkarData.find(c => c.id === "social")!.azkar.find(z => z.id === "so-2")!;
  expect(love[1]).toEqual({ text: so2.text, source: so2.source, note: so2.note });
});
test("resolveDuas throws on a missing zikr", () =>
  expect(() => resolveDuas({ ...FEELINGS[0], duas: [{ categoryId: "distress", zikrId: "nope" }] }))
    .toThrow("Missing zikr distress/nope"));
test("getFeeling returns undefined for unknown id", () => expect(getFeeling("nope")).toBeUndefined());
```

- [ ] **Step 2: Run to verify they fail**

Run: `CI=true npx react-scripts test --watchAll=false --testPathPattern feelings`
Expected: FAIL — cannot find module `feelingsData` / `feelingsContent`.

- [ ] **Step 3: Write `src/data/feelingsData.ts`** with the content above.

- [ ] **Step 4: Implement `parseVerseRef`, `expandVerseRef`, `getFeeling`, `resolveDuas` in `feelingsContent.ts`**

`parseVerseRef`: regex `^(\d+):(\d+)(?:-(\d+))?$`; validate `1 ≤ surah ≤ 114`, `1 ≤ from ≤ to ≤ ayahCount(surah)`. Ayah counts: copy the `VERSE_COUNTS` table from `scripts/build-quran-corpus.mjs` into a module-level `const` (114 entries). `resolveDuas` omits `note` when the source entry has none (so `toEqual` matches).

- [ ] **Step 5: Run tests — all pass**

Same command. Expected: PASS, 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/feelingsData.ts src/app/features/feelings
git commit -m "feat(feelings): feelings data and dua resolver"
```

---

### Task 2: Verse generator + verse resolver

**Files:**
- Create: `scripts/generate-feeling-verses.mjs`
- Create (generated): `src/data/feelingsVerses.generated.ts`
- Modify: `src/app/features/feelings/feelingsContent.ts`
- Test: `src/app/features/feelings/__tests__/feelingsContent.test.ts`

**Interfaces:**
- Consumes: `FEELINGS`, `parseVerseRef`, `expandVerseRef` (Task 1).
- Produces:
  ```ts
  // feelingsVerses.generated.ts
  export const FEELING_VERSES: Record<string, { text: string; page: number }>;
  // feelingsContent.ts
  export interface ResolvedVerse { ref: string; surah: number; surahName: string; from: number; to: number; text: string; page: number; firstKey: string }
  export function resolveVerses(feeling: Feeling): ResolvedVerse[]; // throws Error(`Missing verse ${key} — re-run scripts/generate-feeling-verses.mjs`)
  ```

- [ ] **Step 1: Write the failing tests** (append)

```ts
test("every verse ref has generated text and page", () => {
  FEELINGS.flatMap(f => f.verses).flatMap(expandVerseRef).forEach(k => {
    expect(FEELING_VERSES[k]?.text).toBeTruthy();
    expect(FEELING_VERSES[k].page).toBeGreaterThanOrEqual(1);
    expect(FEELING_VERSES[k].page).toBeLessThanOrEqual(604);
  });
});
test("range joins ayat in order with Arabic-Indic numbers", () => {
  const v = resolveVerses(getFeeling("sad")!).find(x => x.ref === "94:5-6")!;
  expect(v.text).toBe(`${FEELING_VERSES["94:5"].text} (٥) ${FEELING_VERSES["94:6"].text} (٦)`);
  expect(v.surahName).toBe("الشرح");
});
test("range uses first ayah's key and page", () => {
  const v = resolveVerses(getFeeling("content")!).find(x => x.ref === "89:27-30")!;
  expect(v.firstKey).toBe("89:27");
  expect(v.page).toBe(FEELING_VERSES["89:27"].page);
});
```

- [ ] **Step 2: Run — FAIL** (module `feelingsVerses.generated` not found).

- [ ] **Step 3: Write `scripts/generate-feeling-verses.mjs`**

Header comment in the style of `build-quran-corpus.mjs` (purpose, usage `node scripts/generate-feeling-verses.mjs`, output path). Behaviour:
- Read `src/data/feelingsData.ts` as text; collect every string inside `verses: [ ... ]` arrays via regex; expand ranges (inline, same `N:A` / `N:A-B` grammar).
- For each unique key, sequentially: `GET https://api.quran.com/api/v4/verses/by_key/${key}?fields=text_uthmani` → `json.verse.text_uthmani`, `json.verse.page_number` (verified shape: `{"verse":{…,"text_uthmani":"فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا","page_number":596}}` for `94:5`). 150 ms delay between requests. Send a generic `User-Agent: rafeeq-feelings-generator`.
- Any non-200, missing field or empty text → print the key and `process.exit(1)` **before** writing anything.
- Write keys sorted by (surah, ayah); file starts with `// GENERATED by scripts/generate-feeling-verses.mjs from api.quran.com (text_uthmani) — do not edit.`; CRLF line endings to match the tree.

- [ ] **Step 4: Run the generator**

Run: `node scripts/generate-feeling-verses.mjs`
Expected: prints the key count (≈ 50) and the output path; `src/data/feelingsVerses.generated.ts` exists.

- [ ] **Step 5: Implement `resolveVerses`**

Per ref: `parseVerseRef`, expand, look up each key (throw the Missing verse error), `text` = each ayah's text + ` (${arabicIndic(ayah)})` joined with a space, `surahName` = `getSurahNameArabic(surah)` from `src/app/core/services/data/metadata.service.ts` (its static fallback works with an empty cache, so tests need no mocks), `page`/`firstKey` from the first ayah. `arabicIndic` is a local helper mapping `0-9` → `٠-٩`.

- [ ] **Step 6: Run tests — all pass** (15 tests).

- [ ] **Step 7: Spot-check one verse by eye**

Run: `grep -n '"13:28"' src/data/feelingsVerses.generated.ts`
Expected: begins `ٱلَّذِينَ ءَامَنُوا۟ وَتَطْمَئِنُّ قُلُوبُهُم بِذِكْرِ ٱللَّهِ` and page `252`.

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-feeling-verses.mjs src/data/feelingsVerses.generated.ts src/app/features/feelings
git commit -m "feat(feelings): generated verse text and verse resolver"
```

---

### Task 3: Feelings page, strings, routes

**Files:**
- Create: `src/app/features/feelings/Feelings.tsx`
- Create: `src/app/features/feelings/Feelings.css`
- Modify: `src/app/core/i18n/strings.ts` (interface ~line 33; `ar` ~749; `en` ~1496)
- Modify: `src/App.tsx` (import near line 45; routes near line 214)

**Interfaces:**
- Consumes: `FEELINGS`, `getFeeling`, `resolveVerses`, `resolveDuas`, `ResolvedVerse`, `ResolvedDua` (Tasks 1–2).
- Produces: default export `Feelings: React.FC`; strings `t.more.feelings` and `t.feelings.{title, prompt, verses, duas, back, openInMushaf}`.

**Before writing UI:** invoke the `frontend-design:frontend-design` skill (owner's standing preference for UI work). Visual baseline: More cards (`More.css`) for the grid, `.azkar-item` (`Azkar.css`) for dua cards, `.azkar-header` / `.azkar-back-btn` for the detail header.

**Strings (exact):**

| key | ar | en |
|---|---|---|
| `more.feelings` | مشاعري | Feelings |
| `feelings.title` | مشاعري | Feelings |
| `feelings.prompt` | كيف تشعر الآن؟ | How are you feeling? |
| `feelings.verses` | آيات | Verses |
| `feelings.duas` | أدعية | Duas |
| `feelings.back` | رجوع | Back |
| `feelings.openInMushaf` | افتح في المصحف | Open in the mushaf |

- [ ] **Step 1: Add the strings** to `AppStrings`, `ar` and `en`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors (catches a missing key in either language object).

- [ ] **Step 3: Write `Feelings.tsx`**

- `const { feelingId } = useParams<{ feelingId?: string }>()`; `const { t, isRTL } = useLang()`.
- `feelingId` set but `getFeeling` undefined → `<Redirect to="/feelings" />` (react-router).
- **Grid:** heading `t.feelings.prompt`; 3-column grid of buttons, emoji (`aria-hidden`) above `isRTL ? titleAr : titleEn`; `onClick={() => history.push(\`/feelings/${f.id}\`)}`.
- **Detail:** header with back button (`aria-label={t.feelings.back}`, `history.goBack()`), emoji + title. Section `t.feelings.verses`: one button per `ResolvedVerse` → `history.push(\`/viewer?page=${v.page}&v=${encodeURIComponent(v.firstKey)}\`)`, `aria-label={t.feelings.openInMushaf}`; shows `﴿{v.text}﴾` (`dir="rtl" lang="ar"`, `var(--font-arabic)`) and `سورة {surahName} · {from}` or `{from}–{to}` in Arabic-Indic digits. Section `t.feelings.duas`: text, optional note, source.
- Resolve with `useMemo` keyed on `feelingId`.
- Wrapper/container classes mirror More (`feelings-page-wrapper` / `feelings-container`); `<BottomNavBar active="more" fixed />` after `IonContent`.

- [ ] **Step 4: Write `Feelings.css`** under the Global Constraints (width token, nav padding, no scrollbar rules, green fills only / gold text and borders).

- [ ] **Step 5: Add routes in `App.tsx`**

`import Feelings from "./app/features/feelings/Feelings";` and
`<Route exact path="/feelings" component={Feelings} />` + `<Route exact path="/feelings/:feelingId" component={Feelings} />` next to `/more`. Do not touch `ROOT_TAB_PATHS`.

- [ ] **Step 6: Typecheck + full feelings tests**

Run: `npx tsc --noEmit -p .` then `CI=true npx react-scripts test --watchAll=false --testPathPattern feelings`
Expected: no type errors; 15 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/features/feelings src/app/core/i18n/strings.ts src/App.tsx
git commit -m "feat(feelings): feelings grid and detail page"
```

---

### Task 4: More entry + tour copy

**Files:**
- Modify: `src/app/features/more/More.tsx` (`MoreEntry.id` union, `ENTRIES`, `labels`)
- Modify: `src/app/features/onboarding/onboardingCopy.ts:156` and `:321` (More `cards` body)

**Interfaces:**
- Consumes: route `/feelings`, string `t.more.feelings` (Task 3).

- [ ] **Step 1: Add the entry**

`id: "feelings"` inserted in `ENTRIES` after `tracker`, before `account`; `route: "/feelings"`; icon = smiley in the existing 24×24 stroke style:
```tsx
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
  <circle cx="12" cy="12" r="9" />
  <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
  <line x1="9" y1="9.5" x2="9.01" y2="9.5" strokeWidth="2" />
  <line x1="15" y1="9.5" x2="15.01" y2="9.5" strokeWidth="2" />
</svg>
```
Add `feelings: tm.feelings` to `labels`. Update the file's header comment list of destinations. Five cards → the existing `.more-card:last-child:nth-child(odd)` rule makes Settings span the full row; no CSS change.

- [ ] **Step 2: Update tour copy**

ar: `مواقيت الصلاة والقبلة، ومتابع العبادات، ومشاعري، والحساب، والإعدادات.`
en: `Prayer times & Qibla, the Worship Tracker, Feelings, Account and Settings.`

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit -p .` then `CI=true npx react-scripts test --watchAll=false`
Expected: no type errors; whole suite green (onboarding tests may assert copy — update any assertion that pinned the old body string).

- [ ] **Step 4: Commit**

```bash
git add src/app/features/more/More.tsx src/app/features/onboarding/onboardingCopy.ts
git commit -m "feat(more): add the Feelings card"
```

---

### Owner checks before merge (not automatable)

- Verify inline duas A–E (text and source) and the reuse choices for `sick`.
- On device, both languages: grid → detail → verse tap opens the mushaf at the right ayah; hardware back: viewer → detail → grid → More; content never hidden under the nav bar.
