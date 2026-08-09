# Play Store listing copy — Rafeeq

Ready to paste into the Play Console. Every feature named here was checked
against the code; nothing is aspirational. Character counts are noted against
Google's limits.

> **Two claims to confirm yourself before publishing.** The description says
> "a wide selection of reciters" rather than a number — the list comes from the
> Quran Foundation API at runtime, so the count could not be verified from the
> source. If you know the real figure, "Over N reciters" is stronger copy.
> Reading navigation is described as **surah / juz / hizb**, which is what
> `SurahJuzSelection.tsx` actually offers — there is no page or rub' tab.

---

## Short description (limit 80 characters)

**Option A — recommended** (76 chars):

```
Read the Quran, memorise with Hifz plans, and test yourself with recitation.
```

**Option B — memorisation-first** (73 chars):

```
Quran reader and memorisation companion with quizzes and recitation mode.
```

**Option C — plainest** (62 chars):

```
Quran mushaf, Hifz memorisation plans, quizzes and recitation.
```

> Google truncates hard at 80. Option A leads with reading (the widest
> audience) and still names the two things that differentiate the app.

---

## Full description (limit 4000 characters — this draft is ~1,850)

```
Rafeeq is a Quran companion for reading, memorising, and testing what you have learned. It works offline, shows no ads, and needs no account.

READ
• Full Quran mushaf in the QPC page layout, with authentic page-accurate fonts
• Navigate by surah, juz, or hizb
• Translations and tafsir from the Quran Foundation
• Night mode, adjustable text size, and a distraction-free reading view
• Bookmarks and per-verse notes, saved on your device

MEMORISE (HIFZ)
• Build a memorisation plan from what you already know
• Split your revision into sessions by page, rub', hizb, or juz
• Track progress per session and across the whole plan
• A daily streak that keeps counting as long as you review — with a one-day recovery if life gets in the way

TEST YOURSELF
• Complete the Verse — recite or type the rest of a verse from memory
• Mutashabihat — tell apart verses that begin the same way and complete the right one
• Complete the Ending — choose the correct ending after the Waqf sign
• A separate quiz streak, so revision and testing both count

RECITE MODE
Recite aloud and Rafeeq follows along with the text, highlighting as you go and catching where you pause. Recite mode is entirely optional and only listens while you are actively using it.

LISTEN
• A wide selection of reciters
• Background playback with lock-screen and notification controls
• Android Auto support for listening while driving
• Download recitations for offline listening

AZKAR
Daily morning, evening, and occasion remembrances, with counters.

YOUR DATA STAYS YOURS
Rafeeq has no accounts and no sign-in. Your notes, bookmarks, memorisation progress, and streaks are stored only on your device. There is no advertising, no analytics, and no tracking of any kind.

Moving to a new phone? Account → Backup exports everything to a single file you control, and restores it on the new device.

The only feature that sends anything off your device is Recite Mode, which streams microphone audio to a speech-recognition provider purely to turn your recitation into text. It is never on by default, the audio is never recorded or stored, and the rest of the app works normally if you decline the microphone permission.

Quran text, translations, tafsir, and recitation audio are provided by the Quran Foundation.
```

---

## Content rating questionnaire (IARC)

Category: **Reference, News, or Educational**

Expected outcome: **Everyone / PEGI 3 / rated for all ages.**

| Question | Answer |
|---|---|
| Violence (cartoon, fantasy, realistic) | No |
| Sexual content or nudity | No |
| Profanity or crude humour | No |
| Controlled substances (drugs, alcohol, tobacco) | No |
| Gambling — simulated or real | No |
| User-generated content shared with others | **No** — notes are local and never transmitted |
| Users can interact or communicate | **No** — no social features, no accounts |
| Shares user location | No |
| Allows purchase of digital goods | **No** (revisit if the subscription tier ships) |
| Collects personal information | **No** — no sign-in, nothing leaves the device except Recite Mode audio |
| Miscellaneous: references to religion | Religious/educational content, non-controversial |

> The two that catch people out are **user-generated content** and
> **user interaction**. Both are "No" only because notes stay on-device and
> there is no sharing. If backup ever becomes server-side sync, revisit.

---

## Target audience & content

- **Target age groups:** 13+ (simplest honest answer — the app is suitable for
  all ages, but declaring under-13 as a target audience pulls you into Play's
  Families policy, designed-for-families requirements, and stricter data rules
  for no benefit here).
- **Appeals to children?** No — no child-directed characters, gameplay, or
  marketing.
- **Store presence for children:** No.

> If you *do* want a younger target audience, note that Recite Mode requires
> microphone permission, which triggers extra scrutiny under the Families
> policy. Recommend staying 13+.

---

## Category & tags

- **App category:** Books & Reference
  *(Alternative: Lifestyle. Books & Reference is the better fit — it's where
  Quran apps are typically found and where the reading feature belongs.)*
- **Tags:** Quran, Islam, Religion, Books & Reference, Education
- **Contains ads:** No
- **In-app purchases:** No *(revisit when the subscription tier ships)*

---

## Notes on assets still needed

- **App icon** 512×512 PNG, 32-bit with alpha — source at `assets/icon.png`
- **Feature graphic** 1024×500 JPG/PNG, no alpha. Shown at the top of the
  listing; text on it gets cropped on some layouts, so keep any wording central.
- **Phone screenshots** — minimum 2, up to 8. Suggested order, strongest first:
  1. Mushaf page view (the core of the app)
  2. Hifz plan with session progress
  3. A quiz mid-question
  4. Recite mode following along
  5. Reciter list / playback
- **Android Auto:** if you declare Auto support, Google runs an extra car-app
  quality review. Screenshots of the Auto UI are not required but the review is.
