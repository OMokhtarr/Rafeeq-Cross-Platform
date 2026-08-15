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

---

## 0. Status at a glance

Last updated 15 Aug 2026. Section numbers link to the detail below.

### Outstanding

Ordered by category: work that changes the app first, then what we're waiting on
someone else for, then paperwork that can be filled in any time.

#### A. Needs work on the app — do these first

| # | Task | § | Blocking |
|---|---|---|---|
| A1 | **QF 7-day caching rule** — implement Content Sync for translations/tafsir/audio; Quran script depends on the QF answer (B1) | 5 | **Yes** |
| A2 | Fill in the postal address in `privacy.html` | 5 | **Yes** |
| A3 | Mirror that address into `PRIVACY_SECTIONS` in `Account.tsx` (AR + EN in sync) | 5 | **Yes** |
| A4 | **Surah-header ornament** — if QF (B2) says the trace is not permitted, replace `SURAH_BANNER_PATH` in `surah-banner.art.ts` with original artwork | 5 | Depends on B2 |
| A5 | Record the foreground-service demo video (playback → background → notification controls) | 3 | **Yes** |
| A6 | Rebuild + re-sign the AAB after A1–A4 land | 8 | **Yes** |

#### B. Blocked on someone else — chase these in parallel

| # | Task | § | Blocking |
|---|---|---|---|
| B1 | **QF reply — Content Sync scope** for the Quran script (`/verses/by_page/` is not a syncable resource group) | 5 | **Yes** |
| B2 | **QF reply — surah-header artwork**: is a traced KFGQPC page ornament permitted, or is there an official asset? | 5 | Yes, if unfavourable |
| B3 | Recruit ~12 testers and start the closed test — 14 **continuous** days | 8 | **Yes** |
| B4 | Confirm the QF client secret was rotated (Deepgram key confirmed via broker) | 7 | **Yes** |

#### C. Paperwork — no dependencies, do any time

| # | Task | § | Blocking |
|---|---|---|---|
| C1 | Short description (≤80 chars) | 6 | **Yes** |
| C2 | Full description (≤4000 chars) | 6 | **Yes** |
| C3 | Data safety form — answers drafted in §2 | 2 | **Yes** |
| C4 | Foreground service declaration text (§3 has the justification) | 3 | **Yes** |
| C5 | Content rating questionnaire (expect "Everyone") | 6 | **Yes** |
| C6 | Target audience & content declaration | 6 | **Yes** |
| C7 | Category — Books & Reference, or Lifestyle | 6 | **Yes** |
| C8 | Create the Play listing | 8 | **Yes** |
| C9 | Host `privacy.html` + `terms.html` in the same directory; add URL to the listing | 5 | **Yes** (after A2) |
| C10 | Confirm the Deepgram / Cloudflare / jsDelivr / QF policy links resolve | 5 | No |
| C11 | Decide: declare Android Auto now, or in a follow-up release | 6 | No |
| C12 | Apply for production access | 8 | **Yes** — last step |

**Critical path:** B3 is the long pole — 14 continuous days, and nothing gates
starting it, so recruit testers today. B1/B2 are outside our control and both
ride on the same email, so send it first; B1 decides how much of A1 is needed
and B2 decides whether A4 exists at all. Everything in C can be done while
waiting. A5's demo video is the most commonly underestimated item.

### Done

| Item | When |
|---|---|
| Credentials rotated, verified through the broker | 13 Aug 2026 |
| Android Auto in-car regression pass | 13 Aug 2026 |
| Token broker deployed + `verify-deploy.sh` passing | 15 Aug 2026 |
| Recite mode smoke-tested against the live broker | 15 Aug 2026 |
| Signed AAB — `Rafeeq-1.1.0-release.aab`, `rafeeq-upload` key | — |
| Listing assets — icon, feature graphic, 4 × 9:16 screenshots in `play-assets/` | — |
| Account deletion confirmed out of scope (no sign-in) | — |
| Privacy policy rewritten, incl. the QF developer-privacy pass | Aug 2026 |
| Source TODOs — Settings persisted data, Mushaf page layout | 15 Aug 2026 |

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

> Verify Deepgram's own retention setting in your Deepgram account before submitting.
> If their default retains audio/transcripts, "processed ephemerally" no longer holds
> and you must disclose retention instead.

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

- [ ] **Fill in the postal address.** `privacy.html` carries
      `[POSTAL ADDRESS — FILL IN BEFORE PUBLISHING]`; QF asks for a postal
      address alongside the contact email. Blocker for publishing the page.
- [ ] **Then add the same postal address to the in-app policy** — the Contact
      section of `PRIVACY_SECTIONS` in `Account.tsx` (both `bodyAr` and
      `bodyEn`). The placeholder was deliberately *not* put there, so a
      bracketed `[FILL IN]` string never ships inside the APK; the in-app text
      currently gives the contact email and the 30-day response commitment
      only. Keep the AR and EN copies in sync.
