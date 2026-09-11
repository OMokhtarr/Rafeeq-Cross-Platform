# Play Console prep — Rafeeq

Everything needed for the Play Store listing, derived from what the app actually
declares and does. Answers here are meant to be copied into the console verbatim.

App: **Rafeeq** · package `com.rafeeq.quranquiz` · versionCode 2 / versionName 1.1.0

> ✅ **Credentials rotated** 13 Aug 2026 and verified working through the broker.
>
> ✅ **Token broker deployed and verified** 15 Aug 2026.
> `bash token-broker/verify-deploy.sh` passes: `/deepgram/token` is live and
> mints real Deepgram ASR grants (`asr:write` scope), not the Quran Foundation
> fallback token. Recite mode smoke-tested against this deployment and working.
>
> ✅ **QF 7-day caching rule closed** 22 Aug 2026. Content Sync is implemented and
> merged for tafsirs and recitations; the Quran script is covered by express
> written permission from Quran Foundation. See §5 and `docs/licensing-decisions.md`.

---

## 0. Status at a glance

Last updated 11 Sep 2026. Section numbers link to the detail below.

### Outstanding

Ordered by category: work that changes the app first, then what we're waiting on
someone else for, then paperwork that can be filled in any time.

#### A. Needs work on the app — do these first

| # | Task | § | Blocking |
|---|---|---|---|
| ~~A1~~ | ~~**QF 7-day caching rule**~~ | 5 | ✅ **Done 22 Aug 2026** |
| ~~A2~~ | ~~**Postal address in `privacy.html`**~~ | 5 | ✅ **Done 11 Sep 2026** |
| ~~A3~~ | ~~**Address mirrored into `Account.tsx`**~~ (AR + EN in sync) | 5 | ✅ **Done 11 Sep 2026** — changes app code, so A6 rebuild required |
| ~~A4~~ | ~~**Surah-header ornament**~~ — decision taken to ship the trace as-is | 5 | ✅ **Closed 22 Aug 2026** (risk accepted) |
| A5 | Record the foreground-service demo video (playback → background → notification controls) | 3 | **Yes** |
| A6 | Rebuild + re-sign the AAB — **required twice over: the current bundle predates both Content Sync (A1) and the A3 address change** | 8 | **Yes** |

#### B. Blocked on someone else — chase these in parallel

| # | Task | § | Blocking |
|---|---|---|---|
| ~~B1~~ | ~~**QF reply — Content Sync scope**~~ — answered: express permission granted under §3.1(3)(a) | 5 | ✅ **Resolved 21 Aug 2026** |
| ~~B2~~ | ~~**QF reply — surah-header artwork**~~ — QF cannot grant on KFGQPC's behalf; proceeding without a reply | 5 | ✅ **Closed 22 Aug 2026** (risk accepted) |
| B3 | Recruit ~12 testers and start the closed test — 14 **continuous** days | 8 | **Yes** |
| ~~B4~~ | ~~**QF client secret rotation**~~ | 7 | ✅ **Done 11 Sep 2026** |

#### C. Paperwork — no dependencies, do any time

All the copy and questionnaire answers now live in **`PLAY-LISTING-COPY.md`**,
ready to paste. What remains in C is console entry, hosting, and two decisions.

| # | Task | § | Blocking | Status |
|---|---|---|---|---|
| C1 | Short description (≤80 chars) | 6 | **Yes** | ✅ Drafted — EN + AR, 3 options each |
| C2 | Full description (≤4000 chars) | 6 | **Yes** | ✅ Drafted — EN 2,794 / AR 2,497 chars |
| C3 | Data safety form — answers in §2 | 2 | **Yes** | ✅ Submitted 11 Sep 2026 — ⚠️ see the Deepgram retention caveat in §2 |
| C4 | Foreground service declaration (§3 has the justification) | 3 | **Yes** | ✅ Submitted 11 Sep 2026 — demo video (A5) still required |
| C5 | Content rating questionnaire (expect "Everyone") | 6 | **Yes** | ✅ Pre-answered, every question |
| C6 | Target audience & content declaration | 6 | **Yes** | ✅ Pre-answered — 13+ |
| C7 | Category — Books & Reference, or Lifestyle | 6 | **Yes** | ✅ Decided — Books & Reference |
| C8 | Create the Play listing | 8 | **Yes** | ✅ Done 11 Sep 2026 |
| C9 | Host `privacy.html` + `terms.html` in the same directory; add URL to the listing | 5 | **Yes** | ✅ Done 11 Sep 2026 — GitHub Pages, `gh-pages` branch |
| C10 | Confirm the Deepgram / Cloudflare / jsDelivr / QF policy links resolve | 5 | No | ✅ Done 11 Sep 2026 — found + fixed a dead QF link |
| C11 | Decide: declare Android Auto now, or in a follow-up release | 6 | No | ⏳ Recommendation written — **your call** |
| C12 | Apply for production access | 8 | **Yes** — last step | Console only |