- [ ] **Host `privacy.html`** (GitHub Pages, Cloudflare Pages, or alongside the
      token broker) and put the URL in the listing. This is the only page that
      must be hosted — the deletion page is no longer required (section 4).
      Host `terms.html` beside it: privacy.html now links to it via a relative
      `privacy.html` ↔ `terms.html` link, so they must sit in the same directory.
- [ ] Confirm the Deepgram, Cloudflare, jsDelivr and Quran Foundation
      privacy-policy links all resolve.

### Open compliance question — offline caching vs. the QF 7-day rule

QF's Developer Terms say not to store QF content for more than one week unless
expressly permitted, or via the Content Sync flow with a sync at least every
seven days. Rafeeq currently seeds all verses into IndexedDB once per install
(`seedVerses` / `getPage` in `src/app/core/services/data/quran.service.ts`) and
caches pages **indefinitely** — there is no 7-day expiry and no periodic
re-sync. Cached content is only cleared on a DB version bump or a repair pass.

This is an app-behaviour gap that the privacy policy cannot resolve. Two ways
to close it:

1. Add a ≤7-day refresh: stamp cached pages/verses with a fetch timestamp and
   re-fetch (or revalidate) anything older than a week when online.
2. Ask QF for express permission for durable offline storage — plausible for a
   Quran reader, since offline reading is the point, and the terms allow it
   "unless expressly permitted". Basit's email invites implementation questions.

- [ ] Decide between (1) and (2) and act on it before release.

### Open licensing question — the traced surah-header ornament

`src/app/shared/components/mushaf-page/surah-banner.art.ts` renders the
illuminated band around each surah title — arabesque scrollwork, two medallions,
a lobed cartouche. Its header comment records how it was made: **traced from an
official KFGQPC Madani page render**, then simplified onto a half-scale grid.

That makes it a derivative of KFGQPC page artwork rather than a licensed asset.
KFGQPC materials are generally licensed for distribution *unmodified*, so a
traced-and-simplified reproduction may fall outside permitted use. Two things
narrow the exposure but do not remove it:

- The surah **name** is not part of the trace — it comes from the `sura_names`
  font shipped with the Quran.com assets, which is openly distributed for this
  purpose. Only the surrounding frame was traced.
- The band carries no Quran text, so it does not touch the "Quran text is never
  modified" commitment in `terms.html` and the in-app terms.

Practical risk is low — Play does not audit ornamental provenance, and this
surfaces through complaints rather than review. But it is undisclosed anywhere
in the listing or terms, and it is cheap to resolve now versus after visibility.

Asked of QF in the same email as the caching question (see the reply draft):
whether a traced reproduction is acceptable, whether it needs express KFGQPC
permission, and whether an official vector/glyph asset exists that we should
adopt instead.

Replacement is contained if the answer is unfavourable: one exported constant
(`SURAH_BANNER_PATH`) in one file, with the cartouche window already expressed as
fractions, so original artwork drops in without touching layout maths.

- [ ] Await the QF answer (B2), then either keep the trace, adopt an official
      asset, or commission/redraw an original ornament.

---

## 6. Store listing assets

- [x] App icon 512×512 PNG → `play-assets/icon-512.png`
- [x] Feature graphic 1024×500 → `play-assets/feature-graphic-1024x500.png`
- [x] ≥2 phone screenshots → four at 1080×1920 (exact 9:16) in `play-assets/`:
      Home, mushaf, quiz, Azkar. See `play-assets/README.md` for how they were
      produced and the two caveats (no status bar; Hifz empty-state held back).
- [ ] Short description (≤80 chars)
- [ ] Full description (≤4000 chars)
- [ ] Content rating questionnaire (expect "Everyone"; it is religious/educational
      content with no objectionable material)
- [ ] Target audience & content — declare whether children are a target audience
- [ ] Category: Books & Reference, or Lifestyle
- [ ] **Android Auto:** the listing triggers an extra car-app quality review.
      In-car regression pass done and working (13 Aug 2026), so this is no longer
      blocking. Note the car-app review is a separate, stricter track and a common
      source of first-submission rejections — declaring Auto later, in a follow-up
      release, keeps the first submission on the standard track. The Auto code ships
      either way; this only controls whether the listing advertises it.

---

## 7. Credential rotation (blocking)

Both of these were extractable from shipped APKs:

- [ ] **Deepgram API key** — mint a new one in the Deepgram dashboard, revoke the old
      one, then `wrangler secret put DEEPGRAM_API_KEY` in `token-broker/`. Never put
      it back in a `.env` file.
- [ ] **Quran Foundation client secret** — rotate in the QF dashboard and update the
      Worker secret. It is no longer referenced by the app at all.

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
4. **Host the privacy policy (section 5)** — the one remaining hard console blocker
5. ~~Build the signed AAB (`gradlew bundleRelease`)~~ — done: `Rafeeq-1.1.0-release.aab`,
   signed with `rafeeq-upload`, current with the latest source
6. ~~Produce the missing listing assets~~ — done, in `play-assets/`: 512×512 PNG
   icon, 1024×500 feature graphic, and four 9:16 screenshots
7. Create the Play listing, complete Data safety + foreground service declarations
8. Start the closed test — ~12 testers × 14 continuous days (personal accounts)
9. Apply for production access