**Critical path:** B3 is the only long pole — 14 **continuous** days, and nothing
gates starting it, so recruit testers today. Credential rotation (B4) is complete,
so nothing is blocked on a third party any more.

The privacy policy is filled in, hosted, link-checked and in the listing
(A2, A3, C9, C10). What remains that touches the app is **A5** (foreground-service
demo video — the most commonly underestimated item) and **A6** (rebuild + re-sign
the AAB). A6 is doubly required now: the current bundle predates Content Sync
*and* predates the A3 address change.

Note the privacy-link fix touched only the hosted page, not the app, so it does
not itself force a rebuild.

Console entry is done — the listing is created and the Data safety and
foreground-service declarations are submitted (C3, C4, C8). What is left in C is
the Android Auto decision (C11) and production access (C12), which is the last
step and gated on the closed test finishing.

⚠️ Two submitted answers are conditional and worth re-checking before release:
the Data safety "processed ephemerally" claim depends on Deepgram's retention
setting (§2), and the foreground-service declaration still needs its demo
video (A5).

> ⚠️ **Tripwire for the subscription tier.** The content rating answers
> "no digital purchases" and "no user interaction" are correct for versionCode 2
> only. When the RevenueCat Pro tier ships, digital purchases becomes **Yes**
> and the rating questionnaire must be re-run *before* that build goes out.
> Same for §4's account-deletion scope the moment sign-in is added.

### Done

| Item | When |
|---|---|
| Credentials rotated, verified through the broker | 13 Aug 2026 |
| Android Auto in-car regression pass | 13 Aug 2026 |
| Token broker deployed + `verify-deploy.sh` passing | 15 Aug 2026 |
| Recite mode smoke-tested against the live broker | 15 Aug 2026 |
| ~~Signed AAB~~ — built, but **now stale**: predates Content Sync. Rebuild required (A6) | — |
| Listing assets — icon, feature graphic, 4 × 9:16 screenshots in `play-assets/` | — |
| Account deletion confirmed out of scope (no sign-in) | — |
| Privacy policy rewritten, incl. the QF developer-privacy pass | Aug 2026 |
| Source TODOs — Settings persisted data, Mushaf page layout | 15 Aug 2026 |
| Listing copy + questionnaires (C1, C2, C5, C6, C7) — `PLAY-LISTING-COPY.md` | 20 Aug 2026 |
| QF express permission for offline Quran script (§3.1(3)(a)) — `docs/licensing-decisions.md` | 21 Aug 2026 |
| **Content Sync implemented and merged** — tafsirs + recitations, verified live | 22 Aug 2026 |
| KFGQPC ornament — decision taken to ship without KFGQPC permission | 22 Aug 2026 |
| Postal address filled in + mirrored in-app (A2/A3) | 11 Sep 2026 |
| Privacy policy + terms hosted on GitHub Pages, listing updated (C9) | 11 Sep 2026 |
| Processor links verified; dead QF privacy link fixed (C10) | 11 Sep 2026 |
| QF client secret rotated — credential rotation now complete (B4) | 11 Sep 2026 |
| Play listing created; Data safety + foreground-service declarations submitted (C3, C4, C8) | 11 Sep 2026 |

---

## 1. What the app actually collects

Established by auditing the manifest and every outbound host. The app has no
sign-in, so there are no user OAuth scopes to audit.

**Permissions declared** (`AndroidManifest.xml`):

| Permission | Why |
|---|---|
| `INTERNET` | Quran content, audio, translations |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | background/Android Auto recitation playback |
| `RECORD_AUDIO` | recite mode — live recitation matching |
| `MODIFY_AUDIO_SETTINGS` | audio focus handling during playback |

**Outbound hosts:**

| Host | Purpose | Data sent |
|---|---|---|
| `apis.quran.foundation` | Quran text, translations, tafsir, audio timestamps | none personal (via token broker) |
| `verses.quran.foundation` | recitation audio files | none |
| `api.deepgram.com` (wss) | recite mode speech-to-text | **live microphone audio** |
| `cdn.jsdelivr.net` | QPC mushaf fonts | none |

**User sign-in:** none. The app has no accounts and requests no OAuth user
scopes — the token broker only ever fetches machine-to-machine tokens for the
content API. Notes, bookmarks, and the Hifz streak are local-only.

---

## 2. Data safety form — answers

**Does your app collect or share any of the required user data types?** → **Yes**

### Audio → Voice or sound recordings
- Collected: **Yes** · Shared: **Yes** (with Deepgram, the transcription provider)
- Processed ephemerally: **Yes** — audio streams live over a WebSocket for real-time
  transcription and is never written to disk or retained by the app.
- Required or optional: **Optional** — only recite mode uses the mic.
- Purpose: **App functionality**

> ⚠️ **Still open, and now load-bearing — the form was submitted on 11 Sep 2026
> declaring "processed ephemerally".** That answer depends on Deepgram's retention
> setting, which lives in your Deepgram account, not in this repo. If their default
> retains audio or transcripts, the declaration is inaccurate as filed and the Data
> safety form must be corrected to disclose retention. Verify it in the Deepgram
> dashboard; an incorrect Data safety declaration is an enforcement risk, not a
> cosmetic one.

### Personal info → Name / Email
- Collected: **No** — the app has no sign-in and never asks for a name or email.

### App activity → Other user-generated content
- Notes, bookmarks, and the Hifz streak stay on the device and are never
  transmitted, so under Play's definition this is **not collected**.
- Collected: **No**

### Not collected
No location, contacts, photos, files, financial info, health data, or advertising
identifiers. No analytics or ad SDKs are present. All reading progress, bookmarks,
and cached audio for signed-out users stay on-device (IndexedDB + Capacitor
Preferences).

### Security practices
- Data encrypted in transit: **Yes** (all endpoints HTTPS/WSS)
- Users can request data deletion: **Yes** — uninstall or clear storage removes
  everything; nothing is stored off-device. See section 4.

---

## 3. Foreground service declaration

Required because the app declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.

- **Type:** Media playback
- **Justification (paste into the console):**
  > Rafeeq plays Quran recitation audio. The foreground service keeps playback
  > running when the screen is off or the app is backgrounded, and powers the
  > Android Auto media browser so users can listen while driving. Playback is always
  > started by the user and is controllable from the notification, the lock screen,
  > and the car's head unit.
- **Demo video:** Google usually requires one. Record a screen capture showing:
  start playback → background the app → playback continues with a visible
  notification → pause/skip from the notification. Upload unlisted to YouTube and
  paste the link.

---

## 4. Account deletion — NOT REQUIRED (no account creation)

Play's deletion requirement is triggered by **account creation**, not by storing
data. Rafeeq has no sign-in and creates no user identity, so neither the in-app
deletion path nor the public deletion URL applies. Google's definition:

> "If your app allows users to create an account from within your app, our User
> data policy requires that it must also allow users to request for their account
> to be deleted." … "Accounts that are created and operated offline are not app
> accounts and do not fall within policy scope."

Apple's Guideline 5.1.1(v) uses the same trigger, so the iOS build is equally
out of scope.

The in-app "Delete Account & Data" row and its modal have been removed, along
with `delete-account.html` and the OAuth relay `index.html`. All of it is
recoverable from git history — see below.

> ⚠️ **This reverses the moment sign-in is added.** Sign in with Google or Apple
> counts as account creation on both stores (Google names "SSO" in its list of
> account mechanisms; Apple treats social login the same as email signup). If
> sign-in ships — especially with any server-side backup of user data — you must
> restore: an in-app deletion path, a hosted public deletion URL for Play, actual
> deletion of the server-side record, and **Apple token revocation via their REST
> API** for Sign in with Apple.
>
> Note also **Apple Guideline 4.8**: adding Google Sign-In *alone* obliges you to
> offer Sign in with Apple as an equivalent option. Adding one means adding both.

### Recovering the sign-in code

All sign-in files were deleted from the working tree but remain in git history.
To restore them:

```bash
# The last commit where the auth stack was intact:
git show d1aba6f --stat

git checkout d1aba6f -- src/app/core/services/auth/oauth.service.ts
git checkout d1aba6f -- src/app/core/services/auth/AuthCallback.tsx
git checkout d1aba6f -- src/app/core/services/api/user-api.client.ts   # QF user API
git checkout d1aba6f -- delete-account.html                            # deletion page
git checkout d1aba6f -- index.html                                     # OAuth relay page
```

Also needed when re-adding sign-in:
- The `com.rafeeq.quranquiz` deep-link `<intent-filter>` in
  `android/app/src/main/AndroidManifest.xml` (removed; see history).
- The `appUrlOpen` listener and `/auth/callback` route in `src/App.tsx`.
- `token-broker/src/index.ts` still exposes `/oauth2/token` — it was left in
  place and is simply unused, so no broker redeploy is needed to restore it.

Bear in mind the old stack was **Quran Foundation OAuth**, not Google/Apple. It
is a reference for the wiring (PKCE, token storage, deep-link callback), not a
drop-in for a different identity provider.

**Data deletion (as distinct from account deletion)** is still answered on the
data-safety form: users uninstall or clear storage, which removes everything,
since nothing leaves the device. `privacy.html` §6 states this.

---

## 5. Privacy policy — REWRITTEN, needs hosting

`privacy.html` has been rewritten against what the app actually does. The previous
version claimed local data "never leaves your device" and never mentioned the
microphone, speech recognition, or Deepgram — a direct contradiction with the Data
safety answers above, and a likely rejection.

Now covered: on-device storage, the Deepgram audio stream (opt-in, live-only, never
stored), an explicit "no account required" section, a table of every outbound host,
an explicit "what the app does not do", and deletion routes. The same corrected
text is mirrored in-app (`PRIVACY_SECTIONS` in `Account.tsx`), and the bracketed
date/contact placeholders are fixed here and in `terms.html`.

**Aug 2026 — second pass, against the Quran Foundation developer-privacy
requirements** (email from Basit Minhas, QF Developer Support, and
<https://api-docs.quran.foundation/legal/developer-privacy/>). Added to
`privacy.html`, `terms.html`, and the in-app AR/EN mirror:

- QF attribution + an explicit "Rafeeq is an independent app, not an official
  Quran Foundation application" disclaimer.
- Religious information treated as **sensitive data**, with Recite Mode framed as
  the affirmative opt-in (two deliberate acts) and how to withdraw consent.
- An explicit "we do not train AI models on your content" commitment covering
  notes/UGC as well as recitation audio, with no repurposing or ad profiling.
- **Cloudflare** added to the third-party processor table (it hosts the token
  broker and sees request IPs) — previously undisclosed. Every processor now
  links to its own privacy policy.
- A **Security** section: TLS in transit, OS-level encryption at rest, secrets
  held as Worker secrets + rotation, minimum API scope, and the commitment to
  report API-related breaches to QF **within 24 hours**.
- Access/correction/deletion consolidated, stating plainly *why* OAuth
  revocation and the 30/90-day server-deletion clauses do not apply (no
  accounts, no QF user login, no user database) rather than copying template
  language that would misdescribe the app.
- International transfers, a 30-day response commitment, and a postal address.
- `terms.html` gained the QF Developer Terms obligations it was missing: no
  modification of the Quran text, no extraction/redistribution/resale of QF
  content or raw API data, personal-use-only, and an acceptable-use clause.

- [x] **Postal address filled in** (11 Sep 2026). Compound Dar Misr, Phase 2 —
      Building 49, Apartment 23, El Shorouk, Cairo, Egypt.
- [x] **Address mirrored into the in-app policy** (11 Sep 2026) — the Contact
      section of `PRIVACY_SECTIONS` in `Account.tsx`, `bodyAr` and `bodyEn` in
      sync. Arabic uses Arabic-Indic numerals to match the surrounding copy;
      `privacy.html` is transliterated, being an English document read by store
      reviewers. ⚠️ This changed app code — the AAB must be rebuilt (A6).
- [x] **Hosted on GitHub Pages** (11 Sep 2026), from an orphan `gh-pages` branch
      holding only the two pages, so serving the site does not publish the source
      tree. Both are live and the Play listing has been updated:

      - <https://omokhtarr.github.io/Rafeeq-Cross-Platform/privacy.html>
      - <https://omokhtarr.github.io/Rafeeq-Cross-Platform/terms.html>

      They link to each other with **relative** hrefs, so they must stay in the
      same directory — do not move one without the other. The deletion page is
      not required (section 4).
- [x] **Processor links checked** (11 Sep 2026). Deepgram, Cloudflare, jsDelivr
      and the QF api-docs link all return 200. **`https://quran.foundation/privacy`
      returned 404** and was replaced with <https://quran.com/privacy> — the
      end-user policy for the service whose content the App consumes. Not to be
      confused with the *Developer* Privacy Policy Packet at
      `api-docs.quran.foundation/legal/developer-privacy/`, which covers our
      obligations to QF rather than the user's data. Worth re-running this check
      whenever the policy is edited.

### Offline caching vs. the QF 7-day rule — RESOLVED

QF's Developer Terms say not to store QF content for more than one week unless
expressly permitted, or via the Content Sync flow with a sync at least every
seven days. Rafeeq caches content indefinitely, so both halves of that rule had
to be satisfied. They were closed in two different ways, and the distinction
matters if this is ever audited.

**1. Tafsirs and recitations — closed by implementing Content Sync**
(merged 22 Aug 2026).

- Sync runs against `GET /resources/sync` with `sync_token` checkpoints and
  sequence-ordered mutations; a resource is bootstrapped from its snapshot the
  first time it is tracked.
- Resources become tracked when the user actually downloads them — a tafsir
  download or a cached recitation — so nothing is synced that isn't held.
- Triggered on app resume, throttled to once per 24 h, well inside the 7-day
  obligation. Settings shows the last sync age and warns once it passes 7 days,
  and offers a manual **Sync now** control.
- Eviction is explicit-only: content is untracked when the user removes it or
  the API sends `RESOURCE_DELETE`.

Verified end-to-end against the live QF API through the token broker, not just
against mocks — which is how two release-blocking bugs were caught that a fully
green 173-test suite did not (`per_page` above the API maximum, and empty
placeholder records overwriting populated tafsir rows). Details and the
remaining follow-ups are in
`docs/superpowers/specs/2026-08-22-content-sync-followups.md`.

**2. The Quran script — closed by express written permission.**

`/verses/by_page/` is not a syncable resource group, so Content Sync could not
cover it. Quran Foundation granted express permission under **Section 3.1(3)(a)**
of the Developer Terms to store the Quran script and its page-layout/glyph data
locally beyond one week, and to keep it readable offline.

Two conditions ride with that grant and are easy to lose track of:

- It is limited to use inside Rafeeq. No modification, sale, sublicensing,
  export, or redistribution.
- It lasts **until** Content Sync supports the Quran script. QF asked that the
  Content Sync docs be checked roughly weekly; once that support appears, this
  data must migrate onto Content Sync.

The grant, its exact scope, and that ongoing obligation are recorded in
**`docs/licensing-decisions.md`** — in-repo rather than in an inbox, so it
survives a laptop change and is findable at audit time.

> ⚠️ **Known gap, not a blocker.** Android recitation eviction is still a stub:
> `evictRecitation` clears the IndexedDB store used by web/iOS, but on Android
> the blobs are files under `quran-audio/` and that branch does nothing. A
> `RESOURCE_INVALIDATE` for a recitation therefore evicts nothing on the primary
> release platform. This affects content *freshness*, not the retention rule —
> sync still runs and the terms obligation is met. Highest-priority follow-up.

### The traced surah-header ornament — DECISION TAKEN, not resolved

`src/app/shared/components/mushaf-page/surah-banner.art.ts` renders the
illuminated band around each surah title, **traced from an official KFGQPC Madani
page render** and simplified. That makes it a derivative of KFGQPC page artwork
rather than a licensed asset.

QF was asked and **replied that it cannot grant permission on KFGQPC's behalf**:
KFGQPC's own terms control the source artwork, and if those terms are unclear,
KFGQPC should be contacted directly before publishing.

**KFGQPC was not contacted, and no permission was obtained.** The decision taken
on 22 Aug 2026 is to ship the trace and accept the risk. This is recorded as a
*decision to publish without an answer*, not as a determination that the trace is
permitted — the underlying question is still open.

What keeps the exposure contained:

- The surah **name** is not traced; it comes from the openly distributed
  `sura_names` font. Only the surrounding frame was traced.
- The band carries no Quran text, so it does not touch the "Quran text is never
  modified" commitment in `terms.html`.
- Replacement is one exported constant (`SURAH_BANNER_PATH`) in one file, with
  the cartouche window already expressed as fractions. Original artwork drops in
  without touching layout maths — and that remains cheap after release, which is
  what makes accepting the risk reasonable.

Full reasoning in **`docs/licensing-decisions.md` §2**.

---

## 6. Store listing assets

- [x] App icon 512×512 PNG → `play-assets/icon-512.png`
- [x] Feature graphic 1024×500 → `play-assets/feature-graphic-1024x500.png`
- [x] ≥2 phone screenshots → four at 1080×1920 (exact 9:16) in `play-assets/`:
      Home, mushaf, quiz, Azkar. See `play-assets/README.md` for how they were
      produced and the two caveats (no status bar; Hifz empty-state held back).
- [x] Short description (≤80 chars) — **`PLAY-LISTING-COPY.md`**, EN + AR,
      three options each, character counts measured
- [x] Full description (≤4000 chars) — same file. EN 2,794 chars, AR 2,497.
      The Arabic is a parallel version, not a literal translation; the privacy
      paragraph and QF disclaimer are kept faithful in both, since they carry
      compliance weight
- [x] Content rating questionnaire — every IARC question pre-answered in
      `PLAY-LISTING-COPY.md`. Expect "Everyone". Religious content is not a
      rating factor; do not answer Yes to violence on account of scriptural
      references to warfare
- [x] Target audience & content — **13+**. Any under-13 band pulls the app into
      Play's Families policy, and recite mode streams mic audio to Deepgram —
      exactly what draws COPPA scrutiny
- [x] Category: **Books & Reference** (not Lifestyle — it is where Quran.com,
      Tarteel and Ayah sit, and where the browse traffic is)
- [ ] **Android Auto (C11 — your call):** recommendation in
      `PLAY-LISTING-COPY.md` is to **hold the declaration for a follow-up
      release** and drop the Auto bullet from the description, so a car-app
      review rejection cannot delay the whole launch and the 14-day test clock.
      The Auto code ships either way. Full reasoning below.

      The listing triggers an extra car-app quality review.
      In-car regression pass done and working (13 Aug 2026), so this is no longer
      blocking. Note the car-app review is a separate, stricter track and a common
      source of first-submission rejections — declaring Auto later, in a follow-up
      release, keeps the first submission on the standard track. The Auto code ships
      either way; this only controls whether the listing advertises it.

---

## 7. Credential rotation — ✅ COMPLETE

Both of these were extractable from shipped APKs. Both have now been rotated:

- [x] **Deepgram API key** — rotated and verified live through the broker (13 Aug 2026).
      Mint a new one in the Deepgram dashboard, revoke the old
      one, then `wrangler secret put DEEPGRAM_API_KEY` in `token-broker/`. Never put
      it back in a `.env` file.
- [x] **Quran Foundation client secret** — rotated, confirmed 11 Sep 2026.
      Rotate in the QF dashboard and update the Worker secret. It is no longer
      referenced by the app at all.

Deploy the broker after rotating:

```bash
cd token-broker
wrangler secret put DEEPGRAM_API_KEY
wrangler deploy
```

Confirm `ALLOWED_ORIGIN` on the Worker includes the native origin
(`https://localhost`) as well as any web origin — existing broker calls work from
the app, so it almost certainly already does.

Then re-verify nothing leaked back in:

```bash
npm run build:prod
# neither the Deepgram key nor "clientSecret"/"QuranClient" should appear:
grep -c "clientSecret\|QuranClient" build/static/js/main.*.js
```

---

## 8. Release checklist order

1. ~~Rotate both credentials~~ — done 13 Aug 2026, verified live through the broker
   (QF content token returns 200 with a valid token)
1b. ~~Deploy the broker~~ — done, verified 15 Aug 2026.
   `verify-deploy.sh` confirms `/deepgram/token` mints a real `asr:write` grant
   rather than falling through to the Quran Foundation handler.
2. ~~Smoke-test recite mode against the deployed broker~~ — done, working
3. ~~Android Auto regression pass in a real car~~ — done, working (13 Aug 2026)
4. ~~Host the privacy policy (section 5)~~ — done 11 Sep 2026, live on GitHub
   Pages and in the listing; processor links verified
5. **Rebuild + re-sign the AAB (`gradlew bundleRelease`)** — ⚠️ the existing
   `Rafeeq-1.1.0-release.aab` was built **before** Content Sync merged (22 Aug 2026)
   and before the postal address is filled in, so it is stale. Do not submit it.
   Rebuild after A2/A3, sign with `rafeeq-upload`, and bump `versionCode`
6. ~~Produce the missing listing assets~~ — done, in `play-assets/`: 512×512 PNG
   icon, 1024×500 feature graphic, and four 9:16 screenshots
7. Create the Play listing, complete Data safety + foreground service declarations
8. Start the closed test — ~12 testers × 14 continuous days (personal accounts)
9. Apply for production access
